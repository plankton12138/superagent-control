/** QQ Bot API v2 credentials, access-token cache, and JSON transport. */
import { setTimeout as delay } from 'node:timers/promises'

/** The QQ Bot API endpoints; the sandbox domain is the one the platform documents for testing. */
export const QQ_API = 'https://api.bot.qq.com'
export const QQ_SANDBOX_API = 'https://sandbox.api.sgroup.qq.com'
/** Token endpoint; it is the same in both environments. */
export const QQ_TOKEN_URL = 'https://api.bot.qq.com/app/getAppAccessToken'
/** An AppSecret environment variable and the API environment a QQ Source reads them with. */
export interface QqCredentials { appId: string; secretEnv: string; sandbox: boolean }
/** A failed QQ API call; `code` is the platform's error code when it returned one. */
export class QqApiError extends Error {
  constructor(message: string, readonly code?: number, readonly status?: number) { super(message) }
}
interface TokenEntry { token: string; expiresAt: number }
type Fetcher = typeof fetch
const cache = new Map<string, TokenEntry>()
const pending = new Map<string, Promise<TokenEntry>>()

/** Clears cached access tokens; configuration changes and tests start from a fresh token. */
export const clearQqTokens = (): void => { cache.clear(); pending.clear() }

const timeout = (signal?: AbortSignal): AbortSignal => signal
  ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000)

/** Reads the response body as JSON and throws `QqApiError` for non-2xx responses, keeping the platform error code. */
async function call<T>(url: string, init: RequestInit, fetcher: Fetcher): Promise<T> {
  const response = await fetcher(url, init)
  if (!response.ok) {
    const text = await response.text()
    let code: number | undefined
    let message = text.slice(0, 2000)
    try {
      const body = JSON.parse(text) as { code?: unknown; message?: unknown }
      if (typeof body.code === 'number') code = body.code
      if (typeof body.message === 'string' && body.message) message = body.message
    } catch { /* A non-JSON error body is reported as its text. */ }
    throw new QqApiError(`QQ API ${response.status}: ${message}`, code, response.status)
  }
  if (response.status === 204) return undefined as T
  return await response.json() as T
}

/**
 * Returns a valid access token for `credentials`, reading its AppSecret from the named environment variable.
 * The token is cached per AppID and environment and refreshed 60 seconds before its reported expiry.
 */
export async function accessToken(credentials: QqCredentials, signal?: AbortSignal, fetcher: Fetcher = fetch): Promise<string> {
  const secret = process.env[credentials.secretEnv]
  if (!secret) throw new Error(`QQ AppSecret is not set in ${credentials.secretEnv}`)
  const key = `${credentials.appId}:${credentials.sandbox}`
  const cached = cache.get(key)
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token
  const waiting = pending.get(key)
  if (waiting) return (await waiting).token
  const request = (async (): Promise<TokenEntry> => {
    const body = await call<{ access_token?: unknown; expires_in?: unknown }>(QQ_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appId: credentials.appId, clientSecret: secret }),
      signal: timeout(signal),
    }, fetcher)
    if (typeof body.access_token !== 'string' || !body.access_token) throw new QqApiError('QQ did not return an access token')
    const seconds = Number(body.expires_in)
    const entry = { token: body.access_token, expiresAt: Date.now() + (Number.isFinite(seconds) ? seconds : 7200) * 1000 }
    cache.set(key, entry)
    return entry
  })()
  pending.set(key, request)
  try { return (await request).token }
  finally { pending.delete(key) }
}

/** Calls a QQ OpenAPI path with the bot's access token; `path` starts with `/` and is relative to the environment's API base. */
export async function qqRequest<T>(credentials: QqCredentials, method: 'GET' | 'POST' | 'PUT', path: string,
  body?: unknown, signal?: AbortSignal, fetcher: Fetcher = fetch): Promise<T> {
  const token = await accessToken(credentials, signal, fetcher)
  const base = credentials.sandbox ? QQ_SANDBOX_API : QQ_API
  return call<T>(`${base}${path}`, {
    method,
    headers: { authorization: `QQBot ${token}`, ...body === undefined ? {} : { 'content-type': 'application/json' } },
    ...body === undefined ? {} : { body: JSON.stringify(body) },
    signal: timeout(signal),
  }, fetcher)
}

/** Waits for `ms`, or ends early when `signal` aborts; the gateway loop uses it between reconnects. */
export const wait = (ms: number, signal: AbortSignal): Promise<void> =>
  delay(ms, undefined, { signal }).catch(() => {})
