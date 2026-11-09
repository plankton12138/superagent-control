const $ = key => document.querySelector(`[data-${key}]`)
const escape = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])
const dateTime = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const date = value => value ? dateTime.format(new Date(value)) : '暂无记录'
const labels = {
  accept: '接受任务', attach: '归并工单', stop: '停止任务', ignore: '忽略消息', unavailable: '评估不可用',
  ready: '已报告就绪', waiting: '等待消息', progress: '执行进展', failed: '执行失败', blocked: '受阻', dropped: '已放弃',
  sent: '已发出', pending: '等待投递', merged: '已合并', open: '开放中', closed: '已关闭', completed: '已完成',
  acknowledgement: '接单确认', reply: '会话回复', notice: '状态通知',
}
const label = key => labels[key] ?? key ?? '暂无记录'
const sourceName = key => ({ 'virtual-im': '虚拟 IM', github: 'GitHub' })[key] ?? key ?? '来源'
const targetName = key => ({ 'virtual-im:agent': 'SuperAgent 私聊', 'virtual-im:project': '项目群' })[key] ?? key ?? '原会话'
const phase = ticket => {
  if (ticket.stage === 'ended') return { text: label(ticket.ended?.outcome ?? 'completed'), tone: 'done' }
  if (ticket.action === 'queued') return { text: '等待执行', tone: 'queued' }
  if (ticket.stage === 'idle') return { text: '空闲', tone: 'queued' }
  if (ticket.stage === 'person') {
    const text = { review: '等待审查', answer: '等待答复', failed: '执行失败', blocked: '受阻', delivery: '投递受阻' }
    return { text: text[ticket.action] ?? '等待人工', tone: ticket.action === 'failed' ? 'error' : 'queued' }
  }
  return { text: ticket.sessionId ? '工单执行中' : '准备启动', tone: ticket.sessionId ? 'live' : 'queued' }
}
const headReply = ticket => ticket.replies.filter(item => item.kind === 'reply').at(-1) ?? ticket.replies.at(-1)
const activeAssignment = ticket => ticket.assignments.at(-1)
const briefId = value => value?.slice(0, 8) ?? '—'
const replyStatus = key => key === 'dropped' ? '投递终止' : label(key)
const inputStatus = key => ({ queued: '等待投递', delivered: '已送达，等待读取', read: '已读取', unknown: '状态未记录' })[key]
const workerExists = ticket => !!ticket.sessionId && !!activeAssignment(ticket)?.startedAt
const graph = $('network')
const details = $('details')
const svg = $('wires')
let data
let signature = ''
let shownRecently = false
let selected
let initialized = false
let edges = []
let oldEdgeVersions = new Map()
let observedChanges = new Set()
let resizeFrame
let stream
let refreshTimer
let refreshing = false
let refreshRequested = false

function node(id, tone, category, title, sub, status = '') {
  return `<button class="node" type="button" data-node="${escape(id)}" data-inspect="${escape(id)}" data-tone="${tone}"
    aria-pressed="${id === selected}"><span class="node-type"><span>${escape(category)}</span><span>${escape(status)}</span></span>
    <strong>${escape(title)}</strong><small>${escape(sub)}</small></button>`
}

function branch(ticket) {
  const { id, title, sessionId } = ticket
  const state = phase(ticket)
  const assignment = activeAssignment(ticket)
  const work = node(`ticket:${id}`, state.tone, 'TICKET', title,
    assignment ? `执行记录 ${briefId(assignment.id)}` : `工单 ${briefId(id)}`, state.text)
  const worker = workerExists(ticket) ? node(`work:${id}`, state.tone, 'WORKER SESSION',
    `Worker ${briefId(sessionId.replace(/^worker-/, ''))}`, assignment.report ? label(assignment.report.state) : '派工已启动',
    ticket.worker?.status === 'running' ? '回合执行中' : ticket.worker?.holdsSlot ? '清理中 · 占槽'
      : ticket.worker?.reserved ? '槽位已预留' : ticket.worker?.status === 'idle' ? '回合空闲' : '') : ''
  const pulls = ticket.prs.map(pr => node(`pr:${id}:${pr.number}`, 'pr', 'GITHUB', `PR #${pr.number}`, pr.title ?? '已关联到工单', label(pr.status)))
  const receipt = headReply(ticket)
  const response = receipt
    ? node(`reply:${id}`, receipt.status === 'sent' ? 'sent' : receipt.status === 'dropped' ? 'error' : 'queued',
      'OUTBOX', label(receipt.kind), targetName(receipt.target), replyStatus(receipt.status))
    : ''
  const result = [...pulls, response].join('')
  return `<div class="branch"><div class="branch-work">${work}${worker}</div><div class="branch-results">${result}</div></div>`
}

