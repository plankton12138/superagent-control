/**
 * SuperAgent mock control-plane sandbox.
 *
 * Runs the real Runtime (Engine, Policy, Tickets, Executor, Outbox) on an in-memory DSH host and a simulated GitHub
 * repository, so admission, routing, ticket lifecycle, concurrency, pause, stop and retry can be exercised without DSH,
 * a model provider, a real repository, or network access.
 *
 * Start it with `pnpm mock` and open the printed control-console URL.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { githubKind } from '../../src/sources/github.ts'
import { feishuKind } from '../../src/sources/feishu.ts'
import { AutoPilot, type WorkerBehavior } from './autopilot.ts'
import { startMockHost, type MockHost } from './dsh-host.ts'
import { MockFeishu } from './mock-feishu.ts'
import { MockGithub } from './mock-github.ts'
import { PAGE } from './ui.ts'

interface Injected {
  at: string
  kind: 'issue' | 'comment' | 'feishu'
  author: string
  text: string
  triggerId: string
  result: string
}

const argv = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const at = argv.indexOf(name)
  return at >= 0 ? argv[at + 1] : undefined
}
const port = Number(flag('--port') ?? process.env.MOCK_PORT ?? 3099)
const stateDir = resolve(flag('--state') ?? process.env.MOCK_STATE ?? '.mock/state')
const keep = argv.includes('--keep')
const autoRoute = !argv.includes('--manual')
const defaultBehavior = (flag('--behavior') ?? 'ready') as WorkerBehavior

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`Invalid port: ${port}`)
  process.exit(1)
}
if (!keep && existsSync(stateDir)) {
  try { rmSync(stateDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) }
  catch (error) {
    console.error(`Cannot clear ${stateDir}: ${error instanceof Error ? error.message : String(error)}`)
    console.error('Another sandbox may still be running. Stop it, pass --keep, or set MOCK_STATE to another directory.')
    process.exit(1)
  }
}

const github = new MockGithub(stateDir)
const feishu = new MockFeishu(stateDir)
const restoreCommands = github.install()
const injected: Injected[] = []

const host: MockHost = await startMockHost({
  stateDir,
  port,
  answers: { ...github.setupAnswers(), ...feishu.setupAnswers() },
  seed(store) {
    const settings = store.settings()
    store.saveSettings({
      ...settings,
      sources: {
        github: { enabled: true, config: { repository: github.repository, cli: github.cli, pollSeconds: 3600,
          observeIssues: true, observeComments: true } },
        feishu: { enabled: true, config: { cli: feishu.cli, chats: [{ chatId: feishu.chatId, listen: 'all' }], directMessages: true } },
      },
      policy: { ...settings.policy, sources: {
        github: { allowed: [{ id: 'alice' }, { id: 'bob' }] },
        feishu: { allowed: feishu.allowed.map(id => ({ id })) },
      } },
      eval: { ...settings.eval, mode: 'auto' },
      executor: { ...settings.executor, maxWorkers: 2 },
    })
  },
})

host.runtime.sources.register(githubKind)
host.runtime.context({ kind: 'github', health: ['github'] })
  .report('github', { state: 'ready', detail: '模拟 GitHub 来源已连接；事件由模拟控制台注入。', at: new Date().toISOString() })
host.runtime.sources.register(feishuKind)
host.runtime.context({ kind: 'feishu', health: ['feishu', 'history'] })
  .report('feishu', { state: 'ready', detail: '模拟飞书机器人已连接；事件由模拟控制台注入。', at: new Date().toISOString() })
host.runtime.context({ kind: 'feishu', health: ['feishu', 'history'] })
  .report('history', { state: 'ready', detail: '模拟飞书不读取历史消息。', at: new Date().toISOString() })

const autopilot = new AutoPilot(host, { autoRoute, defaultBehavior })
autopilot.start()

const server = createServer((req, res) => {
  void route(req, res).catch(error => { send(res, 500, { error: error instanceof Error ? error.message : String(error) }) })
})
await new Promise<void>((resolveListen, reject) => {
  server.once('error', reject)
  server.listen(port, '127.0.0.1', () => resolveListen())
}).catch((error: unknown) => {
  console.error(`Cannot listen on 127.0.0.1:${port}: ${String(error)}`)
  console.error('Set MOCK_PORT or pass --port <number> to use another port.')
  process.exit(1)
})

console.log('')
console.log('SuperAgent 模拟环境已启动')
console.log(`  控制台:   http://127.0.0.1:${port}/`)
console.log(`  状态 API: http://127.0.0.1:${port}/mock/state`)
console.log(`  管理 API: /orchestrator/api/*（需请求头 x-orchestrator-request: 1，控制台会自动带上）`)
console.log(`  状态目录: ${stateDir}`)
console.log(`  自动路由: ${autoRoute ? '开' : '关'}；默认 Worker 行为: ${defaultBehavior}`)
console.log('  按 Ctrl+C 退出')
console.log('')

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
  if (url.pathname.startsWith('/orchestrator')) {
    const handled = host.orchestrator(req, res)
    if (handled) return await handled
    send(res, 404, { error: 'Unknown management route' })
    return
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(PAGE)
    return
  }
  if (req.method === 'GET' && url.pathname === '/mock/state') return send(res, 200, state())
  if (req.method === 'POST' && url.pathname === '/mock/event') return send(res, 200, await inject(await json(req)))
  if (req.method === 'POST' && url.pathname === '/mock/worker-report') return send(res, 200, await report(await json(req)))
  if (req.method === 'POST' && url.pathname === '/mock/behavior') return send(res, 200, behavior(await json(req)))
  if (req.method === 'POST' && url.pathname === '/mock/route') return send(res, 200, await manualRoute(await json(req)))
  if (req.method === 'POST' && url.pathname === '/mock/control') return send(res, 200, control(await json(req)))
  send(res, 404, { error: 'Not found' })
}

async function inject(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const type = input.type === 'comment' ? 'comment' : input.type === 'feishu' ? 'feishu' : 'issue'
  const author = typeof input.author === 'string' && input.author.trim() ? input.author.trim() : 'alice'
  const body = typeof input.body === 'string' ? input.body : ''
  const mentions = input.mentions !== false
  const behavior = (typeof input.behavior === 'string' ? input.behavior : defaultBehavior) as WorkerBehavior
  const number = typeof input.number === 'number' && Number.isInteger(input.number) && input.number > 0 ? input.number : undefined
  try {
    const trigger = type === 'feishu'
      ? feishu.trigger({ author, body, mentions, direct: input.direct === true })
      : type === 'issue'
        ? github.issue({ number, author, title: typeof input.title === 'string' ? input.title : undefined, body, mentions })
        : github.comment({ number: number ?? github.lastNumber(), id: typeof input.commentId === 'number' ? input.commentId : undefined,
          author, body, mentions, isPr: input.isPr === true })
    const result = host.runtime.receive(trigger)
    autopilot.planTrigger(trigger.id, behavior)
    injected.push({ at: new Date().toISOString(), kind: type, author, text: trigger.text, triggerId: trigger.id, result })
    if (injected.length > 200) injected.splice(0, injected.length - 200)
    return { triggerId: trigger.id, result, number: trigger.meta.number, addressed: !!trigger.addressed }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

async function report(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const ticketId = String(input.ticket_id ?? '')
  const state = String(input.state ?? 'ready') as 'progress' | 'ready' | 'blocked' | 'failed' | 'dropped'
  if (!ticketId) return { error: 'ticket_id is required' }
  try {
    const result = await host.runTool(`worker-${ticketId}`, 'orchestrator_report', { state,
      summary: typeof input.summary === 'string' ? input.summary : '模拟控制台写入的报告。',
      ...(state === 'blocked' ? { human_action: typeof input.human_action === 'string' ? input.human_action : '需要人工确认后继续。' } : {}) })
    host.setIdle(`worker-${ticketId}`)
    return { ok: true, result }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

function behavior(input: Record<string, unknown>): Record<string, unknown> {
  const ticketId = String(input.ticket_id ?? '')
  const value = String(input.behavior ?? '') as WorkerBehavior
  if (!ticketId || !['ready', 'blocked', 'failed', 'silent', 'progress'].includes(value)) return { error: 'ticket_id and a valid behavior are required' }
  autopilot.planTicket(ticketId, value)
  return { ok: true, ticket_id: ticketId, behavior: value }
}

async function manualRoute(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const triggerId = String(input.trigger_id ?? '')
  const kind = String(input.kind ?? 'accept')
  if (!triggerId) return { error: 'trigger_id is required' }
  const item: Record<string, unknown> = { kind, trigger_id: triggerId }
  if (kind === 'accept') {
    item.title = String(input.title ?? '模拟请求')
    item.worktree_name = String(input.worktree_name ?? `manual-${Date.now().toString(36)}`)
    item.acknowledgement = String(input.acknowledgement ?? '收到，开始处理。')
  }
  if (kind === 'ignore') item.reason = String(input.reason ?? '模拟控制台忽略。')
  if (kind === 'stop') item.ticket_id = String(input.ticket_id ?? '')
  if (kind === 'attach') item.ticket_id = String(input.ticket_id ?? '')
  try {
    return { result: await host.runTool(host.runtime.masterId, 'orchestrator_route', { decisions: [item] }) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

function control(input: Record<string, unknown>): Record<string, unknown> {
  if (typeof input.autoRoute === 'boolean') autopilot.autoRoute = input.autoRoute
  if (typeof input.defaultBehavior === 'string') autopilot.defaultBehavior = input.defaultBehavior as WorkerBehavior
  return { ok: true, autoRoute: autopilot.autoRoute, defaultBehavior: autopilot.defaultBehavior }
}

function state(): Record<string, unknown> {
  const settings = host.runtime.store.settings()
  return {
    info: {
      repository: github.repository, agent: github.agent, stateDir, port,
      paused: settings.paused, evalMode: settings.eval.mode, maxWorkers: settings.executor.maxWorkers,
      activeWorkers: host.runtime.executor.activeCount(), autoRoute: autopilot.autoRoute, masterId: host.runtime.masterId,
    },
    health: host.runtime.health,
    tickets: host.runtime.store.tickets.list().slice(0, 50).map(ticket => {
      const assignment = ticket.assignments.at(-1)
      return { id: ticket.id, title: ticket.title, open: !ticket.ended, ended: ticket.ended, attention: ticket.attention,
        behavior: autopilot.behaviorOf(ticket.id),
        assignment: assignment ? { id: assignment.id, state: assignment.state, report: assignment.report,
          startedAt: assignment.startedAt, endedAt: assignment.endedAt } : undefined }
    }),
    events: injected.slice(-40).reverse().map(item => {
      const disposition = host.runtime.store.triggers.disposition(item.triggerId)
      const decision = disposition?.decisionId ? host.runtime.store.decisions.get(disposition.decisionId) : undefined
      const result = item.result === 'duplicate' || item.result === 'filtered' ? item.result
        : disposition?.filtered ? 'filtered' : disposition?.decisionId ? 'routed' : 'pending'
      return { time: new Date(item.at).toLocaleTimeString('zh-CN', { hour12: false }), kind: item.kind, author: item.author,
        text: item.text.replace(/\s+/g, ' ').slice(0, 120), triggerId: item.triggerId, result, decision: decision?.kind }
    }),
    deliveries: host.deliveries.slice(-80).reverse().map(item => ({ sessionId: item.sessionId, mode: item.mode,
      text: item.text.replace(/\s+/g, ' ').slice(0, 220) })),
  }
}

async function json(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
    return value && typeof value === 'object' ? value as Record<string, unknown> : {}
  } catch { return {} }
}
function send(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(value))
}

let closing = false
async function shutdown(): Promise<void> {
  if (closing) return
  closing = true
  console.log('\n正在停止模拟环境…')
  autopilot.stop()
  await new Promise<void>(resolveClose => { server.close(() => resolveClose()) })
  await host.stop().catch(error => { console.error('Stopping the Runtime failed:', String(error)) })
  restoreCommands()
  process.exit(0)
}
process.on('SIGINT', () => { void shutdown() })
process.on('SIGTERM', () => { void shutdown() })
process.on('unhandledRejection', error => { console.error('[mock] unhandled rejection:', String(error)) })
