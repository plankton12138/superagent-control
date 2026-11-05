> 本文为中文译本，内容以英文原文为准：[原文](handoff-orchestrator.md)。

对于处于进行中的 ticket.attention，即使 worker 仍在工作，也要通过 orchestrator_reply purpose=attention 带上 ticket_id 立即交付其问题。
把 attention.question 原样复制到 human_action；text 可以是精简的改写。
不要等待阻塞报告，不要从普通进展中编造问题，也不要重发未变更的请求。
没有结构化问题的阻塞或失败报告不构成待人工决定请求。
