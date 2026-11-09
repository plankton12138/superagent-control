import { ARCHITECTURE_SCRIPT } from './architecture-client.ts'
import { CHANNEL_CONTENT, CHANNEL_STYLE } from './channel-ui.ts'

const shell = String.raw`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SuperAgent 架构工作台</title>
<style>
:root{color-scheme:dark;--bg:#171e25;--panel:#242e36;--bar:#394a53;--edge:#51626b;--deep:#101a1e;--ink:#10171c;--text:#edf0e6;--muted:#b3c2c1;--mint:#b6d9ac;--amber:#f2c57e;--blue:#b1d6db;--red:#ffaf9b;--mono:"Cascadia Mono",Consolas,"Microsoft YaHei",monospace}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,"Microsoft YaHei",sans-serif}
h1,h2,h3,p{margin:0}button,input,select,textarea{font:inherit}a{color:var(--blue)}code,time,.mono{font-family:var(--mono)}code{overflow-wrap:anywhere}
[hidden]{display:none!important}button,summary{cursor:pointer}button:disabled{cursor:default;opacity:.55}
:focus-visible{outline:2px solid var(--amber);outline-offset:2px}
.desktop{background:#475c64;border-block:1px solid #71848a var(--ink)}
.desktop>div{max-width:1450px;margin:auto;padding:6px 18px;display:flex;justify-content:space-between;align-items:center;gap:7px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:8px;font:700 12px var(--mono);letter-spacing:.08em}
.brand::before{content:"";width:13px;height:13px;background:conic-gradient(#f2c57e 25%,#a67853 0 50%,#c58f59 0 75%,#f6d899 0);border:1px solid #4b3c2d}
.nav{display:flex;align-items:center;gap:5px;flex-wrap:wrap;font-size:12px}
.nav a,.button,.menu>summary{padding:5px 9px;background:var(--bar);color:var(--text);border:1px solid var(--ink);box-shadow:inset 1px 1px #63767b;text-decoration:none}
.button:hover:not(:disabled),.nav a:hover{background:#455a62}
.button.primary,.nav a[aria-current="page"]{background:var(--amber);color:#26251e;font-weight:650;box-shadow:inset 1px 1px #ffe4ac,inset -1px -1px #926641}
.button.primary:hover:not(:disabled){background:#ffd89a}
.menu{position:relative;z-index:2}.menu>summary{white-space:nowrap}.menu-body{position:absolute;right:0;min-width:182px;display:grid;gap:6px;background:var(--panel);border:1px solid var(--edge);padding:8px;box-shadow:2px 2px var(--ink)}
main{max-width:1450px;margin:auto;padding:12px 18px 22px}
.mast{isolation:isolate;position:relative;overflow:hidden;display:flex;justify-content:space-between;align-items:end;flex-wrap:wrap;gap:10px;padding:10px 12px;background:#293942;border:1px solid var(--edge);margin-bottom:9px}
.mast::before,.mast::after{content:"";position:absolute;z-index:-1;inset:0 0 0 48%;background:#53665f;clip-path:polygon(0 100%,27% 44%,46% 70%,73% 10%,100% 37%,100% 100%)}
.mast::after{background:#967b5b;clip-path:polygon(52% 100%,73% 10%,100% 37%,87% 100%)}
.mast h1{font:750 clamp(20px,2.5vw,33px)/1.18 var(--mono)}.mast h1 span{color:var(--amber)}
.eyebrow{font:11px var(--mono);letter-spacing:.09em;color:var(--blue);margin-bottom:4px}
.health{background:var(--deep);color:var(--mint);padding:4px 7px;font:12px var(--mono)}
.work-tools{display:flex;align-items:end;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:9px}
.controls{display:flex;align-items:end;gap:7px;flex-wrap:wrap;min-width:0}.controls label{display:grid;gap:2px;font-size:11px;color:var(--muted)}
select,textarea{background:var(--deep);color:var(--text);border:1px solid var(--edge);border-radius:0;padding:5px 7px;max-width:100%;min-width:0}
#scenario{width:min(240px,62vw)}#history{width:min(245px,62vw)}
.hint{padding:5px 8px;font-size:12px;color:var(--muted);border-left:2px solid var(--edge);margin-bottom:9px}
.alert{color:var(--red);margin-bottom:7px;overflow-wrap:anywhere}.alert:empty{display:none}
.workbench{display:grid;grid-template-columns:minmax(0,1fr) minmax(295px,30%);gap:9px;align-items:start}
.column{display:grid;gap:9px;min-width:0}
.window{background:var(--panel);border:1px solid var(--edge);box-shadow:2px 2px var(--ink);min-width:0}
.titlebar{display:flex;align-items:center;justify-content:space-between;gap:5px 10px;flex-wrap:wrap;padding:6px 9px;background:var(--bar);border-bottom:1px solid var(--ink)}
.titlebar h2,.titlebar h3{font-size:13px}
.meta,.subtle{color:var(--muted);font-size:12px;overflow-wrap:anywhere}.subtle{font-size:11px}
.map-body{background:var(--deep);padding:8px}
.route-key{display:flex;gap:4px 10px;align-items:center;flex-wrap:wrap;margin-bottom:7px;font-size:11px;color:var(--muted)}
.route-key b{color:var(--amber);font-weight:650}
.node{flex:1;min-width:0;display:grid;gap:2px;text-align:left;color:var(--text);background:#263338;border:1px solid #4d6062;padding:5px 7px;box-shadow:inset 1px 1px #34484a;overflow-wrap:anywhere}
.node strong{font-size:12px;line-height:1.25}.node small{font:11px/1.25 var(--mono);color:var(--muted)}
.node:hover{background:#334449}.node[data-hit="true"]{border-left:3px solid var(--mint)}.node[data-hit="true"] small{color:var(--mint)}
.node[data-warn="true"] small{color:var(--red)}
.node[aria-pressed="true"]{background:#3e4034;border-color:var(--amber)}
.flow-stage {
  position: relative;
  height: 768px;
  background-image: radial-gradient(#3b4b4c 1px, transparent 1px);
  background-size: 18px 18px;
  border: 1px solid #344348;
}
.flow-wires { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.flow-wire { stroke: #7c9395; stroke-width: 1.25; fill: none; marker-end: url(#flow-arrow); }
.flow-wire[data-used="true"] { stroke: var(--mint); stroke-width: 2; marker-end: url(#flow-active-arrow); }
.flow-label {
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 1px 4px;
  background: var(--deep);
  color: var(--muted);
  font: 11px/1.2 var(--mono);
  text-align: center;
  overflow-wrap: anywhere;
}
.flow-label[data-used="true"] { color: var(--mint); }
.flow-node {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  text-align: center;
  padding: 2px 4px;
}
.flow-node span { color: var(--muted); font-size: 11px; line-height: 1.15; }
.flow-node[data-node="gate"] {
  isolation: isolate;
  border: 0;
  box-shadow: none;
  background: transparent;
}
.flow-node[data-node="gate"]::before, .flow-node[data-node="gate"]::after {
  content: "";
  position: absolute;
  z-index: -1;
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  pointer-events: none;
}
.flow-node[data-node="gate"]::before { inset: 0; background: #7c9395; }
.flow-node[data-node="gate"]::after { inset: 2px; background: #263338; }
.flow-node[data-node="gate"][data-hit="true"]::before { background: var(--mint); }
.flow-node[data-node="gate"][aria-pressed="true"]::before { background: var(--amber); }
.flow-node[data-node="gate"][aria-pressed="true"]::after { background: #3e4034; }
.flow-support { margin-top: 7px; border: 1px solid var(--edge); padding: 5px 7px; }
.flow-support summary { color: var(--blue); font-size: 12px; }
.flow-support .systems { margin-top: 6px; }
.systems{display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:4px}
.inspect-body{padding:9px;min-height:160px;max-height:670px;overflow:auto}
.inspect-body h2{font-size:21px;color:var(--amber);margin-bottom:4px}.inspect-body>p{margin-bottom:7px}
.group-title{margin:9px 0 5px;font-size:12px;color:var(--blue)}
.fact{padding:5px 0;border-top:1px solid #495c61}
.fact h3{font-size:12px;overflow-wrap:anywhere}.fact p{margin-top:3px}
.badge{display:inline-block;padding:0 4px;background:var(--deep);color:var(--mint);font:11px var(--mono)}
.badge.bad{color:var(--red)}.badge.wait{color:var(--amber)}
.rule{margin-top:3px;font-size:12px;overflow-wrap:anywhere}
.raw{font-size:11px;color:var(--blue);margin-top:4px}.raw pre{white-space:pre-wrap;overflow-wrap:anywhere;padding:7px;margin:4px 0;background:var(--deep);color:var(--text);max-height:250px;overflow:auto;font:11px/1.45 var(--mono)}
.timeline{max-height:300px;overflow:auto;background:var(--deep);min-height:60px}
.timeline button{display:grid;grid-template-columns:7ch 8ch minmax(0,1fr);gap:5px;width:100%;padding:5px 7px;border:0;border-bottom:1px solid #334649;background:transparent;color:var(--text);text-align:left;font-size:12px;overflow-wrap:anywhere}
.timeline button:hover,.timeline button[aria-current="step"]{background:#354743}.timeline time{color:var(--muted)}.timeline .mono{color:var(--blue)}
.ticket-list{display:grid;gap:6px;padding:7px}
.ticket{border-left:2px solid var(--mint);padding:5px 7px;background:var(--deep);overflow-wrap:anywhere}.ticket .controls{margin-top:4px}
.ticket strong{font-size:13px}.ticket button{font-size:12px}
.empty{padding:7px;color:var(--muted);font-size:12px}
footer{color:var(--muted);font:11px var(--mono);margin-top:12px}
.back-map{display:none}
.workbench > aside { position: sticky; top: 8px; }
@media(max-width:900px){.workbench{grid-template-columns:minmax(0,1fr);grid-template-areas:"map" "inspect" "timeline" "tickets"}.column{display:contents}
#run-map{grid-area:map}#inspector{grid-area:inspect}#run-timeline{grid-area:timeline}#run-tickets{grid-area:tickets}
.workbench > aside{position:static}.inspect-body{max-height:none}.back-map{display:inline}}
@media(max-width:560px){main{padding:8px}.desktop>div{padding:6px 8px}
.node strong{font-size:11px}
.mast::before,.mast::after{opacity:.48}.systems{grid-template-columns:repeat(3,minmax(0,1fr))}}
${CHANNEL_STYLE}
</style>
</head>
<body>
<header class="desktop"><div><span class="brand">SA WORKBENCH</span><nav class="nav" aria-label="页面">
  <a id="map-link" href="/">架构工作台</a><a id="feishu-link" href="/feishu">虚拟飞书</a><a id="github-link" href="/github">虚拟 GitHub</a><a id="qq-link" href="/qq">虚拟 QQ</a>
  <details class="menu"><summary>更多</summary><div class="menu-body"><a href="/console#custom">自定义事件与详情</a><a href="/console">全部工单与 Session 日志</a><button class="button" id="pause" type="button" disabled>暂停处理</button></div></details>
</nav></div></header>`

