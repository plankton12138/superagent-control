# 006 部署

> 本文为中文译本，内容以英文原文为准：[原文](006-deployment.md)。

本指南用于安装、配置和运维 dsh-superagent。它涵盖账户、启动检查、升级和故障排查，并建立在 [001 领域模型](001-domain.zh-CN.md) 至 [005 面板](005-panel.zh-CN.md) 的基础之上。

## 运行内容

- **一个专用的 DeepSeek Harness 配置档（profile）**，本指南中称为 `superagent`。从 Web 配置档模板创建它。它加载该打包组件，并在 `127.0.0.1` 上提供其面板。请将其与你日常使用的配置档分开：该插件会改变整个进程的 `PATH` 和 git 设置，并且其进程需要独立的重启和升级。
- **一个供智能体使用的 GitHub 账户。** 智能体以该账户评论、推送分支并创建拉取请求，所用 GitHub CLI 只以该账户登录。
- **可选：** 用于聊天请求的飞书机器人。

插件配置保存状态目录和机器限制。其他一切都在面板中完成：来源页用于仓库和账户，策略页用于允许列表，执行页用于 worker 目录和命令。

### 权限与隔离

该打包组件为执行器定义了 `dsh-superagent-worker`，为主 Session 定义了 `dsh-superagent-router`。它们出现在 DeepSeek Harness 预设列表中，但仅供 dsh-superagent 使用。不要为个人 Session 选择它们，也不要禁用它们的配置行。应用需要它们来创建和恢复其 Session。

在 Web UI 中打开空白托管 Session 时，可能会选中该配置档的默认预设。dsh-superagent 会在首个回合之前恢复其按角色区分的预设。

两个预设都以操作者（Operator）的操作系统用户身份、以 `danger-full-access` 运行，并读取已订阅线程中的消息。账户包装脚本默认选用智能体的凭据，但不会隔离进程。worker 可以按路径执行程序，并读取操作者的主目录。若需隔离，请使用仅包含智能体凭据的专用操作系统账户。

## 前置条件

- Node.js 22.19+ 或 24+、pnpm、git 2.32+、Python 3.8+ 和 tmux
- GitHub CLI（`gh`）2.48 或更高版本。来源的 CLI 字段必须指向 `gh` 或 `lark-cli` 包装脚本；宿主依赖它们的子命令和输出格式。
- github.com 上的一个仓库；不支持 GitHub Enterprise Server。要为每个工单创建检出，请保留一个本地克隆，准备命令可从其中添加工作树。如果该仓库使用 Git LFS，请安装 `git-lfs`。
- 为 DeepSeek Harness 配置的模型提供方。除非评估或执行设置指定了其他模型，否则 dsh-superagent 使用配置档的默认模型。
- 使用飞书时：`lark-cli`（已用 1.0.90 测试）以及带有机器人的飞书或 Lark 应用

## 账户

### 智能体的 GitHub 账户

1. 为智能体创建一个 GitHub 用户账户，并授予其对仓库的写权限。GitHub App 不能充当智能体，因为 dsh-superagent 会读取该账户的通知。
2. 为其提供一个仅使用自身凭据的 GitHub CLI：

   ```sh
   mkdir -p ~/.local/bin
   cat > ~/.local/bin/gh-agent <<'EOF'
   #!/bin/sh
   GH_CONFIG_DIR="$HOME/.config/gh-agent" exec gh "$@"
   EOF
   chmod +x ~/.local/bin/gh-agent
   gh-agent auth login
   gh-agent api user --jq .login
   ```

   以智能体账户登录；最后一条命令会打印其登录名。dsh-superagent 以相同方式读取该登录名。

### 飞书机器人（可选）

