/** Normalizes QQ group and single-chat message events into domain Triggers. */
import { z } from 'zod'
import { key, type ChannelRef, type Trigger } from '../core/index.ts'

export const SOURCE = 'qq'
const AuthorSchema = z.looseObject({
  member_openid: z.string().optional(), user_openid: z.string().optional(),
  member_role: z.string().optional(), bot: z.boolean().optional(),
})
const MessageSchema = z.looseObject({
  id: z.string().min(1), content: z.string().default(''), timestamp: z.string(),
  author: AuthorSchema, group_openid: z.string().optional(),
})
export type QqMessage = z.infer<typeof MessageSchema>
/** The group or single-chat Thread a QQ message belongs to; QQ has no topic threads. */
export const qqThreadId = (direct: boolean, id: string): string => direct ? `c2c:${id}` : `group:${id}`
/** A QQ reply address; the message ID is required because QQ passive replies must carry it. */
export const qqChannel = (message: QqMessage, direct: boolean): ChannelRef | undefined => {
  const group = message.group_openid
  const user = message.author.user_openid
  if (direct && !user) return undefined
  if (!direct && !group) return undefined
  return { source: SOURCE, thread: `qq:${qqThreadId(direct, (direct ? user : group)!)}`,
    address: { messageId: message.id, ...direct ? { userOpenid: user!, direct: 'true' } : { groupOpenid: group! } } }
}
/** Deterministic Trigger ID for a QQ message, so duplicate platform pushes are deduplicated by the Engine. */
export const qqTriggerId = (messageId: string): string => key(SOURCE, messageId)
/**
 * Converts one gateway Dispatch event into a Trigger. `GROUP_AT_MESSAGE_CREATE` is a mention,
 * `GROUP_MESSAGE_CREATE` is an unaddressed group message (only delivered when the group enables full messages),
 * and `C2C_MESSAGE_CREATE` is a direct message. Bot-authored messages produce no Trigger.
 */
export function qqTrigger(eventType: string, input: unknown): Trigger | undefined {
  const direct = eventType === 'C2C_MESSAGE_CREATE'
  const group = eventType === 'GROUP_AT_MESSAGE_CREATE' || eventType === 'GROUP_MESSAGE_CREATE'
  if (!direct && !group) return undefined
  const message = MessageSchema.parse(input)
  if (message.author.bot === true) return undefined
  const channel = qqChannel(message, direct)
  if (!channel) return undefined
  const sender = direct ? message.author.user_openid! : message.author.member_openid
  if (!sender) return undefined
  const time = Date.parse(message.timestamp)
  const actorId = direct ? `c2c:${sender}` : `${message.group_openid}:${sender}`
  return {
    id: qqTriggerId(message.id), source: SOURCE,
    threads: [{ source: SOURCE, id: qqThreadId(direct, (direct ? message.author.user_openid : message.group_openid)!) }],
    actor: { source: SOURCE, id: actorId }, human: true,
    ...(direct ? { addressed: 'direct' as const } : eventType === 'GROUP_AT_MESSAGE_CREATE' ? { addressed: 'mention' as const } : {}),
    at: Number.isFinite(time) ? new Date(time).toISOString() : message.timestamp,
    text: message.content.trim(), channel,
    meta: { messageId: message.id, direct, mentioned: eventType === 'GROUP_AT_MESSAGE_CREATE', eventType,
      ...direct ? { userOpenid: message.author.user_openid } : { groupOpenid: message.group_openid, memberOpenid: message.author.member_openid } },
  }
}
