import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Readable } from 'node:stream'

const port = 3083
const upstream = 'http://127.0.0.1:3082'
const page = readFileSync(new URL('./index.html', import.meta.url))
const script = readFileSync(new URL('./graph.js', import.meta.url))
const style = readFileSync(new URL('./graph.css', import.meta.url))

async function read(path, headers) {
  const response = await fetch(upstream + path, { headers, signal: AbortSignal.timeout(3500) })
  if (!response.ok) throw new Error(`Runtime returned ${response.status}`)
  return response.json()
}

const api = path => read('/orchestrator/api/' + path, { 'x-orchestrator-request': '1' })
const history = chat => read('/virtual-im/api/chats/' + chat, { 'x-virtual-im': '1' }).catch(() => ({ messages: [] }))

export function ticketProjection(db, repository, row, messageTimes, deliveryOf = () => undefined) {
  const get = (table, id) => id && JSON.parse(db.prepare(`SELECT value FROM ${table} WHERE id = ?`).get(id)?.value ?? 'null')
  const ticket = get('ticket', row.id)
  if (!ticket) return null
  const projectTrigger = id => {
    const trigger = get('trigger', id)
    if (!trigger) return null
    const disposition = get('disposition', id)
    return { id, source: trigger.source, at: trigger.at, text: trigger.text.slice(0, 250), actor: trigger.actor?.id,
      threads: (trigger.threads ?? []).map(({ source, id }) => `${source}:${id}`), receivedAt: disposition?.at,
      fanout: disposition?.fanout ?? [], filtered: disposition?.filtered?.code,
      url: /^https:\/\/github\.com\//.test(trigger.url ?? '') ? trigger.url : undefined }
  }
  const origin = projectTrigger(ticket.origin.triggerId)
  const decision = get('decision', ticket.decisionId)
  const thread = db.prepare('SELECT value FROM thread WHERE key = ?')
  const prs = (ticket.follows ?? []).flatMap(follow => {
    const number = /^github:(\d+)$/.exec(follow.thread)?.[1]
    if (!number) return []
    const record = JSON.parse(thread.get(follow.thread)?.value ?? '{}')
    return [{ number, title: record.meta?.label, status: follow.closed?.outcome ?? 'open',
      url: repository ? `https://github.com/${repository}/pull/${number}` : null,
      firstSeenAt: record.createdAt, closedAt: follow.closed?.at }]
  })
  const replies = db.prepare("SELECT value FROM outbox WHERE value ->> '$.ticketId' = ? ORDER BY rowid").all(ticket.id)
    .map(({ value }) => {
      const { id, kind, channel, status, dropped } = JSON.parse(value)
      return { id, kind, source: channel.source, target: channel.thread, status, at: messageTimes.get(id) ?? dropped?.at, dropped }
    })
  const assignments = ticket.assignments.map(({ id, createdAt, startedAt, idleAt, endedAt, state, endedReason, report }) =>
    ({ id, createdAt, startedAt, idleAt, endedAt, state, endedReason,
      report: report && { state: report.state, at: report.at, summary: report.summary.slice(0, 1200) } }))
  const inputs = (ticket.inputs ?? []).filter(input => input.kind === 'trigger').map(input => {
    const trigger = projectTrigger(input.triggerId)
    const waiting = (ticket.undelivered ?? []).includes(input.id)
    const delivered = !!(input.deliveredTo || input.deliveredAt || input.readAt)
    const status = waiting ? 'queued' : input.readAt || (delivered && input.readAt === undefined) ? 'read'
      : delivered ? 'delivered' : 'unknown'
    const delivery = deliveryOf(input.id)
    return { id: input.id, at: input.at, trigger, context: !!input.context, status,
      assignmentId: input.deliveredTo, deliveredAt: delivery?.assignmentId === input.deliveredTo ? delivery?.at ?? input.deliveredAt
        : input.deliveredAt, readAt: input.readAt || undefined }
  })
  const keys = new Set([...(origin?.threads ?? []), ...inputs.flatMap(input => input.trigger?.threads ?? []),
    ...(ticket.follows ?? []).map(follow => follow.thread)])
  const threads = [...keys].map(key => {
    const record = JSON.parse(thread.get(key)?.value ?? '{}')
    return { key, title: record.meta?.label ?? key, pending: record.pending?.length ?? 0,
      evaluating: !!record.evaluating, subscribed: record.subscriptions?.includes(ticket.id) ?? false }
  })
  return { id: ticket.id, title: ticket.title, stage: row.stage, action: row.action, createdAt: ticket.createdAt,
    ended: ticket.ended, sessionId: row.sessionId, prs, replies, assignments,
    origin, threads, inputs, delivery: ticket.delivery && { at: ticket.delivery.at, error: ticket.delivery.error },
    mandate: ticket.mandate && { scope: ticket.mandate.scope, strength: ticket.mandate.strength, policyVersion: ticket.mandate.policyVersion },
    decision: decision && { id: decision.id, at: decision.at, kind: decision.kind, reasons: decision.reason.map(item => item.code) } }
}

async function snapshot() {
  const live = await api('observatory').catch(async () => ({ state: await api('state'), workers: [] }))
  const { state } = live
  const [sources, open, ended, decisions, agent, project] = await Promise.all([
    api('sources'), api('tickets?state=open&limit=1000'), api('tickets?state=ended&limit=8'),
    api('decisions?limit=8'), history('agent'), history('project'),
  ])
  const value = state.setup.accounts?.repository ?? ''
  const repository = /^[\w.-]+\/[\w.-]+$/.test(value) ? value : ''
  const messageTimes = new Map([...agent.messages, ...project.messages].filter(item => item.from === 'agent')
    .map(item => [item.id, item.at]))
  const db = new DatabaseSync(join(state.setup.machine.stateDir, 'orchestrator.sqlite'), { readOnly: true })
  let tickets
  let effects
  try {
    db.exec('BEGIN')
    let deliveryOf
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='observation'").get()) {
      const delivery = db.prepare("SELECT at, value FROM observation WHERE type = 'input.delivered' AND json_extract(value, '$.inputId') = ? ORDER BY seq DESC LIMIT 1")
      deliveryOf = inputId => {
        const row = delivery.get(inputId)
        return row && { assignmentId: JSON.parse(row.value).assignmentId, at: row.at }
      }
    }
    const workers = new Map(live.workers.map(worker => [worker.ticketId, worker]))
    tickets = [...new Map([...ended.items, ...open.items].map(row => [row.id, row])).values()]
      .map(row => ticketProjection(db, repository, row, messageTimes, deliveryOf))
      .filter(Boolean).map(ticket => ({ ...ticket, worker: workers.get(ticket.id) }))
    effects = db.prepare('SELECT kind, count(*) AS count, min(due) AS due, max(attempts) AS attempts FROM effect GROUP BY kind').all()
  } finally {
    db.close()
  }
  return { at: new Date().toISOString(), repository, load: state.load, runtime: state.health.runtime?.state,
    router: state.masterId, paused: state.paused, openCount: open.total, tickets, effects, cursor: live.cursor,
    sources: sources.filter(item => item.enabled && item.installed).map(({ id, title, health }) =>
      ({ id, title: title.zh, state: health?.some(item => item.state === 'error') ? 'error' : 'ready' })),
    decisions: decisions.items.map(({ id, at, kind, reason, ticketId }) =>
      ({ id, at, kind, reasons: reason.map(item => item.code), ticketId })) }
}

