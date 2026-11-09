import type { DomainEvent } from '../../src/core/ports.ts'
import { workerSessionId } from '../../src/executor/dsh.ts'
import type { MockHost } from './dsh-host.ts'
import { runTrace, type Run } from './trace.ts'

export interface Fact {
  at?: string
  node: string
  title: string
  state?: string
  detail?: string
  data: unknown
}

const domainNodes = {
  'eval.started': ['eval', '建立线程评估批次'],
  'decision.recorded': ['decision', '持久化决定'],
  'ticket.created': ['ticket', '创建工单与授权'],
  'ticket.resumed': ['ticket', '恢复已有工单'],
  'ticket.ended': ['ticket', '工单结束'],
  'assignment.started': ['executor', '派工启动'],
  'assignment.ended': ['executor', '派工结束'],
  'thread.subscribed': ['threads', '工单订阅线程'],
  'thread.unsubscribed': ['threads', '取消订阅'],
  'trigger.requeued': ['eval', '触发重新排队'],
  'trigger.followup': ['threads', '保留 Worker 对跟进的处理权'],
} as const satisfies Partial<Record<DomainEvent['type'], [string, string]>>

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function inboxData(text: string): unknown {
  try { return JSON.parse(text) } catch { return text }
}

/** Correlates payloads by their structured IDs. Free text and titles are never used as join keys. */
function references(value: unknown, ids: Set<string>): boolean {
  const data = object(value)
  if (['triggerId', 'trigger_id', 'ticketId', 'ticket_id', 'decisionId', 'evalId'].some(key =>
    typeof data[key] === 'string' && ids.has(data[key]))) return true
  if (Array.isArray(data.triggerIds) && data.triggerIds.some(id => ids.has(id))) return true
  return ['ticket', 'trigger'].some(key => typeof data[key] === 'object' && references(data[key], ids))
    || ['batch', 'decisions', 'results'].some(key => Array.isArray(data[key]) && data[key].some(item => references(item, ids)))
}

