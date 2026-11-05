# QQ 与飞书机器人入口开发计划

> 项目：superagent-control（SuperAgent 控制面增强）
> 版本：v0.1
> 日期：2026-11-05
> 状态：计划待执行
> 关联文档：[项目设计预想](../项目设计预想.md)、[详细实施计划书](../SuperAgent详细实施计划书.md)、[上游架构说明](../SuperAgent原项目架构说明.md)
> 上游代码：`dsh-superagent-prototype/`

## 1. 目标与边界

### 1.1 目标

为 superagent-control 增加两个聊天入口，让维护者可以通过 QQ 或飞书向 Agent 发起工作请求：

- QQ 官方机器人：接收群内 @ 消息和单聊消息。
- 飞书自建应用机器人：接收群内 @ 消息和私聊消息；复用上游已有实现。

两个入口只负责“把外部消息转换成 Trigger”，后续仍然走既有链路：

```text
QQ / 飞书消息
  → SourceKind
  → Trigger
  → L1 确定性过滤（Source scope、Policy、去重）
  → L2 Router 研判
  → L3 Ticket 创建 / 归并 / 投递 / 忽略
  → Worker 执行
  → Source Channel 回复
```

### 1.2 不在本期范围

- 不做通用聊天助手；普通讨论仍按 Policy 被忽略。
- 不接入 OneBot、NapCat、LLOneBot 等非官方 QQ 协议。
- 不实现 QQ Webhook 回调模式；本地部署使用 WebSocket 长连接。
- 不做 QQ 频道（Guild）机器人，只做群聊与单聊。
- 不重写 Router、Engine、Executor、Effect/Outbox。
- 不把新入口算入“准入评测、执行看门狗、任务指标”三项控制面成果。

### 1.3 设计原则

- **只扩展 Source 层**：不修改领域模型和状态机。
- **凭证不进数据库**：面板只保存 AppID 等非敏感配置，AppSecret 通过环境变量或受限权限的密钥文件注入。
- **默认关闭**：QQ 与飞书插件均保持 `disabled: true`，避免改变现有部署默认行为。
- **能力边界写进文档**：QQ 的 5 分钟回复窗口、无历史上下文、群内 openid 等限制必须明确记录，不能包装成与飞书等价。

## 2. 现状结论

| 能力 | 上游位置 | 结论 |
|---|---|---|
| Source 扩展点 | `src/sources/kind.ts` 的 `SourceKind` | 新入口只需新增 SourceKind，不改核心 |
| 飞书 Source | `src/sources/feishu.ts` | 已实现接收、补历史、线程上下文、回复、策略白名单 |
| 飞书事件消费 | `src/sources/feishu-loops.ts` | 通过 `lark-cli event consume` 维持长连接 |
| 部署校验 | `src/deployment.ts` | 飞书只保存 `lark-cli` 路径并校验 strict-mode bot |
| 插件注册 | `cordis.patch.yml`、`tsdown.config.ts`、`package.json` | 飞书为 `dsh-superagent-feishu`，默认禁用 |
| QQ Source | 无 | 需要新增 |

结论：

1. **飞书入口不需要写业务代码**，只需要平台配置与宿主配置。
2. **QQ 需要新增一个 SourceKind 及其协议客户端**。

## 3. 飞书接入计划

### 3.1 平台侧配置

1. 在飞书开放平台创建自建应用并启用机器人能力。
2. 申请权限：
   - 接收消息事件。
   - 以机器人身份发送消息。
   - 读取群信息。
   - 读取群成员（仅使用策略同步时需要）。
3. 订阅事件 `im.message.receive_v1`，接收方式使用长连接。
4. 发布应用版本，并把机器人加入目标群。

注意：飞书自定义群机器人 Webhook 只能发送消息，不能接收用户消息；入口必须使用自建应用机器人与事件订阅。

### 3.2 宿主侧配置

1. 安装 `lark-cli`（上游验证版本 1.0.90）。
2. 为机器人建立独立配置目录，认证为机器人身份，`strict-mode` 必须为 `bot`。
3. 创建只调用该配置的包装脚本，避免 Worker 以用户身份操作。
4. 在 profile 中放开 `dsh-superagent-feishu`。
5. 面板「来源 → 飞书」填写机器人 CLI、接收的群、接收模式、是否接收私聊。
6. 面板「策略 → 每个来源」添加允许发起工作的飞书用户。

