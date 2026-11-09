import { SCRIPT } from './ui-client.ts'

/** The local workbench is self-contained, including its type, graphics, and runtime client. */
export const PAGE = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SuperAgent · 模拟实验台</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #181f26; --panel: #263039; --raised: #35424b; --inset: #131b20; --line: #495760;
    --rim: #64747b; --ink: #0e1519; --text: #e5e9df; --muted: #aabbb7; --amber: #f0bf73;
    --green: #b4d5aa; --red: #ffac9c; --cyan: #9acbd0;
    --mono: "Cascadia Mono", "Consolas", "Microsoft YaHei", monospace;
  }
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.55 system-ui, "Microsoft YaHei", sans-serif; }
  button, select, input, textarea { font: inherit; }
  button { cursor: pointer; }
  button:disabled { cursor: default; opacity: .58; }
  :focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
  p, h1, h2, h3 { margin: 0; overflow-wrap: anywhere; }
  code, .mono { font-family: var(--mono); }
  code { overflow-wrap: anywhere; }
  [hidden] { display: none !important; }
  .bar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 6px 16px;
    padding: 7px max(16px, calc((100% - 1330px) / 2)); background: #4b5c64; border-block: 1px solid #75878d #10171b; font: 12px var(--mono); }
  .brand { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
  .glyph { width: 13px; height: 13px; background: conic-gradient(var(--amber) 25%, #936747 0 50%, #cf935f 0 75%, #f5d297 0);
    border: 1px solid #302822; box-shadow: 1px 1px var(--ink); }
  .local { color: #f0e2c2; }
  main { max-width: 1362px; margin: auto; padding: 16px; }
  .hero { position: relative; isolation: isolate; min-height: 138px; padding: 16px 20px; overflow: hidden;
    background: #25363d; border: 1px solid var(--line); box-shadow: inset 1px 1px var(--rim), 2px 2px var(--ink); }
  .hero svg { position: absolute; z-index: -1; right: 0; bottom: 0; width: min(69%, 725px); height: 100%; }
  .hero h1 { font: 700 clamp(23px, 3.2vw, 42px)/1.18 var(--mono); letter-spacing: -.045em; text-shadow: 2px 2px var(--ink); }
  .hero h1 span { color: var(--amber); }
  .hero p { margin-top: 7px; color: var(--text); font-size: 13px; }
  .eyebrow { margin-bottom: 5px; color: var(--amber); font: 11px/1.5 var(--mono); letter-spacing: .10em; }
  .statusbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 7px;
    background: var(--panel); padding: 6px 8px 6px 11px; border: 1px solid var(--line); margin: 11px 0; }
  .statusbar .mono { color: var(--muted); font-size: 12px; }
  .statusbar strong { color: var(--green); }
  .button { color: var(--text); padding: 5px 10px; border: 1px solid var(--ink); background: var(--raised);
    box-shadow: inset 1px 1px #748389, inset -1px -1px #1b252b; }
  .button:hover:not(:disabled) { background: #43545d; }
  .button.primary { color: #232523; background: var(--amber); box-shadow: inset 1px 1px #ffe2a3, inset -1px -1px #8f663e; font-weight: 700; }
  .button.primary:hover:not(:disabled) { background: #ffd18c; }
  .button.small { font-size: 12px; }
  .layout { display: grid; grid-template-columns: minmax(185px, 235px) minmax(0, 1fr); gap: 12px; align-items: start; }
  .window { min-width: 0; background: var(--panel); border: 1px solid var(--rim); box-shadow: 2px 2px var(--ink); }
  .titlebar { display: flex; align-items: center; flex-wrap: wrap; justify-content: space-between; gap: 6px 14px;
    padding: 6px 9px; background: var(--raised); border-bottom: 1px solid var(--ink); }
  .titlebar h2, .titlebar h3 { font-size: 13px; font-weight: 650; }
  .titlebar .mono { color: var(--muted); font-size: 11px; }
  .case-list { display: grid; gap: 3px; padding: 6px; }
  .case { display: grid; grid-template-columns: 23px minmax(0, 1fr); gap: 5px; align-items: baseline; min-height: 41px;
    text-align: left; color: var(--text); border: 1px solid transparent; background: transparent; padding: 7px;
    overflow-wrap: anywhere; }
  .case code { color: var(--muted); font-size: 11px; }
  .case:hover { background: var(--raised); }
  .case[aria-pressed="true"] { color: #191c1d; background: var(--amber); border-color: #ffe1ad #876344 #876344 #ffe1ad; font-weight: 650; }
  .case[aria-pressed="true"] code { color: #483621; }
  .case-note { color: var(--muted); padding: 4px 12px 10px; font-size: 12px; }
  .workbench { display: grid; min-width: 0; gap: 11px; }
  .intro { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 10px 15px; padding: 12px; }
  .intro h2 { font-size: 21px; line-height: 1.3; }
  .intro p { margin-top: 4px; color: var(--muted); }
  .expected { grid-column: 1 / -1; border-left: 3px solid #ae8657; background: #202930; padding: 6px 9px; overflow-wrap: anywhere; }
  .expected strong { color: var(--amber); margin-right: 7px; font-size: 12px; }
  .trace { background: var(--inset); }
  .trace .titlebar { background: #34454a; }
  .trace .titlebar h3 { color: var(--green); }
  .scroll { max-height: 430px; overflow: auto; }
  .trace-line { display: grid; grid-template-columns: 10ch 7ch minmax(0, 1fr); gap: 8px; padding: 6px 10px;
    border-bottom: 1px solid #2a3638; font: 12px/1.55 var(--mono); overflow-wrap: anywhere; }
  .trace-line time { color: var(--muted); }
  .layer { color: var(--cyan); }
  .state { color: var(--green); }
  .state.warn { color: var(--amber); }
  .state.bad { color: var(--red); }
  .state + span { color: var(--text); }
  .trace-line code { color: var(--muted); margin-left: 5px; font-size: 11px; }
  .trace-line:last-child { border-bottom: 0; }
  .results { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px; }
  .entry { padding: 8px 10px; overflow-wrap: anywhere; }
  .entry + .entry { border-top: 1px solid var(--line); }
  .entry strong { font-weight: 650; }
  .entry p { margin-top: 3px; white-space: pre-wrap; }
  .meta, .empty { color: var(--muted); font-size: 12px; }
  .empty { padding: 11px; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .entry .row { margin-top: 6px; }
  #notice { color: var(--amber); padding: 7px 10px; border-left: 3px solid var(--amber); background: var(--panel); overflow-wrap: anywhere; }
  #notice:empty { display: none; }
  details > summary { padding: 7px 9px; background: var(--raised); cursor: pointer; }
  details[open] > summary { border-bottom: 1px solid var(--ink); }
  .form { padding: 10px; display: grid; gap: 9px; }
  .fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  label { display: grid; gap: 3px; font-size: 12px; }
  input:not([type=checkbox]), textarea, select { min-width: 0; max-width: 100%; background: var(--inset); color: var(--text);
    border: 1px solid var(--rim); padding: 5px 7px; border-radius: 0; }
  select#history { width: min(270px, 100%); font: 12px var(--mono); }
  textarea { min-height: 65px; resize: vertical; }
  .check { display: flex; align-items: center; gap: 5px; }
  .extra { margin-top: 12px; display: grid; gap: 8px; }
  footer { margin-top: 14px; color: var(--muted); font: 11px var(--mono); overflow-wrap: anywhere; }
  @media (max-width: 720px) {
    .layout { grid-template-columns: minmax(0, 1fr); }
    .case-list { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .case { font-size: 12px; }
    .case-note { display: none; }
  }
  @media (max-width: 480px) {
    main { padding: 10px; }
    .hero { min-height: 106px; padding: 11px; }
    .hero svg { width: 53%; opacity: .52; }
    .hero p { max-width: 235px; }
    .case { grid-template-columns: 15px minmax(0, 1fr); gap: 3px; padding: 5px; }
    .case-list { padding: 4px; }
    .intro h2 { font-size: 17px; }
    .trace-line { grid-template-columns: 8ch 6ch minmax(0, 1fr); gap: 5px; }
    .trace-line code { display: none; }
    .results { grid-template-columns: minmax(0, 1fr); }
  }
</style>
</head>
<body>
<header class="bar"><span class="brand"><span class="glyph" aria-hidden="true"></span> SA WORKBENCH</span><a class="local" href="/">返回架构工作台</a></header>
<main>
  <section class="hero" aria-label="模拟实验台">
    <svg viewBox="0 0 660 144" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
      <path fill="#30454c" d="M0 144 175 82 280 102 432 21 550 52 660 9V144Z"/>
      <path fill="#3d5559" d="M98 144 264 64 350 128 432 21 528 144Z"/>
      <path fill="#506769" d="m264 64 86 64-152-25Z"/>
      <path fill="#344a4e" d="m432 21 29 90-111 17Z"/>
      <path fill="#5f7775" d="m432 21 87 49-58 41Z"/>
      <path fill="#8a735d" d="m519 70 141-61-30 93Z"/>
      <path fill="#bd9469" d="m660 9-30 93 30 28Z"/>
      <path fill="#716459" d="m461 111 58-41 111 32-37 42H528Z"/>
      <path fill="#314348" d="m198 103 152 25-222 16H98Z"/>
      <path fill="#506468" d="m350 128 111-17 67 33H249Z"/>
      <path fill="#3b5053" d="m593 144 37-42 30 28v14Z"/>
      <path fill="#f0bf73" d="m533 20 11-6 10 6-10 6Z"/>
      <path fill="#be895c" d="m533 20 11 6v11l-11-6Z"/>
      <path fill="#896449" d="m544 26 10-6v11l-10 6Z"/>
    </svg>
    <div class="eyebrow">LOCAL CONTROL PLANE</div>
    <h1>SuperAgent <span>模拟实验台</span></h1>
    <p>虚拟飞书与 GitHub · 实时 Trace</p>
  </section>
  <div class="statusbar"><span id="runtime" class="mono">正在连接 Runtime…</span><button id="pause" class="button small" type="button" disabled>暂停处理</button></div>
  <div class="layout">
    <nav class="window" aria-label="场景库">
      <div class="titlebar"><h2>场景库</h2><span class="mono">SCENARIOS</span></div>
      <div id="scenarios" class="case-list"></div>
      <p class="case-note">选择场景，查看预期后运行。</p>
    </nav>
    <div class="workbench">
      <section class="window intro" aria-label="场景详情">
        <div><div class="eyebrow" id="case-source"></div><h2 id="case-title">正在加载场景</h2><p id="case-description"></p></div>
        <button id="run" class="button primary" type="button" disabled>运行场景</button>
        <div class="expected"><strong>预期</strong><span id="expected"></span></div>
      </section>
      <div id="notice" role="status"></div>
      <section class="window trace">
        <div class="titlebar">
          <h3>▸ 运行轨迹 <span class="mono">TRACE</span></h3>
          <select id="history" aria-label="运行历史" disabled><option>暂无运行记录</option></select>
        </div>
        <div id="trace" class="scroll"><div class="empty">运行场景后，这里会显示真实事件、决策和派工。</div></div>
      </section>
      <div class="results">
        <section class="window"><div class="titlebar"><h3>本轮工单</h3><span id="ticket-count" class="mono"></span></div><div id="run-tickets"></div></section>
        <section class="window"><div class="titlebar"><h3>渠道回执</h3><span class="mono">OUTBOX</span></div><div id="receipts"></div></section>
      </div>
      <details class="window" id="inputs"><summary>本轮输入详情</summary><div id="events"></div></details>
      <details class="window" id="custom">
        <summary>自定义事件</summary>
        <form class="form" id="event-form">
          <div class="fields">
            <label>来源<select name="type"><option value="issue">GitHub Issue</option><option value="comment">GitHub 评论</option><option value="feishu">飞书消息</option></select></label>
            <label>发送者<input name="author" value="alice" spellcheck="false" required></label>
            <label id="issue-number">编号（可选）<input name="number" type="number" min="1"></label>
            <label>Worker 行为<select name="behavior"><option value="ready">正常完成</option><option value="pull">提交虚拟 PR</option><option value="blocked">等人工</option><option value="failed">失败</option><option value="silent">持续占槽</option><option value="progress">只报进度</option></select></label>
          </div>
          <label id="issue-title">Issue 标题<input name="title" value="修复登录页标题"></label>
          <label>内容<textarea name="body" required>请将登录页标题改为 Sign in。</textarea></label>
          <div class="row"><label class="check"><input name="mentions" type="checkbox" checked>自动 @ 智能体</label>
            <label class="check" id="direct-label" hidden><input name="direct" type="checkbox">飞书私聊</label>
            <label class="check" id="pr-label" hidden><input name="isPr" type="checkbox">PR 评论</label></div>
          <div><button class="button" type="submit">注入事件</button></div>
        </form>
      </details>
    </div>
  </div>
  <div class="extra">
    <details class="window"><summary>全部工单</summary><div id="tickets" class="scroll"></div></details>
    <details class="window"><summary>服务状态</summary><div id="health" class="scroll"></div></details>
    <details class="window"><summary>Session 日志</summary><div id="deliveries" class="scroll mono"></div></details>
  </div>
  <footer>SUPERAGENT / SANDBOX · 本次启动保留最近 40 次运行 · Worker 与平台响应由本地脚本模拟</footer>
</main>
<script>${SCRIPT}</script>
</body>
</html>`
