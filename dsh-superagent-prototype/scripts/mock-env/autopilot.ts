/**
 * Deterministic stand-in for the two model roles the control plane talks to:
 * the Main Session that routes candidates, and the Executor Session that reports progress on a ticket.
 * It is not an LLM: every decision comes from the sandbox's configured behavior, so runs are repeatable and need no model.
 */
import type { MockHost } from './dsh-host.ts'

export type WorkerBehavior = 'ready' | 'blocked' | 'failed' | 'silent' | 'progress'

export interface AutoPilotOptions {
  autoRoute: boolean
  defaultBehavior: WorkerBehavior
}

const delay = (ms: number): Promise<void> => new Promise(resolve => { const timer = setTimeout(resolve, ms); timer.unref?.() })

/** Routes explicit candidates, ignores inferred ones, and finishes or stalls simulated workers as configured. */
export class AutoPilot {
  autoRoute: boolean
  defaultBehavior: WorkerBehavior
  private readonly behaviorByTrigger = new Map<string, WorkerBehavior>()
  private readonly behaviorByTicket = new Map<string, WorkerBehavior>()
  private readonly assignments = new Map<string, string>()
  private readonly handled = new Set<string>()
  private readonly stopListeners: (() => void)[] = []
  private counter = 0
  private stopped = false

  constructor(private readonly host: MockHost, options: AutoPilotOptions) {
    this.autoRoute = options.autoRoute
    this.defaultBehavior = options.defaultBehavior
  }

  start(): void {
    this.stopListeners.push(this.host.onDelivery(delivery => {
      if (delivery.sessionId === this.host.runtime.masterId) this.onMain(delivery.text)
      else if (delivery.sessionId.startsWith('worker-')) this.onWorker(delivery.sessionId, delivery.text)
    }))
  }

  stop(): void {
    this.stopped = true
    for (const dispose of this.stopListeners.splice(0)) dispose()
  }

  /** Choose how the worker of the next accepted trigger should behave. */
  planTrigger(triggerId: string, behavior: WorkerBehavior): void {
    this.behaviorByTrigger.set(triggerId, behavior)
  }

  /** Choose how a ticket's current or next worker should behave. */
  planTicket(ticketId: string, behavior: WorkerBehavior): void {
    this.behaviorByTicket.set(ticketId, behavior)
  }

  behaviorOf(ticketId: string): WorkerBehavior {
    return this.behaviorByTicket.get(ticketId) ?? this.defaultBehavior
  }

  private onMain(text: string): void {
    if (!this.autoRoute || this.stopped) return
    let card: { kind?: string; trigger_id?: string; strength?: string }
    try { card = JSON.parse(text) as typeof card } catch { return }
    if (card.kind !== 'candidate' || !card.trigger_id || this.handled.has(card.trigger_id)) return
    this.handled.add(card.trigger_id)
    void this.route(card.trigger_id, card.strength === 'explicit')
  }

  private async route(triggerId: string, explicit: boolean): Promise<void> {
    try {
      await this.host.runtime.idle()
      await delay(30)
      if (this.stopped) return
      if (!explicit) {
        await this.tool(this.host.runtime.masterId, 'orchestrator_route', { decisions: [{
          kind: 'ignore', trigger_id: triggerId, reason: '模拟环境：推断请求自动忽略，避免无规则的主动工作。',
        }] })
        return
      }
      const trigger = this.host.runtime.store.triggers.get(triggerId)
      if (!trigger) return
      const behavior = this.behaviorByTrigger.get(triggerId) ?? this.defaultBehavior
      const result = await this.tool(this.host.runtime.masterId, 'orchestrator_route', { decisions: [{
        kind: 'accept', trigger_id: triggerId, title: cardTitle(trigger.text), worktree_name: `mock-task-${++this.counter}`,
        acknowledgement: '收到，开始处理。',
      }] }) as { results?: { ticket?: { ticket_id?: string } }[] } | undefined
      const ticketId = result?.results?.[0]?.ticket?.ticket_id
      if (ticketId) this.behaviorByTicket.set(ticketId, behavior)
    } catch (error) {
      console.error('[mock] auto route failed:', String(error))
    }
  }

  private onWorker(sessionId: string, text: string): void {
    if (this.stopped) return
    let assignment: { ticket_id?: string; assignment?: number }
    try { assignment = JSON.parse(text) as typeof assignment } catch { return }
    const ticketId = assignment.ticket_id ?? sessionId.slice('worker-'.length)
    const key = String(assignment.assignment ?? 1)
    if (this.assignments.get(sessionId) === key) return
    this.assignments.set(sessionId, key)
    void this.runWorker(ticketId, sessionId)
  }

  private async runWorker(ticketId: string, sessionId: string): Promise<void> {
    try {
      await this.host.runtime.idle()
      await delay(400)
      if (this.stopped || !this.live(ticketId)) return
      await this.report(sessionId, { state: 'progress', summary: '模拟 Worker 已开始处理。' })
      await delay(900)
      if (this.stopped || !this.live(ticketId)) return
      switch (this.behaviorOf(ticketId)) {
        case 'ready':
          await this.report(sessionId, { state: 'ready', summary: '模拟 Worker 已完成修改并通过检查。' })
          break
        case 'blocked':
          await this.report(sessionId, { state: 'blocked', summary: '模拟 Worker 需要人工决策。', human_action: '是否按当前方案继续？' })
          break
        case 'failed':
          await this.report(sessionId, { state: 'failed', summary: '模拟 Worker 遇到不可恢复错误。' })
          break
        case 'silent':
          // Leave the assignment running so stop, pause and concurrency can be exercised.
          return
        case 'progress':
          break
      }
      this.host.setIdle(sessionId)
    } catch (error) {
      console.error('[mock] simulated worker failed:', String(error))
    }
  }

  private live(ticketId: string): boolean {
    const ticket = this.host.runtime.store.tickets.get(ticketId)
    return !!ticket && !ticket.ended
  }

  private async report(sessionId: string, report: Record<string, unknown>): Promise<void> {
    await this.tool(sessionId, 'orchestrator_report', report)
  }

  private async tool(sessionId: string, name: string, args: unknown): Promise<unknown> {
    // A tool is registered while its Session is decorated; a delivery can arrive just before that finishes.
    for (let attempt = 0; attempt < 40; attempt++) {
      try { return await this.host.runTool(sessionId, name, args) }
      catch (error) {
        if (!String(error).includes('is not registered')) throw error
        await delay(50)
      }
    }
    throw new Error(`Tool ${name} never registered for ${sessionId}`)
  }
}

function cardTitle(text: string): string {
  const line = text.split('\n').map(item => item.trim()).find(Boolean) ?? '模拟请求'
  return line.length <= 200 ? line : `${line.slice(0, 197)}...`
}