function assembleEdges(tickets, threads) {
  const connection = (from, to, id, tone, title, version) => ({ from, to, id, tone, title, version })
  const wires = data.sources.map(source => {
    const latest = data.tickets.filter(ticket => ticket.origin?.source === source.id).sort((a, b) => b.origin.at.localeCompare(a.origin.at))[0]
    return connection(`source:${source.id}`, 'engine', `source:${source.id}`, 'base',
      `${source.title} → Engine`, latest?.origin.id)
  })
  for (const thread of threads) {
    wires.push(connection(`thread:${thread.key}`, 'engine', `thread:${thread.key}`, 'muted', `${thread.title} → Engine`))
  }
  wires.push(connection('engine', 'router', 'engine', 'base', 'Engine → Router', data.decisions[0]?.id))
  wires.push(connection('router', 'queue', 'queue', 'base', 'Router → 工单队列', data.decisions[0]?.id))
  for (const ticket of tickets) {
    const { id, decision } = ticket
    const phaseTone = phase(ticket).tone
    const assignment = activeAssignment(ticket)
    wires.push(connection('queue', `ticket:${id}`, `dispatch:${id}`, phaseTone, `队列 → ${ticket.title}`,
      [decision?.id, assignment?.id, assignment?.startedAt, ticket.stage, ticket.action].join(':')))
    const inputs = ticket.inputs ?? []
    for (const thread of ticket.threads ?? []) {
      const routed = inputs.filter(input => input.trigger?.threads.length === 1 && input.trigger.threads[0] === thread.key)
      if (!routed.length) continue
      wires.push(connection(`thread:${thread.key}`, `ticket:${id}`, `followup:${id}:${thread.key}`,
        routed.every(input => input.context) ? 'muted' : 'followup', `${thread.title} → ${ticket.title} · 跟进`,
        routed.map(input => `${input.id}:${input.status}:${input.assignmentId ?? ''}`).join('|')))
    }
    if (workerExists(ticket)) wires.push(connection(`ticket:${id}`, `work:${id}`, `work:${id}`, phaseTone,
      `${ticket.title} → Worker`, inputs.map(input => `${input.id}:${input.status}`).join('|') || assignment.id))
    for (const pr of ticket.prs) {
      wires.push(connection(`ticket:${id}`, `pr:${id}:${pr.number}`, `pr:${id}:${pr.number}`, 'pr',
        `${ticket.title} → PR #${pr.number}`, pr.status))
    }
    const receipt = headReply(ticket)
    if (receipt) {
      wires.push(connection(`ticket:${id}`, `reply:${id}`, `reply:${id}`, receipt.status === 'sent' ? 'sent' : 'queued',
        `${ticket.title} → ${targetName(receipt.target)}`, `${receipt.id}:${receipt.status}`))
    }
  }
  return wires
}

