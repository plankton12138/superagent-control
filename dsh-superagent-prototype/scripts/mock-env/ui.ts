/** Single-page mock console served by the sandbox; plain HTML so no frontend build is involved. */
export const PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SuperAgent 模拟控制台</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0b0f14; --panel: #111820; --panel-2: #151e28; --line: #243241; --text: #dce7f3; --muted: #8296aa;
    --accent: #5eead4; --accent-2: #60a5fa; --warn: #fbbf24; --bad: #f87171; --good: #34d399;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: radial-gradient(1200px 600px at 20% -10%, #16283a 0%, var(--bg) 55%); color: var(--text);
    font: 14px/1.5 "Segoe UI", system-ui, -apple-system, "Microsoft YaHei", sans-serif; }
  header { position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; gap: 12px; align-items: center;
    padding: 14px 22px; background: rgba(11, 15, 20, .86); border-bottom: 1px solid var(--line); backdrop-filter: blur(8px); }
  header h1 { margin: 0; font-size: 17px; letter-spacing: .5px; }
  header .sub { color: var(--muted); font-size: 12px; }
  .pills { display: flex; flex-wrap: wrap; gap: 8px; margin-left: auto; }
  .pill { padding: 4px 10px; border: 1px solid var(--line); border-radius: 999px; background: var(--panel); font-size: 12px; }
  .pill b { color: var(--accent); font-weight: 600; }
  .pill.bad b { color: var(--bad); } .pill.warn b { color: var(--warn); }
  main { display: grid; grid-template-columns: 380px minmax(0, 1fr); gap: 16px; padding: 18px 22px 40px; }
  .panel { background: linear-gradient(180deg, var(--panel), var(--panel-2)); border: 1px solid var(--line);
    border-radius: 14px; padding: 16px; min-width: 0; }
  .panel h2 { margin: 0 0 12px; font-size: 13px; letter-spacing: 1px; color: var(--muted); text-transform: uppercase; }
  .stack { display: flex; flex-direction: column; gap: 10px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--muted); }
  input, select, textarea { width: 100%; padding: 8px 10px; border-radius: 9px; border: 1px solid var(--line);
    background: #0d141b; color: var(--text); font: inherit; outline: none; }
  input:focus, select:focus, textarea:focus { border-color: var(--accent-2); }
  textarea { min-height: 84px; resize: vertical; }
  .check { flex-direction: row; align-items: center; gap: 8px; color: var(--text); }
  .check input { width: auto; }
  button { cursor: pointer; border: 1px solid var(--line); background: #1a2733; color: var(--text);
    padding: 8px 12px; border-radius: 9px; font: inherit; transition: .15s border-color, .15s background; }
  button:hover { border-color: var(--accent-2); background: #203240; }
  button.primary { background: linear-gradient(135deg, #0f766e, #0e7490); border-color: #14b8a6; font-weight: 600; }
  button.small { padding: 4px 8px; border-radius: 7px; font-size: 12px; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; }
  .hint { color: var(--muted); font-size: 12px; }
  .flash { min-height: 18px; font-size: 12px; color: var(--accent); }
  .ticket { border: 1px solid var(--line); border-radius: 11px; padding: 11px 12px; background: #0e151c; }
  .ticket + .ticket { margin-top: 9px; }
  .ticket .top { display: flex; gap: 8px; align-items: center; }
  .ticket .title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badge { flex: none; font-size: 11px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); }
  .badge.good { color: #06281f; background: var(--good); border-color: var(--good); }
  .badge.bad { color: #2b0707; background: var(--bad); border-color: var(--bad); }
  .badge.warn { color: #2b2005; background: var(--warn); border-color: var(--warn); }
  .badge.run { color: #05202b; background: var(--accent); border-color: var(--accent); }
  .meta { color: var(--muted); font-size: 12px; margin-top: 5px; word-break: break-all; }
  .report { margin-top: 6px; padding: 6px 8px; background: #0a1016; border-left: 2px solid var(--accent-2); border-radius: 4px; font-size: 12px; }
  .events { display: flex; flex-direction: column; gap: 7px; max-height: 280px; overflow: auto; }
  .event { display: grid; grid-template-columns: 64px 1fr auto; gap: 8px; align-items: start; font-size: 12px;
    padding: 7px 8px; background: #0d141b; border: 1px solid var(--line); border-radius: 8px; }
  .event .time { color: var(--muted); }
  .event .text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .deliveries { max-height: 300px; overflow: auto; font: 12px/1.45 ui-monospace, Consolas, monospace; }
  .delivery { padding: 7px 8px; border-bottom: 1px solid #1a2530; }
  .delivery .who { color: var(--accent-2); }
  .delivery .mode { color: var(--warn); }
  .delivery .body { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty { color: var(--muted); font-size: 12px; padding: 8px 0; }
  @media (max-width: 980px) { main { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header>
  <div>
    <h1>SuperAgent 模拟控制台</h1>
    <div class="sub">真实 Engine / Policy / Ticket / Executor · 假 DSH 宿主 · 无网络 · 无大模型</div>
  </div>
  <div class="pills" id="pills"></div>
</header>
<main>
  <section class="panel">
    <h2>注入事件</h2>
    <div class="stack">
      <div class="grid2">
        <label>类型
          <select id="type"><option value="issue">Issue</option><option value="comment">评论</option><option value="feishu">飞书消息</option></select>
        </label>
        <label>发送者
          <input id="author" value="alice" spellcheck="false">
        </label>
      </div>
      <div class="grid2">
        <label>编号（留空自动）
          <input id="number" type="number" min="1" placeholder="自动">
        </label>
        <label>Worker 行为
          <select id="behavior">
            <option value="ready">正常完成</option>
            <option value="blocked">阻塞等人</option>
            <option value="failed">失败</option>
            <option value="silent">不响应</option>
            <option value="progress">只报进度</option>
          </select>
        </label>
      </div>
      <label>标题（Issue）
        <input id="title" value="修复登录页标题错别字">
      </label>
      <label>内容
        <textarea id="body">@agent-bot 请修复登录页标题里的错别字。</textarea>
      </label>
      <label class="check"><input id="mentions" type="checkbox" checked> 内容自动 @ 智能体</label>
      <button class="primary" id="send">发送事件</button>
      <div class="flash" id="flash"></div>
      <div class="hint">GitHub 允许账号：alice、bob；飞书允许成员：ou_alice、ou_bob。未授权账号的请求不会创建工单。</div>
    </div>
  </section>

  <section class="panel">
    <h2>快捷场景</h2>
    <div class="row">
      <button class="small" data-scenario="normal">正常完成</button>
      <button class="small" data-scenario="feishu">飞书请求</button>
      <button class="small" data-scenario="unauthorized">未授权用户</button>
      <button class="small" data-scenario="duplicate">重复事件</button>
      <button class="small" data-scenario="blocked">阻塞等人</button>
      <button class="small" data-scenario="failed">Worker 失败</button>
      <button class="small" data-scenario="silent">Worker 不响应</button>
      <button class="small" data-scenario="stop">停止最新工单</button>
      <button class="small" data-scenario="pause">暂停 / 恢复</button>
    </div>
    <h2 style="margin-top:16px">运行状态</h2>
    <div id="health" class="stack"></div>
  </section>

  <section class="panel" id="tickets-panel">
    <h2>工单</h2>
    <div id="tickets"></div>
  </section>

  <section class="panel">
    <h2>注入记录与决策</h2>
    <div class="events" id="events"></div>
  </section>

  <section class="panel" id="deliveries-panel" style="grid-column: 1 / -1">
    <h2>Session 消息</h2>
    <div class="deliveries" id="deliveries"></div>
  </section>
</main>
<script>
  var current = null;
  var $ = function (id) { return document.getElementById(id); };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }
  function flash(text) { $('flash').textContent = text || ''; }

  function mock(path, body) {
    return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (response) { return response.json(); });
  }
  function mgmt(path, method, body) {
    var options = { method: method || 'GET', headers: { 'x-orchestrator-request': '1' } };
    if (body !== undefined) { options.headers['content-type'] = 'application/json'; options.body = JSON.stringify(body); }
    return fetch('/orchestrator/api/' + path, options).then(function (response) { return response.json(); });
  }

  function sendEvent(overrides) {
    var payload = {
      type: $('type').value,
      author: $('author').value.trim(),
      number: Number($('number').value) || undefined,
      title: $('title').value,
      body: $('body').value,
      mentions: $('mentions').checked,
      behavior: $('behavior').value
    };
    Object.keys(overrides || {}).forEach(function (key) { payload[key] = overrides[key]; });
    return mock('/mock/event', payload).then(function (result) {
      flash(result.error ? '失败：' + result.error : '已注入 ' + result.result + ' · ' + result.triggerId);
      setTimeout(refresh, 200);
      return result;
    });
  }

  function applyForm(values) {
    if (values.type) $('type').value = values.type;
    if (values.author) $('author').value = values.author;
    if (values.title !== undefined) $('title').value = values.title;
    if (values.body !== undefined) $('body').value = values.body;
    if (values.behavior) $('behavior').value = values.behavior;
    $('number').value = values.number || '';
  }

  document.querySelectorAll('[data-scenario]').forEach(function (button) {
    button.addEventListener('click', function () {
      var name = button.getAttribute('data-scenario');
      if (name === 'normal') {
        applyForm({ type: 'issue', author: 'alice', title: '修复登录页标题错别字', body: '@agent-bot 请修复登录页标题里的错别字。', behavior: 'ready' });
        sendEvent({ mentions: true });
      } else if (name === 'feishu') {
        applyForm({ type: 'feishu', author: 'ou_alice', title: '飞书请求', body: '@Mock Bot 请修复登录页标题里的错别字。', behavior: 'ready' });
        sendEvent({ mentions: true });
      } else if (name === 'unauthorized') {
        applyForm({ type: 'issue', author: 'mallory', title: '删除生产数据库', body: '@agent-bot 请立即删除生产数据库。', behavior: 'ready' });
        sendEvent({ mentions: true });
      } else if (name === 'duplicate') {
        applyForm({ type: 'issue', author: 'alice', title: '重复事件测试', body: '@agent-bot 请修复重复事件测试。', behavior: 'ready', number: 77 });
        sendEvent({ mentions: true, number: 77 }).then(function () { return sendEvent({ mentions: true, number: 77 }); });
      } else if (name === 'blocked') {
        applyForm({ type: 'issue', author: 'alice', title: '调整按钮圆角', body: '@agent-bot 请把按钮改成圆角，但我不确定用多大。', behavior: 'blocked' });
        sendEvent({ mentions: true });
      } else if (name === 'failed') {
        applyForm({ type: 'issue', author: 'alice', title: '修复启动崩溃', body: '@agent-bot 请修复启动崩溃。', behavior: 'failed' });
        sendEvent({ mentions: true });
      } else if (name === 'silent') {
        applyForm({ type: 'issue', author: 'alice', title: '长时间任务', body: '@agent-bot 请执行一个不会返回的长时间任务。', behavior: 'silent' });
        sendEvent({ mentions: true });
      } else if (name === 'stop') {
        var open = current && current.tickets.filter(function (ticket) { return ticket.open; })[0];
        if (!open) { flash('当前没有打开的工单'); return; }
        mgmt('tickets/' + encodeURIComponent(open.id) + '/stop', 'POST').then(function (result) {
          flash(result.error ? '失败：' + result.error : '已停止 ' + open.id);
          setTimeout(refresh, 200);
        });
      } else if (name === 'pause') {
        var paused = !!(current && current.info.paused);
        mgmt('executor/pause', 'POST', { paused: !paused }).then(function (result) {
          flash(result.error ? '失败：' + result.error : (!paused ? '已暂停处理' : '已恢复处理'));
          setTimeout(refresh, 200);
        });
      }
    });
  });

  $('send').addEventListener('click', function () { sendEvent(); });

  $('tickets').addEventListener('click', function (event) {
    var button = event.target.closest('button[data-action]');
    if (!button) return;
    var id = button.getAttribute('data-id');
    var action = button.getAttribute('data-action');
    if (action === 'stop') {
      mgmt('tickets/' + encodeURIComponent(id) + '/stop', 'POST').then(function () { setTimeout(refresh, 200); });
    } else if (action === 'retry') {
      mgmt('tickets/' + encodeURIComponent(id) + '/retry', 'POST').then(function () { setTimeout(refresh, 200); });
    } else if (action === 'report') {
      mock('/mock/worker-report', { ticket_id: id, state: button.getAttribute('data-state'), summary: '在模拟控制台手动触发的报告。',
        human_action: button.getAttribute('data-state') === 'blocked' ? '需要人工确认后继续。' : undefined })
        .then(function (result) { flash(result.error ? '失败：' + result.error : '已写入报告'); setTimeout(refresh, 200); });
    } else if (action === 'behavior') {
      mock('/mock/behavior', { ticket_id: id, behavior: button.getAttribute('data-behavior') })
        .then(function (result) { flash(result.error ? '失败：' + result.error : '已更新 Worker 行为'); setTimeout(refresh, 200); });
    }
  });

  function pills(info, health) {
    var items = [
      '<span class="pill">仓库 <b>' + esc(info.repository) + '</b></span>',
      '<span class="pill">账号 <b>' + esc(info.agent) + '</b></span>',
      '<span class="pill">槽位 <b>' + esc(info.activeWorkers) + '/' + esc(info.maxWorkers) + '</b></span>',
      '<span class="pill ' + (info.paused ? 'warn' : '') + '">处理 <b>' + (info.paused ? '已暂停' : '运行中') + '</b></span>',
      '<span class="pill">自动路由 <b>' + (info.autoRoute ? '开' : '关') + '</b></span>'
    ];
    Object.keys(health || {}).slice(0, 4).forEach(function (name) {
      var entry = health[name];
      items.push('<span class="pill ' + (entry.state === 'error' ? 'bad' : entry.state === 'paused' ? 'warn' : '') + '">'
        + esc(name) + ' <b>' + esc(entry.state) + '</b></span>');
    });
    $('pills').innerHTML = items.join('');
  }

  function healthList(health) {
    var names = Object.keys(health || {});
    if (!names.length) { $('health').innerHTML = '<div class="empty">暂无健康信息</div>'; return; }
    $('health').innerHTML = names.map(function (name) {
      var entry = health[name];
      return '<div class="ticket"><div class="top"><span class="title">' + esc(name) + '</span>'
        + '<span class="badge ' + (entry.state === 'error' ? 'bad' : entry.state === 'ready' ? 'good' : 'warn') + '">'
        + esc(entry.state) + '</span></div><div class="meta">' + esc(entry.detail) + '</div></div>';
    }).join('');
  }

  function ticketBadge(ticket) {
    if (ticket.ended) return '<span class="badge ' + (ticket.ended.outcome === 'completed' ? 'good' : 'bad') + '">结束 · ' + esc(ticket.ended.outcome) + '</span>';
    var report = ticket.assignment && ticket.assignment.report;
    if (report) {
      var kind = report.state === 'ready' ? 'good' : report.state === 'failed' ? 'bad' : 'warn';
      return '<span class="badge ' + kind + '">' + esc(report.state) + '</span>';
    }
    if (ticket.assignment && ticket.assignment.state === 'running') return '<span class="badge run">运行中</span>';
    return '<span class="badge">等待</span>';
  }

  function tickets(list) {
    if (!list.length) { $('tickets').innerHTML = '<div class="empty">还没有工单。发送一个 @ 智能体的 Issue 试试。</div>'; return; }
    $('tickets').innerHTML = list.map(function (ticket) {
      var report = ticket.assignment && ticket.assignment.report;
      var actions = ticket.open
        ? '<div class="row" style="margin-top:8px">'
          + '<button class="small" data-action="stop" data-id="' + esc(ticket.id) + '">停止</button>'
          + '<button class="small" data-action="report" data-state="ready" data-id="' + esc(ticket.id) + '">标记完成</button>'
          + '<button class="small" data-action="report" data-state="blocked" data-id="' + esc(ticket.id) + '">标记阻塞</button>'
          + '<button class="small" data-action="report" data-state="failed" data-id="' + esc(ticket.id) + '">标记失败</button>'
          + '</div>'
        : '<div class="row" style="margin-top:8px"><button class="small" data-action="retry" data-id="' + esc(ticket.id) + '">重试</button></div>';
      return '<div class="ticket"><div class="top">' + ticketBadge(ticket)
        + '<span class="title">' + esc(ticket.title) + '</span></div>'
        + '<div class="meta">' + esc(ticket.id) + ' · 行为 ' + esc(ticket.behavior)
        + (ticket.assignment ? ' · Assignment ' + esc(ticket.assignment.state) : '') + '</div>'
        + (report ? '<div class="report">' + esc(report.state) + '：' + esc(report.summary) + '</div>' : '')
        + (ticket.attention ? '<div class="report">等待人工：' + esc(ticket.attention.question) + '</div>' : '')
        + actions + '</div>';
    }).join('');
  }

  function events(list) {
    if (!list.length) { $('events').innerHTML = '<div class="empty">还没有注入事件</div>'; return; }
    $('events').innerHTML = list.map(function (item) {
      var label = item.result === 'duplicate' || item.result === 'filtered' ? item.result : (item.decision || item.result);
      var kind = label === 'filtered' ? 'bad' : label === 'duplicate' ? 'warn' : item.decision === 'accept' ? 'good' : '';
      return '<div class="event"><span class="time">' + esc(item.time) + '</span>'
        + '<span class="text">' + esc(item.kind) + ' · ' + esc(item.author) + ' · ' + esc(item.text) + '</span>'
        + '<span class="badge ' + kind + '">' + esc(label) + '</span></div>';
    }).join('');
  }

  function deliveries(list) {
    if (!list.length) { $('deliveries').innerHTML = '<div class="empty">还没有 Session 消息</div>'; return; }
    $('deliveries').innerHTML = list.map(function (item) {
      return '<div class="delivery"><span class="who">' + esc(item.sessionId) + '</span> '
        + '<span class="mode">[' + esc(item.mode) + ']</span> '
        + '<span class="body">' + esc(item.text) + '</span></div>';
    }).join('');
  }

  function refresh() {
    fetch('/mock/state').then(function (response) { return response.json(); }).then(function (state) {
      current = state;
      pills(state.info, state.health);
      healthList(state.health);
      tickets(state.tickets);
      events(state.events);
      deliveries(state.deliveries);
    }).catch(function (error) { flash('读取状态失败：' + error); });
  }

  refresh();
  setInterval(refresh, 1200);
</script>
</body>
</html>`