1. 创建一个具备机器人能力的自建应用。授予其接收消息事件、读取和发送聊天消息以及读取聊天成员的权限，然后发布应用版本。
2. 为机器人提供其专用的 `lark-cli` 配置（限制为机器人身份），以及一个包装脚本：

   ```sh
   LARKSUITE_CLI_CONFIG_DIR="$HOME/.lark-cli-dsh-superagent" lark-cli config init --app-id <cli_…> --app-secret-stdin
   LARKSUITE_CLI_CONFIG_DIR="$HOME/.lark-cli-dsh-superagent" lark-cli config strict-mode bot --global
   cat > ~/.local/bin/lark-bot <<'EOF'
   #!/bin/sh
   export LARKSUITE_CLI_CONFIG_DIR="$HOME/.lark-cli-dsh-superagent"
   exec lark-cli "$@"
   EOF
   chmod +x ~/.local/bin/lark-bot
   ```

   第一条命令从标准输入读取应用密钥。请使用单独的配置目录：`lark-cli` 对每个应用 id 只允许一个配置档，而你的个人配置中可能已经包含该应用的用户登录。

   宿主会拒绝可以以用户身份操作的 CLI。它从机器人配置中读取应用 id、飞书/Lark 品牌和机器人 `open_id`。

   两个配置共享应用密钥的钥匙串条目。若只想移除机器人配置，请删除其目录；不要运行 `lark-cli config remove`，因为那会影响共享的密钥。

## 安装

在尚无 `superagent` 配置档的机器上，执行以下代码块一次：

```sh
npm install -g @deepseek-ai/dsh@0.2.1-rc.3
git clone <this repository> dsh-superagent && cd dsh-superagent
pnpm install && pnpm build
dsh superagent --from-default-profile web --dump-config > /dev/null
dsh plugin --profile superagent add "link:$PWD"
```

上面固定的版本是公开版本；其他版本必须满足 `package.json` 中的 `engines.dsh`。

第四条命令基于 DeepSeek Harness Web 模板创建 `~/.dsh/profiles/superagent`。第五条命令安装此打包组件。设置 `DSH_HOME` 可重新定位默认的 `~/.dsh` 目录。

仅在全新安装时运行创建配置档的命令。如果配置档已存在，该命令会替换它并删除其 `cordis.patch.yml`，其中包括机器配置。升级时不要使用该命令。

## 机器配置

将 [examples/profile.cordis.patch.yml](../examples/profile.cordis.patch.yml) 复制到 `~/.dsh/profiles/superagent/cordis.patch.yml`（替换该文件），并替换其中每个 `<placeholder>`。使用飞书时，还需在该文件中启用 `dsh-superagent-feishu` 条目。`webserver` 条目设置面板端口。

| 键 | 是否必需 | 含义 |
| --- | --- | --- |
| `stateDir` | 是 | 绝对路径：数据库、锁、`worker-bin` 中的命令垫片、智能体的 git 配置，以及默认情况下 `work` 中的工单目录。升级前请备份 |
| `promptMaxChars`, `admissionContextMaxPages`, `admissionContextTimeoutMs` | 否 | 已保存的最大提示词配置，以及一次研判在限定时间内读取多少页线程 |

首次启动后，可在 **设置 → 部署** 或 DeepSeek Harness 插件管理器中修改机器限制。更改无需重启即可生效。`stateDir` 无法在那里修改。无效值或未知的配置键会阻止启动；日志会指出是哪个键。

## 启动与停止

```sh
scripts/dsh-superagent start
scripts/dsh-superagent status
```

`start` 在 tmux 会话 `dsh-superagent` 中运行 `dsh --profile superagent`；若使用其他配置档，则为 `dsh-<profile>`。它最多等待一分钟，让运行时进入就绪状态或报告配置要求。首次运行时，它会打印缺失的配置信息。它会拒绝重复的实例，包括在此脚本之外启动的实例。

`stop` 和 `restart` 请求优雅关闭，并最多为执行器等待五分钟。它们绝不强制终止进程，也不会触碰其他 tmux 会话。

`status` 打印进程 id、健康状况和配置问题。若要使用其他配置档或端口，请使用 `--profile` 和 `--url`，或设置 `DSH_SUPERAGENT_PROFILE` 和 `DSH_SUPERAGENT_URL`。

`status`、`start` 和 `restart` 以四种退出码之一结束：

| 退出码 | 含义 |
| --- | --- |
| 0 | 服务正常运行 |
| 1 | 未运行、重复运行、无响应，或其运行时报告错误；重启可能修复 |
| 2 | 正在运行，但运行时之外的某个部分（例如某个来源或策略同步 `sync:<source id>`）报告错误；重启无法修复 |
| 3 | 正在运行并等待初始配置；重启无法修复 |

