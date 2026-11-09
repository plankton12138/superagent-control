/**
 * In-memory stand-in for a Feishu bot CLI used by the mock sandbox.
 * It supplies the startup probes, builds real Feishu Triggers from simulated chat messages, and lets the Outbox's
 * acknowledgement path succeed without lark-cli or a network.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { feishuTrigger } from '../../src/sources/feishu.ts'
import type { Trigger } from '../../src/core/index.ts'

export interface FeishuInput {
  author: string
  body: string
  direct?: boolean
  chatId?: string
  replyTo?: { rootId: string; messageId: string }
  /** Mark the message as mentioning the bot; ignored for direct messages, which are always addressed. */
  mentions?: boolean
}

/** Simulated Feishu chat: members whose messages may originate work, and the bot that receives them. */
export class MockFeishu {
  readonly cli: string
  readonly chatId = 'oc_mock'
  readonly botId = 'ou_bot'
  readonly appId = 'cli_mock'
  readonly allowed = ['ou_alice', 'ou_bob']
  private counter = 0

  constructor(stateDir: string) {
    this.cli = join(stateDir, 'mock-bin', 'lark-cli')
    mkdirSync(join(stateDir, 'mock-bin'), { recursive: true })
    writeFileSync(this.cli, '#!/bin/sh\n', { mode: 0o755 })
  }

  /** Answers `resolveFeishuBot` through the fake subprocess. */
  setupAnswers(): Record<string, string> {
    return {
      [`${this.cli} auth status`]: JSON.stringify({ appId: this.appId, brand: 'feishu', identities: { bot: { status: 'ready' } } }),
      [`${this.cli} config strict-mode`]: 'strict-mode: bot (source: profile)',
      [`${this.cli} api GET /open-apis/bot/v3/info --as bot --format ndjson`]:
        `${JSON.stringify({ bot: { open_id: this.botId, app_name: 'Mock Bot' }, code: 0, msg: 'ok' })}\n`,
    }
  }

  /** Build the Trigger a live Feishu message event would produce. */
  trigger(input: FeishuInput): Trigger {
    const author = input.author.startsWith('ou_') ? input.author : `ou_${input.author.replace(/[^A-Za-z0-9]/g, '')}`
    const messageId = `om_${Date.now().toString(36)}${++this.counter}`
    const trigger = feishuTrigger({ message_id: messageId, chat_id: input.chatId ?? (input.direct ? `oc_dm_${author}` : this.chatId), chat_type: input.direct ? 'p2p' : 'group',
      sender_id: author, sender_type: 'user', content: input.body, create_time: String(Date.now()),
      root_id: input.replyTo?.rootId, parent_id: input.replyTo?.messageId,
      mentions: input.direct || !input.mentions ? [] : [{ id: this.botId, name: 'Mock Bot' }] }, this.botId, this.appId)
    if (!trigger) throw new Error('The simulated message was the bot\'s own')
    return trigger
  }
}
