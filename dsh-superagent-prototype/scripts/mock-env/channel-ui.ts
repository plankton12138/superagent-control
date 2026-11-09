export const CHANNEL_STYLE = String.raw`
.channel-layout{display:grid;grid-template-columns:minmax(170px,24%) minmax(0,1fr);gap:9px;align-items:start}
.channel-side{padding:7px;display:grid;gap:5px}.channel-side button{text-align:left;overflow-wrap:anywhere}
.channel-side button[aria-current="true"]{background:#45594d;border-left:3px solid var(--mint)}
.channel-actions button[aria-pressed="true"]{background:var(--amber);color:var(--ink);box-shadow:inset 1px 1px #ffe4ac}
.channel-side label,.compose label{display:grid;gap:3px;font-size:12px;color:var(--muted)}
.channel-list{display:grid;gap:4px;max-height:390px;overflow:auto}
.channel-thread{background:var(--deep);max-height:480px;min-height:180px;overflow:auto}
.channel-thread>h3{padding:9px 12px;font-size:16px;overflow-wrap:anywhere}
.channel-message{padding:8px 12px;overflow-wrap:anywhere;border-top:1px solid #334649}
.channel-message header{display:flex;gap:5px 10px;align-items:baseline;flex-wrap:wrap}
.channel-message p{white-space:pre-wrap}.channel-message[data-bot]{color:var(--mint)}
.channel-message[data-reply]{border-left:2px solid var(--mint);margin-left:12px}
.channel-message a,.link-button{font-size:12px;color:var(--blue)}
.link-button{background:none;border:0;padding:0;text-decoration:underline}
.compose{padding:9px 11px;border-top:1px solid var(--edge);display:grid;gap:7px}
.compose input[type="text"]{background:var(--deep);color:var(--text);padding:5px 7px;border:1px solid var(--edge);min-width:0}
.compose label.check{display:flex;align-items:center;gap:5px}.compose textarea{width:100%;resize:vertical}
.channel-actions,.compose-options{display:flex;align-items:center;gap:6px 10px;flex-wrap:wrap}
.channel-actions button{font-size:12px}.channel-status:not(:empty){padding:7px 12px;background:#31423e;color:var(--mint)}
@media(max-width:680px){.channel-layout{grid-template-columns:minmax(0,1fr)}.channel-list{max-height:140px}.channel-thread{max-height:350px}}
`