仍在启动中的来源算作正常运行。初始配置无法检查的飞书机器人同样如此。

`status` 在 `errors` 下返回失败的部分及其详情，在 `setup` 下返回初始配置要求。`start` 和 `restart` 以文本行形式打印这些问题；若服务始终未启动，则以退出码 1 结束。只有主动执行的 `stop` 才会暂停自动恢复。

每个配置档在 `.artifacts/` 下存储日志和控制文件：

- 启动日志：`dsh-superagent-<profile>-<date>-<time>-<pid>.log`，其中的 pid 属于该脚本。保留最新的 20 个。
- 控制文件：`control/profiles/<profile>/`，包含停止标记、锁和进程 id。

打开日志中打印的 URL，然后在侧边栏中选择 **Superagent**。

### 每小时检查

在你日常使用的 DeepSeek Harness 配置档中创建每小时检查，而不是在 `superagent` 中。它必须在智能体服务停止时继续运行。请该配置档中的智能体使用以下提示词创建每小时计划任务，并填入检出路径：

```text
检查 dsh-superagent：在 <checkout> 中运行 `scripts/dsh-superagent --profile superagent status`。退出码 0：什么都不做，也不要发言。退出码 2：不要重启；逐项告诉我 `errors` 下的每个部分及其详情，除非你已经告诉过我相同的问题。退出码 3：不要重启；告诉我 `setup` 说明初始配置还需要什么，除非你已经告诉过我。如果它报告 manually_stopped: true，就保持停止状态。否则（退出码 1）运行 `scripts/dsh-superagent --profile superagent --respect-stop restart`，它同样以相同方式结束：0 表示已恢复，因此不要发言；2 和 3 按上述方式报告；如果以 1 结束或以其他方式失败，请读取最新的 .artifacts/dsh-superagent-superagent-*.log 以及 docs/006-deployment.md 的“故障排查”一节，修复你能修复的问题，并告诉我出了什么问题以及你做了什么。
```

`--respect-stop` 会保留主动停止状态。只有 `stop` 会写入该标记；`start` 会清除它。`restart` 不写标记，因此该检查可以恢复那些关闭超时的重启。

## 设置

初始配置必须先成功，轮询或工作才会开始。概览页列出缺失的要求，并链接到相应设置。更改设置会重新运行初始配置。如果你在应用之外修复了某些内容（例如 CLI 认证），请选择 **再次检查（Check again）**。

1. **来源。** 设置 GitHub 仓库（`owner/name`）和智能体 CLI，例如 `/home/me/.local/bin/gh-agent`。请求通常通过智能体账户的通知到达。提及该账户的新 Issue 或新评论会在下一次轮询时到达；通过编辑现有 Issue 正文添加的提及则不会。请改为发表新评论。使用飞书时，设置机器人 CLI、聊天、每个聊天的全量接收或仅提及模式，以及是否接收私聊消息。
2. **策略。** 两条示例规则可以编辑或删除。在 **每个来源** 下，添加可以请求工作的 GitHub 账户和飞书用户；列表为空时，任何请求都无法成为工单。使用飞书时，可以选择一个聊天作为列表的同步来源，在启动时以及点击 **立即同步** 时进行同步。
3. **执行。** 目录根路径和准备命令。要让每个工单检出该仓库：

   ```sh
   git -C /home/me/src/widgets fetch --no-tags "https://github.com/$DSH_SUPERAGENT_GITHUB_REPOSITORY.git" "${DSH_SUPERAGENT_GITHUB_PR_HEAD:-HEAD}:refs/dsh-superagent/$DSH_SUPERAGENT_TICKET" &&
   git -C /home/me/src/widgets worktree add -b "agent/$DSH_SUPERAGENT_NAME" "$DSH_SUPERAGENT_DIR" "refs/dsh-superagent/$DSH_SUPERAGENT_TICKET"
   ```

   将个人 CLI（例如以你自己的账户登录的 CLI）列在被阻止的命令中。
4. **提示词。** 设置团队段落：GitHub 披露语句、审查机器人、提交作者和自动合并条件。

### 管理 API

面板使用一个本地 HTTP API，智能体也可以调用它。`SETUP.md` 用它保存设置，服务脚本读取 `GET state`。