function drawWires() {
  const box = $('canvas').getBoundingClientRect()
  const compact = matchMedia('(max-width: 720px)').matches
  const nodes = new Map([...graph.querySelectorAll('[data-node]')].map(item => [item.dataset.node, item.getBoundingClientRect()]))
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`)
  svg.innerHTML = edges.map(edge => {
    const start = nodes.get(edge.from), end = nodes.get(edge.to)
    if (!start || !end) return ''
    const sameColumn = Math.abs(start.left - end.left) < 2 && end.top >= start.bottom
    const downward = sameColumn || compact && end.top >= start.bottom &&
      (edge.from.startsWith('source:') || edge.from.startsWith('thread:') || edge.from === 'queue')
    const x = (downward ? start.left + start.width / 2 : start.right) - box.left
    const y = (downward ? start.bottom : start.top + start.height / 2) - box.top
    const lastX = (downward ? end.left + end.width / 2 : end.left - 3) - box.left
    const lastY = (downward ? end.top - 3 : end.top + end.height / 2) - box.top
    const midX = (x + lastX) / 2, midY = (y + lastY) / 2
    const curve = downward ? `${x} ${midY} ${lastX} ${midY}` : `${midX} ${y} ${midX} ${lastY}`
    const path = `M${x} ${y} C${curve} ${lastX} ${lastY}`
    const arrow = downward ? 'm-3 -5 l3 5 l3 -5' : 'm-5 -3 l5 3 l-5 3'
    return `<g class="wire${observedChanges.has(edge.id) ? ' changed' : ''}" role="button" tabindex="0" aria-label="${escape(edge.title)}"
      aria-pressed="${selected === edge.id}" data-inspect="${escape(edge.id)}" data-tone="${edge.tone}">
      <path class="route" d="${path} ${arrow}"></path><path class="hit" d="${path}"></path></g>`
  }).join('')
  observedChanges.clear()
}

function redrawWires() {
  cancelAnimationFrame(resizeFrame)
  resizeFrame = requestAnimationFrame(drawWires)
}

function renderGraph(animate) {
  const visible = data.tickets.filter(ticket => ticket.stage !== 'ended' || shownRecently)
  const threads = [...new Map(visible.flatMap(ticket => (ticket.threads ?? []).map(thread => [thread.key, thread]))).values()]
  const sourceNodes = data.sources.map(source => node(`source:${source.id}`, source.state === 'error' ? 'error' : 'source',
    'SOURCE', source.title, source.id === 'github' ? '仓库事件轮询' : '消息输入', source.state === 'error' ? '异常' : '已启用'))
  graph.innerHTML = `<div class="sources">${sourceNodes.join('')}${threads.map(thread =>
    node(`thread:${thread.key}`, 'base', 'THREAD', thread.title, thread.evaluating ? '评估中' : `${thread.pending} 条待评估`)).join('')}</div><div class="core">
      ${node('engine', 'base', 'ENGINE', 'Engine', '去向、准入与工单状态')}
      ${node('router', 'router', 'ROUTER', 'Router', '主 Session · 路由决定')}
      ${node('queue', data.load.queued ? 'queued' : 'base', 'EFFECTS', 'Effects', `启动与投递 · ${data.load.queued} 张待执行`)}
    </div><div class="branches">${visible.length ? visible.map(branch).join('') : '<p class="empty">当前没有运行中的工单。新任务进入后，执行分支会在这里出现。</p>'}</div>`
  const nextEdges = assembleEdges(visible, threads)
  observedChanges = new Set(nextEdges.filter(edge => animate && edge.version && oldEdgeVersions.get(edge.id) !== edge.version).map(edge => edge.id))
  oldEdgeVersions = new Map(nextEdges.map(edge => [edge.id, edge.version]))
  edges = nextEdges
  redrawWires()
}

function timeline(items) {
  const dated = items.filter(item => item.at).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const ordered = [...dated, ...items.filter(item => !item.at)]
  if (!ordered.length) return '<p class="note">暂无记录</p>'
  return `<ol class="timeline">${ordered.map(item => `<li><strong>${escape(item.name)}</strong>
    <time>${item.at ? date(item.at) : '时间未记录'}</time>${item.detail ? `<small>${escape(item.detail)}</small>` : ''}
    ${item.url ? `<small><a href="${escape(item.url)}" target="_blank" rel="noreferrer">查看原消息 ↗</a></small>` : ''}</li>`).join('')}</ol>`
}

function facts(items) {
  return `<dl class="facts">${items.map(([name, value]) => `<dt>${escape(name)}</dt><dd>${escape(value)}</dd>`).join('')}</dl>`
}

function dispatchEvents(ticket) {
  const { origin, decision } = ticket
  return [
    ...origin ? [
      { at: origin.at, name: `${sourceName(origin.source)} 来源事件`, detail: origin.text },
      { at: origin.receivedAt, name: '本机收到任务' },
    ] : [],
    ...decision ? [{ at: decision.at, name: `Router · ${label(decision.kind)}`, detail: decision.reasons.join(' · ') }] : [],
    { at: ticket.createdAt, name: '工单创建' },
    ...ticket.assignments.flatMap(assignment => [
      { at: assignment.createdAt, name: '执行记录入队', detail: briefId(assignment.id) },
      ...assignment.startedAt ? [{ at: assignment.startedAt, name: '派工已启动', detail: briefId(assignment.id) }] : [],
    ]),
  ]
}

function workerEvents(ticket) {
  return ticket.assignments.flatMap(assignment => [
    ...assignment.report ? [{ at: assignment.report.at, name: `Worker · ${label(assignment.report.state)}`, detail: assignment.report.summary }] : [],
    ...assignment.idleAt ? [{ at: assignment.idleAt, name: 'Worker 回到空闲' }] : [],
    ...assignment.endedAt ? [{ at: assignment.endedAt, name: '执行记录结束', detail: assignment.endedReason }] : [],
  ])
}

const receiptEvents = ticket => ticket.replies.map(receipt => ({ at: receipt.at,
  name: `${label(receipt.kind)} · ${replyStatus(receipt.status)}`, detail: targetName(receipt.target) }))

function inputEvents(inputs) {
  return inputs.flatMap(input => {
    const { trigger } = input
    const steps = [
      { at: trigger?.at, name: '来源事件', detail: [trigger?.actor, trigger?.text].filter(Boolean).join(' · '), url: trigger?.url },
      { at: trigger?.receivedAt, name: '本机收到' },
      { at: input.at, name: input.context ? '分发到工单 · 仅上下文' : '分发到工单', detail: briefId(input.id) },
    ]
    if (input.status === 'delivered' || input.status === 'read' && input.deliveredAt) {
      steps.push({ at: input.deliveredAt, name: '已送达', detail: `派工 ${briefId(input.assignmentId)}` })
    }
    const detail = input.status === 'read' && !input.deliveredAt ? `送达时间未记录 · 派工 ${briefId(input.assignmentId)}` : undefined
    steps.push({ at: input.readAt, name: inputStatus(input.status), detail })
    return steps
  })
}

function inspectTicket(kind, ticket, number) {
  const assignment = activeAssignment(ticket)
  const delay = assignment?.startedAt && assignment.createdAt
    ? `${((Date.parse(assignment.startedAt) - Date.parse(assignment.createdAt)) / 1000).toFixed(1)} 秒` : '等待启动'
  const ticketFacts = facts([['工单', briefId(ticket.id)], ['执行记录', briefId(assignment?.id)],
    ['入队到启动', delay], ['当前状态', phase(ticket).text]])
  if (kind === 'dispatch') {
    return ['派发与启动', ticket.title, ticketFacts + timeline(dispatchEvents(ticket))]
  }
  if (kind === 'reply') {
    return ['原会话回执', ticket.title, ticketFacts + timeline(receiptEvents(ticket))]
  }
  if (kind === 'followup') {
    const inputs = (ticket.inputs ?? []).filter(input => input.trigger?.threads.length === 1 && input.trigger.threads[0] === number)
    const thread = ticket.threads?.find(item => item.key === number)
    return ['线程跟进', ticket.title, facts([['线程', thread?.title ?? number], ['目标工单', briefId(ticket.id)]]) +
      timeline(inputEvents(inputs))]
  }
  if (kind === 'pr') {
    const pr = ticket.prs.find(item => item.number === number)
    if (!pr) return null
    const events = [
      ...dispatchEvents(ticket), ...workerEvents(ticket),
      { at: pr.firstSeenAt, name: 'PR 线程首次记录', detail: `#${pr.number}` },
      ...pr.closedAt ? [{ at: pr.closedAt, name: `PR ${label(pr.status)}` }] : [],
      ...inputEvents((ticket.inputs ?? []).filter(input => input.trigger?.threads.includes(`github:${number}`))),
      ...receiptEvents(ticket),
    ]
    const url = pr.url ? `<p><a href="${escape(pr.url)}" target="_blank" rel="noreferrer">在 GitHub 查看 PR ↗</a></p>` : ''
    return ['PR 记录', `PR #${pr.number} · ${label(pr.status)}`, `<p>${escape(ticket.title)}</p>${url}` + ticketFacts + timeline(events)]
  }
  return [kind === 'work' ? 'Worker 详情' : '工单详情', ticket.title, ticketFacts +
    facts([['Session', ticket.sessionId || '尚未启动'], ['授权范围', ticket.mandate?.scope ?? '未记录'],
      ['策略版本', ticket.mandate?.policyVersion ?? '未记录'], ['投递错误', ticket.delivery?.error ?? '—']]) +
    timeline([...dispatchEvents(ticket), ...workerEvents(ticket), ...inputEvents(ticket.inputs ?? [])])]
}

