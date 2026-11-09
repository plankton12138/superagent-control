const form = document.querySelector('.log-filters')
const results = document.querySelector('[data-log-results]')
const status = document.querySelector('[data-log-status]')
const more = document.querySelector('[data-log-more]')
const levels = { error: '错误', warn: '警告', info: '信息' }
const components = { worker: 'Worker', github: 'GitHub', runtime: '运行时' }
const dateFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'medium' })
let filters
let cursor
let request

const initial = new URLSearchParams(location.search)
for (const control of form.querySelectorAll('input, select')) {
  if (initial.has(control.name)) control.value = initial.get(control.name)
}

function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

function row(entry) {
  const details = element('details', 'log-entry')
  const summary = element('summary', 'log-entry-head')
  const time = element('time', 'log-time', dateFormat.format(new Date(entry.at)))
  time.dateTime = entry.at
  const level = element('span', 'log-level', levels[entry.level])
  level.dataset.level = entry.level
  const code = element('span', 'log-code', `${components[entry.component]} · ${entry.code}`)
  const message = element('span', 'log-preview', entry.message || '暂无详情')
  summary.append(time, level, code, message)
  details.append(summary, element('pre', 'log-message', entry.message || '暂无详情'))
  if (entry.ticketId) {
    const ticket = element('a', 'log-ticket', `${entry.title || '工单'} · ${entry.ticketId}`)
    ticket.href = `/logs?ticket=${encodeURIComponent(entry.ticketId)}`
    details.append(ticket)
  }
  if (entry.assignmentId) details.append(element('p', 'log-id', `派工 ${entry.assignmentId}`))
  return details
}

async function load(append = false) {
  request?.abort()
  const controller = new AbortController()
  request = controller
  if (!append) {
    filters = new URLSearchParams([...new FormData(form)].filter(([, value]) => value.trim()))
    history.replaceState(null, '', filters.size ? `/logs?${filters}` : '/logs')
    cursor = null
    results.replaceChildren()
  }
  const query = new URLSearchParams(filters)
  if (append && cursor) for (const [key, value] of Object.entries(cursor)) query.set(key, value)
  status.textContent = '正在读取日志…'
  more.disabled = true
  try {
    const response = await fetch(`/api/logs?${query}`, { signal: controller.signal })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error)
    if (request !== controller) return
    results.append(...data.items.map(row))
    cursor = data.next
    status.textContent = results.children.length ? `已显示 ${results.children.length} 条日志` : '没有符合条件的日志'
  } catch (error) {
    if (request !== controller) return
    status.textContent = error.message || '读取日志失败'
  } finally {
    if (request === controller) {
      more.hidden = !cursor
      more.disabled = false
    }
  }
}

form.addEventListener('submit', event => { event.preventDefault(); void load() })
more.addEventListener('click', () => void load(true))
void load()