向 `http://127.0.0.1:<port>/orchestrator/api/` 发送请求时带上 `x-orchestrator-request: 1`。主机必须是 `127.0.0.1:<port>` 或 `localhost:<port>`。缺少标头或 `Origin` 来自其他站点时会收到 403。

API 保存具有面板的权限。与通过主 Session 工具进行的保存不同，它们可以更改执行环境和初始配置账户字段。

智能体可以依赖这些路由和字段。`src/app/api.ts` 中的其他路由服务于面板，并随面板变化。

| 请求 | 响应 |
| --- | --- |
| `GET state` | 每个页面读取的内容：`setup`，包含 `problem` 和 `feishuProblem`，每项为 `null`，或为带有 `place`、`code`、`values` 和 `detail` 的初始配置问题，以及初始配置解析后的 `accounts`；`health`，按部分各一条记录（见下文），包含 `state`（`starting`、`ready`、`paused` 或 `error`）、`detail` 和 `at`；`load`，即执行器 Session 的 `running`、工单的 `queued` 和 `maxWorkers`；`paused`；以及 `masterId` |
| `GET settings` | `blocks`：`policy`、`eval` 和 `executor`，各带其 `value` 和 `revision`；`sources`：来源实例，每个带 `id`、`kind`、`installed`、其区块的 `value`（`{"enabled": …, "config": {…}}`）和 `revision`、其类型的表单，以及存在时的初始配置 `problem`；`policyVersion`；以及 `environment`，即执行环境的 `root` 和 `variables` |
| `GET sources` | 每个来源的状态：`state`（`missing`、`off`、`error`、`setup`、`starting`、`paused` 或 `ready`）、其各部分的 `health`、其初始配置 `problem`、最近一天的 `stats`、当天被其 `filtered` 的触发，以及当天被其 `dropped` 的消息（最新的丢弃在前），每条消息包含其 `channel`、`preview`、`ticket`（`id` 和 `title`，当该消息属于某个工单时）、`thread`（当存储中存在时），以及 `dropped.at` 和 `dropped.reason`、`channelGone` 或 `channelIgnored` |
| 带 `{"value": …, "revision": n}` 的 `PUT settings/<block>` | 保存一个区块：`saved`、该区块的新 `revision`、`policy_changed` 和 `restarting`。`value` 是整个区块，与 `GET settings` 中的结构一致；缺少的键取默认值 |
| 带 `{"paused": true}` 或 `false` 的 `POST executor/pause` | 暂停或恢复处理：`paused` |
| `POST setup/check` | 通过重启 dsh-superagent 重新运行初始配置：`restarting: true`。当初始配置没有需要修复的内容时会被拒绝 |
| `POST policy-sync/<source id>` | 立即同步该来源的允许列表：`policy`，即该来源已保存的部分 |
| `GET prompts`、带 `{"config", "baseRevision"}` 的 `PUT prompts` | 读取提示词配置：`current`（含其 `revision` 和 `config`）、`defaults`、`sections`（团队段落，按 Session 读取它们的顺序）、`skillName`（团队技能名称的模式）、`builtin`（团队技能不可使用的名称）和 `skillPrefix`（Session 加载技能名称时使用的前缀）。或者保存它：返回新的 `revision` |
| `POST tickets/<id>/retry`、`POST tickets/<id>/stop` | 重试或停止一个工单，与面板行为一致 |

健康记录按职责分组：

| 记录 | 报告内容 |
| --- | --- |
| `runtime` | 应用自身 |
| `models` | 等待模型预算重试的 Session |
| `evals` | 最近一小时内不可用、且之后没有判断或忽略的评估 |
| `assessment`、`launch`、`delivery`、`relay`、`notice`、`reply` | [003 执行](003-execution.zh-CN.md) 中描述的已存储工作；delivery 统计等待中的工作，而 reply 覆盖渠道消息 |
| `worker` | 执行器 Session 的事件处理；在首次失败后出现 |
| `github`、`feishu`、`history` | 来源轮询、事件和历史恢复 |
| `sync:<source id>` | 允许列表同步 |

拒绝响应包含状态码和 `error`（其英文文本）：

- 400：无效值（`issues`，每项带其 `path`）、账户检查失败（`setup`）、固定拒绝（`code` 和 `values`），或请求体不是 JSON 或过大。
- 404：请求的内容不存在。
- 409：过期的版本号。
- 500：其他任何情况。