### 3.3 代码改动

无。

### 3.4 验收标准

- 机器人启动后健康项 `feishu` 为 `ready`。
- 群内 @ 机器人能产生 Trigger，并在面板可见。
- 允许列表用户能创建 Ticket；非允许列表用户被 L1 过滤。
- Worker 完成后的回复能回到原消息线程。
- 私聊消息在开关打开时能进入同一条链路。

### 3.5 风险

- Windows 下 `lark-cli` 的可用性与长期运行稳定性需要先验证。
- 上游依赖 `lark-cli` 的长连接事件输出格式；版本升级可能破坏兼容性，需要锁定版本。
- 如果 `lark-cli` 不可用，才考虑用飞书官方 Node SDK 重写 Source；该方案会重复上游已有实现，不作为首版选择。

## 4. QQ 接入计划

### 4.1 选型

| 方案 | 接收消息 | 合规性 | 结论 |
|---|---|---|---|
| 官方机器人 API v2 + WebSocket | 群 @、群全量（需群主开启）、单聊 | 官方协议 | 采用 |
| 官方 Webhook 回调 | 支持 | 需要 HTTPS 公网地址，端口仅 80/443/8080/8443 | 本地演示不采用 |
| OneBot / NapCat / LLOneBot | 支持，可读全量消息 | 非官方，有封号风险 | 不采用 |

### 4.2 前置条件

- 在 QQ 开放平台完成主体认证：个人认证需要身份证与人脸识别；企业认证需要营业执照等材料。
- 创建机器人，获得 AppID 与 AppSecret。
- 正式群使用前需要通过机器人上线审核；未上线只能使用沙箱环境，沙箱只接收测试群事件。
- 机器人需要被加入目标 QQ 群。

### 4.3 协议流程

1. **获取凭证**
   - `POST https://api.bot.qq.com/app/getAppAccessToken`
   - 请求体：`{ appId, clientSecret }`
   - 返回 `access_token`，默认有效期 7200 秒。
   - 在到期前 60 秒刷新；刷新失败时 Source 进入 `paused` 并上报健康状态。
2. **获取网关**
   - 调用 `/gateway/bot` 获取 WebSocket 地址。
   - 正式环境 OpenAPI 基地址为 `https://api.bot.qq.com`；沙箱地址以管理端显示为准。
3. **建立连接**
   - 收到 `op 10 Hello`，读取 `heartbeat_interval`。
   - 发送 `op 2 Identify`：
     - `token`: `QQBot {AccessToken}`
     - `intents`: `1 << 25`，覆盖 `GROUP_AT_MESSAGE_CREATE`、`GROUP_MESSAGE_CREATE`、`C2C_MESSAGE_CREATE`
     - `shard`: `[0, 1]`
4. **心跳与恢复**
   - 按周期发送 `op 1` 心跳，携带最新 `s`。
   - 收到 `op 7 Reconnect` 后重连；`op 9` 无效会话时重新 Identify。
   - 进程内断线优先使用 `op 6 Resume`，携带 `session_id` 与最新 `seq`。
   - 进程重启后没有有效会话，直接重新 Identify。
5. **发送消息**
   - 群聊：`POST /v2/groups/{group_openid}/messages`
   - 单聊：`POST /v2/users/{user_openid}/messages`
   - 请求头：`Authorization: QQBot {ACCESS_TOKEN}`
   - 被动回复必须携带 `msg_id` 和 `msg_seq`。

### 4.4 配置模型

建议的 QQ Source 配置：

| 配置项 | 类型 | 说明 |
|---|---|---|
| `appId` | 文本 | 机器人 AppID，可显示在面板 |
| `secretEnv` | 文本 | 读取 AppSecret 的环境变量名，默认 `QQ_BOT_CLIENT_SECRET` |
| `sandbox` | 开关 | 是否使用沙箱环境 |
| `groups` | 列表 | `groupOpenid`、显示名、接收模式 `mentions` / `all` |
| `otherGroups` | 选择 | 未列出的群是否接收 @ 消息 |
| `directMessages` | 开关 | 是否接收单聊 |

约束：

