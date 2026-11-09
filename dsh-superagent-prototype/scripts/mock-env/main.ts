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
import { randomUUID } from 'node:crypto'
import { existsSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { githubKind } from '../../src/sources/github.ts'
import { observePull, pullOf } from '../../src/sources/github-pull.ts'
import { feishuKind } from '../../src/sources/feishu.ts'
import { canRetry, followupOwners } from '../../src/core/index.ts'
import { policyVersion } from '../../src/policy.ts'
import { AutoPilot, isWorkerBehavior } from './autopilot.ts'
import { startMockHost, type MockHost } from './dsh-host.ts'
import { MockFeishu } from './mock-feishu.ts'
import { MockGithub } from './mock-github.ts'
import { mockQqKind, mockQqTrigger, qqAllowed, qqGroupId } from './mock-qq.ts'
import { PAGE } from './ui.ts'
import { ARCHITECTURE_PAGE, CHANNEL_PAGE } from './architecture-ui.ts'
import { scenario, scenarios } from './scenarios.ts'
import { eventView, runTrace, ticketView, type Run } from './trace.ts'
import { inspectRun } from './inspect-run.ts'

const argv = process.argv.slice(2)
const flag = (name: string): string | undefined => {
  const at = argv.indexOf(name)
  return at >= 0 ? argv[at + 1] : undefined
}
const port = Number(flag('--port') ?? process.env.MOCK_PORT ?? 3099)
const stateDir = resolve(flag('--state') ?? process.env.MOCK_STATE ?? '.mock/state')
const keep = argv.includes('--keep')
const autoRoute = !argv.includes('--manual')
const defaultBehavior = flag('--behavior') ?? 'ready'
if (!isWorkerBehavior(defaultBehavior)) {
  console.error(`Invalid Worker behavior: ${defaultBehavior}`)
  process.exit(1)
}

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
const runs: Run[] = []

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
        qq: { enabled: true, config: { groups: [{ groupOpenid: qqGroupId, name: '沙箱测试群', listen: 'all' }], directMessages: true } },
      },
      policy: { ...settings.policy, sources: {
        github: { allowed: [{ id: 'alice' }, { id: 'bob' }] },
        feishu: { allowed: feishu.allowed.map(id => ({ id })) },
        qq: { allowed: qqAllowed.map(id => ({ id })) },
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
host.runtime.sources.register(mockQqKind)
host.runtime.context(mockQqKind)
  .report('qq', { state: 'ready', detail: '模拟 QQ 群聊与私聊已连接。', at: new Date().toISOString() })

const autopilot = new AutoPilot(host, github, { autoRoute, defaultBehavior })
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
  const channelPage = ['/feishu', '/github', '/qq'].includes(url.pathname)
  if (req.method === 'GET' && (channelPage || ['/', '/index.html', '/architecture', '/console'].includes(url.pathname))) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(channelPage ? CHANNEL_PAGE : url.pathname === '/console' ? PAGE : ARCHITECTURE_PAGE)
    return
  }
  if (req.method === 'GET' && url.pathname === '/mock/state') return send(res, 200, state(url.searchParams.get('run')))
  if (req.method === 'GET' && url.pathname === '/mock/inspection') return send(res, 200, inspection(url.searchParams.get('run')))
  if (req.method === 'GET' && url.pathname === '/mock/channels') return send(res, 200, channelState())
  if (req.method === 'GET' && url.pathname === '/mock/scenarios') return send(res, 200, scenarios)
  if (req.method === 'POST' && url.pathname === '/mock/scenario') return send(res, 200, await runScenario(String((await json(req)).id ?? '')))
  if (req.method === 'POST' && url.pathname === '/mock/event') {
    const input = await json(req)
    const run = newRun(input.type === 'feishu' || input.type === 'qq'
      ? `${input.type === 'qq' ? 'QQ' : '飞书'}${input.direct === true ? '私聊' : '群聊'}输入`
      : input.type === 'comment' ? `GitHub ${input.isPr === true ? 'PR' : 'Issue'} 评论` : 'GitHub 新建 Issue')
    try { return send(res, 200, inject(input, run)) }
    catch (error) {
      run.error = error instanceof Error ? error.message : String(error)
      return send(res, 200, { runId: run.id, error: run.error })
    }
  }
  if (req.method === 'POST' && url.pathname === '/mock/pull') return send(res, 200, await finishPull(await json(req)))
  if (req.method === 'POST' && url.pathname === '/mock/retry') return send(res, 200, retry(await json(req)))
  if (req.method === 'POST' && url.pathname === '/mock/worker-report') return send(res, 200, await report(await json(req)))
  if (req.method === 'POST' && url.pathname === '/mock/behavior') return send(res, 200, behavior(await json(req)))
  if (req.method === 'POST' && url.pathname === '/mock/route') return send(res, 200, await manualRoute(await json(req)))
  if (req.method === 'POST' && url.pathname === '/mock/control') return send(res, 200, control(await json(req)))
  send(res, 404, { error: 'Not found' })
}

