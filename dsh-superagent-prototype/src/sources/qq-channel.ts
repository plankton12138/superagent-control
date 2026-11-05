/** QQ outbound channel: passive replies to the message that triggered the work. */
import type { OutboundMessage } from '../core/index.ts'
import type { SourceContext } from './host.ts'
import { checkedImText } from '../infra/text.ts'
import type { ChannelLink, ChannelLinks } from './kind.ts'
import { QqApiError, qqRequest } from './qq-auth.ts'
import type { QqConfig } from './qq.ts'

/** QQ error codes with a permanent meaning: the message was recalled, expired, or the user is not reachable. */
const GONE = new Set([304026, 304027, 40054004])
/** The platform's code for a repeated `msg_id` + `msg_seq`; the earlier reply already went out. */
const DUPLICATE = 40054005
/** A stable reply sequence for an outbox message: retries reuse it, so QQ's duplicate check stays idempotent. */
export function qqSequence(id: string): number {
  let hash = 0x811c9dc5
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193)
  return 1 + (hash >>> 0) % 1000
}
/**
 * Sends one message as a QQ passive reply. A reply needs the trigger message ID; without it, or after QQ's
 * five-minute group window (sixty minutes in single chat), the message can never be delivered and is reported as `gone`.
 */
export async function sendQq(host: Pick<SourceContext, 'commands'> & { config: QqConfig }, message: OutboundMessage): Promise<'sent' | 'gone'> {
  const { groupOpenid, userOpenid, messageId } = message.channel.address
  if (!messageId) throw new Error('Missing QQ reply target')
  if (!groupOpenid && !userOpenid) throw new Error('Missing QQ reply conversation')
  const text = checkedImText(message.text)
  const path = groupOpenid ? `/v2/groups/${encodeURIComponent(groupOpenid)}/messages`
    : `/v2/users/${encodeURIComponent(userOpenid!)}/messages`
  try {
    await qqRequest(host.config, 'POST', path, { content: text, msg_type: 0, msg_id: messageId, msg_seq: qqSequence(message.id) })
  } catch (error) {
    if (error instanceof QqApiError && error.code !== undefined) {
      if (GONE.has(error.code)) return 'gone'
      if (error.code === DUPLICATE) return 'sent'
    }
    throw error
  }
  return 'sent'
}
/** QQ has no stable public link for a group or single chat; the label still names the channel. */
export const qqLink = (_address: Record<string, string>, _links: ChannelLinks): ChannelLink =>
  ({ url: '', label: { zh: 'QQ 消息', en: 'QQ message' } })