- AppSecret 不写入 SQLite、不写入面板、不写入日志。
- 环境变量缺失时，启动校验失败，面板显示明确原因。
- 群全量消息依赖群主在 QQ 群设置中开启，未开启时只接收 @ 消息。

### 4.5 Trigger 映射

| QQ 事件 | Trigger 关键字段 |
|---|---|
| `GROUP_AT_MESSAGE_CREATE` | `source: 'qq'`；`threads: ['qq:group:<group_openid>']`；`actor: 'qq:<member_openid>'`；`addressed: 'mention'`；`human: true` |
| `GROUP_MESSAGE_CREATE` | 同上，不带 `addressed` |
| `C2C_MESSAGE_CREATE` | `threads: ['qq:c2c:<user_openid>']`；`addressed: 'direct'`；`human: true` |
| 任意消息 | `id = 'qq:<message_id>'`；`channel.address = { groupOpenid 或 userOpenid, messageId }` |
| 文本 | 去掉 QQ 内容前的空格；保留原始文本，不拼接 @ 名称 |
| 机器人自己 | `author.bot === true` 时不产生 Trigger |

说明：

- 一个群对应一个 Thread；一个私聊用户对应一个 Thread。
- QQ 事件没有可靠的父消息字段，首版不实现 `repliesTo`。
- 上游 Engine 按 Trigger id 去重，QQ 重复推送会返回 `duplicate`，不会重复建单。

### 4.6 策略与身份

- `member_openid` 是群内身份，同一个人在不同群中不同。
- 策略白名单使用组合 id：`<group_openid>:<member_openid>`。
- 单聊白名单使用 `c2c:<user_openid>`。
- 明确请求的定义：群内 @ 机器人，或私聊机器人。
- 群全量消息只作为“推断候选”，仍需经过 L1/L2，不能直接成为明确请求。

### 4.7 回复窗口与交付策略

QQ 官方限制：

- 群聊被动回复：5 分钟内，每条用户消息最多 5 次。
- 单聊被动回复：60 分钟内，每条用户消息最多 4 次。
- 超出窗口或超频会发送失败。
- 主动消息需要群主开启「机器人主动在群聊内发言」，并受账号与单群频控限制。

应对方案：

1. 收到 Trigger 后立即回复一条“已受理”，占用 `msg_seq = 1`。
2. 执行过程中的进度更新尽量在窗口内使用 `msg_seq = 2、3`。
3. 最终结果超出窗口时：
   - 有主动消息权限时，尝试主动消息。
   - 没有权限时，返回 `'gone'`，结果保留在面板，不伪造成功。
4. `outbound message.id → msg_seq` 映射持久化到 KV，Effect 队列重试时复用同一个序号。
5. 平台返回“相同 `msg_id + msg_seq` 重复发送”时，视为已发送，不重复投放。
6. 收到 `22009 msg limit exceeded` 时按退避策略重试，不无限重试。

### 4.8 上下文限制

- QQ 官方没有群历史消息读取 API。
- 首版 `threadContext` 留空，Router 研判只能看到当前消息。
- 可选增强：本地 KV 缓存每个群最近 N 条消息，再实现受限的 `threadContext` 读取；该缓存必须标注为本地缓存，不是官方历史。
- 图片附件首版不下载、不解析。

### 4.9 代码任务分解

| 序号 | 文件 | 任务 | 测试 |
|---|---|---|---|
| 1 | `src/sources/qq-auth.ts` | access_token 获取、缓存、提前刷新 | 过期刷新、失败重试、并发只刷新一次 |
| 2 | `src/sources/qq-gateway.ts` | WebSocket Hello、Identify、心跳、Resume、重连 | 心跳周期、op 7/9、断线恢复 |
| 3 | `src/sources/qq-trigger.ts` | 三类事件归一化为 Trigger | 群 @、群全量、单聊、机器人过滤、时间解析 |
| 4 | `src/sources/qq-channel.ts` | 回复发送、错误码映射、`msg_seq` 分配 | 窗口内发送、超窗、重复序号、限频 |
| 5 | `src/sources/qq.ts` | SourceKind、面板字段、scope、policy、environment、apply | scope、策略、环境变量 |
| 6 | `src/infra/commands.ts` | 新增 `Commands.qq()`，统一凭证、超时、错误解析 | 成功、HTTP 错误、超时 |
| 7 | `src/deployment.ts` | `QqBotSchema`、`Deployment.qq`、`SETUP_FIELDS` | schema、默认值、未知键 |
| 8 | `src/setup.ts` | 新增 QQ 配置问题与启动校验 | 缺凭证、认证失败、机器人信息读取失败 |
| 9 | `tsdown.config.ts` | 增加 `qq-watch` 构建入口 | 构建通过 |
| 10 | `package.json` | 增加 `./qq-watch` 导出 | 导出可解析 |
| 11 | `cordis.patch.yml` | 增加 `dsh-superagent-qq`，默认禁用 | 默认部署行为不变 |
| 12 | 面板文案 | 来源页 QQ 卡片、健康项、错误提示 | 中英文一致 |