function newRun(title: string): Run {
  const run: Run = { id: randomUUID(), title, at: new Date().toISOString(), events: [] }
  runs.unshift(run)
  if (runs.length > 40) runs.pop()
  return run
}

async function runScenario(id: string) {
  const selected = scenario(id)
  if (!selected) return { error: '场景不存在' }
  if (!autopilot.autoRoute || host.runtime.store.settings().paused) return { error: '请恢复处理并开启自动路由后再运行场景' }
  const run = newRun(selected.title)
  try {
    const first = inject({ ...selected.events[0]! }, run)
    if (typeof first.number === 'number') {
      for (const message of selected.context ?? []) github.comment({ ...message, number: first.number })
    }
    if (selected.replay) inject({ ...selected.events[0]!, number: first.number }, run)
    if (selected.followup) {
      // Wait for the original ticket's subscription before the comment is allowed to enter intake.
      const store = host.runtime.store
      const deadline = Date.now() + 4000
      while (!eventView(store, run.events[0]!).ticketIds.length) {
        if (Date.now() >= deadline) throw new Error('等待原工单超时，请检查路由和运行状态')
        await delay(50)
      }
    }
    for (const next of selected.events.slice(1)) {
      const injected = inject({ ...next, number: next.type === 'comment' ? first.number : undefined }, run)
      if (selected.followup) autopilot.planFollowup(injected.triggerId)
    }
  } catch (error) {
    run.error = error instanceof Error ? error.message : String(error)
  }
  return { runId: run.id }
}

function inject(input: Record<string, unknown>, run: Run) {
  const type = input.type === 'comment' || input.type === 'feishu' || input.type === 'qq' ? input.type : 'issue'
  const author = typeof input.author === 'string' && input.author.trim() ? input.author.trim() : 'alice'
  const body = typeof input.body === 'string' ? input.body : ''
  const mentions = input.mentions !== false
  const behavior = isWorkerBehavior(input.behavior) ? input.behavior : autopilot.defaultBehavior
  const number = typeof input.number === 'number' && Number.isSafeInteger(input.number) && input.number > 0 ? input.number : undefined
  const at = new Date().toISOString()
  const direct = input.direct === true
  const feishuAuthor = author.startsWith('ou_') ? author : `ou_${author.replace(/[^A-Za-z0-9]/g, '')}`
  const chatId = direct ? `oc_dm_${feishuAuthor}` : input.chatId === 'oc_unconfigured' ? input.chatId : feishu.chatId
  const parent = type === 'feishu' && typeof input.replyTo === 'string'
    ? runs.flatMap(item => item.events).find(event => event.kind === 'feishu' && event.meta?.chatId === chatId && event.meta.messageId === input.replyTo)?.meta
    : undefined
  if (type === 'feishu' && input.replyTo && !parent) throw new Error('要回复的飞书消息不在当前会话')
  const build = () => type === 'feishu'
      ? feishu.trigger({ author, body, mentions, direct, chatId, ...(parent ? { replyTo: {
        rootId: String(parent.rootId ?? parent.messageId), messageId: String(parent.messageId),
      } } : {}) })
      : type === 'qq' ? mockQqTrigger(author, body, direct, mentions, at)
        : type === 'issue'
        ? github.issue({ number, author, title: typeof input.title === 'string' ? input.title : undefined, body, mentions, at })
        : github.comment({ number: number ?? github.lastNumber(), id: typeof input.commentId === 'number' ? input.commentId : undefined,
          author, body, mentions, isPr: input.isPr === true })
  let trigger = build()
  if ((type === 'issue' && number === undefined) || (type === 'comment' && input.commentId === undefined)) {
    while (host.runtime.store.triggers.get(trigger.id)) trigger = build()
  }
  const result = host.runtime.receive(trigger)
  const disposition = result === 'duplicate' ? undefined : host.runtime.store.triggers.disposition(trigger.id)
  if (result === 'stored') {
    autopilot.planTrigger(trigger.id, behavior)
    if (input.assessment === 'copy-fix' || input.assessment === 'unclear') autopilot.planAssessment(trigger.id, input.assessment)
  }
  const target = type === 'feishu' || type === 'qq' ? `${type === 'feishu' ? '飞书' : 'QQ'}${direct ? '私聊' : '群聊'}`
    : `${trigger.meta.isPr ? 'PR' : 'Issue'} #${trigger.meta.number}${type === 'comment' ? ' 评论' : ''}`
  run.events.push({ at, kind: type, author: trigger.actor.id, text: trigger.text, triggerId: trigger.id, result,
    addressed: trigger.addressed, target, meta: trigger.meta,
    ...(disposition ? { intake: { disposition, owners: followupOwners(trigger, host.runtime.store) } } : {}) })
  return { runId: run.id, triggerId: trigger.id, result, number: trigger.meta.number, addressed: !!trigger.addressed }
}

