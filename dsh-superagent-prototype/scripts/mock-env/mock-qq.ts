import { randomUUID } from 'node:crypto'
import { qqTrigger } from '../../src/sources/qq-trigger.ts'
import { qqKind } from '../../src/sources/qq.ts'

export const qqGroupId = 'qq_mock_group'
export const qqAllowed = ['alice', 'bob'].flatMap(id => [`${qqGroupId}:${id}`, `c2c:${id}`])

// Reuse QQ's real policy, scopes and reply addresses. Only the outbound transport is local.
export const mockQqKind: typeof qqKind = {
  ...qqKind,
  channel: { ...qqKind.channel!, send: async () => 'sent' },
}

export function mockQqTrigger(author: string, body: string, direct: boolean, mentions: boolean, at: string) {
  const id = author.replace(/[^A-Za-z0-9_-]/g, '') || 'visitor'
  const event = direct ? 'C2C_MESSAGE_CREATE' : mentions ? 'GROUP_AT_MESSAGE_CREATE' : 'GROUP_MESSAGE_CREATE'
  const trigger = qqTrigger(event, {
    id: `qq_mock_${randomUUID()}`, content: body, timestamp: at,
    ...(direct ? { author: { user_openid: id } } : { group_openid: qqGroupId, author: { member_openid: id } }),
  })
  if (!trigger) throw new Error('无法构造虚拟 QQ 消息')
  return trigger
}
