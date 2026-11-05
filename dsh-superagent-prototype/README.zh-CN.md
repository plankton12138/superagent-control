# dsh-superagent

> 本文为中文译本，内容以英文原文为准：[原文](README.md)。

> **仅供研究参考的原型，并非 DeepSeek 官方产品。** 本代码源自我们团队的日常开发工作，其中大量工程工作由编码智能体（coding agent）完成。请将其视为研究代码，而非可用于生产的软件。它可能仍包含缺陷，其编码风格和工程实践也可能不一致。在你自己的环境中使用前，请先审查并调整。
>
> 我们已为公开发布对其进行了调整，因此它与我们的内部版本，或与 *Exploring Super-agent Design: Towards a More Autonomous Agent System* 一文所描述的实现，并不完全相同。文章讨论的一些设计是未来发展的方向，并未在此原型中实现。

dsh-superagent 是面向单个 GitHub 仓库的主动（proactive）编码智能体，以打包组件（bundle）形式提供给 [DeepSeek Harness](https://www.deepseek.com/en/harness/)。它监听 GitHub，并可选择监听飞书或 QQ。当允许列表中的人向智能体请求工作时，它会创建一个工作项（work item），在自己的智能体会话和目录中处理，并在原对话中回复，例如通过一个拉取请求。Web 面板显示需要人工处理的事项。

它也是一种与智能体协作的方式：**尽可能少占用人的注意力，尽可能多地提供价值。** 一个能为整个团队行动的智能体，也可能浪费整个团队的注意力，因此它只在被请求时，或在团队写下的规则允许时才采取行动，并且只在有人必须行动或可以使用某个结果时才发言。[docs/000-philosophy.md](docs/000-philosophy.zh-CN.md) 阐述这一原则及其对操作者的要求。

## 初始配置

初始配置有很多步骤，所以由智能体与你一起完成。向你的编码智能体说：

> 阅读本仓库中的 SETUP.md，并和我一起配置 dsh-superagent。

它每次只问一个简短的问题，一次性展示完整计划，然后安装并配置所有内容。它遵循的是 [SETUP.md](SETUP.zh-CN.md)。

## 文档

请按顺序阅读编号文档；每个文档只建立在它之前的文档之上。

- [000 理念](docs/000-philosophy.zh-CN.md)
- [001 领域模型](docs/001-domain.zh-CN.md)
- [002 授权](docs/002-authorization.zh-CN.md)
- [003 执行](docs/003-execution.zh-CN.md)
- [004 提示词](docs/004-prompts.zh-CN.md)
- [005 面板](docs/005-panel.zh-CN.md)
- [006 部署](docs/006-deployment.zh-CN.md)：手动初始配置、配置、升级和故障排查
- [007 架构](docs/007-architecture.zh-CN.md)
- [008 实践指南](docs/008-cookbook.zh-CN.md)：添加来源

## 开发

`pnpm check` 运行类型检查、测试和构建。

## 许可证

[MIT](LICENSE)