async function finishPull(input: Record<string, unknown>) {
  const ticket = host.runtime.store.tickets.get(String(input.ticket_id ?? ''))
  const number = typeof input.number === 'number' ? input.number : ticket && !ticket.ended ? pullOf(ticket) : undefined
  const pull = number ? github.pull(number) : undefined
  if (!pull || pull.state !== 'open') return { error: '没有可操作的虚拟 PR' }
  if (input.action !== 'merge' && input.action !== 'close') return { error: '未知的 PR 操作' }
  await observePull(host.runtime.context(githubKind), github.finishPull(pull, input.action === 'merge'))
  return { ok: true }
}

function retry(input: Record<string, unknown>) {
  const ticket = host.runtime.store.tickets.get(String(input.ticket_id ?? ''))
  if (!ticket || !canRetry(ticket)) return { error: '工单当前不可重试' }
  host.runtime.engine.retryTicket(ticket.id)
  autopilot.planTicket(ticket.id, 'ready')
  return { ok: true }
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
  const value = input.behavior
  if (!ticketId || !isWorkerBehavior(value)) return { error: 'ticket_id and a valid behavior are required' }
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
  if (isWorkerBehavior(input.defaultBehavior)) autopilot.defaultBehavior = input.defaultBehavior
  return { ok: true, autoRoute: autopilot.autoRoute, defaultBehavior: autopilot.defaultBehavior }
}

function state(runId: string | null): Record<string, unknown> {
  const { store } = host.runtime
  const settings = store.settings()
  const focused = runs.find(run => run.id === runId) ?? runs[0]
  const trace = focused ? runTrace(store, focused) : undefined
  const withPull = (ticket: ReturnType<typeof ticketView>) => ({
    ...ticket, virtualPull: ticket.pull ? github.pull(ticket.pull)?.state === 'open' : false,
  })
  return {
    info: {
      repository: github.repository, agent: github.agent, stateDir, port,
      paused: settings.paused, evalMode: settings.eval.mode, maxWorkers: settings.executor.maxWorkers,
      activeWorkers: host.runtime.executor.activeCount(), autoRoute: autopilot.autoRoute, masterId: host.runtime.masterId,
    },
    health: host.runtime.health,
    tickets: store.tickets.list().slice(0, 50).map(ticket => ({ ...withPull(ticketView(ticket)), behavior: autopilot.behaviorOf(ticket.id) })),
    runs: runs.map(({ id, title, at }) => ({ id, title, at })),
    trace: trace ? { ...trace, tickets: trace.tickets.map(withPull) } : undefined,
    events: runs.flatMap(run => [...run.events].reverse()).slice(0, 40).map(event => eventView(store, event)),
    deliveries: host.deliveries.slice(-80).reverse().map(item => ({ sessionId: item.sessionId, mode: item.mode,
      text: item.text.replace(/\s+/g, ' ').slice(0, 220) })),
  }
}

