/**
 * Deterministic stand-in for the two model roles the control plane talks to:
 * the Main Session that routes candidates, and the Executor Session that reports progress on a ticket.
 * It is not an LLM: every decision comes from the sandbox's configured behavior, so runs are repeatable and need no model.
 */
import type { MockHost } from './dsh-host.ts'
import type { MockGithub } from './mock-github.ts'
import { followupOwners } from '../../src/core/index.ts'
import { allowedSender } from '../../src/policy.ts'

export const workerBehaviors = ['answer', 'ready', 'blocked', 'failed', 'silent', 'progress', 'pull'] as const
export type WorkerBehavior = typeof workerBehaviors[number]
export type AssessmentFixture = 'copy-fix' | 'unclear'

export function isWorkerBehavior(value: unknown): value is WorkerBehavior {
  return workerBehaviors.some(behavior => behavior === value)
}

export interface AutoPilotOptions {
  autoRoute: boolean
  defaultBehavior: WorkerBehavior
}

const delay = (ms: number): Promise<void> => new Promise(resolve => { const timer = setTimeout(resolve, ms); timer.unref?.() })

/** Exercises the real routing and report tools with repeatable decisions and worker behavior. */
export class AutoPilot {
  autoRoute: boolean
  defaultBehavior: WorkerBehavior
  private readonly behaviorByTrigger = new Map<string, WorkerBehavior>()
  private readonly behaviorByTicket = new Map<string, WorkerBehavior>()
  private readonly assessments = new Map<string, AssessmentFixture>()
  private readonly followups = new Set<string>()
  private readonly assignments = new Map<string, string>()
  private readonly workerTurns = new Map<string, string>()
  private readonly followupTurns = new Map<string, number>()
  private readonly answeredFollowups = new Set<string>()
  private readonly handled = new Set<string>()
  private readonly stopListeners: (() => void)[] = []
  private counter = 0
  private stopped = false

