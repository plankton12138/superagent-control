/**
 * In-memory stand-in for the GitHub CLI used by the mock sandbox.
 * It answers the few API reads the application makes, builds real domain Triggers from the simulated issues and comments,
 * and supplies the probe answers that let Setup resolve a deployment without any network or real gh installation.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Commands } from '../../src/infra/commands.ts'
import { credentialHelper, workerGitConfig } from '../../src/infra/environment.ts'
import { commentTrigger, issueTrigger, mentions, type GithubComment } from '../../src/sources/github-trigger.ts'
import type { Pull } from '../../src/sources/github-pull.ts'
import type { Trigger } from '../../src/core/index.ts'

export interface IssueInput {
  number?: number
  title?: string
  body?: string
  author: string
  /** Append `@<agent>` to the body so the trigger is addressed to the agent. */
  mentions?: boolean
  at?: string
}

export interface CommentInput {
  number: number
  id?: number
  body: string
  author: string
  isPr?: boolean
  /** Append `@<agent>` to the body so the trigger is addressed to the agent. */
  mentions?: boolean
  at?: string
}

interface StoredIssue { number: number; title: string; body: string; author: string; at: string; isPr: boolean }

/**
 * Simulated GitHub repository: triggers built here go through the same Engine, Policy and Ticket paths as real events,
 * while the CLI answers keep the Source's polling and the Outbox's reply path working without a network.
 */
export class MockGithub {
  readonly repository = 'mock/repo'
  readonly agent = 'agent-bot'
  readonly stateDir: string
  readonly cli: string
  private readonly issues = new Map<number, StoredIssue>()
  private readonly comments = new Map<number, Map<number, GithubComment>>()
  private readonly pulls = new Map<number, Pull>()
  private nextNumber = 100
  private nextCommentId = 5000

  constructor(stateDir: string) {
    this.stateDir = stateDir
    this.cli = join(stateDir, 'mock-bin', 'gh')
    mkdirSync(join(stateDir, 'mock-bin'), { recursive: true })
    // Setup only checks that the configured CLI is an executable file; the sandbox never runs it as a process.
    writeFileSync(this.cli, '#!/bin/sh\n', { mode: 0o755 })
  }

  /** Store a simulated Issue and return the domain Trigger the GitHub Source would produce for it. */
  issue(input: IssueInput): Trigger {
    const number = input.number ?? this.allocateNumber()
    const title = input.title?.trim() || `模拟 Issue #${number}`
    const text = input.body?.trim() ?? ''
    const body = `${text}${input.mentions && !mentions(text, this.agent) ? `${text ? '\n\n' : ''}@${this.agent}` : ''}`
    const at = input.at ?? new Date().toISOString()
    this.issues.set(number, { number, title, body, author: input.author, at, isPr: false })
    return issueTrigger({ number, title, body, user: { login: input.author, type: 'User' }, created_at: at,
      html_url: this.issueUrl(number) }, this.agent)
  }

  /** Store a simulated comment or PR conversation comment and return its domain Trigger. */
  comment(input: CommentInput): Trigger {
    const id = input.id ?? this.nextCommentId++
    const number = input.number
    const at = input.at ?? new Date().toISOString()
    const body = `${input.body}${input.mentions && !mentions(input.body, this.agent) ? `${input.body ? '\n\n' : ''}@${this.agent}` : ''}`
    const pr = this.pulls.get(number)
    const comment: GithubComment = { id, body, user: { login: input.author, type: 'User' },
      html_url: `${pr?.html_url ?? this.issueUrl(number)}#issuecomment-${id}`, created_at: at, updated_at: input.at }
    const thread = this.comments.get(number) ?? new Map<number, GithubComment>()
    thread.set(id, comment)
    this.comments.set(number, thread)
    return commentTrigger(comment, { number, isPr: !!pr || !!input.isPr, url: comment.html_url ?? undefined,
      ...(pr ? { prAuthor: pr.user.login } : {}) }, 'conversation', this.agent)
  }

  /** Highest simulated Issue number, or 101 when none exists; comments without a number attach to it. */
  lastNumber(): number {
    return [...this.issues.keys()].sort((a, b) => a - b).at(-1) ?? 101
  }

  openPull(branch: string, title: string): Pull {
    const number = this.allocateNumber()
    const pull: Pull = {
      number, title, state: 'open', html_url: `https://github.com/${this.repository}/pull/${number}`,
      user: { login: this.agent }, created_at: new Date().toISOString(),
      head: { ref: `agent/${branch}`, sha: `mock-head-${number}`, repo: { full_name: this.repository } },
    }
    this.pulls.set(number, pull)
    return pull
  }

  pull(number: number): Pull | undefined { return this.pulls.get(number) }

  conversations() {
    return [...this.issues.values(), ...[...this.pulls.values()].map(pr => ({
      number: pr.number, title: pr.title, body: '', author: pr.user.login, at: pr.created_at, isPr: true,
      state: pr.merged ? 'merged' : pr.state, branch: pr.head.ref,
    }))].sort((a, b) => b.number - a.number).map(item => ({
      ...item, comments: [...this.comments.get(item.number)?.values() ?? []].map(comment => ({
        id: comment.id, text: comment.body, author: comment.user.login, at: comment.created_at,
      })),
    }))
  }

