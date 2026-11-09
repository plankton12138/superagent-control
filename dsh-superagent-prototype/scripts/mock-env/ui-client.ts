export const SCRIPT = String.raw`
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const time = at => new Date(at).toLocaleTimeString('zh-CN', { hour12: false });
  let scenarios = {};
  let selected;
  let focusRun;
  let state;
  let busy = false;
  let refreshId = 0;
  const form = $('event-form');

  function update(id, html) {
    const element = $(id);
    if (element.rendered !== html) {
      element.innerHTML = html;
      element.rendered = html;
    }
  }
  const empty = text => '<div class="empty">' + esc(text) + '</div>';
  const shortId = id => esc(id.slice(0, 8));

  async function request(path, body, management = false) {
    const headers = management ? { 'x-orchestrator-request': '1' } : {};
    const options = { headers };
    if (body !== undefined) {
      options.method = 'POST';
      options.body = JSON.stringify(body);
      headers['content-type'] = 'application/json';
    }
    const response = await fetch(path, options);
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || ('HTTP ' + response.status));
    return result;
  }

  function selectCase(id) {
    selected = id;
    const item = scenarios[id];
    $('case-source').textContent = item.source;
    $('case-title').textContent = item.title;
    $('case-description').textContent = item.description;
    $('expected').textContent = item.expected;
    $('scenarios').querySelectorAll('[data-case]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.case === id));
    });
  }

  function syncControls() {
    $('run').disabled = busy || !state || !selected || state.info.paused || !state.info.autoRoute;
    $('pause').disabled = busy || !state;
    form.querySelector('[type="submit"]').disabled = busy || !state;
  }

  async function act(action) {
    if (busy) return;
    busy = true;
    $('notice').textContent = '';
    syncControls();
    try {
      const result = await action();
      if (result?.runId) focusRun = result.runId;
    } catch (error) {
      $('notice').textContent = error.message;
    } finally {
      await refresh();
      busy = false;
      syncControls();
    }
  }

  function stateLabel(code) {
    return '<strong class="state' + (['failed', 'filtered', 'dropped', 'error'].includes(code) ? ' bad' :
      ['blocked', 'ignore', 'duplicate', 'pending', 'queued', 'stopped'].includes(code) ? ' warn' : '') + '">' + esc(code) + '</strong>';
  }

  function renderTrace(trace) {
    if (!trace) return empty('运行场景后，这里会显示真实事件、决策和派工。');
    const lines = trace.steps.map(step => '<div class="trace-line"><time datetime="' + esc(step.at) + '">' + esc(time(step.at))
      + '</time><span class="layer">' + esc(step.layer) + '</span><div>' + stateLabel(step.state) + ' <span>' + esc(step.detail)
      + '</span>' + (step.id ? ' <code title="' + esc(step.id) + '">' + shortId(step.id) + '</code>' : '') + '</div></div>');
    return (trace.error ? '<div class="entry">' + stateLabel('error') + ' ' + esc(trace.error) + '</div>' : '')
      + (lines.join('') || empty('正在等待事件注入。'));
  }

  function ticketStatus(ticket) {
    if (ticket.ended) return ticket.ended.outcome;
    if (ticket.stage.action) return ticket.stage.action;
    return ticket.assignment?.report?.state ?? (ticket.stage.stage === 'working' ? 'running' : ticket.stage.stage);
  }
  function ticketRows(tickets, advanced) {
    if (!tickets.length) return empty('暂无工单');
    return tickets.map(ticket => {
      const button = (action, label) => '<button type="button" class="button small" data-action="' + action + '" data-id="' + esc(ticket.id) + '">' + label + '</button>';
      const actions = [];
      if (ticket.retry) actions.push(button('retry', '重试并完成'));
      if (ticket.virtualPull && ticket.open) actions.push(button('merge', '合并 PR'), button('close', '关闭 PR'));
      if (ticket.open) actions.push(button('stop', '停止工单'));
      if (advanced && ticket.open && ticket.assignment?.state === 'running') {
        actions.push(button('ready', '报告完成'), button('blocked', '报告阻塞'), button('failed', '报告失败'));
      }
      return '<article class="entry"><div class="row">' + stateLabel(ticketStatus(ticket)) + '<strong>' + esc(ticket.title)
        + '</strong></div><div class="meta mono">' + shortId(ticket.id) + ' · 派工 ' + esc(ticket.attempts)
        + (ticket.pull ? ' · PR #' + esc(ticket.pull) : '') + '</div>'
        + (ticket.assignment?.report ? '<p>' + esc(ticket.assignment.report.summary) + '</p>' : '')
        + (ticket.attention ? '<p class="meta">待确认 · ' + esc(ticket.attention.question) + '</p>' : '')
        + (actions.length ? '<div class="row">' + actions.join('') + '</div>' : '') + '</article>';
    }).join('');
  }
  function receiptRows(receipts) {
    if (!receipts.length) return empty('暂无回执');
    return receipts.map(item => {
      const target = item.channel.source === 'feishu'
        ? '飞书 · ' + (item.channel.address.messageId ?? item.channel.address.chatId)
        : 'GitHub · #' + (item.channel.address.number ?? '?');
      return '<article class="entry"><div class="row">' + stateLabel(item.status) + '<strong>' + esc(target) + '</strong></div>'
        + '<div class="meta mono">' + esc(item.kind) + ' · ' + shortId(item.id) + '</div><p>' + esc(item.text) + '</p></article>';
    }).join('');
  }
  function inputRows(events) {
    if (!events.length) return empty('暂无输入');
    return events.map(event => '<article class="entry"><div class="row">' + stateLabel(event.decision || event.result)
      + '<strong>' + esc(event.target) + ' · ' + esc(event.author) + '</strong></div><p>' + esc(event.text)
      + '</p><div class="meta mono">Trigger ' + esc(event.triggerId) + '</div></article>').join('');
  }
  function render(next) {
    state = next;
    const info = state.info;
    $('runtime').innerHTML = '<strong>' + (info.paused ? '已暂停' : '在线') + '</strong> · ' + esc(info.repository)
      + ' · 槽位 ' + esc(info.activeWorkers) + '/' + esc(info.maxWorkers) + ' · 路由 ' + (info.autoRoute ? '自动' : '手动');
    $('pause').textContent = info.paused ? '恢复处理' : '暂停处理';
    const trace = state.trace;
    focusRun = trace?.id;
    update('history', state.runs.length ? state.runs.map(run => '<option value="' + esc(run.id) + '">'
      + esc(time(run.at) + ' · ' + run.title) + '</option>').join('') : '<option>暂无运行记录</option>');
    if (focusRun) $('history').value = focusRun;
    $('history').disabled = !state.runs.length;
    update('trace', renderTrace(trace));
    $('ticket-count').textContent = (trace?.tickets.length ?? 0) + ' TICKETS';
    update('run-tickets', ticketRows(trace?.tickets ?? [], false));
    update('receipts', receiptRows(trace?.receipts ?? []));
    update('events', inputRows(trace?.events ?? []));
    update('tickets', ticketRows(state.tickets, true));
    update('health', Object.entries(state.health).map(([name, item]) => '<div class="entry">' + stateLabel(item.state)
      + ' <strong>' + esc(name) + '</strong><p class="meta">' + esc(item.detail) + '</p></div>').join(''));
    update('deliveries', state.deliveries.map(item => '<div class="entry"><div class="meta">' + esc(item.sessionId)
      + ' · ' + esc(item.mode) + '</div><p>' + esc(item.text) + '</p></div>').join('') || empty('暂无 Session 消息'));
    syncControls();
  }

  async function refresh() {
    const id = ++refreshId;
    try {
      const result = await request('/mock/state' + (focusRun ? '?run=' + encodeURIComponent(focusRun) : ''));
      if (id === refreshId) render(result);
    } catch (error) {
      if (id !== refreshId) return;
      state = undefined;
      $('runtime').textContent = 'Runtime 连接失败 · ' + error.message;
      syncControls();
    }
  }
  $('history').addEventListener('change', () => {
    focusRun = $('history').value;
    void refresh();
  });
  $('scenarios').addEventListener('click', event => {
    const button = event.target.closest('button[data-case]');
    if (button) selectCase(button.dataset.case);
  });
  $('run').addEventListener('click', () => act(() => request('/mock/scenario', { id: selected })));
  $('pause').addEventListener('click', () => act(() => request('/orchestrator/api/executor/pause', { paused: !state.info.paused }, true)));

  function updateForm() {
    const type = form.elements.namedItem('type').value;
    $('issue-title').hidden = type !== 'issue';
    $('issue-number').hidden = type === 'feishu';
    $('direct-label').hidden = type !== 'feishu';
    $('pr-label').hidden = type !== 'comment';
  }
  form.elements.namedItem('type').addEventListener('change', updateForm);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const values = new FormData(form);
    const body = Object.fromEntries(values);
    body.number = body.type === 'feishu' ? undefined : (Number(body.number) || undefined);
    body.mentions = values.has('mentions');
    body.direct = body.type === 'feishu' && values.has('direct');
    body.isPr = body.type === 'comment' && values.has('isPr');
    void act(() => request('/mock/event', body));
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, id } = button.dataset;
    void act(() => {
      if (action === 'retry') return request('/mock/retry', { ticket_id: id });
      if (action === 'merge' || action === 'close') return request('/mock/pull', { ticket_id: id, action });
      if (action === 'stop') return request('/orchestrator/api/tickets/' + encodeURIComponent(id) + '/stop', {}, true);
      return request('/mock/worker-report', { ticket_id: id, state: action });
    });
  });

  async function start() {
    try {
      scenarios = await request('/mock/scenarios');
      update('scenarios', Object.entries(scenarios).map(([id, item], index) => '<button class="case" type="button" data-case="'
        + esc(id) + '"><code>' + String(index + 1).padStart(2, '0') + '</code><span>' + esc(item.title) + '</span></button>').join(''));
      selectCase(Object.keys(scenarios)[0]);
    } catch (error) {
      $('notice').textContent = '读取场景失败 · ' + error.message;
    }
    await refresh();
    setInterval(() => { if (!busy) void refresh(); }, 800);
  }
  void start();
`