  constructor(private readonly host: MockHost, private readonly github: MockGithub, options: AutoPilotOptions) {
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

  planFollowup(triggerId: string): void { this.followups.add(triggerId) }

  planAssessment(triggerId: string, fixture: AssessmentFixture): void { this.assessments.set(triggerId, fixture) }

  behaviorOf(ticketId: string): WorkerBehavior {
    const triggerId = this.host.runtime.store.tickets.get(ticketId)?.origin.triggerId
    return this.behaviorByTicket.get(ticketId) ?? (triggerId ? this.behaviorByTrigger.get(triggerId) : undefined) ?? this.defaultBehavior
  }

  private onMain(text: string): void {
    if (!this.autoRoute || this.stopped) return
    let card: { kind?: string; trigger_id?: string; strength?: string; state?: string; summary?: string; answer_to?: string; ticket?: { ticket_id: string } }
    try { card = JSON.parse(text) as typeof card } catch { return }
    if (card.kind === 'worker_report' && card.ticket?.ticket_id && card.summary && (card.answer_to || card.state === 'ready')) {
      const reply = { ticket_id: card.ticket.ticket_id, purpose: card.answer_to ? 'answer' : 'result',
        ...(card.answer_to ? { trigger_id: card.answer_to } : {}), text: card.summary }
      void this.deliverResult(reply).catch(error => console.error('[mock] result delivery failed:', String(error)))
      return
    }
    if (card.kind !== 'candidate' || !card.trigger_id || this.handled.has(card.trigger_id)) return
    this.handled.add(card.trigger_id)
    void this.route(card.trigger_id, card.strength === 'explicit')
  }

  private async deliverResult(reply: Record<string, unknown>): Promise<void> {
    await this.host.runtime.idle()
    if (!this.stopped) await this.tool(this.host.runtime.masterId, 'orchestrator_reply', reply)
  }

  private async route(triggerId: string, explicit: boolean): Promise<void> {
    try {
      await this.host.runtime.idle()
      await delay(30)
      if (this.stopped) return
      if (!explicit) {
        const fixture = this.assessments.get(triggerId)
        if (fixture) { await this.assess(triggerId, fixture); return }
        await this.tool(this.host.runtime.masterId, 'orchestrator_route', { decisions: [{
          kind: 'ignore', trigger_id: triggerId, reason: '模拟环境：推断请求自动忽略，避免无规则的主动工作。',
        }] })
        return
      }
      const trigger = this.host.runtime.store.triggers.get(triggerId)
      if (!trigger) return
      await this.tool(this.host.runtime.masterId, 'orchestrator_route', { decisions: [{
        kind: 'accept', trigger_id: triggerId, title: cardTitle(trigger.text), worktree_name: `mock-task-${++this.counter}`,
        acknowledgement: '收到，开始处理。',
      }] })
    } catch (error) {
      console.error('[mock] auto route failed:', String(error))
    }
  }

  private async assess(triggerId: string, fixture: AssessmentFixture): Promise<void> {
    const { runtime } = this.host
    const trigger = runtime.store.triggers.get(triggerId)
    if (!trigger) return
    await this.tool(runtime.masterId, 'orchestrator_eval', { trigger_id: triggerId })
    const clear = fixture === 'copy-fix'
    const evidence = trigger.text.slice(0, 250)
    await this.tool(runtime.masterId, 'orchestrator_eval_decide', {
      trigger_id: triggerId, decision: clear ? 'accept' : 'ignore',
      rule_assessments: runtime.store.settings().policy.rules.filter(rule => rule.enabled).map(rule => ({
        rule_id: rule.id, matched: clear && rule.id === 'copy',
        reason: clear && rule.id === 'copy' ? '给出了替换前后的文案，属于局部文字修复。' : '样例中的请求不符合这条规则。',
      })),
      direction: { implementation_requested: true, target_basis: clear ? 'specified' : 'undetermined',
        requires_design_decision: !clear, evidence },
      title: cardTitle(trigger.text), scope: clear ? '仅更正指定按钮文字。' : '',
      intent_evidence: clear ? evidence : null, worktree_name: 'copy-fix',
      acknowledgement: clear ? '收到，我会更正这处文案。' : null,
      reason: clear ? '命中文案修复规则，且修改目标明确。' : '请求没有给出可核对的实现目标。',
    })
  }

  private onWorker(sessionId: string, text: string): void {
    if (this.stopped) return
    let assignment: { ticket_id?: string; assignment?: number; trigger_id?: string }
    try { assignment = JSON.parse(text) as typeof assignment } catch { return }
    if (assignment.trigger_id) {
      void this.runFollowup(sessionId, assignment.trigger_id)
      return
    }
    if (!assignment.ticket_id) return
    const ticketId = assignment.ticket_id ?? sessionId.slice('worker-'.length)
    const key = String(assignment.assignment ?? 1)
    if (this.assignments.get(sessionId) === key) return
    this.assignments.set(sessionId, key)
    const assignmentId = this.host.runtime.store.tickets.get(ticketId)?.assignments.at(-1)?.id
    if (assignmentId) void this.runWorker(ticketId, sessionId, assignmentId)
  }

  private async runFollowup(sessionId: string, triggerId: string): Promise<void> {
    const ticketId = sessionId.slice('worker-'.length)
    this.followupTurns.set(sessionId, (this.followupTurns.get(sessionId) ?? 0) + 1)
    try {
      await this.host.runtime.idle()
      const { store } = this.host.runtime
      const ticket = store.tickets.get(ticketId)
      const trigger = store.triggers.get(triggerId)
      if (this.stopped || !ticket || ticket.ended || !trigger || !followupOwners(trigger, store).includes(ticketId)) return
      if (this.behaviorByTrigger.get(triggerId) === 'answer' && trigger.addressed
        && allowedSender(store.settings(), trigger.actor) && !this.answeredFollowups.has(triggerId)) {
        this.answeredFollowups.add(triggerId)
        const ready = ticket.assignments.at(-1)?.report?.state === 'ready' && !this.workerTurns.has(sessionId)
        await this.report(sessionId, { state: ready ? 'ready' : 'progress', summary: this.answer(sessionId, trigger.text), reply_to_trigger_id: triggerId })
      } else if (this.followups.delete(triggerId)) {
        await this.tool(sessionId, 'orchestrator_ack', { trigger_id: triggerId, text: '收到补充要求，会在原工单一起处理。' })
      }
    } catch (error) {
      console.error('[mock] follow-up failed:', String(error))
    } finally {
      const remaining = (this.followupTurns.get(sessionId) ?? 1) - 1
      if (remaining) this.followupTurns.set(sessionId, remaining)
      else this.followupTurns.delete(sessionId)
      this.finishTurn(sessionId)
    }
  }

  private finishTurn(sessionId: string): void {
    if (!this.workerTurns.has(sessionId) && !this.followupTurns.has(sessionId)) this.host.setIdle(sessionId)
  }

  private answer(sessionId: string, question: string): string {
    const billing = /账单|导出|格式|文件名|输出|空态|billing|export|csv/i.test(question)
    const path = billing ? 'src/billing/export.ts' : 'README.md'
    const content = this.github.files[path]!
    this.host.observe({ kind: 'repository-read', at: new Date().toISOString(), sessionId, repository: this.github.repository, path, content })
    if (!billing) return '我查了虚拟仓库的 README。这个示例项目只包含账单导出逻辑；你可以问导出格式、文件名或没有账单时的提示。其他问题在这个示例仓库里没有足够资料。'
    const hint = /return \{ message: "([^"]+)" \}/.exec(content)?.[1]
    const filename = /filename: "([^"]+)"/.exec(content)?.[1]
    const columns = /const csv = \["([^"]+)"/.exec(content)?.[1]?.split(',')
    if (!hint || !filename || !columns?.length) return `我读取了 ${path}，但没有找到预设示例的导出定义。`
    if (/空态|没有|为空|空数据|empty|零条/i.test(question)) return `没有账单时不会生成 CSV 文件，只会返回提示「${hint}」。依据：${path} 的空列表分支。`
    return `账单导出会生成 ${filename}，列为 ${columns.join('、')}。如果没有账单，只会返回提示「${hint}」。依据：${path}。`
  }

  private async runWorker(ticketId: string, sessionId: string, assignmentId: string): Promise<void> {
    this.workerTurns.set(sessionId, assignmentId)
    let keepRunning = false
    try {
      await this.host.runtime.idle()
      await delay(400)
      if (this.stopped || !this.live(ticketId, assignmentId)) return
      await this.tool(sessionId, 'orchestrator_read', { resource: `ticket/${ticketId}/assignment`, offset: 0, limit: 4000 })
      if (this.stopped || !this.live(ticketId, assignmentId)) return
      await this.report(sessionId, { state: 'progress', summary: '模拟 Worker 已开始处理。' })
      await delay(900)
      const ticket = this.live(ticketId, assignmentId)
      if (this.stopped || !ticket) return
      switch (this.behaviorOf(ticketId)) {
        case 'answer': {
          const trigger = this.host.runtime.store.triggers.get(ticket.origin.triggerId)
          if (!trigger) throw new Error('找不到工单的原始问题')
          await this.report(sessionId, { state: 'ready', summary: this.answer(sessionId, trigger.text), reply_to_trigger_id: trigger.id })
          break
        }
        case 'ready':
          await this.report(sessionId, { state: 'ready', summary: '模拟 Worker 已完成预设执行步骤。' })
          break
        case 'pull': {
          if (!ticket.execution) throw new Error('PR scenario requires a worker branch')
          const pull = this.github.openPull(ticket.execution.name, ticket.title)
          await this.report(sessionId, { state: 'ready', summary: `已提交虚拟 PR #${pull.number}，等待合并。`, pr_number: pull.number })
          break
        }
        case 'blocked':
          await this.report(sessionId, { state: 'blocked', summary: '模拟 Worker 需要人工决策。', human_action: '是否按当前方案继续？' })
          break
        case 'failed':
          await this.report(sessionId, { state: 'failed', summary: '模拟 Worker 遇到不可恢复错误。' })
          break
        case 'silent':
          // Leave the assignment running so stop, pause and concurrency can be exercised.
          keepRunning = true
          return
        case 'progress':
          break
      }
    } catch (error) {
      console.error('[mock] simulated worker failed:', String(error))
    } finally {
      if (!keepRunning && this.workerTurns.get(sessionId) === assignmentId) this.workerTurns.delete(sessionId)
      this.finishTurn(sessionId)
    }
  }

  private live(ticketId: string, assignmentId: string) {
    const ticket = this.host.runtime.store.tickets.get(ticketId)
    const assignment = ticket?.assignments.at(-1)
    if (ticket && !ticket.ended && assignment?.id === assignmentId && assignment.state === 'running') return ticket
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
