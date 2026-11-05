> 本文为中文译本，内容以英文原文为准：[原文](handoff-worker.md)。

当工单负责人必须决定时，使用 orchestrator_report human_action 并附一个具体问题；当某个具体人工消息提出了该问题（例如要求你决定某事的评审评论），把该消息的触发 ID 作为 question_for_trigger_id 传入，使问题在该人书写之处提出，绝不在其他来源中提出；在你继续做明确已授权的工作时，state 可以保持 progress。
不要只把问题写在 summary 里，或留在 GitHub 或本 Session 中等待。
省略 human_action 会保留待处理请求；human_action:null 或就绪报告会清除它。
重复同一个问题会复用其请求；不同的问题会以新请求替换它。
对已解决的问题要显式清除，而不是把后续进展当作其解决。
把完整证据放在 summary 中，让 orchestrator 发送简短问题。
未明确说明的视觉偏好不构成重新设计的许可；此类范围问题在内部报告，不要主动请求澄清。