function reply(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'" })
  res.end(body)
}

async function proxyObservations(req, res, url) {
  const after = req.headers['last-event-id'] ?? url.searchParams.get('after') ?? '0'
  if (typeof after !== 'string' || !/^\d+$/.test(after)) return reply(res, 400, '{"error":"无效的事件游标"}')
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3500)
  res.once('close', () => controller.abort())
  try {
    const stream = await fetch(`${upstream}/orchestrator/api/observations?after=${after}`, {
      headers: { 'x-orchestrator-request': '1' }, signal: controller.signal,
    })
    if (!stream.ok || !stream.body) return reply(res, 503, '{"error":"事件流暂不可用"}')
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform' })
    res.flushHeaders()
    Readable.fromWeb(stream.body).on('error', () => res.destroy()).pipe(res)
  } catch {
    if (!res.destroyed) reply(res, 503, '{"error":"事件流暂不可用"}')
  } finally {
    clearTimeout(timeout)
  }
}

if (import.meta.main) createServer(async (req, res) => {
  const { host, origin } = req.headers
  if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host) || origin && origin !== `http://${host}`) {
    return reply(res, 403, '{"error":"仅接受本机请求"}')
  }
  if (req.method !== 'GET') return reply(res, 405, '{"error":"只读预览"}')
  const url = new URL(req.url, upstream)
  switch (url.pathname) {
    case '/': return reply(res, 200, page, 'text/html; charset=utf-8')
    case '/graph.js': return reply(res, 200, script, 'text/javascript; charset=utf-8')
    case '/graph.css': return reply(res, 200, style, 'text/css; charset=utf-8')
    case '/api/topology':
      try { return reply(res, 200, JSON.stringify(await snapshot())) }
      catch { return reply(res, 503, '{"error":"无法读取 SuperAgent 状态，请检查 3082 上的部署"}') }
    case '/api/observations': return proxyObservations(req, res, url)
    default: return reply(res, 404, '{"error":"未找到页面"}')
  }
}).listen(port, '127.0.0.1', () => console.log(`Observatory preview: http://127.0.0.1:${port}/`))
