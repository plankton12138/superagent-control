import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import { VIRTUAL_IM_PAGE } from './virtual-im-page.ts'

export const IM_PATH = '/virtual-im'
export const CHATS = ['project', 'agent'] as const
const ChatSchema = z.enum(CHATS)
export type Chat = z.infer<typeof ChatSchema>
export interface ChatMessage { id: string; from: 'operator' | 'agent'; at: string; text: string }
type Status = { mode: 'preview' | 'ready' | 'waiting'; reason?: string; repository?: string }
const MessageSchema = z.object({ id: z.uuid(), text: z.string().trim().min(1).max(6000) }).strict()
export type ChatInput = z.infer<typeof MessageSchema>
export const recentMessages = (messages: ChatMessage[], message: ChatMessage): ChatMessage[] =>
  messages.some(existing => existing.id === message.id) ? messages : [...messages.slice(-199), message]

export function virtualImHandler(port: () => number, backend: {
  status(): Status
  history(chat: Chat): ChatMessage[]
  send(chat: Chat, input: ChatInput): void
}, preview = false) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const { host, origin } = req.headers
    const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
    const json = (status: number, body: object) => {
      res.writeHead(status, { ...headers, 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(body))
    }
    if (host !== `127.0.0.1:${port()}` && host !== `localhost:${port()}`) return json(403, { error: '请从本机打开聊天页面。' })
    const path = (req.url ?? '/').split('?')[0]
    if (req.method === 'GET' && (path === IM_PATH || path === `${IM_PATH}/` || preview && path === '/')) {
      res.writeHead(200, { ...headers, 'content-type': 'text/html; charset=utf-8',
        'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" })
      res.end(VIRTUAL_IM_PAGE)
      return
    }
    const chat = ChatSchema.safeParse(path?.match(/^\/virtual-im\/api\/chats\/([^/]+)$/)?.[1])
    if (!chat.success) return json(404, { error: '没有找到该页面。' })
    if (req.headers['x-virtual-im'] !== '1' || origin !== undefined && origin !== `http://${host}`) {
      return json(403, { error: '请从聊天页面发送消息。' })
    }
    if (req.method === 'GET') return json(200, { ...backend.status(), messages: backend.history(chat.data) })
    if (req.method !== 'POST') return json(405, { error: '不支持该请求。' })
    const status = backend.status()
    if (status.mode === 'waiting') return json(503, { error: status.reason ?? '暂时无法发送消息。' })
    let payload: unknown
    try {
      let size = 0
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        const bytes = Buffer.from(chunk)
        size += bytes.length
        if (size > 40_000) return json(413, { error: '消息太长。' })
        chunks.push(bytes)
      }
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch { return json(400, { error: '无法读取这条消息。' }) }
    const input = MessageSchema.safeParse(payload)
    if (!input.success) return json(400, { error: '请输入 1 至 6000 个字符。' })
    // Configuration can change while the request body is arriving.
    const current = backend.status()
    if (current.mode === 'waiting') return json(503, { error: current.reason ?? '暂时无法发送消息。' })
    try { backend.send(chat.data, input.data) }
    catch { return json(503, { error: '消息未送达，请稍后重试。' }) }
    json(200, { ...current, messages: backend.history(chat.data) })
  }
}