区块：

- `source:github`、`source:feishu`：`{"enabled": true, "config": {…}}`。GitHub 的配置包含 `repository` 和 `cli`，以及默认关闭的开关 `observeIssues`、`observePulls`、`observeComments` 和 `observeCi`；这些开关会接收仓库中每个新 Issue、新拉取请求和评论，以及默认分支的 CI；飞书的配置包含 `cli`、`chats`（形如 `[{"chatId": "oc_…", "name": "…", "listen": "mentions"}]`，或 `"all"`）、`directMessages`，以及 `otherChats`（`"none"` 或 `"mentions"`）。
- `policy`：`{"rules": […], "sources": {"github": {"allowed": [{"id": "<login>"}], "bots": [{"id": "dependabot[bot]"}]}, "feishu": {"allowed": [{"id": "ou_…", "name": "…"}], "syncChat": "oc_…", "admission": {"oc_…": {"unlistedAddressed": "explicit"}}}}}`。`bots` 列出其消息可以成为推断候选的机器人。`admission` 行以聊天 id 为键，飞书还可用 `other` 或 `direct`，GitHub 则用 `issues`、`pulls`、`comments` 或 `ci`；未设置的单元格取默认值（见 [002 授权](002-authorization.zh-CN.md)）。
- `eval`：`mode`、`timeoutSeconds` 和 `model`。
- `executor`：`model`、`maxWorkers`、`directory`、`prepare` 和 `blockedCommands`。处理暂停是一个独立设置 `paused`，由 `POST executor/pause` 设置。

更改仓库或 CLI 会先运行相应的初始配置检查。检查失败会返回 400，详情在 `setup` 中。账户更改成功，或在初始配置待定时进行任何保存，都会返回 `restarting: true`。应用重启期间 API 暂时不可用。

```sh
api=http://127.0.0.1:3082/orchestrator/api
rev=$(curl -s -H 'x-orchestrator-request: 1' $api/settings | jq '.sources[] | select(.id == "github") | .revision')
curl -s -X PUT -H 'x-orchestrator-request: 1' -H 'content-type: application/json' $api/settings/source:github \
  -d "{\"value\": {\"enabled\": true, \"config\": {\"repository\": \"acme/widgets\", \"cli\": \"$HOME/.local/bin/gh-agent\"}}, \"revision\": $rev}"
```

## 初始配置检查

初始配置使用 DeepSeek Harness 子进程服务，与 worker shell 一样。它会移除名称包含 KEY、PASSWORD、SECRET 或 TOKEN 的环境变量。

初始配置会验证 GitHub 仓库和智能体的推送权限，写入 worker 环境，并检查 git 对 github.com 只使用智能体凭据。飞书的初始配置失败只会禁用飞书来源。

初始配置写入的进程环境：

- **命令垫片（shim）**：位于 `<stateDir>/worker-bin`，排在 `PATH` 最前：`gh` 运行智能体的 CLI；`lark-cli` 运行机器人的 CLI；被阻止的命令会失败。垫片在运行其目标之前会从 `PATH` 中移除自己所在的目录。
- **git 配置**：位于 `<stateDir>/worker-gitconfig`：替代操作者的全局和系统 git 配置。它将智能体 CLI 选为 github.com 的凭据助手，把 GitHub SSH 地址重写为 HTTPS，并定义 Git LFS 过滤器。诸如 HTTP 代理之类的个人 git 设置不会生效。此处不设置提交身份，git 从不提示输入凭据，并且会移除 `GH_TOKEN` 和 `GITHUB_TOKEN`。

`worker-bin` 或 `worker-gitconfig` 中并非由 dsh-superagent 写入的文件会中止初始配置。若工单目录位于某个自行在配置中添加凭据的 git 仓库内，该工单会失败。

## 试用

使用允许列表中的 GitHub 账户，打开一个 Issue 或发表包含 `@<agent login> <request>` 的评论。在一个轮询间隔内（默认一分钟），概览页应显示一个工单。智能体确认该请求，在自己的 Session 和目录中工作，并在原对话中交付。使用飞书时，在已配置的聊天中提及机器人。

## 升级

