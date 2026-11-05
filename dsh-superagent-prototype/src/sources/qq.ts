/** QQ Source kind: configuration, group/single-chat scope, Policy, Channel, and the gateway plugin entry. */
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { sourceContext, health, type SourceContext } from './host.ts'
import type { SourceKind } from './kind.ts'
import { sendQq, qqLink } from './qq-channel.ts'
import { runQqGateway } from './qq-gateway.ts'
import { qqTrigger, SOURCE } from './qq-trigger.ts'
import { wait } from './qq-auth.ts'

const QqGroupSchema = z.object({
  groupOpenid: z.string().trim().min(1).max(200),
  name: z.string().trim().max(60).optional(),
  listen: z.enum(['mentions', 'all']),
}).strict()
export const QqConfigSchema = z.object({
  appId: z.string().trim().max(100).default(''),
  /** The environment variable holding the AppSecret; the secret itself is never stored in settings. */
  secretEnv: z.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'An environment variable name').default('QQ_BOT_CLIENT_SECRET'),
  sandbox: z.boolean().default(false),
  groups: z.array(QqGroupSchema)
    .refine(groups => new Set(groups.map(group => group.groupOpenid)).size === groups.length, 'Duplicate group openids').default([]),
  otherGroups: z.enum(['none', 'mentions']).default('none'),
  directMessages: z.boolean().default(true),
}).strict()
export type QqConfig = z.infer<typeof QqConfigSchema>
const QqAllowedSchema = z.object({
  id: z.string().trim().regex(/^(c2c:)?[A-Za-z0-9_-]+(:[A-Za-z0-9_-]+)?$/, 'A group/member openid, or c2c:<user openid>'),
  name: z.string().trim().max(100).optional(),
}).strict()
/** True when this Trigger belongs to a conversation the Source still receives. */
function listened(meta: Record<string, unknown>, config: QqConfig) {
  if (meta.direct === true) return config.directMessages ? { listened: true as const, observed: false, row: 'direct' } : { listened: false as const, reason: 'direct_messages_not_allowed' }
  const group = config.groups.find(item => item.groupOpenid === meta.groupOpenid)
  const mentioned = meta.mentioned === true
  if (group) {
    if (!mentioned && group.listen !== 'all') return { listened: false as const, reason: 'not_addressed' }
    return { listened: true as const, observed: group.listen === 'all' && !mentioned, row: group.groupOpenid }
  }
  if (config.otherGroups === 'mentions' && mentioned) return { listened: true as const, observed: false, row: 'other' }
  return { listened: false as const, reason: mentioned ? 'group_not_allowed' : 'not_addressed' }
}
export const qqKind: SourceKind<QqConfig> = {
  kind: SOURCE,
  title: { zh: 'QQ', en: 'QQ' },
  description: {
    zh: '接收下列 QQ 群里 @ 机器人的消息和单聊消息；群主开启全量消息时可接收群内全部发言。',
    en: 'Receives messages that mention the bot in these QQ groups and single-chat messages; a group that enables full messages also sends the rest.',
  },
  schema: QqConfigSchema,
  fields: [
    { key: 'appId', type: 'text', label: { zh: '机器人 AppID', en: 'Bot AppID' },
      hint: { zh: 'QQ 开放平台机器人的 AppID。AppSecret 不保存在设置里，启动时从下面命名的环境变量读取。', en: 'The AppID of the QQ Open Platform bot. The AppSecret is not stored in settings; it is read from the environment variable named below.' } },
    { key: 'secretEnv', type: 'text', label: { zh: 'AppSecret 环境变量', en: 'AppSecret variable' },
      hint: { zh: '保存 AppSecret 的环境变量名，默认 QQ_BOT_CLIENT_SECRET。', en: 'The environment variable that holds the AppSecret; QQ_BOT_CLIENT_SECRET by default.' } },
    { key: 'sandbox', type: 'switch', label: { zh: '沙箱环境', en: 'Sandbox' },
      hint: { zh: '使用 QQ 开放平台的沙箱环境；沙箱只接收测试群事件。', en: 'Use the QQ Open Platform sandbox, which receives events only from test groups.' } },
    { key: 'groups', type: 'rows', label: { zh: '接收的群', en: 'Groups' },
      hint: { zh: '“仅 @”只接收 @ 机器人的消息；“全部消息”还接收其余消息，需要群主在 QQ 群设置中允许。', en: '"@ only" receives messages that mention the bot; "All" also receives the rest, which requires the group owner to allow it in QQ.' },
      columns: [
        { key: 'groupOpenid', type: 'text', label: { zh: '群 openid', en: 'Group openid' } },
        { key: 'name', type: 'text', label: { zh: '名字', en: 'Name' }, optional: true },
        { key: 'listen', type: 'select', label: { zh: '接收', en: 'Receive' }, options: [{ value: 'mentions', label: { zh: '仅 @', en: '@ only' } }, { value: 'all', label: { zh: '全部消息', en: 'All' } }] },
      ] },
    { key: 'otherGroups', type: 'select', label: { zh: '其他群', en: 'Other groups' },
      options: [{ value: 'none', label: { zh: '不接收', en: 'Not received' } }, { value: 'mentions', label: { zh: '仅 @', en: '@ only' } }],
      hint: { zh: '机器人已加入、但没列在上面的群；谁的 message 能发起工作仍由策略决定。', en: 'Groups the bot joined that are not listed above; who may originate work is still the Policy.' } },
    { key: 'directMessages', type: 'switch', label: { zh: '接收单聊', en: 'Direct messages' } },
  ],
  health: ['qq'],
  scope({ meta }, config) { return listened(meta, config) },
  channel: {
    allowed: (address, config) => address.groupOpenid
      ? listened({ groupOpenid: address.groupOpenid, mentioned: true, direct: false }, config).listened
      : address.direct === 'true' && config.directMessages,
    send: sendQq, link: qqLink,
  },
  find: () => ({ threads: [], terms: [] }),
  policy: {
    unnamed: { person: { zh: 'QQ 用户', en: 'QQ user' }, bot: { zh: 'QQ 机器人', en: 'QQ bot' } },
    schema: z.object({
      allowed: z.array(QqAllowedSchema)
        .refine(users => new Set(users.map(user => user.id)).size === users.length, 'Duplicate openids').default([]),
    }).strict(),
    fields: [
      { key: 'allowed', type: 'rows', label: { zh: '能发起工作的 QQ 用户', en: 'QQ users who may originate work' },
        hint: { zh: '群成员填“群 openid:成员 openid”，单聊用户填“c2c:用户 openid”。member_openid 只在本群有效。', en: 'For a group member, enter "group openid:member openid"; for a single chat, "c2c:user openid". A member_openid is valid only in its group.' },
        columns: [{ key: 'id', type: 'text', label: { zh: '用户标识', en: 'User id' } },
          { key: 'name', type: 'text', label: { zh: '名字', en: 'Name' }, optional: true }] },
    ],
    explicit: { zh: '名单内的人在群里 @ 机器人，或私聊机器人，总是明确的请求。', en: 'Someone on the list who mentions the bot in a group or messages it directly always makes an explicit request.' },
    rows(stored) {
      const config = QqConfigSchema.parse(stored)
      const mentions = { zh: '仅 @', en: '@ only' }
      return [
        ...config.groups.map(group => ({ id: group.groupOpenid, label: group.name || group.groupOpenid,
          note: group.listen === 'all' ? { zh: '全部消息', en: 'All' } : mentions,
          cells: { listedUnaddressed: group.listen === 'all', unlistedAddressed: true, unlistedUnaddressed: group.listen === 'all' } })),
        { id: 'other', label: { zh: '其他群', en: 'Other groups' }, note: config.otherGroups === 'mentions' ? mentions : { zh: '不接收', en: 'Not received' },
          cells: { listedUnaddressed: false, unlistedAddressed: config.otherGroups === 'mentions', unlistedUnaddressed: false } },
        { id: 'direct', label: { zh: '单聊', en: 'Direct messages' }, note: config.directMessages ? { zh: '接收', en: 'Received' } : { zh: '不接收', en: 'Not received' },
          cells: { listedUnaddressed: false, unlistedAddressed: config.directMessages, unlistedUnaddressed: false } },
      ]
    },
  },
  environment: {
    variables: [
      { key: 'DSH_SUPERAGENT_QQ_GROUP', description: { zh: '接下工单的 QQ 群 openid；不是从 QQ 群来的时为空', en: 'openid of the QQ group that started the ticket; empty when the ticket did not start in a QQ group' } },
      { key: 'DSH_SUPERAGENT_QQ_USER', description: { zh: '接下工单的 QQ 用户 openid；不是从 QQ 单聊来的时为空', en: 'openid of the QQ user that started the ticket; empty when the ticket did not start in a QQ single chat' } },
    ],
    values: ({ trigger }) => ({
      DSH_SUPERAGENT_QQ_GROUP: trigger?.source === SOURCE && trigger.meta.direct !== true ? String(trigger.meta.groupOpenid ?? '') : '',
      DSH_SUPERAGENT_QQ_USER: trigger?.source === SOURCE && trigger.meta.direct === true ? String(trigger.meta.userOpenid ?? '') : '',
    }),
  },
}
/** Next retry after a gateway run: one second after a minute of service, otherwise exponential up to a minute. */
function retryAfter(previous: number | undefined, ranMs: number): number {
  return previous === undefined || ranMs >= 60_000 ? 1000 : Math.min(previous * 2, 60_000)
}
/** Runs the QQ gateway while the Source is enabled, reporting credential and connection state as `qq` health. */
export async function runQq(ctx: SourceContext, signal: AbortSignal): Promise<void> {
  await ctx.ready
  if (!ctx.configured()) { ctx.report('qq', health('paused', 'setupPending')); return }
  let retry: number | undefined
  while (!signal.aborted) {
    const config = ctx.config<QqConfig>(SOURCE)
    if (!config) {
      ctx.report('qq', health('paused', 'sourceOff'))
      await wait(5000, signal)
      continue
    }
    if (!config.appId) {
      ctx.report('qq', health('paused', 'qqAppUnset'))
      await wait(5000, signal)
      continue
    }
    if (!process.env[config.secretEnv]) {
      ctx.report('qq', health('paused', 'qqSecretUnset', { variable: config.secretEnv }))
      await wait(5000, signal)
      continue
    }
    const running = new AbortController()
    const check = setInterval(() => { if (!ctx.config(SOURCE)) running.abort() }, 5000)
    const stop = (): void => { running.abort() }
    signal.addEventListener('abort', stop, { once: true })
    const began = Date.now()
    let chain = Promise.resolve()
    try {
      await runQqGateway({ appId: config.appId, secretEnv: config.secretEnv, sandbox: config.sandbox }, running.signal, {
        onReady: () => ctx.report('qq', { state: 'ready', detail: 'Listening for QQ bot events', at: new Date().toISOString() }),
        onEvent: (type, data) => {
          chain = chain.then(async () => {
            const trigger = qqTrigger(type, data)
            if (trigger && ctx.config(SOURCE)) await ctx.receive(trigger)
          }).catch((error: unknown) => { ctx.report('qq', { state: 'error', detail: String(error) }) })
        },
      })
    } catch (error) {
      if (!running.signal.aborted) ctx.report('qq', { state: 'error', detail: String(error) })
    } finally {
      clearInterval(check)
      signal.removeEventListener('abort', stop)
      await chain
    }
    if (running.signal.aborted) continue
    retry = retryAfter(retry, Date.now() - began)
    await wait(retry, signal)
  }
}
export const name = 'dsh-superagent-qq'
export const inject = ['orchestrator']
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.orchestrator.sources.register(qqKind), 'qq: source kind')
  ctx.effect(() => {
    const source = sourceContext(ctx.orchestrator, qqKind)
    const controller = new AbortController()
    const running = runQq(source, controller.signal)
      .catch((error: unknown) => { source.report('qq', { state: 'error', detail: String(error) }) })
    return async () => { controller.abort(); await running }
  })
}
