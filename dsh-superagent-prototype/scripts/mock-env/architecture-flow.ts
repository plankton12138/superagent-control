/** Renders the workbench's fixed directed graph. HTML nodes stay keyboard accessible while SVG draws the edges. */
export const FLOW_SCRIPT = String.raw`
  const flowNodes = {
    source:     [0, 'center', 'GitHub / 飞书 / QQ'],
    intake:     [1, 'center', 'Intake', '去重、来源范围、线程关联'],
    filtered:   [2, 'left',   '去重 / 来源过滤'],
    eval:       [2, 'center', 'Eval', '按线程合批'],
    threads:    [2, 'right',  '分发给已有工单'],
    gate:       [3, 'center', 'Policy Gate'],
    gateIgnore: [4, 'left',   '记录 ignore'],
    router:     [4, 'center', 'Router 主 Session'],
    decision:   [5, 'center', 'Engine 复核决定'],
    assessment: [5, 'right',  '读取上下文', '判断规则'],
    ticket:     [6, 'center', 'Ticket', '授权与派工'],
    executor:   [7, 'center', 'DshExecutor', '调度 Worker Session'],
    workerUpdate: [8, 'center', 'Engine', '更新工单'],
    outbox:     [9, 'center', 'Outbox', '回到原渠道'],
  };
  const flowEdges = [
    ['source', 'intake'],
    ['intake', 'filtered', '重复或未监听'],
    ['intake', 'threads', '订阅匹配'],
    ['intake', 'eval', '没有工单负责该消息'],
    ['threads', 'eval', '交回且无其他工单负责'],
    ['eval', 'gate'],
    ['gate', 'gateIgnore', '拒绝'],
    ['gate', 'router', '明确或推断候选'],
    ['router', 'decision', '快捷路由'],
    ['router', 'assessment', '完整研判'],
    ['assessment', 'decision'],
    ['decision', 'ticket', '接单'],
    ['ticket', 'executor'],
    ['threads', 'executor', '跟进输入'],
    ['ticket', 'outbox', '接单确认'],
    ['executor', 'workerUpdate', '报告或绑定 PR'],
    ['workerUpdate', 'outbox', '满足回执条件'],
  ];
  const graphHeight = 768;
  const rankY = [10, 76, 154, 250, 329, 407, 484, 552, 634, 712];

  function drawFlow() {
    const marker = (id, color) => '<marker id="' + id + '" markerUnits="userSpaceOnUse" viewBox="0 0 8 8" refX="7" refY="4"'
      + ' markerWidth="8" markerHeight="8" orient="auto"><path d="M 0 0 L 8 4 L 0 8 L 2 4 Z" fill="' + color + '"/></marker>';
    const wires = flowEdges.map(([from, to]) => '<path class="flow-wire" data-wire="' + from + ',' + to + '"/>').join('');
    const labels = flowEdges.filter(([, , label]) => label).map(([from,to,label]) =>
      '<span class="flow-label" data-edge-label="' + from + ',' + to + '">' + esc(label) + '</span>').join('');
    const nodes = Object.entries(flowNodes).map(([key, [, , title, sub]]) => '<button class="node flow-node" type="button" data-node="'
      + key + '" aria-pressed="false" aria-controls="inspect-body"><strong>' + esc(title) + '</strong>'
      + (sub ? '<span>' + esc(sub) + '</span>' : '') + '<small></small></button>').join('');
    return '<div class="flow-stage" id="flow-stage" role="group" aria-label="SuperAgent 自上而下的分支流程图">'
      + '<svg class="flow-wires" id="flow-wires" aria-hidden="true" preserveAspectRatio="none"><defs>'
      + marker('flow-arrow', '#7c9395') + marker('flow-active-arrow', '#b6d9ac') + '</defs>' + wires + '</svg>'
      + labels + nodes + '</div>';
  }

  /** Route side branches around nodes instead of letting long bypass edges cut through the main path. */
  function layoutFlow() {
    const stage = $('flow-stage');
    const width = stage.clientWidth || 600;
    const centers = { left: width * .148, center: width * .485, right: width * .822 };
    const nodes = Object.fromEntries(Object.entries(flowNodes).map(([id, [rank, column]]) => {
      const w = Math.min(column === 'center' ? 276 : 178, width * (column === 'center' ? .365 : .235));
      const x = centers[column], top = rankY[rank], h = id === 'gate' ? 58 : 46;
      return [id, { x, top, w, h, left: x - w / 2, right: x + w / 2, bottom: top + h, mid: top + h / 2 }];
    }));
    stage.style.height = graphHeight + 'px';
    $('flow-wires').setAttribute('viewBox', '0 0 ' + width + ' ' + graphHeight);
    const place = (element, x, y) => { element.style.left = x + 'px'; element.style.top = y + 'px'; };
    stage.querySelectorAll('[data-node]').forEach(button => {
      const box = nodes[button.dataset.node];
      place(button, box.left, box.top);
      button.style.width = box.w + 'px';
      button.style.height = box.h + 'px';
    });
    for (const [from, to, label] of flowEdges) {
      const key = from + ',' + to;
      const a = nodes[from], b = nodes[to];
      let points, labelX = b.x, labelY = (a.bottom + b.top) / 2;
      if (key === 'threads,eval') {
        const approach = b.right + 8, bendY = a.bottom + 21;
        points = [[a.x - 9, a.bottom], [a.x - 9, bendY], [approach, bendY], [approach, b.mid], [b.right, b.mid]];
        labelX = (b.right + a.x) / 2;
        labelY = bendY + 13;
      } else if (key === 'threads,executor' || key === 'ticket,outbox') {
        const right = key === 'threads,executor';
        const rail = right ? width - 8 : 8;
        points = [[right ? a.right : a.left, a.mid], [rail, a.mid], [rail, b.mid], [right ? b.right : b.left, b.mid]];
        labelX = right ? centers.right : centers.left;
        labelY = right ? b.mid - 11 : a.mid - 11;
      } else if (key === 'assessment,decision') {
        points = [[a.left, a.mid], [b.right, b.mid]];
      } else if (a.x !== b.x) {
        const startX = a.x + (b.x > a.x ? 1 : -1) * a.w * .22;
        const startY = from === 'gate' ? a.bottom - a.h * .22 : a.bottom;
        const bendY = b.top - 13;
        points = [[startX, startY], [startX, bendY], [b.x, bendY], [b.x, b.top]];
        labelY = bendY - 10;
      } else {
        points = [[a.x, a.bottom], [b.x, b.top]];
      }
      stage.querySelector('[data-wire="' + key + '"]').setAttribute('d', points.map(([x,y], i) =>
        (i ? 'L' : 'M') + x + ' ' + y).join(' '));
      if (label) {
        const element = stage.querySelector('[data-edge-label="' + key + '"]');
        place(element, labelX, labelY);
        element.style.maxWidth = Math.min(165, width * (key === 'threads,eval' ? .38 : .31)) + 'px';
      }
    }
  }

  function gateRejection(fact, facts) {
    if (fact.node !== 'decision' || fact.state !== 'ignore') return false;
    const { triggerIds, reason } = fact.data;
    return Boolean(triggerIds?.length) && triggerIds.every(id => facts.some(check => check.node === 'gate'
      && check.state === 'rejected' && check.data.triggerId === id
      && reason?.some(item => item.code === check.detail && (!item.triggerId || item.triggerId === id))));
  }

  function factNode(fact, facts) {
    if (fact.node === 'intake' && ['duplicate','filtered'].includes(fact.state)) return 'filtered';
    if (gateRejection(fact, facts)) return 'gateIgnore';
    if (fact.node === 'threads' && ['工单订阅线程','取消订阅'].includes(fact.title)) return 'ticket';
    if (fact.node === 'worker' && fact.title === 'orchestrator_report') return 'workerUpdate';
    if (fact.node === 'github' || (fact.node === 'ticket' && fact.title === '工单结束')) return 'workerUpdate';
    if (['worker','sessions'].includes(fact.node)) return 'executor';
    return fact.node;
  }

  function flowState(facts) {
    const timed = facts.filter(fact => fact.at);
    const mapped = new Map();
    for (const fact of timed) mapped.set(factNode(fact, facts), fact);
    // A rejected batch still reached Eval's gate check even though no candidate was started.
    if (!mapped.has('eval') && mapped.has('gate')) mapped.set('eval', { state: '准入检查' });
    // Intake and its terminal outcome are two visible nodes.
    if (!mapped.has('intake') && mapped.has('filtered')) mapped.set('intake', { state: '已检查' });
    const has = key => mapped.has(key);
    const gateChecks = timed.filter(fact => fact.node === 'gate');
    const subscriptions = timed.filter(fact => fact.node === 'threads' && fact.title === '线程订阅投递');
    const subscribed = new Set(subscriptions.map(fact => fact.data.triggerId));
    const returned = new Set(timed.filter(fact => fact.title === 'orchestrator_trigger_handback' && fact.state !== 'error')
      .map(fact => fact.data.input?.trigger_id));
    const followsDelivered = timed.some(fact => fact.node === 'sessions' && subscribed.has(fact.data.payload?.trigger_id));
    const shortcut = timed.some(fact => fact.node === 'router'
      && ['调用 orchestrator_route','orchestrator_route'].includes(fact.title) && fact.state !== 'error');
    const decisions = timed.filter(fact => fact.node === 'decision' && !gateRejection(fact, facts));
    const output = timed.filter(fact => fact.node === 'outbox');
    const edges = {
      'source,intake': has('source') && has('intake'),
      'intake,filtered': has('filtered'),
      'intake,threads': subscriptions.length > 0,
      'intake,eval': gateChecks.some(fact => !subscriptions.some(input =>
        input.data.triggerId === fact.data.triggerId && input.state === 'forwarded')),
      'threads,eval': gateChecks.some(fact => returned.has(fact.data.triggerId)),
      'eval,gate': has('gate'),
      'gate,gateIgnore': has('gateIgnore'),
      'gate,router': has('router') && gateChecks.some(fact => fact.state !== 'rejected'),
      'router,decision': shortcut && decisions.some(fact => !fact.data.audit?.rule_assessments),
      'router,assessment': has('assessment'),
      'assessment,decision': decisions.some(fact => Array.isArray(fact.data.audit?.rule_assessments)),
      'decision,ticket': decisions.some(fact => fact.state === 'accept') && has('ticket'),
      'ticket,executor': has('ticket') && has('executor'),
      'threads,executor': followsDelivered,
      'ticket,outbox': has('ticket') && output.some(fact => fact.data.kind === 'acknowledgement'),
      'executor,workerUpdate': has('executor') && timed.some(fact => fact.node === 'github'
        || (fact.node === 'worker' && fact.title === 'orchestrator_report' && fact.state !== 'error')),
      'workerUpdate,outbox': has('workerUpdate') && output.some(fact => fact.data.kind !== 'acknowledgement'),
    };
    return { nodes: mapped, edges };
  }
`
