> 本文为中文译本，内容以英文原文为准：[原文](delivery.md)。

对于每个改动 UI 的工单，PR 描述必须同时包含 Before 与 After 视觉证据，明确标注，并指明基线版本与变更后的版本。
截取相同的场景、视口、主题与相关 UI 状态，使对比有意义；截图或演示都可用。
仅有 After 的证据是不完整的。
使用真实的应用截图，而不是把模型图当作先前实现来呈现，也不要公开飞书私密内容或凭据。
当后续 UI 改动使对比过时时，刷新该对比。
若无法提供真实基线截图，如实说明缺失的证据与限制，保持交接为不完整，且不要声称该 UI PR 已就绪。
worker 负责截取并验证对比；orchestrator 在交付就绪结果前检查所报告的证据。

请求匹配规则、派工、这些提示词或代码库指令所要求的评审。
绝不以智能体账户启用自动合并，以免智能体合并自己的工作：仅用本节指明的合并 CLI 启用，即 `<merge CLI> pr merge <number> --auto --merge --match-head-commit <sha> --repo $DSH_SUPERAGENT_GITHUB_REPOSITORY`。
当本节未指明合并 CLI 时，由人来合并每个 PR。
在有合并 CLI 时，对由工单分支发起、由你创建的 PR，当其头提交满足以下全部条件时启用自动合并：PR 已就绪；改动少于 200 行（新增加删除）；这些指令要求的每项批准都覆盖该提交；且若它改变了用户可见内容，这些指令已指明由其批准此类变更，且该批准覆盖该提交。
报告 ready 时不必等待批准，批准到达后再启用自动合并。
否则由人合并该 PR；在报告中说明这一点。
一旦上述任一条件不再成立（例如评审要求修改），或在向该 PR 推送之前，立即用 `<merge CLI> pr merge <number> --disable-auto --repo $DSH_SUPERAGENT_GITHUB_REPOSITORY` 撤回自动合并；待新头提交满足条件后再次启用。
绝不代表评审者批准或合并。
在你创建的 PR 的每个提交上，为每位评审者记名一次（每个 PR 一次）：当人类评审者对该 PR 的反馈首次被研判时，重写该分支，使其每个提交为迄今为止记名的每个人带一条 `Co-authored-by: <name or login> <id+login@users.noreply.github.com>` 尾注，其中 id 取自 `gh api users/<login> --jq .id`。
先如上撤回自动合并。
运行 `git fetch origin`，用 `gh pr view <number> --json baseRefName` 取基线分支并设置 `base=$(git merge-base HEAD origin/<base branch>)`、`old=$(git rev-parse origin/<head branch>)`，然后运行 `FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --msg-filter 'git interpret-trailers --if-exists addIfDifferent --trailer "<trailer>"' $base..HEAD`，每个记名的人一个 `--trailer`，这只会改动提交信息，再用 `git push --force-with-lease=<head branch>:$old` 推送；若推送被拒绝，停下并报告。
你之后添加的提交带有相同的尾注。
对某提交的批准也覆盖其重写副本，因为二者的树相同。
若 PR 已合并，不要重写它；在 orchestrator_report 中记录未记名的评审者。
绝不要为记名而推送空提交。
不要记名机器人（登录名以 [bot] 结尾者与本指令所指名的评审机器人账户）、该 PR 的作者、智能体账户，或本指令所指名的提交作者，后者已作为每个提交的作者被记名。
在 orchestrator_report 中记录你已记名的人，以免后续 worker 再次记名。
若有人正在处理同一问题，且其分支或 PR 包含本工单的代码（来自工单分支的提交，或其变更被带入），立即用 gh 关闭本工单的 PR，无需询问任何人，并在其上留下一句点明该人 PR 的话。
仅仅是相关、或不包含本工单代码的工作，不是关闭的理由。
关闭该 PR 即结束工单；不要发送其他消息。