function inspector() {
  if (!selected) return null
  const [kind, id, ...rest] = selected.split(':')
  if (kind === 'router' || kind === 'engine') {
    return ['路由与决策', kind === 'engine' ? 'Engine' : 'Router', facts([['主 Session', data.router], ['运行时', data.runtime === 'ready' ? '就绪' : data.runtime]]) +
      timeline(data.decisions.map(decision => ({ at: decision.at, name: label(decision.kind), detail: decision.reasons.join(' · ') })))]
  }
  if (kind === 'queue') {
    const queued = data.tickets.filter(ticket => ticket.action === 'queued')
    const effects = (data.effects ?? []).map(item => [item.kind, `${item.count} 项 · 最高重试 ${item.attempts} 次`])
    return ['执行排队', 'Effects', facts([['等待执行', data.load.queued], ['Worker 占用', `${data.load.running} / ${data.load.maxWorkers}`], ...effects]) +
      timeline(queued.map(ticket => ({ at: activeAssignment(ticket)?.createdAt ?? ticket.createdAt, name: ticket.title })))]
  }
  if (kind === 'thread') {
    const key = [id, ...rest].join(':')
    const tickets = data.tickets.filter(ticket => ticket.threads?.some(thread => thread.key === key))
    const thread = tickets[0]?.threads.find(item => item.key === key)
    if (!thread) return null
    return ['来源线程', thread.title, facts([['线程', key], ['待评估', thread.pending]]) +
      timeline(tickets.flatMap(ticket => (ticket.inputs ?? []).filter(input => input.trigger?.threads.includes(key))
        .map(input => ({ at: input.at, name: ticket.title, detail: inputStatus(input.status) }))))]
  }
  if (kind === 'source') {
    const source = data.sources.find(item => item.id === id)
    if (!source) return null
    return ['来源详情', source.title, timeline(data.tickets.filter(ticket => ticket.origin?.source === id)
      .map(ticket => ({ at: ticket.origin.at, name: ticket.title, detail: ticket.origin.text })))]
  }
  const ticket = data.tickets.find(item => item.id === id)
  return ticket ? inspectTicket(kind, ticket, rest.join(':')) : null
}

