/** Tests for the QQ Source: configuration, Trigger normalization, scope, Policy rows and passive replies. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearQqTokens } from '../src/sources/qq-auth.ts'
import { qqSequence, sendQq } from '../src/sources/qq-channel.ts'
import { gatewayPayload } from '../src/sources/qq-gateway.ts'
import { qqKind, QqConfigSchema } from '../src/sources/qq.ts'
import { qqTrigger } from '../src/sources/qq-trigger.ts'
import type { OutboundMessage } from '../src/core/index.ts'

const SECRET = 'QQ_TEST_SECRET'
const groupAt = (overrides: Record<string, unknown> = {}) => ({
  id: 'm1', content: ' Please fix the margin ', timestamp: '2026-11-05T03:00:00+08:00',
  group_openid: 'G1', author: { member_openid: 'M1', member_role: 'member' }, ...overrides,
})
const direct = (overrides: Record<string, unknown> = {}) => ({
  id: 'm2', content: 'hello', timestamp: '2026-11-05T03:00:01+08:00',
  author: { user_openid: 'U1' }, ...overrides,
})
const reply = (id = 'r1'): OutboundMessage => ({
  id, kind: 'reply', text: 'Done',
  channel: { source: 'qq', thread: 'qq:group:G1', address: { groupOpenid: 'G1', messageId: 'm1' } },
})
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })

beforeEach(() => { clearQqTokens() })
afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env[SECRET]
})

describe('QQ configuration and Triggers', () => {
  it('fills safe defaults and rejects duplicate groups', () => {
    expect(QqConfigSchema.parse({})).toEqual({ appId: '', secretEnv: 'QQ_BOT_CLIENT_SECRET', sandbox: false, groups: [], otherGroups: 'none', directMessages: true })
    expect(() => QqConfigSchema.parse({ groups: [{ groupOpenid: 'G1', listen: 'mentions' }, { groupOpenid: 'G1', listen: 'all' }] })).toThrow('Duplicate group openids')
  })
  it('turns a group mention into an addressed Trigger with a per-group member id', () => {
    const trigger = qqTrigger('GROUP_AT_MESSAGE_CREATE', groupAt())!
    expect(trigger).toMatchObject({
      source: 'qq', threads: [{ source: 'qq', id: 'group:G1' }], actor: { source: 'qq', id: 'G1:M1' },
      human: true, addressed: 'mention', text: 'Please fix the margin',
      channel: { source: 'qq', thread: 'qq:group:G1', address: { groupOpenid: 'G1', messageId: 'm1' } },
    })
    expect(trigger.meta).toMatchObject({ groupOpenid: 'G1', memberOpenid: 'M1', direct: false, mentioned: true })
  })
  it('distinguishes full group messages, single chat, bot messages and unrelated events', () => {
    const full = qqTrigger('GROUP_MESSAGE_CREATE', groupAt())!
    expect(full.human).toBe(true)
    expect(full).not.toHaveProperty('addressed')
    expect(qqTrigger('C2C_MESSAGE_CREATE', direct())).toMatchObject({
      threads: [{ source: 'qq', id: 'c2c:U1' }], actor: { source: 'qq', id: 'c2c:U1' }, addressed: 'direct',
      channel: { source: 'qq', thread: 'qq:c2c:U1', address: { userOpenid: 'U1', direct: 'true', messageId: 'm2' } },
    })
    expect(qqTrigger('GROUP_AT_MESSAGE_CREATE', groupAt({ author: { member_openid: 'M1', bot: true } }))).toBeUndefined()
    expect(qqTrigger('GROUP_ADD_ROBOT', groupAt())).toBeUndefined()
  })
})
describe('QQ scope and Policy', () => {
    const config = QqConfigSchema.parse({ groups: [
      { groupOpenid: 'G1', listen: 'mentions' }, { groupOpenid: 'G2', name: 'Full', listen: 'all' }], otherGroups: 'mentions' })
  it('listens to configured groups according to their mode, and to other groups only when mentioned', () => {
    expect(qqKind.scope!({ meta: { groupOpenid: 'G1', mentioned: true } }, config)).toEqual({ listened: true, observed: false, row: 'G1' })
    expect(qqKind.scope!({ meta: { groupOpenid: 'G1', mentioned: false } }, config)).toEqual({ listened: false, reason: 'not_addressed' })
    expect(qqKind.scope!({ meta: { groupOpenid: 'G2', mentioned: false } }, config)).toEqual({ listened: true, observed: true, row: 'G2' })
    expect(qqKind.scope!({ meta: { groupOpenid: 'G3', mentioned: true } }, config)).toEqual({ listened: true, observed: false, row: 'other' })
    expect(qqKind.scope!({ meta: { groupOpenid: 'G3', mentioned: false } }, config)).toEqual({ listened: false, reason: 'not_addressed' })
    expect(qqKind.scope!({ meta: { direct: true } }, config)).toEqual({ listened: true, observed: false, row: 'direct' })
    expect(qqKind.scope!({ meta: { direct: true } }, QqConfigSchema.parse({ directMessages: false }))).toEqual({ listened: false, reason: 'direct_messages_not_allowed' })
  })
  it('describes the Policy admission rows for groups, other groups and direct messages', () => {
    expect(qqKind.policy!.rows!(config).map(row => row.id)).toEqual(['G1', 'G2', 'other', 'direct'])
    expect(qqKind.policy!.rows!(config)[1]).toMatchObject({ label: 'Full', note: { zh: '全部消息', en: 'All' },
      cells: { listedUnaddressed: true, unlistedAddressed: true, unlistedUnaddressed: true } })
  })
})
describe('QQ passive replies', () => {
  const host = (config: ReturnType<typeof QqConfigSchema.parse>) => ({ commands: {} as never, config })
  it('uses a stable reply sequence, sends the trigger message id, and posts to the group', async () => {
    process.env[SECRET] = 'secret'
    const fetch = vi.fn(async (input: string | URL | Request, _init?: RequestInit) => String(input).includes('getAppAccessToken')
      ? ok({ access_token: 'token', expires_in: '7200' }) : ok({ id: 'sent' }))
    vi.stubGlobal('fetch', fetch)
    const config = QqConfigSchema.parse({ appId: '123', secretEnv: SECRET })
    await expect(sendQq(host(config), reply())).resolves.toBe('sent')
    expect(qqSequence('r1')).toBe(qqSequence('r1'))
    const [tokenCall, sendCall] = fetch.mock.calls
    expect(String(tokenCall![0])).toBe('https://api.bot.qq.com/app/getAppAccessToken')
    expect(String(sendCall![0])).toBe('https://api.bot.qq.com/v2/groups/G1/messages')
    expect(JSON.parse(String(sendCall![1]?.body))).toEqual({ content: 'Done', msg_type: 0, msg_id: 'm1', msg_seq: qqSequence('r1') })
    expect(sendCall![1]?.headers).toMatchObject({ authorization: 'QQBot token' })
  })
  it('treats a duplicate sequence as sent and an expired reply as gone', async () => {
    process.env[SECRET] = 'secret'
    const config = QqConfigSchema.parse({ appId: '123', secretEnv: SECRET })
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => String(input).includes('getAppAccessToken')
      ? ok({ access_token: 'token', expires_in: 7200 })
      : new Response(JSON.stringify({ code: 40054005, message: 'duplicate' }), { status: 400 })))
    await expect(sendQq(host(config), reply())).resolves.toBe('sent')
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => String(input).includes('getAppAccessToken')
      ? ok({ access_token: 'token', expires_in: 7200 })
      : new Response(JSON.stringify({ code: 304027, message: 'expired' }), { status: 400 })))
    await expect(sendQq(host(config), reply())).resolves.toBe('gone')
  })
  it('reads gateway frames and ignores malformed ones', () => {
    expect(gatewayPayload('{"op":0,"t":"READY","s":1}')).toEqual({ op: 0, t: 'READY', s: 1 })
    expect(gatewayPayload('not json')).toBeUndefined()
    expect(gatewayPayload({})).toBeUndefined()
  })
})
