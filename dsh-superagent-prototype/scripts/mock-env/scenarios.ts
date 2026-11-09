import type { AssessmentFixture, WorkerBehavior } from './autopilot.ts'

export interface ScenarioInput {
  type: 'issue' | 'comment' | 'feishu'
  author: string
  title?: string
  body: string
  behavior: WorkerBehavior
  direct?: boolean
  chatId?: string
  mentions?: boolean
  assessment?: AssessmentFixture
}

interface Scenario {
  title: string
  source: string
  description: string
  expected: string
  events: ScenarioInput[]
  replay?: boolean
  followup?: boolean
  context?: { author: string; body: string }[]
}

const issue = (title: string, body: string, behavior: WorkerBehavior = 'ready'): ScenarioInput =>
  ({ type: 'issue', author: 'alice', title, body, behavior })

export const scenarios = {
  answer: {
    title: '飞书私聊 · 提问到回答', source: '飞书 × GitHub',
    description: 'Alice 在私聊问没有账单时导出会发生什么。',
    expected: 'Worker 读取虚拟仓库的导出代码，提交答案；主 Session 通过 Outbox 把答案发回 Alice 的私聊。',
    events: [{ type: 'feishu', author: 'ou_alice', body: '没有账单时，导出会生成 CSV 吗？', behavior: 'answer', direct: true }],
  },
  feishu: {
    title: '飞书请求与 PR 交付', source: '飞书 × GitHub',
    description: '群成员 @ 机器人，请它补齐账单导出空态。Worker 会提交虚拟 PR，等待合并。',
    expected: '工单关联 PR。点击「合并 PR」后，工单结束，飞书原消息收到合并通知。',
    events: [{ type: 'feishu', author: 'ou_alice', body: '请补齐账单导出的空数据提示，并提交 PR。', behavior: 'pull' }],
  },
  issue: {
    title: 'GitHub Issue 接单', source: 'GitHub',
    description: 'alice 发一个 @ 机器人的 Issue，Worker 返回完成报告。',
    expected: '生成一张工单、一条接单回执，Worker 报告 ready 后结束。',
    events: [issue('修复登录页标题', '请将登录页标题改为 Sign in。')],
  },
  inferred: {
    title: '慢路径 · 规则接单', source: 'GitHub',
    description: 'alice 发出一条没有 @ 的请求，给出按钮的原文和替换目标。',
    expected: 'Gate 标为 inferred，Router 读取上下文并提交逐条规则判断。命中 copy 后创建工单。',
    events: [{ ...issue('更正登录按钮文字', '请将登录按钮的“Signni”更正为“Sign in”。'), mentions: false, assessment: 'copy-fix' }],
    context: [{ author: 'bob', body: '设计稿上的按钮文案是 Sign in，当前页面显示 Signni。' }],
  },
  inferredIgnore: {
    title: '慢路径 · 目标不明确', source: 'GitHub',
    description: 'alice 发出一条没有 @ 的改版请求，缺少具体目标。',
    expected: '进入完整研判，记录规则和目标检查，Router 忽略，Worker 不启动。',
    events: [{ ...issue('重新设计设置页', '请重新设计设置页，具体怎么改请自行决定。'), mentions: false, assessment: 'unclear' }],
  },
  followup: {
    title: '评论跟进已有工单', source: 'GitHub',
    description: '先创建 Issue，再在同一个 Issue 补充验收要求。',
    expected: '跟进消息投递给原工单，轨迹显示原始事件和追加要求。',
    events: [issue('修复列表布局', '请修复窄屏列表布局。'),
      { type: 'comment', author: 'bob', body: '补充要求：窄屏下操作按钮需要换行。', behavior: 'ready', mentions: false }],
    followup: true,
  },
  direct: {
    title: '飞书私聊', source: '飞书',
    description: 'bob 从私聊发出请求。',
    expected: '即使没有 @，私聊仍作为显式请求接单，回执发往原消息。',
    events: [{ type: 'feishu', author: 'ou_bob', body: '请更新导出文件名。', behavior: 'ready', direct: true, mentions: false }],
  },
  denied: {
    title: '未授权请求', source: 'GitHub',
    description: '不在允许名单中的 mallory 发出 @ 请求。',
    expected: '决策为 ignore，原因是 not_a_member，工单数为零。',
    events: [{ ...issue('修改分支保护', '请关闭测试分支的保护。'), author: 'mallory' }],
  },
  filtered: {
    title: '来源筛选 · 未监听群', source: '飞书',
    description: '已授权群友在一个未配置监听的群发消息。',
    expected: '在 Intake 就被过滤，Policy Gate 和 Router 都不触发。',
    events: [{ type: 'feishu', author: 'ou_alice', chatId: 'oc_unconfigured', body: '这条消息来自未监听的群。', mentions: false, behavior: 'ready' }],
  },
  duplicate: {
    title: '重复事件', source: 'GitHub',
    description: '为本轮生成一个新 Issue，并立即重放同一事件。',
    expected: '轨迹记录 duplicate，两次输入共用一个 Trigger，只创建一张工单。',
    events: [issue('验证幂等', '请修复帮助链接。')],
    replay: true,
  },
  blocked: {
    title: '阻塞与人工处理', source: 'GitHub',
    description: 'Worker 遇到需要人工决定的事项并回报 blocked。',
    expected: '工单显示待确认问题，可用「重试并完成」创建新派工。',
    events: [issue('调整默认主题', '请调整主题，但我还没确定色板。', 'blocked')],
  },
  failed: {
    title: '失败后重试', source: 'GitHub',
    description: 'Worker 报告 failed，留在同一张工单上等待操作。',
    expected: '点击「重试并完成」后出现第二次派工，第一次失败仍可核对。',
    events: [issue('修复启动故障', '请检查启动时的错误。', 'failed')],
  },
  queue: {
    title: '并发与排队', source: 'GitHub',
    description: '前两个 Worker 持续占用槽位，第三个等待执行。',
    expected: '停止其中一个长任务后，第三个 Worker 获得槽位并完成。可用全局暂停和恢复观察队列。',
    events: [issue('长任务 A', '保持执行槽位。', 'silent'), issue('长任务 B', '保持执行槽位。', 'silent'),
      issue('排队任务 C', '等到空闲槽位后完成。')],
  },
} satisfies Record<string, Scenario>

export function scenario(id: string): Scenario | undefined {
  return Object.hasOwn(scenarios, id) ? scenarios[id as keyof typeof scenarios] : undefined
}
