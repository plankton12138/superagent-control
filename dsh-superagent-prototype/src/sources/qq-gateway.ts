/** QQ Bot gateway WebSocket client: authentication, heartbeat, dispatch, and resume. */
import type { QqCredentials } from './qq-auth.ts'
import { accessToken, qqRequest, wait } from './qq-auth.ts'

/** The intents a QQ group and single-chat bot needs: `GROUP_AND_C2C_EVENT` (1 << 25). */
export const QQ_INTENTS = 1 << 25
interface Payload { op: number; d?: unknown; s?: number; t?: string }
/** Callbacks the Source loop supplies to the gateway. */
export interface QqGatewayHandlers {
  /** A gateway Dispatch event. */
  onEvent(type: string, data: unknown): void
  /** The session authenticated (`READY`) or resumed (`RESUMED`). */
  onReady(): void
}
interface Connection {
  ready: boolean; sessionId?: string; seq?: number; invalid?: boolean; error?: unknown
}
type SocketFactory = (url: string) => WebSocket

/** Parses one gateway frame; malformed frames are ignored rather than ending the connection. */
export function gatewayPayload(text: unknown): Payload | undefined {
  if (typeof text !== 'string') return undefined
  try {
    const value = JSON.parse(text) as Partial<Payload>
    return typeof value.op === 'number' ? value as Payload : undefined
  } catch { return undefined /* A frame that is not JSON cannot be acted on. */ }
}

/**
 * Runs one connection until it closes: `Identify` when there is no session, `Resume` otherwise.
 * It sends heartbeats, forwards Dispatch events, and reports an invalid session so the caller can Identify again.
 */
async function connect(url: string, credentials: QqCredentials, session: { id?: string; seq?: number } | undefined,
  signal: AbortSignal, handlers: QqGatewayHandlers, create: SocketFactory): Promise<Connection> {
  const token = `QQBot ${await accessToken(credentials, signal)}`
  const socket = create(url)
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let current = session?.seq
  let ready = false
  let invalid = false
  let failure: unknown
  let settled = false
  return await new Promise<Connection>((resolve, reject) => {
    const finish = (): void => {
      if (settled) return
      settled = true
      clearTimeout(deadline)
      if (heartbeat) clearInterval(heartbeat)
      signal.removeEventListener('abort', stop)
      if (signal.aborted) { resolve({ ready, sessionId: session?.id, seq: current }) ; return }
      if (!ready && failure !== undefined) reject(failure)
      else resolve({ ready, sessionId: session?.id, seq: current, ...invalid ? { invalid: true } : {}, ...failure === undefined ? {} : { error: failure } })
    }
    const stop = (): void => { socket.close(); finish() }
    const send = (payload: unknown): void => { try { socket.send(JSON.stringify(payload)) } catch { /* The close handler reports the failed connection. */ } }
    const heartbeatNow = (): void => send({ op: 1, d: current ?? null })
    const deadline = setTimeout(() => {
      failure = new Error('QQ gateway did not become ready within 45 seconds')
      socket.close()
    }, 45_000)
    signal.addEventListener('abort', stop, { once: true })
    socket.addEventListener('open', () => send(session?.id
      ? { op: 6, d: { token, session_id: session.id, seq: current ?? null } }
      : { op: 2, d: {
        token, intents: QQ_INTENTS, shard: [0, 1],
        properties: { $os: process.platform, $browser: 'dsh-superagent', $device: 'dsh-superagent' },
      } }))
    socket.addEventListener('message', event => {
      const payload = gatewayPayload(event.data)
      if (!payload) return
      if (payload.op === 10) {
        const interval = Number((payload.d as { heartbeat_interval?: unknown } | undefined)?.heartbeat_interval)
        if (Number.isFinite(interval) && interval > 0) {
          heartbeatNow()
          heartbeat = setInterval(heartbeatNow, interval)
        }
        return
      }
      if (payload.op === 1) { heartbeatNow(); return }
      if (payload.op === 11) return
      if (payload.op === 7) { socket.close(); return }
      if (payload.op === 9) { invalid = true; socket.close(); return }
      if (payload.op !== 0 || !payload.t) return
      if (typeof payload.s === 'number') current = payload.s
      if (payload.t === 'READY') {
        const id = (payload.d as { session_id?: unknown } | undefined)?.session_id
        if (typeof id === 'string') session = { id, ...current === undefined ? {} : { seq: current } }
        ready = true
        clearTimeout(deadline)
        handlers.onReady()
        return
      }
      if (payload.t === 'RESUMED') {
        ready = true
        clearTimeout(deadline)
        handlers.onReady()
        return
      }
      handlers.onEvent(payload.t, payload.d)
    })
    socket.addEventListener('close', finish)
    socket.addEventListener('error', event => { failure = event })
  })
}

/**
 * Maintains a QQ gateway session: obtains the gateway URL, identifies or resumes, and retries transient disconnects.
 * `RESUMED` uses the stored session ID and last sequence so missed events are replayed by QQ; `op 9` clears them.
 */
export async function runQqGateway(credentials: QqCredentials, signal: AbortSignal, handlers: QqGatewayHandlers,
  create: SocketFactory = url => new WebSocket(url)): Promise<void> {
  let session: { id?: string; seq?: number } | undefined
  let failures = 0
  let previous: unknown
  while (!signal.aborted) {
    const gateway = await qqRequest<{ url?: unknown }>(credentials, 'GET', '/gateway/bot', undefined, signal)
    if (typeof gateway.url !== 'string' || !gateway.url.startsWith('wss://')) throw new Error('QQ did not return a WebSocket gateway URL')
    const connection = await connect(gateway.url, credentials, session, signal, handlers, create)
    if (signal.aborted) return
    if (connection.invalid) session = undefined
    else if (connection.sessionId) session = { id: connection.sessionId, ...connection.seq === undefined ? {} : { seq: connection.seq } }
    failures = connection.ready ? 0 : failures + 1
    previous = connection.error ?? previous
    if (failures >= 5) throw previous instanceof Error ? previous : new Error('The QQ gateway closed repeatedly')
    // A ready connection that dropped resumes immediately; one that never authenticated backs off.
    await wait(connection.ready ? 1000 : Math.min(1000 * 2 ** failures, 60_000), signal)
  }
}