export const CHANNEL_CONTENT = String.raw`
<main>
  <header class="mast"><div><div class="eyebrow">/dev/mock · SOURCE TERMINAL</div><h1 id="channel-title">虚拟渠道</h1></div><p class="health">LOCAL SANDBOX · 本地模拟</p></header>
  <p class="hint" id="channel-hint"></p>
  <div class="alert" id="channel-error" role="alert"></div>
  <div class="channel-layout">
    <section class="window" aria-label="会话列表">
      <div class="titlebar"><h2 id="side-title">会话</h2></div>
      <div class="channel-side">
        <div class="channel-actions" id="channel-modes"></div>
        <div class="channel-list" id="channel-list"></div>
        <label>模拟身份<select id="channel-author"><option value="alice">Alice · 已授权</option><option value="bob">Bob · 已授权</option><option value="visitor">访客 · 未授权</option></select></label>
      </div>
    </section>
    <section class="window" aria-label="当前会话">
      <div class="titlebar"><h2 id="thread-title">正在连接…</h2><div class="channel-actions" id="thread-actions"></div></div>
      <div class="channel-thread" id="channel-thread"><p class="empty">正在读取本地沙箱…</p></div>
      <div class="channel-status" id="channel-status" role="status"></div>
      <form class="compose" id="channel-form">
        <label id="issue-title-row" hidden>标题<input type="text" id="issue-title" maxlength="120" required></label>
        <p id="replying" class="meta" hidden><span id="reply-target"></span> <button type="button" class="link-button" id="cancel-reply">取消回复</button></p>
        <label><span id="body-label">消息</span><textarea id="channel-body" maxlength="3000" rows="3"></textarea></label>
        <div class="compose-options"><label class="check" id="mention-row"><input type="checkbox" id="mention-bot" checked> @ SuperAgent</label>
          <button class="link-button" id="insert-example" type="button">填入示例</button></div>
        <div><button class="button primary" type="submit" id="send-channel" disabled>发送</button></div>
      </form>
    </section>
  </div>
  <footer>这些输入进入同一个 SuperAgent Runtime。点击消息旁的「查看 Trace」可以打开这次运行。</footer>
</main>
<script>
(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
  const source = location.pathname.slice(1);
  const gh = source === 'github';
  const feishu = source === 'feishu';
  const name = gh ? 'GitHub' : feishu ? '飞书' : 'QQ';
  const params = new URLSearchParams(location.search);
  let number = gh && Number(params.get('number')) || 0;
  let mode = gh ? number ? 'pulls' : 'issues' : params.get('mode') === 'direct' ? 'direct' : 'group';
  let replyTo = '';
  let state;
  let busy = false;
  let refreshId = 0;
  const direct = () => mode === 'direct';
  const author = () => (feishu ? 'ou_' : '') + $('channel-author').value;
  const current = () => state?.conversations.find(item => item.number === number);
  const traceLink = (id, label = '查看 Trace') => id ? '<a href="/?run=' + encodeURIComponent(id) + '#run-map">' + label + '</a>' : '';
  const empty = text => '<p class="empty">' + esc(text) + '</p>';
  const time = at => at ? new Date(at).toLocaleTimeString('zh-CN', { hour12:false }) : '';
  const label = id => ({ alice:'Alice', bob:'Bob', visitor:'访客' })[String(id).replace(/^ou_/, '')] || id;
  const render = (id, html) => {
    const element = $(id);
    if (element.lastMarkup === html) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 30;
    element.innerHTML = html;
    element.lastMarkup = html;
    if (id === 'channel-thread' && atBottom) element.scrollTop = element.scrollHeight;
  };
  async function request(path, body) {
    const response = await fetch(path, body === undefined ? {} : { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || 'HTTP ' + response.status);
    return result;
  }
  function messages() {
    return (state?.chat ?? []).filter(item => item.source === source && item.direct === direct() && (!direct() || item.author === author()));
  }
  function line({ author, text, at, runId }, controls = '', bot = false, reply = false) {
    return '<article class="channel-message"' + (bot ? ' data-bot' : '') + (reply ? ' data-reply' : '') + '><header><strong>' + esc(label(author))
      + '</strong><time class="subtle">' + esc(time(at)) + '</time>' + traceLink(runId) + controls + '</header><p>' + esc(text) + '</p></article>';
  }
  const botLine = (item, reply = false) => line({ ...item, author:'SuperAgent' }, '', true, reply);
  function draw() {
    const item = current();
    const emptyPulls = gh && mode === 'pulls' && !number;
    const title = gh ? item ? (item.isPr ? 'PR #' : 'Issue #') + item.number + ' · ' + item.title : emptyPulls ? 'Pull requests' : '新建 Issue'
      : direct() ? label(author()) + ' ↔ SuperAgent' : '# 沙箱测试群';
    $('thread-title').textContent = title;
    const modeButton = (key, title) => '<button class="button" type="button" data-mode="' + key + '" aria-pressed="' + (mode === key) + '">' + title + '</button>';
    render('channel-modes', gh ? modeButton('issues', 'Issues') + modeButton('pulls','Pull requests')
      : modeButton('group','群聊') + modeButton('direct','私聊'));
    render('channel-list', gh ? '<button class="button" type="button" data-number="0" aria-current="' + (!number && mode === 'issues') + '">+ 新建 Issue</button>'
      + (state?.conversations ?? []).filter(row => row.isPr === (mode === 'pulls')).map(row => '<button class="button" type="button" data-number="'
        + row.number + '" aria-current="' + (row.number === number) + '"><span class="mono">#' + row.number + '</span> ' + esc(row.title)
        + (row.isPr ? ' <span class="badge">' + esc(row.state) + '</span>' : '') + '</button>').join('') : '');
    const actions = item?.isPr ? '<span class="badge">' + esc(item.state) + '</span>'
      + (item.state === 'open' ? '<button class="button" type="button" data-pull="merge">合并 PR</button><button class="button" type="button" data-pull="close">关闭 PR</button>' : '') : '';
    render('thread-actions', actions);
    const feed = gh ? item ? (item.branch ? '<p class="empty">分支 · <code>' + esc(item.branch) + '</code></p>' : '')
      + line({ ...item, text:item.body }) + [...item.comments.map(comment => ({ ...comment, bot:false })), ...item.replies.map(reply => ({ ...reply, bot:true }))]
        .sort((a,b) => String(a.at).localeCompare(String(b.at))).map(row => row.bot ? botLine(row) : line(row)).join('')
      : empty(emptyPulls ? '暂无虚拟 PR。等 Worker 提交 PR 后会显示在这里。' : '填写标题和描述，即可创建虚拟 Issue。Worker 提交的 PR 会出现在 Pull requests。')
      : messages().map(msg => {
        const controls = (feishu ? '<button type="button" class="link-button" data-reply-to="' + esc(msg.messageId) + '">线程回复</button>' : '')
          + msg.pulls.map(pull => '<a href="/github?number=' + pull + '">虚拟 PR #' + pull + '</a>').join('');
        return line({ ...msg, text:(msg.addressed === 'mention' ? '@SuperAgent ' : '') + msg.text }, controls, false, !!msg.parentId)
          + msg.replies.map(reply => botLine(reply, true)).join('');
      }).join('') || empty(direct() ? '还没有私聊消息，试着给 SuperAgent 发一个任务。' : '还没有群聊消息，可以 @ SuperAgent，也可以发普通消息。');
    render('channel-thread', feed);
    $('channel-form').hidden = emptyPulls;
    $('issue-title-row').hidden = $('issue-title').disabled = !gh || !!number;
    $('mention-row').hidden = direct();
    $('body-label').textContent = gh ? number ? '评论' : '描述' : '消息';
    $('send-channel').textContent = gh ? number ? '发表评论' : '创建 Issue' : '发送消息';
    $('send-channel').disabled = busy || !state || (gh && !!number && !item);
    $('thread-actions').querySelectorAll('button').forEach(button => { button.disabled = busy; });
    const reply = replyTo && messages().find(item => item.messageId === replyTo);
    $('replying').hidden = !reply;
    $('reply-target').textContent = reply ? '回复 ' + label(reply.author) + '：' + reply.text.slice(0, 52) : '';
  }
  async function refresh() {
    const id = ++refreshId;
    try {
      const snapshot = await request('/mock/channels');
      if (id !== refreshId) return;
      const first = !state;
      state = snapshot;
      if (first && number) {
        const item = current();
        mode = item?.isPr ? 'pulls' : 'issues';
        if (!item) number = 0;
      }
      draw();
    } catch (error) { if (id === refreshId) $('channel-error').textContent = error.message; }
  }
  async function act(action) {
    if (busy) return;
    busy = true;
    $('channel-error').textContent = '';
    draw();
    try { await action(); }
    catch (error) { $('channel-error').textContent = error.message; }
    finally { await refresh(); busy = false; draw(); }
  }
  function select() {
    replyTo = '';
    $('channel-status').textContent = '';
    const url = new URL(location.href);
    if (gh) { if (number) url.searchParams.set('number', number); else url.searchParams.delete('number'); }
    else { if (direct()) url.searchParams.set('mode','direct'); else url.searchParams.delete('mode'); }
    history.replaceState(null, '', url);
    draw();
  }
  $('channel-modes').addEventListener('click', event => {
    const button = event.target.closest('[data-mode]');
    if (!button || busy || button.dataset.mode === mode) return;
    mode = button.dataset.mode;
    if (gh) number = state?.conversations.find(item => item.isPr === (mode === 'pulls'))?.number ?? 0;
    select();
  });
  $('channel-list').addEventListener('click', event => {
    const button = event.target.closest('[data-number]');
    if (!button || busy) return;
    number = Number(button.dataset.number);
    if (!number) mode = 'issues';
    select();
  });
  $('channel-author').addEventListener('change', () => { if (direct()) select(); });
  $('channel-thread').addEventListener('click', event => {
    const button = event.target.closest('[data-reply-to]');
    if (button) { replyTo = button.dataset.replyTo; draw(); $('channel-body').focus(); }
  });
  $('cancel-reply').addEventListener('click', () => { replyTo = ''; draw(); });
  $('insert-example').addEventListener('click', () => {
    const title = $('issue-title');
    const body = $('channel-body');
    if (gh && !number && !title.value) title.value = '补上账单导出的空态提示';
    if (!body.value) body.value = gh && number ? '请在本轮补上空态文案的验证步骤。' : '请补上账单导出的空态提示，并提交 PR。';
    body.focus();
  });
  $('thread-actions').addEventListener('click', event => {
    const button = event.target.closest('[data-pull]');
    if (!button) return;
    void act(async () => {
      await request('/mock/pull', { number, action:button.dataset.pull });
      $('channel-status').innerHTML = (button.dataset.pull === 'merge' ? '虚拟 PR 已合并。' : '虚拟 PR 已关闭。') + ' ' + traceLink(current()?.runId);
    });
  });
  $('channel-form').addEventListener('submit', event => {
    event.preventDefault();
    const bodyField = $('channel-body');
    const body = bodyField.value.trim();
    const title = $('issue-title').value.trim();
    if (gh && !number && !title || (!gh || number) && !body) {
      $('channel-error').textContent = gh && !number ? '请填写标题' : '请输入内容';
      return;
    }
    void act(async () => {
      const result = await request('/mock/event', {
        type:gh ? number ? 'comment' : 'issue' : source,
        author:author(), body, title, number:number || undefined, isPr:current()?.isPr,
        direct:direct(), mentions:!direct() && $('mention-bot').checked, replyTo:replyTo || undefined, behavior:'pull',
      });
      if (gh && !number) {
        number = result.number;
        $('issue-title').value = '';
        select();
      }
      replyTo = '';
      if (bodyField.value.trim() === body) bodyField.value = '';
      $('channel-status').innerHTML = (gh ? '已提交。' : '已发送。') + ' ' + traceLink(result.runId);
    });
  });
  $('channel-title').textContent = '虚拟 ' + name;
  document.title = '虚拟 ' + name + ' · SuperAgent';
  $(source + '-link').setAttribute('aria-current','page');
  $('side-title').textContent = gh ? '虚拟仓库 · mock/repo' : '会话与身份';
  $('channel-hint').textContent = gh ? '模拟创建 Issue、给 Issue 或 PR 留言，以及处理 Worker 提交的虚拟 PR。'
    : '以群友或私聊用户身份发消息。切换到访客可以验证未授权时的 Gate 决策。';
  $('pause').hidden = true;
  draw();
  void refresh();
  setInterval(() => { if (!busy && !document.hidden) void refresh(); }, 1100);
})();
</script>
</body>
</html>`