1. 等到没有执行器正在处理回合。
2. 备份 `<stateDir>/orchestrator.sqlite`。
3. 运行 `git pull && pnpm install && pnpm build`。
4. 运行 `scripts/dsh-superagent restart` 并检查其状态。

重启会结束正在运行的派工，并以恢复说明启动替代任务。团队文本和被覆盖的提示词部分会保留；未被覆盖的部分则遵循新的默认内容。升级后请检查标记为 **默认内容已更新（Default updated）** 的部分。

由较新版本迁移的数据库无法被较旧版本打开。因此回滚需要升级前的备份。升级 DeepSeek Harness 本身之后，请重启正在运行的实例，以便面板加载匹配的构件。

### 智能体预设

worker 和 router 预设会在 5 秒后将 shell 命令移到后台。Session 缺少其预设就无法加载。在其 Session 仍在使用期间，请保留 `cordis.patch.yml` 中的 `dsh-superagent-worker` 和 `dsh-superagent-router` 行；否则恢复会以 `agent-preset/not-found` 失败。

## 故障排查

初始配置问题会以面板的语言显示在概览页，并附有修复链接；日志和 API 则显示下文的英文原文。

| 现象 | 原因与修复 |
| --- | --- |
| `The agent GitHub CLI is not set.` | 在 GitHub 卡片上设置智能体的 CLI |
| `The agent GitHub CLI was not found.` | 设置包装脚本的绝对路径，或 `PATH` 上的命令名 |
| `The agent GitHub CLI cannot read its account` | 用 `auth login` 登录该包装脚本 |
| `@… cannot read …` 或 `@… cannot push to …` | 为智能体账户授予仓库写权限 |
| `The GitHub Source names no repository.` | 在 GitHub 卡片上设置仓库，格式为 `owner/name` |
| 工单失败并显示 `The prepare command failed: …` | 输出会指出原因，例如克隆路径错误；修复该命令，然后重试该工单 |
| `git does not read the github.com credential configuration dsh-superagent writes` | 安装 git 2.32 或更高版本 |
| 工单失败并显示 `The git configuration of the repository in … sets …` | 从克隆的 `.git/config` 中移除所指的凭据或 `http.*.extraheader` 设置 |
| `… was not written by dsh-superagent` | 将所指文件移出 `<stateDir>/worker-bin` 或 `<stateDir>/worker-gitconfig`，或选择另一个 `stateDir` |
| `The bot lark-cli allows user identities` | 让飞书来源指向仅机器人配置，参见上文“飞书机器人” |
| `The bot lark-cli does not work.` 或 `The bot identity of app … is …` | 检查配置中的应用 id 和密钥 |
| `The Feishu bot is not a member of the chat.` | 在聊天设置中将机器人加入该聊天；下次尝试即可成功 |
| `status` 以 2 退出 | 某一部分报告错误，重启无法修复：`errors` 列出每个部分（与管理 API 下所列一致）及其详情；每个部分恢复正常后会清除自己的记录 |
| `status` 以 3 退出 | 初始配置在等待：`setup` 说明缺少什么，概览页会链接到可修复它的设置 |
| `status` 以 1 退出 | 服务未运行、重复运行、无响应，或其运行时报告错误；输出和最新日志会说明是哪一种 |
| `… timed out after 90 s`、`… was stopped by …`、`… exited with code …` 或 `… could not run: …` | CLI 失败但未打印原因；请以操作者用户的身份手动运行所指程序，以查看其自身的消息 |
| 面板提示 dsh-superagent 无响应 | 它正在重启，或因配置问题未启动；DeepSeek Harness 日志会指出原因 |
| `dsh-superagent configuration has keys it does not use`（日志） | 移除所指的键；消息会说明每个值现在的所在位置 |
| 日志显示该插件与正在运行的 dsh 不兼容 | 安装处于 `engines.dsh` 范围内的 DeepSeek Harness 版本 |
| DeepSeek Harness 升级后，面板显示“Failed to load plugins” | 重启正在运行的实例 |
| 提及之后没有任何反应 | 检查作者是否在来源的允许列表中、来源是否已开启、处理是否未被暂停。在 GitHub 上，通过编辑 Issue 正文添加的提及不会被接收；请在评论中提及智能体 |
