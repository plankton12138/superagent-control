/** Structured operational logs stored with the observations, with a read projection for older worker reports. */
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'

export const LogQuery = z.object({
  q: z.string().trim().max(200).default(''),
  ticket: z.string().trim().max(128).default(''),
  level: z.enum(['info', 'warn', 'error']).optional(),
  component: z.enum(['worker', 'github', 'runtime']).optional(),
  beforeAt: z.iso.datetime().optional(),
  beforeId: z.string().min(1).max(320).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
}).refine(query => !!query.beforeAt === !!query.beforeId, { message: 'Both cursor fields are required' })

export interface LogEntry {
  id: string
  at: string
  component: 'worker' | 'github' | 'runtime'
  level: 'info' | 'warn' | 'error'
  code: string
  message: string
  ticketId?: string
  assignmentId?: string
  title?: string
}

export function logText(value: string): string {
  return value.replace(/(https?:\/\/)[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/\bBearer\s+[a-z0-9._~+\/=-]+/gi, 'Bearer [redacted]')
    .replace(/\b(?:gh[pousr]_[a-z0-9_]+|github_pat_[a-z0-9_]+|sk-[a-z0-9_-]{12,})\b/gi, '[redacted]')
    .replace(/(["']?(?:[\w-]*(?:token|password|secret|api[_-]?key))["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s&,;]+)/gi, '$1[redacted]')
    .slice(0, 4000)
}

export function workerReportLog(state: string, summary: string): Pick<LogEntry, 'component' | 'level' | 'code' | 'message'> {
  return {
    component: 'worker',
    level: state === 'failed' ? 'error' : state === 'blocked' ? 'warn' : 'info',
    code: state === 'failed' && summary.includes('The prepare command failed:') ? 'worker.prepare_failed' : `worker.report.${state}`,
    message: logText(summary),
  }
}

/** Registers the same redaction for legacy reports read from existing state databases. */
export function registerLogRedaction(db: DatabaseSync): void {
  db.function('redact_log_text', { deterministic: true }, value => logText(String(value ?? '')))
}

export function readLogs(db: DatabaseSync, query: z.infer<typeof LogQuery>) {
  const rows = db.prepare(`
    WITH saved AS (
      SELECT printf('event:%020d', seq) AS id, at,
        value ->> '$.component' AS component, value ->> '$.level' AS level,
        value ->> '$.code' AS code, value ->> '$.message' AS message,
        value ->> '$.ticketId' AS ticketId, value ->> '$.assignmentId' AS assignmentId
      FROM observation WHERE type = 'log.entry'
    ), historical AS (
      SELECT 'report:' || (a.value ->> '$.id') AS id, a.value ->> '$.report.at' AS at,
        'worker' AS component,
        CASE a.value ->> '$.report.state' WHEN 'failed' THEN 'error' WHEN 'blocked' THEN 'warn' ELSE 'info' END AS level,
        CASE WHEN a.value ->> '$.report.state' = 'failed' AND instr(a.value ->> '$.report.summary', 'The prepare command failed:') > 0
          THEN 'worker.prepare_failed' ELSE 'worker.report.' || (a.value ->> '$.report.state') END AS code,
        redact_log_text(a.value ->> '$.report.summary') AS message, t.id AS ticketId, a.value ->> '$.id' AS assignmentId
      FROM ticket t, json_each(t.value, '$.assignments') a
      WHERE a.value ->> '$.report.at' IS NOT NULL
      UNION ALL
      SELECT 'retry:' || (a.value ->> '$.id'), a.value ->> '$.endedAt', 'worker', 'info',
        'worker.retried', '已重新派工', t.id, a.value ->> '$.id'
      FROM ticket t, json_each(t.value, '$.assignments') a
      WHERE a.value ->> '$.endedReason' = 'retried' AND a.value ->> '$.endedAt' IS NOT NULL
    ), entries AS (
      SELECT * FROM saved
      UNION ALL
      SELECT h.* FROM historical h WHERE NOT EXISTS (
        SELECT 1 FROM saved s WHERE s.assignmentId = h.assignmentId AND s.code = h.code
          AND (s.at = h.at OR h.code = 'worker.retried')
      )
    )
    SELECT e.*, redact_log_text(t.value ->> '$.title') AS title
    FROM entries e LEFT JOIN ticket t ON t.id = e.ticketId
    WHERE ($level IS NULL OR e.level = $level)
      AND ($component IS NULL OR e.component = $component)
      AND ($ticket = '' OR instr(e.ticketId, $ticket) = 1)
      AND ($beforeAt IS NULL OR (e.at, e.id) < ($beforeAt, $beforeId))
      AND ($q = '' OR instr(lower(e.message || ' ' || e.code || ' ' || coalesce(e.ticketId, '')
        || ' ' || coalesce(e.assignmentId, '') || ' ' || redact_log_text(t.value ->> '$.title')), lower($q)) > 0)
    ORDER BY e.at DESC, e.id DESC LIMIT $limit
  `).all({
    $level: query.level ?? null, $component: query.component ?? null, $ticket: query.ticket,
    $beforeAt: query.beforeAt ?? null, $beforeId: query.beforeId ?? null, $q: query.q, $limit: query.limit + 1,
  }) as unknown as LogEntry[]
  const items = rows.slice(0, query.limit)
  const last = items.at(-1)
  return { items, next: rows.length > query.limit && last ? { beforeAt: last.at, beforeId: last.id } : null }
}
