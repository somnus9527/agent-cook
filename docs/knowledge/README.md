# 知识点索引（Knowledge）

配合 [`../plan/agent-learning-plan.md`](../plan/agent-learning-plan.md) 使用。每篇聚焦一个概念，尽量给原理 + 可运行的最小示例（基于本地 Ollama，无框架）。每篇末尾有「延伸阅读」指向更深的优秀文章。

> 🗺️ **先读 [`00-overview.md`](00-overview.md)** —— 完整心智模型（分层）、19 篇阅读地图、精选外部资源、未覆盖的进阶主题入口。

| # | 知识点 | 对应阶段 | 一句话 |
|---|---|---|---|
| 00 | [总览（知识库地图）](00-overview.md) | 入口 | 分层心智模型 + 阅读地图 + 外部资源 |
| 01 | [Node.js 服务端 SSE](01-nodejs-sse.md) | 阶段 0（可选/Web 专用） | 服务端怎么"产出"流；**CLI 案例不需要** |
| 02 | [用 Ollama 裸调用模型](02-ollama-calling.md) | 阶段 1 | `ollama` npm 包：chat / 流式 / 参数；含"LLM 本质"心智锚点 |
| 03 | [Tool / Function Calling 原理](03-tool-calling.md) | 阶段 2 | 模型决策、你执行、结果回填的闭环；含跨供应商可移植性 |
| 04 | [Agent Loop 与 ReAct](04-agent-loop-react.md) | 阶段 2 | 那个 while 循环到底在干嘛 |
| 05 | [Plan-Execute-Replan](05-plan-execute-replan.md) | 阶段 2 | 先规划再执行，与 ReAct 的对比 |
| 06 | [Memory 与分级记忆架构](06-memory-architecture.md) | 阶段 3 | 为什么 Memory 这么卷；三级/四级架构 |
| 07 | [RAG 检索增强](07-rag.md) | 阶段 3 | embedding → 检索 → 拼 prompt |
| 08 | [上下文管理](08-context-management.md) | 阶段 2 | 上下文为什么爆、怎么压 |
| 09 | [结构化输出](09-structured-output.md) | 阶段 2 | 让模型稳定吐 JSON |
| 10 | [Agent 安全与护栏](10-tool-safety.md) | 阶段 2 | 模型输出不可信；沙箱、人在环、prompt 注入 |
| 11 | [扩展点 / 接缝设计](11-extensibility-seams.md) | 阶段 2 | **为未来留口子**：5 个单一收口处 |
| 12 | [知识库 Knowledge Base](12-knowledge-base.md) | 阶段 3 | 被 RAG 查的"馆藏"：组成、实现、优化 |
| 13 | [接入云端模型（Kimi）](13-provider-cloud-kimi.md) | 阶段 1–2 补充 | 切 Kimi：兼容 OpenAI，只动口子 A 的 adapter |
| 14 | [Embedding 与 RAG 讲透](14-embedding-and-rag-explained.md) | 阶段 3（概念） | Embedding 把"意思"变坐标；RAG=开卷考试 |
| 15 | [MCP 讲透](15-mcp-explained.md) | 阶段 3（了解） | MCP=给 Agent 插工具的标准接口，非 Agent 替代 |
| 16 | [运行时分层与 Agent Loop 编排](16-runtime-layering-and-loop.md) | 阶段 2 进阶 | 分层、loop 两分支、持久/临时上下文、规划接入、resume 路径 |
| 17 | [四类收集：Context/Memory/Checkpoint/Trace](17-collection-context-memory-trace-checkpoint.md) | 阶段 2–3 横切 | 各收集什么/谁用/怎么用 + checkpoint 数据模型 + 术语表 |
| 18 | [Prompt / 指令设计](18-prompt-and-instruction-design.md) | 地基（阶段 1–2） | system prompt 结构、工具描述怎么写、指令优先级、迭代法 |
| 19 | [评估（Evaluation）](19-evaluation.md) | 可靠性（阶段 2–3） | 评什么/怎么评、LLM-as-judge、评估集来自 trace、回归 |

> 阅读顺序建议按编号；02→03→04 是核心主线。**11 在动手写案例 1 前务必先读**——它决定你的骨架怎么搭。