### 4.10 可靠性要求

- 凭证刷新失败、WebSocket 不可用、发送超频都要有明确健康状态。
- 重连使用指数退避，不能让故障进程高频重试。
- 机器人自己发送的消息不能再次成为 Trigger。
- 配置关闭时，监听循环在 5 秒内停止。
- 进程重启后不把离线时间算入任务活跃时间；QQ 入口不改变现有看门狗口径。
- 日志不输出 AppSecret、access_token 和用户消息正文。

### 4.11 验收标准

- 沙箱群内 @ 机器人能创建 Trigger 并进入面板。
- 单聊消息在开关打开时能进入同一条链路。
- 非白名单成员的消息被 L1 过滤。
- 机器人能回复原消息，且 5 分钟窗口内多次回复不重复。
- 超窗后的结果不会伪造为“已发送”。
- 重复推送同一 `message_id` 不产生重复 Ticket。
- 凭证过期后能自动刷新并继续接收。
- WebSocket 断线后能恢复；进程重启后能重新建立连接。
- `pnpm check` 通过，默认部署不启用 QQ 时行为与上游一致。

## 5. 里程碑

| 阶段 | 内容 | 完成标准 |
|---|---|---|
| M0 飞书接通 | 平台配置、lark-cli、面板启用、真实消息闭环 | 一条群 @ 消息能创建 Ticket 并收到回复 |
| M1 QQ 最小闭环 | token、WebSocket、群 @、单聊、文本回复、策略、面板 | 沙箱内完成一条完整任务链路 |
| M2 QQ 可靠性 | 心跳、Resume、重连、令牌刷新、`msg_seq` 幂等、健康上报 | 断线与重启场景可恢复 |
| M3 QQ 体验补齐 | 即时回执、主动消息、Markdown、本地上下文缓存、图片 | 长任务结果可交付且不重复 |

依赖关系：

- M0 与 M1 可并行，M0 不依赖 QQ 资质。
- M2 依赖 M1 的网关与发送基础。
- M3 依赖 M2 的可靠发送。

## 6. 测试计划

### 6.1 单元测试

- QQ 事件解析：群 @、群全量、单聊、机器人消息过滤、时间格式。
- Trigger id 稳定性与去重。
- scope 判断：配置群、其他群、私聊。
- 策略匹配：群内成员、跨群同人、单聊用户。
- `msg_seq` 分配与幂等。
- 错误码映射：超频、窗口过期、机器人不在群。
- token 过期与并发刷新。
- 部署 schema 默认值与未知键拒绝。

### 6.2 集成测试

- 模拟 WebSocket 事件序列：Hello → Ready → 消息 → 心跳 → 断线 → Resume。
- 模拟 Effect 队列重试，确认同一消息不会重复发送。
- 模拟超窗发送，确认返回 `'gone'` 而不是 `'sent'`。
- 模拟禁用 Source，确认监听停止且不再产生 Trigger。

### 6.3 手工验证

- 飞书群 @ 与私聊各一条。
- QQ 沙箱群 @ 与单聊各一条。
- 未授权用户消息被过滤。
- 长任务超过 5 分钟后结果的交付表现。
- Windows 下 lark-cli 与 QQ 长连接的稳定性。

