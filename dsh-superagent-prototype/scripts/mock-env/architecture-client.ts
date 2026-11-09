import { FLOW_SCRIPT } from './architecture-flow.ts'

export const ARCHITECTURE_SCRIPT = String.raw`
(() => {
  const modules = {
    source: ['Source', '来源适配器', '把 GitHub、飞书或 QQ 的外部事件规范化为 Trigger，记录来源身份、是否 @ 或私聊、线程和回执地址。', 'src/sources/registry.ts'],
    intake: ['Intake', '来源筛选', '先按 Trigger ID 去重，再判断来源是否监听。通过后保存 Trigger、关联 Thread，并寻找可能接收此消息的工单。', 'src/core/intake.ts'],
    filtered: ['去重 / 来源过滤', 'Intake 终点', '重复 Trigger 不再进入调度；未监听的来源记录过滤原因。两者都在 Policy Gate 前结束。', 'src/core/intake.ts'],
    threads: ['Thread', '订阅与直投', '自有线程上的人类跟进可直接交给已有工单。仅作上下文的订阅也收到输入，但不获得新授权。Worker 可以把超范围的消息交回 Eval。', 'src/core/model.ts · src/core/intake.ts'],
    eval: ['Eval', '线程批次', '同一 Thread 的待处理 Trigger 合批，Gate 选出最强的候选。候选投递到主 Session 后才开始计算评估时限。', 'src/core/evals.ts'],
    gate: ['Policy Gate', '确定性准入', '读取来源允许名单、准入表、是否指向智能体和接单模式，给出 explicit、inferred 或拒绝原因。准入并不创建工单。', 'src/policy.ts'],
    gateIgnore: ['记录 ignore', '准入拒绝', '如果一个待评估批次没有可准入的事件，Engine 直接记录 ignore 和拒绝原因。', 'src/core/evals.ts'],
    router: ['Router', '主 Session', '接收候选卡和关键工单通知。明确请求走 orchestrator_route，可接单、附加、停止或忽略。推断候选可从卡片忽略，接单需经过完整研判。', 'src/app/tools/main.ts'],
    assessment: ['Assessment', '语义研判', '主 Session 读取线程窗口和关联工单，再逐条提交已启用规则的判断与意图证据。observe 只记 would_accept，auto 才能接单。', 'src/app/assessment.ts · src/policy.ts'],
    decision: ['Engine', '决定与复核', '校验评估身份、策略版本与授权强度，事务内保存 Decision 和 Mandate。Gate 拒绝也会留下 ignore 决定。', 'src/core/engine.ts · src/core/evals.ts'],
    ticket: ['Ticket', '工单与授权', '工单承载原始触发、授权范围、输入和订阅。失败重试保留工单身份，增加一次 Assignment。', 'src/core/tickets.ts'],
    executor: ['DshExecutor', '派工和槽位', '检查并发槽、准备独立目录，启动或唤醒该工单的 Worker。派工从排队开始，失败、交还人工与清理分别有自己的状态。', 'src/executor/dsh.ts'],
    sessions: ['Sessions', '会话与收件箱', '按工单建立 worker-<ticketId>，安装角色提示词和工具。queue 启动新回合，steer 把跟进送入步骤，inject 注入上下文。', 'src/app/sessions.ts · src/app/delivery.ts'],
    worker: ['Worker', '工单执行', '读取派工说明和后续输入，通过工作工具执行并报告 progress、ready、blocked、failed 等结果。这里的调用由本地脚本驱动，详情展示实际参数和返回值。', 'src/app/tools/executor.ts'],
    workerUpdate: ['Engine 更新工单', '报告与 PR 状态', '接收 Worker 报告、校验 PR 关联并推进工单阶段。已绑定的 PR 合并或关闭后，符合条件的工单可以结束并回执。', 'src/core/assignments.ts · src/sources/github-pull.ts'],
    github: ['GitHub PR', '交付与跟进', '将工单与其来源 PR 或工作分支的 PR 绑定。PR 的评论、评审、检查和合并属于来源事件。绑定 PR 的 ready 通常仍待评审。', 'src/sources/github-pull.ts · src/sources/github.ts'],
    outbox: ['Outbox', '回执支路', '接单确认可早于执行结束。回执先落库，再由 Effects 发送到原渠道，按回执 ID 幂等。合并通知在工单收尾后走同一支路。', 'src/app/outbox.ts · src/core/replies.ts'],
    runtime: ['Runtime', '装配与生命周期', '装配 Store、Engine、Sources、Assessor、Executor、Sessions、Effects 和 Outbox，负责启动、轮次、暂停、恢复与关闭。', 'src/app/runtime.ts · src/app/passes.ts'],
    setup: ['Setup', '部署与账号', '解析仓库和渠道账号，准备 Worker 命令环境，并通过服务健康信息报告配置状态。', 'src/app/setup.ts'],
    store: ['SQLite Store', '领域状态', '持久化 Trigger、Thread、Decision、Ticket、Assignment、Effect 和回执。事件观测在提交后发布。', 'src/app/store.ts'],
    effects: ['Effects', '持久化队列', '按键去重和调度候选投递、派工、输入投递、通知与回执。暂不可运行或失败时保留队列并重试。', 'src/app/effects.ts'],
    settings: ['Settings', '版本化策略', '保存来源配置、允许名单、准入表、接单模式与并发设置。策略版本变化会让旧评估重新排队。', 'src/app/settings.ts · src/policy.ts'],
    prompts: ['Prompts', '角色提示词', '组合主 Session、Worker 和团队约定的提示词、技能与版本。研判规则与角色说明都能按版本追踪。', 'src/app/prompts.ts'],
    panel: ['Panel / HTTP', '人工控制', '查询触发、评估和执行，允许人暂停、停止、重试或重新评估。管理请求作用于同一 Runtime。', 'src/app/http.ts · src/client/app.tsx'],
  };
  const infrastructure = ['sessions','worker','github','runtime','setup','store','effects','settings','prompts','panel'];
${FLOW_SCRIPT}
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]);
  const text = (id, value) => { $(id).textContent = value; };
  const mono = value => '<code>' + esc(value) + '</code>';
  const empty = value => '<p class="empty">' + esc(value) + '</p>';
  const hhmm = at => new Date(at).toLocaleTimeString('zh-CN', { hour12: false });
  $('map-link').setAttribute('aria-current','page');

  let scenarios = {};
  let state;
  let focusRun = new URL(location.href).searchParams.get('run');
  let selected = 'router';
  let cursor = null;
  let timer = null;
  let busy = false;
  let refreshId = 0;

  function update(id, html) {
    const target = $(id);
    if (target.rendered === html) return;
    const open = new Set([...target.querySelectorAll('details[data-detail][open]')].map(el => el.dataset.detail));
    target.innerHTML = html;
    target.rendered = html;
    target.querySelectorAll('details[data-detail]').forEach(el => { if (open.has(el.dataset.detail)) el.open = true; });
  }
  async function request(path, body, management) {
    const headers = management ? { 'x-orchestrator-request':'1' } : {};
    const options = { headers };
    if (body !== undefined) {
      options.method = 'POST';
      options.body = JSON.stringify(body);
      headers['content-type'] = 'application/json';
    }
    const response = await fetch(path, options);
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || 'HTTP ' + response.status);
    return result;
  }
  const trace = () => state?.trace;
  const timeline = () => trace()?.facts.filter(item => item.at) ?? [];
  const visibleFacts = () => cursor === null ? trace()?.facts ?? [] : timeline().slice(0, cursor + 1);
  const relative = at => '+' + Math.max(0, (Date.parse(at) - Date.parse(trace().at)) / 1000).toFixed(2) + 's';

  function drawTopology() {
    const node = key => '<button class="node" type="button" data-node="' + key + '" aria-pressed="false" aria-controls="inspect-body"><strong>'
      + esc(modules[key][0]) + '</strong><small></small></button>';
    update('topology', drawFlow() + '<details class="flow-support"><summary>共享组件与 Worker 内部</summary><div class="systems">'
      + infrastructure.map(node).join('') + '</div></details>');
    layoutFlow();
    if (window.ResizeObserver) new ResizeObserver(layoutFlow).observe($('topology'));
    else window.addEventListener('resize', layoutFlow);
  }
  function renderMap() {
    const facts = visibleFacts();
    const { nodes, edges } = flowState(facts);
    const pathLabels = [
      [edges['intake,filtered'], '去重 / 来源过滤'], [edges['threads,executor'], '线程直投'],
      [edges['threads,eval'], '交回评估'], [edges['gate,gateIgnore'], 'Gate 拒绝'],
      [edges['router,decision'], '快捷路由'], [edges['router,assessment'], '完整研判'],
    ].filter(([active]) => active).map(([, label]) => '<b>' + label + '</b>');
    update('route-key', '<span>本轮经过</span>' + (pathLabels.join('') || '<span>等待分流</span>'));
    $('topology').querySelectorAll('[data-node]').forEach(button => {
      const key = button.dataset.node;
      const last = button.classList.contains('flow-node') ? nodes.get(key) : facts.findLast(fact => fact.node === key && fact.at);
      button.setAttribute('aria-pressed', String(selected === key));
      button.dataset.hit = String(Boolean(last));
      button.dataset.warn = String(['rejected','error','failed','blocked','dropped'].includes(last?.state));
      button.querySelector('small').textContent = last ? (last.state ?? '已发生') :
        infrastructure.includes(key) ? modules[key][1] : '未触发';
    });
    $('flow-stage').querySelectorAll('[data-wire], [data-edge-label]').forEach(el => {
      el.dataset.used = String(Boolean(edges[el.dataset.wire ?? el.dataset.edgeLabel]));
    });
  }
  function badge(value) {
    const style = ['error','failed','blocked','rejected','dropped'].includes(value) ? ' bad'
      : ['pending','queued','waiting','ignore'].includes(value) ? ' wait' : '';
    return '<span class="badge' + style + '">' + esc(value) + '</span>';
  }
  function ruleRows(fact) {
    const data = fact.data;
    const rules = data.audit?.rule_assessments ?? (fact.state === 'submitted' ? data.input?.rule_assessments : undefined);
    const direction = data.audit?.direction ?? data.input?.direction;
    if (!Array.isArray(rules)) return '';
    return (direction ? '<p class="meta">实现目标 · ' + esc(direction.target_basis) + ' · ' + esc(direction.evidence) + '</p>' : '')
      + rules.map(rule => '<div class="rule">' + badge(rule.matched ? '命中' : '未命中') + ' '
        + mono(rule.rule_id) + ' · ' + esc(rule.reason) + '</div>').join('');
  }
  function factHtml(fact, index) {
    const record = JSON.stringify(fact.data, null, 2);
    const session = fact.data.sessionId ?? fact.data.delivery?.sessionId;
    const reason = fact.data.error;
    const call = fact.data.input;
    const output = fact.data.output;
    const duration = fact.data.startedAt && fact.at ? Date.parse(fact.at) - Date.parse(fact.data.startedAt) : undefined;
    const context = fact.title === 'orchestrator_eval' && output
      ? '<p class="meta">线程上下文 · ' + esc(output.thread?.error ?? ((output.thread?.loaded_messages ?? 0) + ' 条'))
        + ' · ' + esc(output.policy_version) + '</p>' : '';
    const routing = Array.isArray(output?.results) ? output.results.map(item => '<p class="meta">' + badge(item.decision ?? item.kind)
      + ' ' + esc(item.refused ?? item.reason) + (item.ticket?.ticket_id ? ' · 工单 ' + mono(item.ticket.ticket_id) : '') + '</p>').join('') : '';
    const file = fact.data.kind === 'repository-read' && typeof fact.data.path === 'string' ? '<p><a href="/github/blob/main/'
      + fact.data.path.split('/').map(encodeURIComponent).join('/') + '">打开虚拟仓库文件</a></p>' : '';
    const raw = record === undefined ? '' : '<details class="raw" data-detail="' + esc(selected + ':' + (fact.at ?? 'snapshot') + ':' + index)
      + '"><summary>输入、输出与记录 JSON</summary><pre>' + esc(record) + '</pre></details>';
    return '<article class="fact"><h3>' + esc(fact.title) + (fact.state ? ' ' + badge(fact.state) : '') + '</h3>'
      + (fact.at ? '<time class="subtle">' + esc(relative(fact.at)) + (duration === undefined ? '' : ' · ' + duration + ' ms') + '</time>' : '')
      + (fact.detail ? '<p class="meta">' + esc(fact.detail) + '</p>' : '')
      + (session && session !== fact.detail ? '<p class="meta">Session ' + mono(session) + '</p>' : '')
      + (call?.resource ? '<p class="meta">读取 ' + mono(call.resource) + '</p>' : '')
      + (call?.summary ? '<p>' + esc(call.summary) + '</p>' : '')
      + (fact.data.execution?.directory ? '<p class="meta">工作目录 ' + mono(fact.data.execution.directory) + '</p>' : '')
      + (reason ? '<p class="alert">' + esc(reason) + '</p>' : '')
      + file + context + routing + ruleRows(fact) + raw + '</article>';
  }
  function renderInspector() {
    const [label,sub,desc,source] = modules[selected];
    const all = visibleFacts();
    const facts = all.filter(fact => {
      if (selected === 'router') return ['router','assessment','decision'].includes(fact.node) && !gateRejection(fact, all);
      if (selected === 'executor') return ['executor','sessions','worker'].includes(fact.node);
      if (selected === 'worker') return ['sessions','worker'].includes(fact.node);
      if (selected === 'gateIgnore') return gateRejection(fact, all) || (fact.node === 'gate' && fact.state === 'rejected');
      if (selected === 'eval') return fact.node === 'eval' || (fact.node === 'gate' && !all.some(item => item.node === 'eval'));
      if (selected === 'decision') return fact.node === 'decision' && !gateRejection(fact, all);
      return fact.node === selected || factNode(fact, all) === selected;
    });
    if (cursor === null && state?.system[selected]) facts.push({ node:selected, title:'当前运行设置或服务状态', data:state.system[selected] });
    if (['worker','executor'].includes(selected) && cursor === null) {
      for (const ticket of trace()?.tickets ?? []) {
        facts.unshift({ node:'worker', title:'工单与 Worker', state:ticket.ended?.outcome ?? ticket.stage.action ?? ticket.stage.stage,
          detail:ticket.title + ' · worker-' + ticket.id, data:{ sessionId:'worker-' + ticket.id, assignment:ticket.assignment, attempts:ticket.attempts } });
      }
    }
    const subtitle = '<p class="meta">' + esc(sub) + '</p><p>' + esc(desc) + '</p><p class="subtle">源码 · ' + mono(source) + '</p>';
    update('inspect-body', '<h2>' + esc(label) + '</h2>' + subtitle + '<h3 class="group-title">本轮证据</h3>'
      + (facts.length ? facts.map(factHtml).join('') : empty('本轮未经过该组件。')));
  }
  function renderTimeline() {
    const steps = timeline();
    text('cursor-label', cursor === null ? 'LIVE · ' + steps.length : 'REPLAY · ' + (cursor + 1) + '/' + steps.length);
    update('timeline', steps.map((fact,index) => '<button type="button" data-step="' + index + '"'
      + (cursor === index ? ' aria-current="step"' : '') + '><time>' + esc(relative(fact.at)) + '</time>'
      + '<span class="mono">' + esc(modules[fact.node][0]) + '</span><span>' + esc(fact.title)
      + (fact.state ? ' ' + badge(fact.state) : '') + '</span></button>').join('') || empty('运行场景或在虚拟飞书发消息后，事件会出现在这里。'));
  }
  function renderTickets() {
    const entries = trace()?.tickets ?? [];
    const button = (ticket,action,label) => '<button type="button" class="button" data-task="' + action + '" data-id="' + esc(ticket.id) + '">' + label + '</button>';
    update('tickets', entries.map(ticket => {
      const actions = [];
      if (ticket.retry) actions.push(button(ticket,'retry','重试并完成'));
      if (ticket.virtualPull && ticket.open) actions.push(button(ticket,'merge','合并虚拟 PR'),button(ticket,'close','关闭 PR'));
      if (ticket.open) actions.push(button(ticket,'stop','停止工单'));
      return '<div class="ticket"><strong>' + esc(ticket.title) + '</strong> '
        + badge(ticket.ended?.outcome ?? ticket.stage.action ?? ticket.stage.stage) + '<p class="meta">'
        + mono('worker-' + ticket.id) + ' · 派工 ' + ticket.attempts + (ticket.pull ? ' · <a href="/github?number='
          + encodeURIComponent(ticket.pull) + '">虚拟 PR #' + esc(ticket.pull) + '</a>' : '') + '</p>'
        + (ticket.attention ? '<p>' + esc(ticket.attention.question) + '</p>' : '')
        + (actions.length ? '<div class="controls">' + actions.join('') + '</div>' : '') + '</div>';
    }).join('') || empty('暂无工单'));
  }
  function syncControls() {
    const runtime = state?.runtime;
    $('run').disabled = busy || !runtime?.autoRoute || runtime.paused || !$('scenario').value;
    $('pause').disabled = busy || !runtime;
    $('play').disabled = !timeline().length;
    $('live').disabled = cursor === null;
    text('play', timer === null ? '播放轨迹' : '暂停播放');
  }
  function drawTrace() {
    renderMap();
    renderInspector();
    renderTimeline();
    syncControls();
  }
  function draw() {
    const info = state.runtime;
    text('health', (info.paused ? '暂停' : '在线') + ' · ' + info.repository + ' · 槽位 ' + info.active + '/' + info.limit);
    text('pause', info.paused ? '恢复处理' : '暂停处理');
    update('history', state.runs.length ? state.runs.map(run => '<option value="' + esc(run.id) + '">' + esc(hhmm(run.at) + ' · ' + run.title) + '</option>').join('')
      : '<option>暂无运行记录</option>');
    $('history').disabled = !state.runs.length;
    if (focusRun) $('history').value = focusRun;
    text('run-title', trace() ? trace().title + ' · ' + trace().id.slice(0, 8) : '等待事件');
    if (trace()?.error) text('alert', trace().error);
    renderTickets();
    drawTrace();
  }
  async function refresh() {
    const id = ++refreshId;
    try {
      const data = await request('/mock/inspection' + (focusRun ? '?run=' + encodeURIComponent(focusRun) : ''));
      if (id !== refreshId) return;
      const next = data.trace?.id;
      if (next !== focusRun) { stopPlayback(); cursor = null; }
      focusRun = next;
      state = data;
      draw();
    } catch (error) {
      if (id !== refreshId) return;
      text('health','Runtime 连接失败');
      text('alert',error.message);
    }
  }
  function stopPlayback() {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }
  function showStep(index) {
    const fact = timeline()[index];
    if (!fact) return;
    cursor = index;
    selected = factNode(fact, visibleFacts());
    drawTrace();
  }
  function focus(id) {
    stopPlayback();
    cursor = null;
    focusRun = id;
    const address = new URL(location.href);
    if (id) address.searchParams.set('run', id);
    history.replaceState(null, '', address);
    void refresh();
  }
  async function act(action) {
    if (busy) return;
    busy = true;
    stopPlayback();
    cursor = null;
    text('alert','');
    syncControls();
    try {
      const result = await action();
      if (result?.runId) focusRun = result.runId;
    } catch (error) { text('alert',error.message); }
    finally {
      await refresh();
      busy = false;
      syncControls();
    }
  }
  $('topology').addEventListener('click', event => {
    const node = event.target.closest('[data-node]');
    if (!node) return;
    selected = node.dataset.node;
    stopPlayback();
    drawTrace();
    if (matchMedia('(max-width:900px)').matches) $('inspector').scrollIntoView({ block:'start' });
  });
  $('timeline').addEventListener('click', event => {
    const step = event.target.closest('[data-step]');
    if (!step) return;
    stopPlayback();
    showStep(Number(step.dataset.step));
    if (matchMedia('(max-width:900px)').matches) $('inspector').scrollIntoView({ block:'start' });
  });
  $('play').addEventListener('click', () => {
    if (timer !== null) { stopPlayback(); syncControls(); return; }
    if (timeline().length > 1) timer = setInterval(() => {
      const next = cursor + 1;
      if (next >= timeline().length - 1) stopPlayback();
      showStep(next);
    }, 480);
    showStep(0);
  });
  $('live').addEventListener('click', () => { stopPlayback(); cursor = null; drawTrace(); });
  $('history').addEventListener('change', () => focus($('history').value));
  $('scenario').addEventListener('change', () => text('expected', scenarios[$('scenario').value]?.expected ?? ''));
  $('run').addEventListener('click', () => act(() => request('/mock/scenario', { id:$('scenario').value })));
  $('pause').addEventListener('click', () => act(() => request('/orchestrator/api/executor/pause', { paused:!state.runtime.paused }, true)));
  $('tickets').addEventListener('click', event => {
    const button = event.target.closest('[data-task]');
    if (!button) return;
    const { task, id } = button.dataset;
    void act(() => task === 'retry' ? request('/mock/retry', { ticket_id:id })
      : task === 'stop' ? request('/orchestrator/api/tickets/' + encodeURIComponent(id) + '/stop',{},true)
        : request('/mock/pull',{ ticket_id:id, action:task }));
  });
  async function start() {
    drawTopology();
    drawTrace();
    try {
      scenarios = await request('/mock/scenarios');
      update('scenario', Object.entries(scenarios).map(([key,item]) => '<option value="' + esc(key) + '">' + esc(item.title) + '</option>').join(''));
      $('scenario').value = 'inferred';
      text('expected', scenarios.inferred.expected);
    } catch (error) { text('alert',error.message); }
    await refresh();
    setInterval(() => { if (!busy && cursor === null) void refresh(); }, 800);
  }
  void start();
})();
`