function renderDetails() {
  const view = inspector()
  details.hidden = !view
  if (view) {
    const [type, title, body] = view
    const offset = details.querySelector('.details-body')?.scrollTop ?? 0
    details.innerHTML = `<header class="detail-head"><div><div class="overline">${escape(type)}</div>
      <h2>${escape(title)}</h2></div><button type="button" data-close class="close" aria-label="关闭详情">关闭</button></header>
      <div class="details-body">${body}</div>`
    details.querySelector('.details-body').scrollTop = offset
  }
  for (const node of document.querySelectorAll('[data-inspect]')) {
    node.setAttribute('aria-pressed', String(node.dataset.inspect === selected))
  }
  redrawWires()
}

function setConnection(status, value) {
  const target = $('connection')
  target.dataset.status = status
  if (target.lastChild?.textContent !== value) target.replaceChildren(document.createElement('span'), value)
}

async function update() {
  refreshing = true
  try {
    const response = await fetch('/api/topology', { cache: 'no-store' })
    if (!response.ok) throw new Error('Unavailable')
    const { at, cursor, ...next } = await response.json()
    if (typeof cursor === 'number' && !stream) {
      stream = new EventSource(`/api/observations?after=${cursor}`)
      stream.onmessage = () => {
        if (refreshing) { refreshRequested = true; return }
        clearTimeout(refreshTimer)
        refreshTimer = setTimeout(update, 80)
      }
    }
    setConnection('online', next.runtime === 'ready' ? '已连接 · 只读预览' : '已连接 · 运行时未就绪')
    $('sample').textContent = `实时状态 · 最近读取 ${date(at)}${next.paused ? ' · 已暂停执行' : ''}`
    const nextSignature = JSON.stringify(next)
    if (nextSignature === signature) return
    signature = nextSignature
    data = next
    $('repository').textContent = next.repository || '当前部署'
    $('running').textContent = `${next.load.running} / ${next.load.maxWorkers}`
    $('queued').textContent = next.load.queued
    $('open').textContent = next.openCount
    $('recent-count').textContent = next.tickets.filter(ticket => ticket.stage === 'ended').length
    if (!initialized) {
      const recentPr = next.tickets.find(ticket => ticket.stage !== 'ended' && ticket.prs.length)
      if (recentPr) selected = `pr:${recentPr.id}:${recentPr.prs.at(-1).number}`
    }
    renderGraph(initialized)
    renderDetails()
    initialized = true
  } catch {
    setConnection('error', '连接中断 · 正在重试')
    $('sample').textContent = data ? '连接中断 · 图中保留最后一次读取的状态' : '请检查 3082 上的 SuperAgent 服务'
  } finally {
    refreshing = false
    refreshTimer = setTimeout(update, refreshRequested ? 80 : 2000)
    refreshRequested = false
  }
}

document.addEventListener('click', event => {
  if (!data) return
  const control = event.target.closest('[data-inspect], [data-close], [data-recent]')
  if (!control) return
  if (control.hasAttribute('data-recent')) {
    shownRecently = !shownRecently
    control.setAttribute('aria-pressed', String(shownRecently))
    if (!shownRecently && data.tickets.find(ticket => ticket.id === selected?.split(':')[1])?.stage === 'ended') selected = undefined
    renderGraph(false)
  } else {
    selected = control.dataset.inspect
  }
  renderDetails()
})

svg.addEventListener('keydown', event => {
  if (!['Enter', ' '].includes(event.key) || !event.target.dataset.inspect) return
  event.preventDefault()
  selected = event.target.dataset.inspect
  renderDetails()
})

new ResizeObserver(redrawWires).observe($('canvas'))
void update()
