import type { Store } from '../../src/app/store.ts'
import { canRetry, ticketStage, type Ticket, type Trigger, type TriggerDisposition } from '../../src/core/index.ts'
import { pullOf } from '../../src/sources/github-pull.ts'

export interface RunEvent {
  at: string
  kind: 'issue' | 'comment' | 'feishu' | 'qq'
  author: string
  text: string
  triggerId: string
  result: string
  addressed?: Trigger['addressed']
  target: string
  meta?: Trigger['meta']
  intake?: { disposition: TriggerDisposition; owners: string[] }
}

export interface Run {
  id: string
  title: string
  at: string
  events: RunEvent[]
  error?: string
}

export function eventView(store: Store, event: RunEvent) {
  const disposition = store.triggers.disposition(event.triggerId)
  const decision = disposition?.decisionId ? store.decisions.get(disposition.decisionId) : undefined
  const replay = event.result === 'duplicate'
  const reached = [...disposition?.fanout ?? [], ...disposition?.acked ?? []]
  const result = replay || event.result === 'filtered' ? event.result
    : disposition?.filtered ? 'filtered' : decision ? 'routed' : reached.length ? 'forwarded' : 'pending'
  return {
    ...event, time: new Date(event.at).toLocaleTimeString('zh-CN', { hour12: false }), result,
    decision: replay ? undefined : decision?.kind, decidedAt: replay ? undefined : decision?.at,
    reason: replay ? [] : decision?.reason ?? (disposition?.filtered ? [disposition.filtered] : []),
    ticketIds: replay ? [] : [...new Set([...(decision?.ticketId ? [decision.ticketId] : []), ...reached])],
  }
}

export function ticketView(ticket: Ticket) {
  return {
    id: ticket.id, title: ticket.title, open: !ticket.ended, ended: ticket.ended, attention: ticket.attention,
    stage: ticketStage(ticket), retry: canRetry(ticket), pull: pullOf(ticket),
    assignment: ticket.assignments.at(-1), attempts: ticket.assignments.length,
  }
}

interface TraceStep { at: string; layer: string; state: string; detail: string; id?: string }

/** Derive the trace from the stored facts of this run. Duplicate attempts are kept as separate intake rows. */
export function runTrace(store: Store, run: Run) {
  const events = run.events.map(event => eventView(store, event))
  const ticketIds = [...new Set(events.flatMap(event => event.ticketIds))]
  const tickets = ticketIds.flatMap(id => store.tickets.get(id) ?? [])
  const steps: TraceStep[] = []
  for (const event of events) {
    steps.push({ at: event.at, layer: 'SOURCE', state: event.result === 'duplicate' ? 'duplicate' : 'received',
      detail: `${event.target} · ${event.author}${event.addressed ? ' · ' + event.addressed : ''}`, id: event.triggerId })
    if (event.decidedAt || event.result === 'filtered' || event.result === 'forwarded') {
      steps.push({ at: event.decidedAt ?? event.at, layer: 'ROUTER', state: event.decision ?? event.result,
        detail: event.reason.map(reason => reason.code).join(' · ') || (event.result === 'forwarded' ? '跟进消息关联到已有工单' : ''),
        id: event.ticketIds[0] ?? event.triggerId })
    }
  }
  for (const ticket of tickets) {
    steps.push({ at: ticket.createdAt, layer: 'TICKET', state: 'created', detail: ticket.title, id: ticket.id })
    for (const input of ticket.inputs) {
      if (input.kind !== 'trigger' || !events.some(event => event.triggerId === input.triggerId)) continue
      const at = input.readAt ?? input.deliveredAt ?? ticket.assignments.find(assignment => assignment.id === input.deliveredTo)?.deliveredAt
      if (at) steps.push({ at, layer: 'WORKER', state: 'delivered', detail: '跟进消息投递到 Worker', id: input.triggerId })
    }
    for (const [index, assignment] of ticket.assignments.entries()) {
      const attempt = `派工 #${index + 1}`
      steps.push({ at: assignment.createdAt, layer: 'WORKER', state: 'queued', detail: attempt, id: assignment.id })
      if (assignment.startedAt) steps.push({ at: assignment.startedAt, layer: 'WORKER', state: 'started', detail: attempt, id: assignment.id })
      if (assignment.report) steps.push({ at: assignment.report.at, layer: 'WORKER', state: assignment.report.state,
        detail: `${attempt} · ${assignment.report.summary}`, id: assignment.id })
    }
    if (ticket.ended) steps.push({ at: ticket.ended.at, layer: 'TICKET', state: ticket.ended.outcome, detail: ticket.title, id: ticket.id })
  }
  return {
    id: run.id, title: run.title, at: run.at, error: run.error, events,
    steps: steps.sort((a, b) => a.at.localeCompare(b.at)),
    tickets: tickets.map(ticketView),
    receipts: tickets.flatMap(ticket => store.receipts.forTicket(ticket.id)),
  }
}
