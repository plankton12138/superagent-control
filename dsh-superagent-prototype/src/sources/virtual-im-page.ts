export const VIRTUAL_IM_PAGE = String.raw`<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark"><title>消息 · SuperAgent</title>
<script>
const themeKey = 'superagent-im-theme';
const systemTheme = matchMedia('(prefers-color-scheme: dark)');
let themePreference;
try { themePreference = localStorage.getItem(themeKey); } catch {}
function applyTheme() {
  document.documentElement.dataset.theme = themePreference === 'dark' || themePreference === 'light'
    ? themePreference : systemTheme.matches ? 'dark' : 'light';
}
applyTheme();
</script>
<style>
:root {
  color-scheme: light;
  font-family: Inter,"Microsoft YaHei UI","PingFang SC",system-ui,sans-serif;
  color: var(--ink);
  background: var(--feed);
  --ink: #20243c;
  --sub: #626b80;
  --placeholder: #69728a;
  --blue: #4356db;
  --link: #3349c4;
  --line: #e7eaf3;
  --control-line: #dfe3ef;
  --focus-halo: #aeb8fb;
  --sidebar: #fafbff;
  --panel: #fff;
  --feed: #f7f8fc;
  --rail: #1f2544;
  --muted-fill: #eef0f7;
  --hover: #f0f2f9;
  --selected: #e9edff;
  --accent-fill: #e3e8ff;
  --bot-fill: #e7f2ed;
  --bot-ink: #28684f;
  --ready-fill: #ebf6ef;
  --ready-dot: #379263;
  --own-avatar-fill: #e9e8fa;
  --own-avatar-ink: #574b9c;
  --own-bubble: #e8edff;
  --own-border: #e1e6ff;
  --send-fill: #4658db;
  --send-hover: #3548ca;
  --error: #a23834;
  --scroll-thumb: #8993ad;
  --scroll-track: #eceef6;
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --ink: #e7ebf7;
  --sub: #a8b3cb;
  --placeholder: #a1acc4;
  --blue: #a0afff;
  --link: #b1beff;
  --line: #30394c;
  --control-line: #49546c;
  --focus-halo: #6477b8;
  --sidebar: #191f2d;
  --panel: #1b2231;
  --feed: #141925;
  --rail: #101420;
  --muted-fill: #242c3e;
  --hover: #283247;
  --selected: #2e395a;
  --accent-fill: #313d63;
  --bot-fill: #203a36;
  --bot-ink: #9ce2c6;
  --ready-fill: #21372f;
  --ready-dot: #6dd4a6;
  --own-avatar-fill: #3a3155;
  --own-avatar-ink: #d6c4ff;
  --own-bubble: #283553;
  --own-border: #40527b;
  --send-fill: #4d61e0;
  --send-hover: #4357d4;
  --error: #ffa8a4;
  --scroll-thumb: #737f9a;
  --scroll-track: #232b3d;
}
*{box-sizing:border-box}body{margin:0}button,input,textarea{font:inherit}button{cursor:pointer}button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible{outline:2px solid var(--blue);outline-offset:3px}button:disabled{cursor:default}a{color:var(--link);text-underline-offset:3px}svg{display:block;flex:none}
.app{height:100vh;height:100dvh;display:grid;grid-template-rows:minmax(0,1fr);grid-template-columns:64px minmax(218px,286px) minmax(0,1fr);overflow:hidden}
.rail{display:flex;align-items:center;flex-direction:column;background:var(--rail);color:#fff;padding:17px 0;gap:28px}
.mark,.self{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;font-weight:700}.mark{background:#576af1;color:white;box-shadow:0 3px 9px #13193370}.self{margin-top:auto;background:#57608b;color:#fff;font-size:13px;border-radius:50%}
.rail-tab{position:relative;display:grid;place-items:center;width:40px;height:40px;border-radius:11px;background:#3b456f;color:#fff}.rail-tab::before{content:'';position:absolute;left:-12px;height:20px;width:3px;background:#99a7ff;border-radius:0 4px 4px 0}
.sidebar{display:flex;flex-direction:column;background:var(--sidebar);border-right:1px solid var(--line);min-width:0}.sidebar-top{padding:25px 18px 16px}.sidebar h1{font-size:24px;margin:0 0 18px;letter-spacing:-.03em}.search{display:flex;align-items:center;gap:8px;background:var(--muted-fill);color:var(--placeholder);border-radius:9px;padding:0 11px;height:36px}.search:focus-within{box-shadow:0 0 0 2px var(--focus-halo)}.search input{border:0;background:none;color:var(--ink);min-width:0;width:100%;font-size:13px;outline:none!important}.search input::placeholder{color:var(--placeholder)}
.room-list{padding:0 9px;display:grid;gap:3px}.room{position:relative;display:grid;grid-template-columns:41px minmax(0,1fr);align-items:center;gap:11px;text-align:left;width:100%;padding:10px 9px;border:0;border-radius:10px;background:transparent;color:var(--ink)}.room[hidden]{display:none}.room:hover{background:var(--hover)}.room[aria-current=true]{background:var(--selected)}.room[aria-current=true]::before{content:'';position:absolute;left:0;top:12px;bottom:12px;width:3px;border-radius:3px;background:var(--blue)}.room-title{font-size:14px;font-weight:650;display:block;margin-bottom:4px}.room-preview{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--sub);font-size:12px}.sidebar-foot{margin:auto 16px 0;padding:16px 2px;border-top:1px solid var(--line);font-size:11px;color:var(--sub)}.room-avatar{display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:var(--accent-fill);color:var(--blue);font-weight:700}.room-avatar.bot{background:var(--bot-fill);color:var(--bot-ink)}
.conversation{display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:var(--panel);min-width:0;min-height:0}.chat-head{display:flex;align-items:center;gap:12px;padding:15px 24px;min-height:72px;border-bottom:1px solid var(--line)}.chat-head h2{margin:0 0 3px;font-size:16px}.chat-sub{font-size:12px;color:var(--sub)}.status{margin-left:auto;display:flex;gap:6px;align-items:center;padding:5px 9px;border-radius:20px;background:var(--muted-fill);color:var(--sub);font-size:11px;white-space:nowrap}.status::before{content:'';width:7px;height:7px;border-radius:50%;background:var(--placeholder)}.status[data-mode=ready]{background:var(--ready-fill);color:var(--bot-ink)}.status[data-mode=ready]::before{background:var(--ready-dot)}
.mobile-back{display:none}.feed{min-height:0;overflow-y:auto;overscroll-behavior:contain;background:var(--feed);padding:23px max(18px, calc((100% - 920px)/2));scrollbar-gutter:stable;scrollbar-color:var(--scroll-thumb) var(--scroll-track)}.empty{height:100%;min-height:215px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:var(--sub);gap:10px}.empty[hidden]{display:none}.empty .room-avatar{width:57px;height:57px;border-radius:17px}.empty h3{margin:4px 0 0;color:var(--ink);font-size:17px}.empty p{margin:0;line-height:1.6;font-size:13px;max-width:310px}.starter{margin-top:5px;padding:7px 12px;background:var(--panel);border:1px solid var(--control-line);border-radius:7px;color:var(--link);font-size:12px}.starter:hover{border-color:var(--blue)}
.day{text-align:center;font-size:11px;color:var(--sub);margin:12px 0 20px}.message{display:flex;align-items:flex-start;gap:10px;margin:0 0 21px}.message.own{flex-direction:row-reverse}.message .room-avatar{width:33px;height:33px;border-radius:10px;font-size:12px}.message.own .room-avatar{background:var(--own-avatar-fill);color:var(--own-avatar-ink)}.message article{max-width:min(78%,680px);min-width:0}.message.own article{display:flex;flex-direction:column;align-items:flex-end}.meta{display:flex;align-items:center;gap:7px;margin:0 2px 5px;color:var(--sub);font-size:11px}.meta strong{color:var(--ink);font-weight:650}.bubble{display:block;border:1px solid var(--line);border-radius:3px 13px 13px 13px;background:var(--panel);padding:9px 12px;color:var(--ink);font-size:14px;line-height:1.63;white-space:pre-wrap;overflow-wrap:anywhere}.own .bubble{border-color:var(--own-border);border-radius:13px 3px 13px 13px;background:var(--own-bubble)}.mention{font-weight:650;color:var(--link)}
.compose-wrap{padding:12px 22px 15px;border-top:1px solid var(--line);background:var(--panel)}.composer{border:1px solid var(--control-line);border-radius:11px;padding:9px 11px;max-width:920px;margin:auto}.composer:focus-within{border-color:var(--blue);box-shadow:0 0 0 2px var(--accent-fill)}.composer textarea{display:block;resize:none;border:0;outline:none!important;width:100%;min-height:58px;max-height:155px;color:var(--ink);font-size:14px;line-height:1.55;background:transparent}.composer textarea::placeholder{color:var(--placeholder)}.compose-actions{display:flex;align-items:center;gap:9px}.mention-btn,.mobile-back{border:0;background:var(--accent-fill);color:var(--link);padding:6px 9px;border-radius:6px;font-weight:650}.mention-btn[hidden]{display:none}.mention-btn:hover,.mobile-back:hover{background:var(--selected)}.compose-note{margin-left:auto;font-size:11px;color:var(--sub)}.send{display:flex;gap:6px;align-items:center;border:0;border-radius:7px;padding:7px 13px;background:var(--send-fill);color:white;font-size:13px;font-weight:650}.send:hover:not(:disabled){background:var(--send-hover)}.send:disabled{opacity:.48}.feedback{max-width:920px;margin:0 auto;font-size:12px;color:var(--error)}.feedback:not(:empty){padding-bottom:8px}.repo{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:5px}.repo[hidden]{display:none}
.theme-toggle {
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--control-line);
  border-radius: 8px;
  background: var(--panel);
  color: var(--link);
}
.theme-toggle:hover { background: var(--hover); }
.theme-sun, [data-theme="dark"] .theme-moon { display: none; }
[data-theme="dark"] .theme-sun { display: block; }
@media(max-width:680px){.app{grid-template-columns:1fr}.rail{display:none}.sidebar{display:none}.app[data-list=true] .sidebar{display:flex}.app[data-list=true] .conversation{display:none}.mobile-back{display:block;padding:7px}.chat-head{padding:12px;min-height:61px;gap:8px}.chat-head .room-avatar{width:34px;height:34px}.compose-wrap{padding:8px}.compose-note{font-size:0}.feed{padding:16px 12px}.sidebar-top{padding-top:18px}.status{padding:5px 7px}.message article{max-width:84%}}
</style></head><body>
<main class="app" id="app" data-list="false">
  <div class="rail" aria-hidden="true"><div class="mark">S</div><div class="rail-tab"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 11.5a7.8 7.8 0 0 1-8 7.5H5l1.4-3.2A7 7 0 0 1 4 11.5 7.8 7.8 0 0 1 12 4a7.8 7.8 0 0 1 8 7.5Z"/><path d="M8 11.5h8"/></svg></div><div class="self">我</div></div>
  <aside class="sidebar" aria-label="会话列表"><div class="sidebar-top"><h1>消息</h1><label class="search"><svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="8.4" cy="8.4" r="5.2"/><path d="m12.3 12.3 4 4"/></svg><input id="search" type="search" placeholder="搜索会话" aria-label="搜索会话" autocomplete="off"></label></div>
  <nav class="room-list" aria-label="切换会话">
    <button type="button" class="room" data-chat="project"><span class="room-avatar" aria-hidden="true">#</span><span><span class="room-title">项目协作群</span><span class="room-preview" id="project-preview">群聊 · @SuperAgent 发起任务</span></span></button>
    <button type="button" class="room" data-chat="agent"><span class="room-avatar bot" aria-hidden="true">S</span><span><span class="room-title">SuperAgent</span><span class="room-preview" id="agent-preview">私聊 · 直接发送消息</span></span></button>
  </nav><div class="sidebar-foot">虚拟 IM · 本机工作区<a class="repo" id="repo" hidden target="_blank" rel="noopener noreferrer"></a></div></aside>
  <section class="conversation" aria-labelledby="room-title"><header class="chat-head"><button class="mobile-back" type="button" aria-label="返回会话列表" id="back">‹</button><span class="room-avatar" id="avatar" aria-hidden="true">#</span><div><h2 id="room-title">项目协作群</h2><div class="chat-sub" id="room-sub">群聊 · 2 位成员</div></div><span class="status" id="status" role="status">连接中</span>
    <button type="button" class="theme-toggle" id="theme-toggle" aria-label="深色模式" aria-pressed="false" title="切换到深色模式">
      <svg class="theme-moon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20.5 14.1A8.6 8.6 0 0 1 9.9 3.5a8.7 8.7 0 1 0 10.6 10.6Z"/></svg>
      <svg class="theme-sun" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></svg>
    </button>
  </header>
  <div class="feed" id="feed" tabindex="0" aria-label="聊天消息"><div class="empty" id="empty"><span class="room-avatar" id="empty-icon" aria-hidden="true">#</span><h3 id="empty-title"></h3><p id="empty-text"></p><button class="starter" type="button" id="starter"></button></div><div id="messages" role="log" aria-label="会话消息" aria-relevant="additions"></div></div>
  <footer class="compose-wrap"><div class="feedback" id="feedback" role="status"></div><form class="composer" id="composer"><textarea rows="2" id="draft" aria-label="输入消息" maxlength="6000" placeholder="输入消息…"></textarea><div class="compose-actions"><button type="button" class="mention-btn" id="mention" aria-label="提及 SuperAgent">@</button><span class="compose-note">Enter 发送 · Shift + Enter 换行</span><button class="send" id="send" type="submit" disabled>发送 <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m2.7 9 14.4-6-4.3 14-3.3-5.6L2.7 9Z"/><path d="m9.5 11.4 7.6-8.4"/></svg></button></div></form></footer></section>
</main>
<script>
const by = id => document.getElementById(id);
const themeToggle = by('theme-toggle');
function updateThemeToggle() {
  applyTheme();
  const dark = document.documentElement.dataset.theme === 'dark';
  themeToggle.setAttribute('aria-pressed', String(dark));
  themeToggle.title = dark ? '切换到浅色模式' : '切换到深色模式';
}
themeToggle.onclick = () => {
  themePreference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(themeKey, themePreference); } catch {}
  updateThemeToggle();
};
systemTheme.addEventListener('change', updateThemeToggle);
updateThemeToggle();
const rooms = {
  project: { title: '项目协作群', sub: '群聊 · 2 位成员', icon: '#', description: '在群里 @SuperAgent 分派任务。普通消息只留在群聊。', starter: '@SuperAgent ', action: '@SuperAgent' },
  agent: { title: 'SuperAgent', sub: '机器人 · 私聊', icon: 'S', description: '直接给 SuperAgent 发消息，回复会出现在这里。', starter: '请查看仓库并介绍这个项目。', action: '试试一条消息' },
};
const buttons = [...document.querySelectorAll('.room')];
const feed = by('feed'), draft = by('draft'), send = by('send'), feedback = by('feedback');
const drafts = {}, latest = {}, pending = {};
let active, mode = 'waiting', reason = '', busy = false, requestId = 0, statusId = 0;
const chatOf = () => location.hash === '#agent' ? 'agent' : 'project';
const day = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', year: 'numeric' });
const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' });
function updateSend() { send.disabled = busy || mode === 'waiting' || !draft.value.trim(); }
function focusDraft() { draft.focus(); draft.setSelectionRange(draft.value.length, draft.value.length); }
function insert(text) {
  const existing = draft.value;
  if (text === '@SuperAgent ' && /@SuperAgent\b/i.test(existing)) { focusDraft(); return; }
  draft.value = existing && text.startsWith('@') ? text + existing.trimStart() : (existing || text);
  focusDraft(); updateSend();
}
function select(chat) {
  if (active === chat) return;
  if (active) drafts[active] = draft.value;
  active = chat;
  const room = rooms[chat];
  buttons.forEach(button => button.setAttribute('aria-current', String(button.dataset.chat === chat)));
  for (const id of ['avatar', 'empty-icon']) { by(id).textContent = room.icon; by(id).classList.toggle('bot', chat === 'agent'); }
  by('room-title').textContent = room.title; by('room-sub').textContent = room.sub;
  by('empty-title').textContent = room.title; by('empty-text').textContent = room.description;
  by('starter').textContent = room.action; by('mention').hidden = chat === 'agent';
  draft.value = drafts[chat] || '';
  draft.placeholder = chat === 'project' ? '发送到项目协作群…' : '发送给 SuperAgent…';
  feedback.textContent = reason;
  draw(chat, latest[chat] || [], true); updateSend(); void refresh(chat);
}
function node(tag, className, value) {
  const el = document.createElement(tag); if (className) el.className = className; if (value !== undefined) el.textContent = value; return el;
}
function bubble(text) {
  const el = node('div', 'bubble');
  for (const part of text.split(/(@SuperAgent\b|https:\/\/github\.com\/[A-Za-z0-9_.\/%?&=+@#~-]+)/gi)) {
    if (/^https:\/\/github\.com\//i.test(part)) {
      const link = node('a', '', part); link.href = part; link.target = '_blank'; link.rel = 'noopener noreferrer'; el.append(link);
    } else if (part.toLowerCase() === '@superagent') el.append(node('span', 'mention', part));
    else el.append(document.createTextNode(part));
  }
  return el;
}
function draw(chat, messages, force = false) {
  const previous = latest[chat]; latest[chat] = messages;
  if (messages.length) by(chat + '-preview').textContent = messages.at(-1).text;
  if (chat !== active || !force && previous?.length === messages.length && previous?.at(-1)?.id === messages.at(-1)?.id) return;
  const bottom = force || feed.scrollHeight - feed.scrollTop - feed.clientHeight < 90;
  const list = document.createDocumentFragment(); let lastDay = '';
  for (const message of messages) {
    const stamp = new Date(message.at), date = day.format(stamp), own = message.from === 'operator';
    if (lastDay !== date) { list.append(node('div', 'day', date)); lastDay = date; }
    const row = node('div', 'message' + (own ? ' own' : ''));
    const avatar = node('span', 'room-avatar' + (own ? '' : ' bot'), own ? '我' : 'S'); avatar.setAttribute('aria-hidden', 'true');
    const item = node('article'), meta = node('div', 'meta'), clock = node('time', '', time.format(stamp)); clock.dateTime = message.at;
    meta.append(node('strong', '', own ? '我' : 'SuperAgent'), clock); item.append(meta, bubble(message.text)); row.append(avatar, item); list.append(row);
  }
  by('empty').hidden = messages.length > 0; by('messages').replaceChildren(list); if (bottom) feed.scrollTop = feed.scrollHeight;
}
function setStatus(snapshot, version) {
  if (version < statusId) return;
  statusId = version; mode = snapshot.mode; reason = snapshot.reason || '';
  by('status').dataset.mode = mode;
  by('status').textContent = { ready: '已连接', preview: '本地预览', waiting: '未连接' }[mode];
  by('status').title = reason || (mode === 'preview' ? '预览中的消息只保留在本地，不会触发任务。' : '已连接 SuperAgent');
  feedback.textContent = reason;
  const repo = by('repo'); repo.hidden = !snapshot.repository;
  if (snapshot.repository) { repo.textContent = snapshot.repository; repo.href = 'https://github.com/' + snapshot.repository; }
  updateSend();
}
const roomRequests = {};
async function request(chat, data) {
  const version = ++requestId; roomRequests[chat] = version;
  const response = await fetch('/virtual-im/api/chats/' + chat, {
    method: data ? 'POST' : 'GET', signal: AbortSignal.timeout(8000), cache: 'no-store',
    headers: { 'x-virtual-im': '1', ...(data ? { 'content-type': 'application/json' } : {}) },
    body: data && JSON.stringify(data),
  });
  const snapshot = await response.json(); if (!response.ok) throw new Error(snapshot.error);
  if (roomRequests[chat] === version) { draw(chat, snapshot.messages); setStatus(snapshot, version); }
}
async function refresh(chat) {
  if (busy) return;
  try { await request(chat); }
  catch { if (active === chat) setStatus({ mode: 'waiting', reason: '连接中断，正在重试…' }, requestId); }
}
buttons.forEach(button => button.onclick = () => { const chat = button.dataset.chat; location.hash = chat; select(chat); by('app').dataset.list = 'false'; });
by('back').onclick = () => { by('app').dataset.list = 'true'; by('search').focus(); };
by('search').oninput = event => { const query = event.target.value.trim().toLowerCase(); buttons.forEach(button => button.hidden = !rooms[button.dataset.chat].title.toLowerCase().includes(query)); };
by('mention').onclick = () => insert('@SuperAgent '); by('starter').onclick = () => insert(rooms[active].starter);
draft.oninput = updateSend;
draft.onkeydown = event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); by('composer').requestSubmit(); } };
by('composer').onsubmit = async event => {
  event.preventDefault();
  const chat = active, text = draft.value.trim();
  if (!text || busy || mode === 'waiting') return;
  const input = pending[chat]?.text === text ? pending[chat] : { id: crypto.randomUUID(), text };
  pending[chat] = input; busy = true; feedback.textContent = ''; updateSend();
  try {
    await request(chat, input); delete pending[chat];
    if (chat === active && draft.value.trim() === text) { draft.value = ''; focusDraft(); feed.scrollTop = feed.scrollHeight; }
    if (drafts[chat]?.trim() === text) drafts[chat] = '';
  } catch (error) { if (chat === active) feedback.textContent = error.message || '发送失败，请重试。'; }
  finally { busy = false; updateSend(); }
};
window.addEventListener('hashchange', () => select(chatOf()));
select(chatOf()); setInterval(() => { if (!document.hidden) void refresh(active); }, 1500);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(active); });
</script></body></html>`
