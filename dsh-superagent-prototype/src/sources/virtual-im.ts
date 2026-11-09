/** Local IM transport. Only the browser conversation is simulated; normal Runtime and Policy handle each request. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import { z } from 'zod'
import type { Runtime } from '../app/runtime.ts'
import { key, threadKey } from '../core/index.ts'
import { family } from '../kv.ts'
import { AllowedSchema, allowedSender } from '../policy.ts'
import type { SourceKind } from './kind.ts'
import { CHATS, IM_PATH, recentMessages, virtualImHandler, type Chat, type ChatMessage } from './virtual-im-http.ts'

const SOURCE = 'virtual-im'
const actor = { source: SOURCE, id: 'local-operator' }
const history = family<ChatMessage[], [Chat]>('virtual-im:chat:')
const labels = {
  project: { zh: '项目协作群', en: 'Project group' },
  agent: { zh: 'SuperAgent', en: 'SuperAgent' },
}
const room = (id: string | undefined): Chat | undefined => CHATS.find(chat => chat === id)

export function mountVirtualIm(ctx: Context, runtime: Runtime): () => void {
  if (ctx.webServer.host !== '127.0.0.1' || ctx.webServer.protocol !== 'http:') throw new Error('Virtual IM requires a local HTTP Web profile')
  const kind: SourceKind = {
    kind: SOURCE, title: { zh: '虚拟 IM', en: 'Virtual IM' },
    description: { zh: '本机的项目群聊与机器人私聊。', en: 'Local project group and direct chat.' },
    schema: z.strictObject({}), fields: [], health: [],
    policy: {
      schema: z.object({ allowed: z.array(AllowedSchema).default([]) }),
      fields: [{ key: 'allowed', type: 'rows', label: { zh: '允许的本机身份', en: 'Allowed local identity' },
        columns: [{ key: 'id', type: 'text', label: { zh: '身份（local-operator）', en: 'Identity (local-operator)' } }] }],
      explicit: { zh: '群里 @SuperAgent 或在私聊中发消息', en: 'Mention @SuperAgent or send a direct message' },
    },
    channel: {
      allowed: address => !!room(address.chat),
      async send(_host, message) {
        const chat = room(message.channel.address.chat)
        if (!chat) return 'gone'
        append(chat, { id: message.id, from: 'agent', at: new Date().toISOString(), text: message.text })
        return 'sent'
      },
      link(address) {
        const chat = room(address.chat)
        return { url: chat ? `${IM_PATH}#${chat}` : '', label: chat ? labels[chat] : { zh: '虚拟 IM', en: 'Virtual IM' } }
      },
    },
    threadContext: {
      messageId: trigger => String(trigger.meta.messageId),
      async read(_commands, trigger, part) {
        const chat = room(trigger.meta.chat as string)
        const messages = chat ? (source.state.get(history(chat)) ?? []).slice(-40).map(({ from, ...message }) => ({
          ...message, from: from === 'agent' ? 'SuperAgent' : 'local-operator', ...from === 'agent' ? { bot: true as const } : {},
        })) : []
        return { messages: part === 'thread' ? messages : [], body: {} }
      },
    },
  }
  const unregister = runtime.sources.register(kind)
  const source = runtime.context(kind)
  const append = (chat: Chat, message: ChatMessage) => source.state.set(history(chat), recentMessages(source.state.get(history(chat)) ?? [], message))
  const dispose = ctx.webServer.register({ kind: 'prefix', path: IM_PATH, handler: virtualImHandler(() => ctx.webServer.port, {
    status() {
      if (!runtime.configured()) return { mode: 'waiting', reason: '等待 GitHub 和机器人账号配置完成。' }
      const repository = runtime.deployment.repository
      const settings = runtime.store.settings()
      if (!source.config(SOURCE)) return { mode: 'waiting', repository, reason: '虚拟 IM 来源已关闭。' }
      if (!allowedSender(settings, actor)) return { mode: 'waiting', repository, reason: '本机操作者还未加入允许列表。' }
      if (settings.paused) return { mode: 'waiting', repository, reason: 'SuperAgent 已暂停。' }
      return { mode: 'ready', repository }
    },
    history: chat => source.state.get(history(chat)) ?? [],
    send(chat, { id, text }) {
      const thread = { source: SOURCE, id: chat }
      const at = new Date().toISOString()
      if ((source.state.get(history(chat)) ?? []).some(message => message.id === id)) return
      if (chat === 'agent' || /@SuperAgent(?![\w-])/i.test(text)) {
        runtime.receive({ id: key(SOURCE, chat, id), source: SOURCE, threads: [thread], actor, human: true,
          addressed: chat === 'agent' ? 'direct' : 'mention', at, text, meta: { chat, messageId: id },
          channel: { source: SOURCE, thread: threadKey(thread), address: { chat } } })
        source.threads.describe(threadKey(thread), { label: labels[chat].zh })
      }
      append(chat, { id, from: 'operator', at, text })
    },
  }) })
  return () => { dispose(); unregister() }
}
