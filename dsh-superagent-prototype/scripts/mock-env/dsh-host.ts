/**
 * Minimal in-memory DSH host for the mock sandbox.
 * It provides the services `Runtime` needs, simulates Session creation, inbox delivery and status events, and lets the
 * sandbox drive the same Main Session tools and Executor Session tools a real model would call.
 */
import { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import { Runtime, type RuntimeObservation } from '../../src/app/runtime.ts'
import { Store } from '../../src/app/store.ts'
import { SettingsSchema } from '../../src/policy.ts'
import type { Machine } from '../../src/deployment.ts'

export interface Delivery { at: string; sessionId: string; mode: 'queue' | 'steer' | 'inject'; id: string; text: string }
interface ToolInvocation { startedAt: string; sessionId: string; assignmentId?: string; name: string; input: unknown }
export type Observation = RuntimeObservation
  | { kind: 'inbox'; at: string; delivery: Delivery }
  | { kind: 'session'; at: string; sessionId: string; state: 'created' | 'running' | 'idle'; preset?: string; workspace?: string }
  | (ToolInvocation & { kind: 'tool-start'; at: string })
  | (ToolInvocation & { kind: 'tool'; at: string; output?: unknown; error?: string })
  | { kind: 'repository-read'; at: string; sessionId: string; repository: string; path: string; content: string }
interface RegisteredTool { name: string; execute: (args: unknown, execution: { signal: AbortSignal }) => Promise<unknown> }
interface FakeAgent {
  id: string
  ctx: Context
  status: string
  inbox: { nextTurn: UserMessage[]; nextStep: UserMessage[]; remove(id: string): boolean }
  session: { id: string; header: { parentSession?: string; agentPreset?: string }; snapshotEvents(): unknown[]; requestHeader(): unknown; append(): void }
  cancel(cause?: unknown, options?: { keepInbox?: boolean }): void
  inject(message: UserMessage): void
  followup(message: UserMessage): void
  steer(message: UserMessage): void
  whenIdle(): Promise<void>
}

/** Mutable volatile setting, as Cordis exposes live configuration values. */
const reference = <T>(value: T) => {
  let current = value
  return { get: () => current, set: (next: T) => { current = next } }
}

export interface MockHostOptions {
  stateDir: string
  port: number
  /** Writes settings before the Runtime opens them, such as the simulated GitHub Source and allowed senders. */
  seed(store: Store): void
  /** Answers for the fake subprocess, keyed by the joined argv (`env` assignments stripped). */
  answers: Record<string, string>
}

export interface MockHost {
  runtime: Runtime
  ctx: Context
  stateDir: string
  agents: Map<string, FakeAgent>
  deliveries: Delivery[]
  observations: readonly Observation[]
  observe(event: Observation): void
  onDelivery(listener: (delivery: Delivery) => void): () => void
  runTool(sessionId: string, name: string, args: unknown): Promise<unknown>
  setIdle(sessionId: string): void
  wantIdle(sessionId: string): boolean
  orchestrator(req: IncomingMessage, res: ServerResponse): Promise<void> | undefined
  stop(): Promise<void>
}

/** Start a Runtime on fake DSH services; returns the handles the sandbox and the auto-pilot use. */
export async function startMockHost(options: MockHostOptions): Promise<MockHost> {
  const { stateDir, port, answers } = options
  const store = new Store(join(stateDir, 'orchestrator.sqlite'))
  store.saveSettings(SettingsSchema.parse({}))
  options.seed(store)
  store.close()

  const deliveries: Delivery[] = []
  const observations: Observation[] = []
  const observe = (event: Observation) => {
    observations.push(event)
    if (observations.length > 4000) observations.splice(0, 400)
  }
  const listeners = new Set<(delivery: Delivery) => void>()
  const agents = new Map<string, FakeAgent>()
  const tools = new Map<string, Map<string, RegisteredTool>>()
  let orchestratorHandler: ((req: IncomingMessage, res: ServerResponse) => Promise<void>) | undefined

  const subprocess = {
    spawn: (spec: { argv: readonly string[] }) => {
      const argv = [...spec.argv]
      while (argv[0] === 'env' || /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[0] ?? '')) argv.shift()
      const text = answers[argv.join(' ')] ?? ''
      const reader = (value: string) => ({ readFrom: () => ({ text: value, nextOffset: value.length, lossy: false }) })
      return { done: Promise.resolve({ exitCode: 0, signal: null }), collected: { stdout: reader(text), stderr: reader('') } }
    },
  }
  const jobs = {
    list: () => [] as { id: string; owner?: string; status: string; label?: string }[],
    wait: () => new Promise<{ status: string }>(() => {}),
    kill: () => undefined,
    events: { subscribe: () => () => {} },
  }
  const subagents = {
    waitForChildren: async () => false,
    listChildren: async () => [],
    drainChildren: async () => {},
    drainDescendants: async () => {},
    interrupt: () => {},
  }

  function statusEvent(agent: FakeAgent, status: 'running' | 'idle'): void {
    observe({ kind: 'session', at: new Date().toISOString(), sessionId: agent.id, state: status })
    ctx.emit('agent/status', { agent, status } as never)
  }
  const create = async ({ sessionId, agentPreset, workspaceId }: { sessionId: string; agentPreset?: string; workspaceId?: string }): Promise<void> => {
    if (agents.has(sessionId)) return
    const agentCtx = new Context()
    const sessionTools = new Map<string, RegisteredTool>()
    tools.set(sessionId, sessionTools)
    const register = (tool: RegisteredTool) => { sessionTools.set(tool.name, tool); return () => sessionTools.delete(tool.name) }
    agentCtx.reflect.provide('tools', { register, get: () => undefined, restrict: () => () => {}, guard: () => () => {} })
    agentCtx.reflect.provide('skills', { register: () => () => {} })
    agentCtx.reflect.provide('systemPrompt', { section: () => () => {} })

    const inbox = {
      nextTurn: [] as UserMessage[], nextStep: [] as UserMessage[],
      remove: (id: string) => [inbox.nextTurn, inbox.nextStep].some(list => {
        const at = list.findIndex(message => message.id === id)
        if (at >= 0) list.splice(at, 1)
        return at >= 0
      }),
    }
    const session = { id: sessionId, header: { agentPreset }, snapshotEvents: () => [], requestHeader: () => undefined, append: () => {} }
    const taken = new Set<string>()
    let turn = 0
    const take = (starts: boolean, cut = false) => {
      const agent = agents.get(sessionId)!
      const queued = starts ? inbox.nextTurn.filter(message => !taken.has(message.id)).slice(0, 1) : []
      for (const message of [...inbox.nextStep.filter(item => !taken.has(item.id)), ...queued]) {
        taken.add(message.id)
        ctx.emit('agent/inbox/claimed', { agent, message, turn } as never)
        if (!cut) ctx.emit('session/event', session as never, { type: 'user/message', data: message } as never)
      }
    }
    const idle: (() => void)[] = []
    let status = 'idle'
    const agent = {
      id: sessionId, ctx: agentCtx, inbox, session,
      get status() { return status },
      set status(next: string) { status = next; if (next === 'idle') for (const wake of idle.splice(0)) wake() },
      whenIdle: () => status === 'idle' ? Promise.resolve() : new Promise<void>(resolve => { idle.push(resolve) }),
      cancel: (_cause?: unknown, options?: { keepInbox?: boolean }) => {
        if (!options?.keepInbox) { inbox.nextTurn.length = 0; inbox.nextStep.length = 0 }
        if (status === 'idle') return
        queueMicrotask(() => {
          if (agents.get(sessionId)?.status === 'idle') return
          agent.status = 'idle'
          statusEvent(agent, 'idle')
        })
      },
      inject: (message: UserMessage) => {
        inbox.nextStep.push(message)
        record({ at: new Date().toISOString(), sessionId, mode: 'inject', id: message.id, text: textOf(message) })
      },
      followup: (message: UserMessage) => deliver(message, 'queue'),
      steer: (message: UserMessage) => deliver(message, 'steer'),
    } as FakeAgent
    const record = (entry: Delivery) => {
      deliveries.push(entry)
      observe({ kind: 'inbox', at: entry.at, delivery: entry })
      for (const listener of listeners) listener(entry)
    }
    const deliver = (message: UserMessage, mode: 'queue' | 'steer') => {
      inbox[mode === 'queue' ? 'nextTurn' : 'nextStep'].push(message)
      record({ at: new Date().toISOString(), sessionId, mode, id: message.id, text: textOf(message) })
      if (agent.status !== 'idle') return
      agent.status = 'running'
      statusEvent(agent, 'running')
      turn += 1
      take(true)
    }
    agents.set(sessionId, agent)
    observe({ kind: 'session', at: new Date().toISOString(), sessionId, state: 'created', preset: agentPreset, workspace: workspaceId })
  }

  const resolveAgent = async (id: string) => agents.has(id) ? { agent: agents.get(id) } : { error: { code: 'session/not-found' } }
  const controller = {
    create,
    resolveAgent,
    selectModel: async () => {},
    rename: async () => {},
    prompt: () => { throw new Error('Plugin delivery must not use user RPC') },
    inspect: async () => ({ events: [] }),
    modelCatalog: async () => ({ providers: [] }),
  }
  const persistence = {
    flush: async () => {},
    open: async () => ({ read: async () => ({ events: [] }), [Symbol.asyncDispose]: async () => {} }),
  }
  const webServer = {
    host: '127.0.0.1', port,
    register: (route: { handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> }) => {
      orchestratorHandler = route.handler
      return () => {}
    },
  }
  const services = {
    agents, llm: { resolveCallConfig: async (value: unknown) => value }, sessionController: controller,
    sessionPersistence: persistence, workspaceRegistry: { create: async (cwd: string) => ({ id: cwd }) },
    permissionPresets: { set: () => {} }, subprocess, webServer, jobs, subagents,
  }
  const ctx = new Context()
  for (const [name, service] of Object.entries(services)) ctx.reflect.provide(name, service as never)

  const machine: Machine = {
    stateDir, promptMaxChars: reference(100_000), admissionContextMaxPages: reference(10), admissionContextTimeoutMs: reference(15_000),
  } as Machine
  const runtime = new Runtime(ctx, machine, () => { /* The sandbox does not restart accounts. */ }, observe)
  await runtime.ready

  const runTool = async (sessionId: string, name: string, args: unknown): Promise<unknown> => {
    const tool = tools.get(sessionId)?.get(name)
    if (!tool) throw new Error(`Tool ${name} is not registered for ${sessionId}`)
    const startedAt = new Date().toISOString()
    const assignmentId = sessionId.startsWith('worker-')
      ? runtime.store.tickets.get(sessionId.slice(7))?.assignments.at(-1)?.id : undefined
    const record = { startedAt, sessionId, assignmentId, name, input: args }
    observe({ ...record, kind: 'tool-start', at: startedAt })
    try {
      const output = await tool.execute(args, { signal: new AbortController().signal })
      observe({ ...record, kind: 'tool', at: new Date().toISOString(), output })
      return output
    } catch (error) {
      observe({ ...record, kind: 'tool', at: new Date().toISOString(), error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }
  const setIdle = (sessionId: string) => {
    const agent = agents.get(sessionId)
    if (!agent || agent.status === 'idle') return
    agent.status = 'idle'
    ctx.emit('agent/status', { agent, status: 'idle' } as never)
  }
  const wantIdle = (sessionId: string) => agents.get(sessionId)?.status === 'idle'
  return {
    runtime, ctx, stateDir, agents, deliveries, observations, observe,
    onDelivery: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    runTool, setIdle, wantIdle,
    orchestrator: (req, res) => orchestratorHandler?.(req, res),
    stop: async () => { await runtime.stop() },
  }
}

function textOf(message: UserMessage): string {
  return message.content.map(block => block.type === 'text' ? block.text : '').join('')
}