export const CHANNEL_PAGE = shell + CHANNEL_CONTENT

export const ARCHITECTURE_PAGE = shell + String.raw`
<main>
  <header class="mast"><div><div class="eyebrow">/dev/mock · RUNTIME INSPECTOR</div><h1>SuperAgent <span>架构工作台</span></h1></div><p class="health" id="health">连接本地 Runtime…</p></header>
  <div id="alert" class="alert" role="alert"></div>
  <div class="work-tools">
    <div class="controls"><label>运行场景<select id="scenario"></select></label><button class="button primary" id="run" type="button" disabled>运行场景</button></div>
    <div class="controls"><label>运行历史<select id="history"></select></label><button class="button" id="play" type="button" disabled>播放轨迹</button><button class="button" id="live" type="button" disabled>返回实时</button></div>
  </div>
  <p id="expected" class="hint"></p>
  <div class="workbench">
    <div class="column">
      <section class="window" id="run-map" aria-label="运行图">
        <div class="titlebar"><h2>运行图</h2><span class="meta mono" id="run-title">等待事件</span></div>
        <div class="map-body"><div id="route-key" class="route-key"></div><div id="topology"></div></div>
      </section>
      <section class="window" id="run-timeline" aria-label="时间线"><div class="titlebar"><h2>事件时间线</h2><span class="meta mono" id="cursor-label">LIVE</span></div><div class="timeline" id="timeline"></div></section>
      <section class="window" id="run-tickets" aria-label="本轮工单"><div class="titlebar"><h2>本轮工单</h2></div><div class="ticket-list" id="tickets"></div></section>
    </div>
    <aside class="window" id="inspector" aria-label="组件详情">
      <div class="titlebar"><h2>组件详情</h2><a class="back-map" href="#run-map">返回运行图</a><span class="meta mono">INSPECT</span></div><div class="inspect-body" id="inspect-body"></div>
    </aside>
  </div>
  <footer>本地沙箱 · Runtime 和策略按原型运行 · Router 与 Worker 的模型输出由可重复脚本提供</footer>
</main>
<script>${ARCHITECTURE_SCRIPT}</script>
</body>
</html>`