export function inspectRun(host: MockHost, run: Run) {
  const { runtime } = host
  const { store } = runtime
  const trace = runTrace(store, run)
  const ticketIds = new Set([...trace.tickets.map(ticket => ticket.id),
    ...trace.events.flatMap(event => event.intake?.disposition.fanout ?? [])])
  const tickets = [...ticketIds].flatMap(id => store.tickets.get(id) ?? [])
  const ids = new Set(trace.events.map(event => event.triggerId))
  for (const event of trace.events) {
    const disposition = store.triggers.disposition(event.triggerId)
    if (disposition?.evalId) ids.add(disposition.evalId)
    if (disposition?.decisionId) ids.add(disposition.decisionId)
  }
  for (const ticket of tickets) ids.add(ticket.id)
  const workers = new Set(tickets.map(ticket => workerSessionId(ticket.id)))
  const facts: Fact[] = []
  const started = new Set<string>()
  for (const event of trace.events) {
    const trigger = store.triggers.get(event.triggerId)
    facts.push({ node: 'source', at: event.at, title: '来源事件', state: event.kind, detail: `${event.target} · ${event.author}`, data: trigger ?? event })
    facts.push({ node: 'intake', at: event.at, title: 'Intake 接收结果', state: event.result === 'duplicate' || event.result === 'filtered' ? event.result : 'stored',
      detail: event.intake?.disposition.filtered?.code ?? event.triggerId, data: { triggerId: event.triggerId, ...event.intake } })
    const intake = event.intake
    if (intake?.disposition.fanout.length) facts.push({ node: 'threads', at: intake.disposition.at,
      title: '线程订阅投递', state: intake.owners.length ? 'forwarded' : 'context',
      detail: intake.owners.length ? '由已有工单处理此跟进' : '投递输入，评估路径仍可独立运行',
      data: { triggerId: event.triggerId, ...intake } })
  }

  for (const observed of host.observations) {
    if (observed.at < run.at) continue
    const { at, kind } = observed
    if (kind === 'gate' && ids.has(observed.triggerId)) {
      const { result } = observed
      facts.push({ node: 'gate', at, title: '确定性准入',
        state: result.admissible ? result.strength : 'rejected', detail: result.admissible ? result.basis.via : result.reason, data: observed })
    } else if (kind === 'domain' && references(observed.event.data, ids)) {
      const { event } = observed
      const pair = (domainNodes as Partial<Record<DomainEvent['type'], readonly [string, string]>>)[event.type]
      if (!pair) continue
      if (event.type === 'assignment.started') {
        if (started.has(event.data.assignmentId)) continue
        started.add(event.data.assignmentId)
      }
      const decision = event.type === 'decision.recorded' ? store.decisions.get(event.data.decisionId) : undefined
      const data = decision ?? event.data
      const state = decision?.kind ?? ('outcome' in event.data ? event.data.outcome : event.type.split('.')[1])
      const detail = decision?.reason.map(reason => reason.code === 'said' ? reason.values?.text : reason.code).join(' · ')
      facts.push({ node: pair[0], at, title: pair[1], state, detail, data })
    } else if (kind === 'inbox') {
      const { delivery } = observed
      const payload = inboxData(delivery.text)
      if (workers.has(delivery.sessionId)) {
        facts.push({ node: 'sessions', at, title: 'Worker 收到 Session 输入', state: delivery.mode,
          detail: delivery.sessionId, data: { ...delivery, payload } })
      } else if (references(payload, ids)) {
        facts.push({ node: 'router', at, title: object(payload).kind === 'candidate' ? 'Router 收到候选卡' : 'Router 收到工单通知',
          state: delivery.mode, detail: delivery.sessionId, data: { ...delivery, payload } })
      }
    } else if (kind === 'session' && workers.has(observed.sessionId)) {
      facts.push({ node: observed.state === 'created' ? 'sessions' : 'worker', at, title: 'Worker Session 状态',
        state: observed.state, detail: observed.sessionId, data: observed })
    } else if (kind === 'repository-read' && workers.has(observed.sessionId)) {
      facts.push({ node: 'worker', at, title: 'Worker 读取虚拟仓库文件', state: 'read', detail: `${observed.repository}/${observed.path}`, data: observed })
    } else if ((kind === 'tool-start' || kind === 'tool') && (workers.has(observed.sessionId) || references(observed.input, ids))) {
      const node = workers.has(observed.sessionId) ? 'worker' : observed.name === 'orchestrator_reply' ? 'outbox'
        : observed.name.startsWith('orchestrator_eval') ? 'assessment' : 'router'
      if (kind === 'tool-start') {
        if (['orchestrator_route', 'orchestrator_eval_decide', 'orchestrator_report', 'orchestrator_reply'].includes(observed.name)) {
          facts.push({ node, at, title: '调用 ' + observed.name, state: 'submitted',
            data: { sessionId: observed.sessionId, assignmentId: observed.assignmentId, input: observed.input } })
        }
        continue
      }
      const code = object(observed.input).state
      facts.push({ node, at, title: observed.name, state: observed.error ? 'error' : typeof code === 'string' ? code : 'returned',
        detail: observed.assignmentId ? `派工 ${observed.assignmentId}` : undefined, data: observed })
      if (observed.name === 'orchestrator_report' && !observed.error && typeof object(observed.input).pr_number === 'number') {
        facts.push({ node: 'github', at, title: 'Worker 绑定虚拟 PR', state: 'linked',
          detail: `PR #${object(observed.input).pr_number}`, data: observed })
      }
    } else if (kind === 'outbox' && observed.message.ticketId && ids.has(observed.message.ticketId)) {
      facts.push({ node: 'outbox', at, title: observed.message.kind === 'acknowledgement' ? '原渠道接单确认' : '原渠道结果回执', state: observed.status,
        detail: `${observed.message.channel.source} · ${observed.message.kind}`, data: observed.message })
    }
  }

  for (const ticket of tickets) {
    for (const assignment of ticket.assignments) {
      if (assignment.createdAt >= run.at) facts.push({ node: 'executor', at: assignment.createdAt, title: '派工进入队列', state: 'queued',
        detail: assignment.id, data: { ticketId: ticket.id, assignmentId: assignment.id } })
    }
    for (const follow of ticket.follows ?? []) {
      if (!follow.thread.startsWith('github:') || !follow.closed || follow.closed.at < run.at) continue
      facts.push({ node: 'github', at: follow.closed.at, title: 'GitHub PR 状态', state: follow.closed.outcome, detail: follow.thread, data: follow })
    }
    facts.push({ node: 'ticket', title: '工单快照', detail: ticket.id, data: {
      id: ticket.id, title: ticket.title, mandate: ticket.mandate, origin: ticket.origin, follows: ticket.follows, inputs: ticket.inputs,
      assignments: ticket.assignments, execution: ticket.execution, ended: ticket.ended,
    } })
    facts.push({ node: 'worker', title: 'Worker 与工作目录', detail: workerSessionId(ticket.id), data: {
      ticketId: ticket.id, sessionId: workerSessionId(ticket.id), execution: ticket.execution,
      assignments: ticket.assignments.map(({ id, state, startedAt, endedAt, report }) => ({ id, state, startedAt, endedAt, report })),
    } })
  }
  facts.push({ node: 'store', title: 'SQLite 中的关联记录', data: {
    triggers: trace.events.map(event => event.triggerId), tickets: tickets.map(ticket => ticket.id),
    decisions: tickets.map(ticket => ticket.decisionId), receipts: trace.receipts.map(receipt => receipt.id),
  } })
  return { id: trace.id, title: trace.title, at: trace.at, error: trace.error, tickets: trace.tickets,
    facts: facts.sort((a, b) => (a.at ?? '\uffff').localeCompare(b.at ?? '\uffff')) }
}