  private allocateNumber(): number {
    while (this.issues.has(this.nextNumber) || this.pulls.has(this.nextNumber)) this.nextNumber++
    return this.nextNumber++
  }

  finishPull(pull: Pull, merged: boolean): Pull {
    const at = new Date().toISOString()
    const updated = { ...pull, state: 'closed', merged, closed_at: at, ...(merged ? { merged_at: at } : {}) }
    this.pulls.set(pull.number, updated)
    return updated
  }

  /** Answers the startup probes of `resolveDeployment` and `verifyEnvironment` through the fake subprocess. */
  setupAnswers(): Record<string, string> {
    const helper = credentialHelper(this.cli)
    return {
      [`${this.cli} api user`]: JSON.stringify({ login: this.agent, id: 7 }),
      [`${this.cli} api repos/${this.repository} --jq {name: .full_name, push: .permissions.push}`]:
        `${JSON.stringify({ name: this.repository, push: true })}\n`,
      'git config -z --show-origin --get-all credential.https://github.com.helper': `file:${workerGitConfig(this.stateDir)}\0${helper}\0`,
      'git config -z --show-scope --get-regexp ^(credential\\..*|http\\..*extraheader)$':
        `global\0credential.helper\n\0global\0credential.https://github.com.helper\n${helper}\0`,
    }
  }

  /** Replace the subprocess-backed CLI methods with in-memory answers; returns the restore function. */
  install(): () => void {
    const proto = Commands.prototype as unknown as Record<string, unknown>
    const originals = {
      api: proto.api, pages: proto.pages, gh: proto.gh, run: proto.run, git: proto.git, lark: proto.lark,
    }
    proto.api = async (schemaOrPath: unknown, ...rest: string[]) => {
      const schema = typeof schemaOrPath === 'string' ? undefined : schemaOrPath as { parse(value: unknown): unknown }
      const path = typeof schemaOrPath === 'string' ? schemaOrPath : String(rest.shift() ?? '')
      const value = this.answer(path, rest)
      if (!schema) return typeof value === 'string' ? value : JSON.stringify(value)
      return schema.parse(value)
    }
    proto.pages = async () => []
    proto.gh = async () => ({})
    proto.run = async () => ''
    proto.git = async () => ''
    proto.lark = async () => ({})
    return () => { for (const [name, value] of Object.entries(originals)) proto[name] = value }
  }

  private issueUrl(number: number): string {
    return `https://github.com/${this.repository}/issues/${number}`
  }

  private answer(path: string, flags: readonly string[]): unknown {
    const methodAt = flags.indexOf('--method')
    const method = methodAt >= 0 ? String(flags[methodAt + 1] ?? 'GET').toUpperCase() : 'GET'
    if (method !== 'GET') return {}
    // `api(path, '--include')` is the raw-overload call that reads HTTP headers and a body.
    if (path.startsWith('notifications')) return 'HTTP/2.0 200 OK\r\nx-poll-interval: 60\r\n\r\n[]'
    if (!path) return { default_branch: 'main', permissions: { push: true }, full_name: this.repository }
    const issue = /^issues\/(\d+)$/.exec(path)
    if (issue) {
      const stored = this.issues.get(Number(issue[1]))
      return stored
        ? { id: stored.number, number: stored.number, title: stored.title, body: stored.body, state: 'open', user: { login: stored.author, type: 'User' },
          created_at: stored.at, html_url: this.issueUrl(stored.number) }
        : { id: Number(issue[1]), number: Number(issue[1]), title: `模拟 Issue #${issue[1]}`, body: '', state: 'open', user: { login: 'alice', type: 'User' },
          created_at: new Date().toISOString(), html_url: this.issueUrl(Number(issue[1])) }
    }
    const comments = /^issues\/(\d+)\/comments(?:\?(.*))?$/.exec(path)
    if (comments) {
      const query = new URLSearchParams(comments[2])
      const size = Number(query.get('per_page')) || 100
      const page = Number(query.get('page')) || 1
      return [...this.comments.get(Number(comments[1]))?.values() ?? []].slice((page - 1) * size, page * size)
    }
    if (/^pulls\/\d+\/comments/.test(path) || /^pulls\/\d+\/reviews/.test(path)) return []
    if (/^pulls\/comments\/\d+$/.test(path)) return {}
    if (/^pulls\/\d+\/checks/.test(path)) return { total_count: 0, check_runs: [] }
    const pull = /^pulls\/(\d+)$/.exec(path)
    if (pull) {
      const stored = this.pulls.get(Number(pull[1]))
      if (stored) return stored
      return { state: 'open', merged: false, user: { login: this.agent }, html_url: `https://github.com/${this.repository}/pull/${pull[1]}`,
        head: { ref: 'agent/mock', sha: 'mock-head', repo: { full_name: this.repository } }, created_at: new Date().toISOString() }
    }
    if (/^commits\//.test(path)) return { sha: 'mock-head' }
    return {}
  }
}