function channelState() {
  const { store } = host.runtime
  const receipts = new Map<string, { at: string; id: string; text: string; kind: string }[]>()
  for (const entry of host.observations) {
    if (entry.kind !== 'outbox' || entry.status !== 'sent') continue
    const { source, address } = entry.message.channel
    const id = source === 'github' ? address.number : address.messageId
    const target = id && `${source}:${id}`
    if (!target) continue
    const list = receipts.get(target) ?? []
    if (!list.some(reply => reply.id === entry.message.id)) list.push({ at: entry.at, id: entry.message.id, text: entry.message.text, kind: entry.message.kind })
    receipts.set(target, list)
  }
  const issueRuns = new Map<number, string>()
  const commentRuns = new Map<string, string>()
  const pullRuns = new Map<number, string>()
  const chat = []
  for (const run of [...runs].reverse()) for (const event of run.events) {
    const { meta, kind } = event
    if (!meta) continue
    const pulls = [...new Set(eventView(store, event).ticketIds.flatMap(id => {
      const ticket = store.tickets.get(id)
      const pull = ticket && pullOf(ticket)
      return pull && github.pull(pull) ? [pull] : []
    }))]
    for (const pull of pulls) if (!pullRuns.has(pull)) pullRuns.set(pull, run.id)
    if (kind === 'issue' && typeof meta.number === 'number' && !issueRuns.has(meta.number)) issueRuns.set(meta.number, run.id)
    if (kind === 'comment' && typeof meta.commentId === 'number') commentRuns.set(`${meta.number}:${meta.commentId}`, run.id)
    if ((kind === 'feishu' || kind === 'qq') && typeof meta.messageId === 'string') {
      if (kind === 'feishu' && !meta.direct && meta.chatId !== feishu.chatId) continue
      chat.push({ runId: run.id, source: kind, at: event.at, text: event.text, addressed: event.addressed,
        messageId: meta.messageId, parentId: meta.parentId, direct: meta.direct === true, pulls,
        author: kind === 'qq' ? meta.userOpenid ?? meta.memberOpenid : event.author,
        replies: receipts.get(`${kind}:${meta.messageId}`) ?? [] })
    }
  }
  return { repository: github.repository, chat, conversations: github.conversations().map(item => ({
    ...item, runId: (item.isPr ? pullRuns : issueRuns).get(item.number),
    comments: item.comments.map(comment => ({ ...comment, runId: commentRuns.get(`${item.number}:${comment.id}`) })),
    replies: receipts.get(`github:${item.number}`) ?? [],
  })) }
}

function inspection(runId: string | null) {
  const { runtime } = host
  const { store } = runtime
  const settings = store.settings()
  const focused = runs.find(run => run.id === runId) ?? runs[0]
  const trace = focused ? inspectRun(host, focused) : undefined
  const prompt = runtime.prompts.current()
  return {
    runs: runs.map(({ id, title, at }) => ({ id, title, at })),
    runtime: { id: runtime.masterId, active: runtime.executor.activeCount(), limit: settings.executor.maxWorkers,
      paused: settings.paused, autoRoute: autopilot.autoRoute, repository: github.repository },
    trace: trace ? { ...trace, tickets: trace.tickets.map(ticket => ({ ...ticket,
      virtualPull: ticket.pull ? github.pull(ticket.pull)?.state === 'open' : false,
    })) } : undefined,
    system: {
      runtime: runtime.health.runtime,
      setup: { repository: github.repository, githubActor: github.agent, feishuBot: feishu.botId,
        setupProblem: runtime.setupProblem, feishuProblem: runtime.feishuProblem },
      settings: { mode: settings.eval.mode, version: policyVersion(settings), rules: settings.policy.rules, sources: settings.policy.sources },
      prompts: { revision: prompt.revision, savedAt: prompt.savedAt, source: prompt.source },
      effects: Object.fromEntries(Object.entries(runtime.health).filter(([key]) =>
        ['relay', 'notice', 'launch', 'delivery', 'assessment', 'reply'].includes(key))),
      panel: { actions: ['暂停 / 恢复', '停止工单', '重试', '重新评估'], api: '/orchestrator/api/' },
    },
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