## 7. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| QQ 主体认证与上线审核未完成 | 无法进入正式群，只能沙箱 | 提前完成认证；演示准备沙箱录屏 |
| QQ 5 分钟被动回复窗口 | 长任务结果无法回复原消息 | 即时回执 + 主动消息 + 面板兜底 |
| QQ 无历史上下文 | Router 研判质量下降 | 评测样本标注来源；后续加本地缓存 |
| `member_openid` 按群隔离 | 无法跨群识别同一个人 | 策略按群维度配置 |
| 官方接口变更 | 连接或发送失败 | 锁定文档版本；错误码集中映射 |
| 重复事件推送 | 重复建单或重复回复 | Trigger id 去重 + `msg_seq` 幂等 |
| 凭证泄露 | 机器人被滥用 | 环境变量/密钥文件注入，日志脱敏 |
| `lark-cli` 在 Windows 不可用 | 飞书入口无法演示 | 先验证；必要时再评估官方 SDK 方案 |
| 新入口污染控制面成果 | 简历表述失焦 | 单独分支与提交，不计入评测/看门狗/指标数据 |

## 8. 配置与运维

### 8.1 环境变量

| 变量 | 用途 |
|---|---|
| `QQ_BOT_CLIENT_SECRET` | QQ 机器人 AppSecret，默认读取的变量名 |
| `DSH_SUPERAGENT_QQ_GROUP` | 当前 Ticket 来源 QQ 群 openid；非 QQ 来源时为空 |
| `DSH_SUPERAGENT_QQ_USER` | 当前 Ticket 来源 QQ 用户 openid；非 QQ 单聊时为空 |

### 8.2 面板

- 来源页新增 QQ 卡片：AppID、密钥变量名、沙箱开关、接收群、其他群、私聊开关。
- 健康项新增 `qq`：`starting / ready / paused / error`。
- 错误提示区分：凭证缺失、认证失败、机器人信息读取失败、群未授权、发送超频、回复窗口过期。
- 中英文文案保持一致。

### 8.3 默认行为

- `dsh-superagent-qq` 默认禁用。
- 飞书保持上游默认禁用，只有显式开启后才运行。
- 不改变 GitHub Source 的轮询、策略和回复行为。

## 9. 任务清单

- [ ] M0-1 飞书应用创建、权限申请、事件订阅、发布版本
- [ ] M0-2 安装并配置机器人专用 lark-cli（strict-mode bot）
- [ ] M0-3 面板启用飞书 Source 并配置群与私聊
- [ ] M0-4 策略添加允许用户，完成一条真实消息闭环
- [ ] M1-1 QQ 开放平台认证、创建机器人、获取 AppID/AppSecret
- [ ] M1-2 实现 token 管理与网关长连接
- [ ] M1-3 实现 QQ 事件到 Trigger 的归一化
- [ ] M1-4 实现群聊与单聊文本回复
- [ ] M1-5 实现 scope、policy、环境变量与面板字段
- [ ] M1-6 注册插件、构建入口与包导出
- [ ] M1-7 补齐单元测试与沙箱手工验证
- [ ] M2-1 心跳、Resume、重连与重启恢复
- [ ] M2-2 `msg_seq` 持久化与 Effect 队列幂等
- [ ] M2-3 健康状态、错误码与日志脱敏
- [ ] M3-1 即时回执与主动消息策略
- [ ] M3-2 Markdown 消息与本地上下文缓存
- [ ] M3-3 图片附件支持评估

## 10. 参考资料

### 10.1 QQ 官方文档

- [使用 Websocket 接入](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/reference.html)
- [事件订阅与通知](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.html)
- [发送消息](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/send-receive/send.html)
- [消息事件字段](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/send-receive/event.html)
- [接口调用与鉴权](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/api-use.html)
- [Webhook 方式](https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/event-emit/webhook.html)
- [QQ 开放平台入驻文档](https://q.qq.com/wiki/)
- [QQ Bot 常见问题答疑](https://bot.q.qq.com/wiki/bot_FAQ/)
- [接口域名说明](https://bot.q.qq.com/wiki/develop/api/)

### 10.2 上游代码与文档

- `src/sources/kind.ts`：SourceKind 扩展点
- `src/sources/feishu.ts`：飞书 Source 完整实现
- `src/sources/feishu-loops.ts`：飞书事件消费与历史补收
- `src/deployment.ts`：部署配置与飞书机器人校验
- `src/setup.ts`：启动配置问题定义
- `src/infra/commands.ts`：lark-cli 调用封装
- `docs/006-deployment.zh-CN.md`：上游部署说明
- `cordis.patch.yml`：插件注册与默认禁用
- `tsdown.config.ts`：构建入口
</content>
