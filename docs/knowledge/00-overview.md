# 00 · 总览：怎么做一个优秀的 Agent（知识库地图）

> 整个 `knowledge/` 的入口与地图。先建立完整心智模型，再按图索骥读细节；每篇末尾有「延伸阅读」指向更深的优秀文章，本篇底部有「精选外部资源」和「本库未深入的进阶主题」。

## 一、完整心智模型（分层）

做一个 Agent，核心不止"能力"，还有"可靠"和"地基"。三层缺一不可：

```
┌─────────────────────────────────────────────────────┐
│  可靠性层   评估 · 校验/护栏 · 可观测性 · 安全            │ ← 区分 demo 与生产
├─────────────────────────────────────────────────────┤
│  能力层     ① 上下文工程（上下文管理 + Memory + RAG）     │
│            ② 工具能力注入                               │ ← "让 Agent 能干活"
│            ③ Agent Loop / 编排                          │
├─────────────────────────────────────────────────────┤
│  地基       模型选择  ·  Prompt/指令设计                  │ ← 最便宜的大杠杆
└─────────────────────────────────────────────────────┘
            贯穿全层：扩展点设计（给上面每层留口子）
```

**一句话**：能力决定上限，可靠性决定能不能上生产，地基决定性价比。

> 关键认知（贯穿全库）：LLM 是**无状态的概率预测器**，本质不确定。能力层让它"能干活"，可靠性层把"压不到零的不确定性"圈进可接受边界——两者同等重要。

## 二、阅读地图（21 篇按层归类）

### 地基
| 篇 | 内容 |
|---|---|
| [02 用 Ollama 裸调用模型](02-ollama-calling.md) | LLM 调用基础 + "LLM 本质"心智锚点 |
| [13 接入云端模型（Kimi）](13-provider-cloud-kimi.md) | 换更强模型测效果，只动 adapter |
| [18 Prompt / 指令设计](18-prompt-and-instruction-design.md) | 最便宜的大杠杆：system prompt 结构、工具描述、指令优先级 |

### 能力层 · ① 上下文工程
| 篇 | 内容 |
|---|---|
| [08 上下文管理](08-context-management.md) | 窗口内取舍：截断/摘要/滑窗 |
| [06 Memory 与分级记忆架构](06-memory-architecture.md) | 跨会话记忆；三级/四级架构为什么这么卷 |
| [14 Embedding 与 RAG 讲透](14-embedding-and-rag-explained.md) | 概念：向量化与"开卷考试"，及其局限 |
| [07 RAG 检索增强](07-rag.md) | RAG 的工程实现 |
| [12 知识库 Knowledge Base](12-knowledge-base.md) | 被 RAG 查的"馆藏"：组成/实现/优化 |

### 能力层 · ② 工具
| 篇 | 内容 |
|---|---|
| [03 Tool / Function Calling 原理](03-tool-calling.md) | 模型决策/你执行/回填闭环 + 跨供应商 |
| [15 MCP 讲透](15-mcp-explained.md) | 工具/数据/模版的标准化接入 |
| [20 Skill（技能）](20-skills.md) | 指令+工具+资源的按需加载单元；渐进式披露 |

### 能力层 · ③ 循环 / 编排
| 篇 | 内容 |
|---|---|
| [04 Agent Loop 与 ReAct](04-agent-loop-react.md) | 那个 while 循环 |
| [05 Plan-Execute-Replan](05-plan-execute-replan.md) | 先规划再执行 |
| [09 结构化输出](09-structured-output.md) | 让模型稳定吐 JSON（编排的粘合剂） |
| [21 工作流 vs 智能体：编排模式菜单](21-workflow-patterns.md) | 工作流 vs Agent + 5 模式；ReAct/Plan-Execute 的上位地图 |
| [16 运行时分层与 Agent Loop 编排](16-runtime-layering-and-loop.md) | 分层、loop 两分支、规划接入、resume 路径 |
| [17 四类收集：Context/Memory/Checkpoint/Trace](17-collection-context-memory-trace-checkpoint.md) | 谁收集什么/谁用/怎么用 + checkpoint 数据模型 + 术语表 |

### 可靠性层
| 篇 | 内容 |
|---|---|
| [10 Agent 安全与护栏](10-tool-safety.md) | 不可信输出、沙箱、人在环、prompt 注入 |
| [19 评估（Evaluation）](19-evaluation.md) | 度量好不好用：评什么/怎么评、LLM-as-judge、回归 |
| （可观测性：见 [17 trace](17-collection-context-memory-trace-checkpoint.md) + [11 口子 D](11-extensibility-seams.md)） | |

### 贯穿
| 篇 | 内容 |
|---|---|
| [11 扩展点 / 接缝设计](11-extensibility-seams.md) | 5 个单一收口处，含持久化/断点续跑 |
| [01 Node.js 服务端 SSE](01-nodejs-sse.md) | 可选/Web 专用 |

## 三、本库未深入的进阶主题（给入口，自行深入）

> 原列在此的**持久化、评估、可观测性**现已各自成篇/有专节（见下），不再算"未深入"。本节现仅余有意延后的进阶主题：

- **多 Agent 编排**：把 Agent 当工具组合（[11 口子 E](11-extensibility-seams.md) 已留位）。单 Agent CLI 不需要，作为进阶入口保留。

已补齐的原"未深入"项：
- **持久化与断点续跑**：见 [17 §6](17-collection-context-memory-trace-checkpoint.md)（数据模型/幂等/一致性）+ [11 §5](11-extensibility-seams.md) + [LangGraph Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)、[Durable Execution 详解](https://vadim.blog/durable-execution-agents-that-survive-failure-and-resume-where-they-left-off)。
- **评估（Evaluation）**：见 [19 评估](19-evaluation.md)。
- **可观测性 / 追踪**：见 [17 trace](17-collection-context-memory-trace-checkpoint.md) + [11 口子 D](11-extensibility-seams.md)。

## 四、精选外部资源（按"想搞懂什么"分类，均已核实）

### 大模型到底是什么、怎么运转的
- 🎥 [Karpathy《Intro to LLMs》(1hr)](https://www.youtube.com/watch?v=zjkBMFhNj_g) —— 非技术向、建立整体心智模型，**强烈首推**。
- 🎥 [Karpathy《Let's build GPT, from scratch, in code》](https://www.youtube.com/watch?v=kCc8FmEb1nY) —— 想从代码层手写理解，看这个。
- 🎥 [3Blue1Brown《But what is a GPT?》](https://www.3blue1brown.com/lessons/gpt) + [《Attention, step-by-step》](https://www.3blue1brown.com/lessons/attention) —— 可视化讲透 Transformer/注意力。
- 📄 [The Illustrated Transformer (Jay Alammar)](https://jalammar.github.io/illustrated-transformer/) —— 图解 Transformer 经典。
- 📄 [Attention Is All You Need（原论文）](https://arxiv.org/abs/1706.03762) —— Transformer 起源。

### Embedding / 向量化到底在干嘛
- 📄 [The Illustrated Word2vec (Jay Alammar)](https://jalammar.github.io/illustrated-word2vec/) —— 把"意思变成向量"讲到直觉级。

### RAG 底层原理
- 📄 [RAG 原论文 (Lewis et al., 2020)](https://arxiv.org/abs/2005.11401) —— RAG 概念出处（参数记忆 vs 非参数记忆）。

### Agent 架构与最佳实践
- 📄 [Anthropic《Building Effective Agents》](https://www.anthropic.com/engineering/building-effective-agents) —— 工作流 vs Agent、设计模式、"先求简单"，**必读**。
- 📄 [Anthropic《Effective Context Engineering for AI Agents》](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) —— 上下文工程的实操指南。
- 📄 [Lilian Weng《LLM Powered Autonomous Agents》](https://lilianweng.github.io/posts/2023-06-23-agent/) —— Planning/Memory/Tool 三件套的经典综述。
- 📄 [ReAct 论文](https://arxiv.org/abs/2210.03629)、[MemGPT 论文](https://arxiv.org/abs/2310.08560) —— 推理+行动、OS 式记忆。
- 💻 [Anthropic Cookbook · agents patterns](https://github.com/anthropics/anthropic-cookbook/tree/main/patterns/agents) —— 可运行的模式代码。

### MCP
- 📄 [MCP 官方文档](https://modelcontextprotocol.io) + [规范博客](https://blog.modelcontextprotocol.io/)

---

**怎么用这份地图**：先看完 §一 的分层模型 + Karpathy 那个 1hr 视频建立全局观；再按"地基 → 能力层 → 可靠性层"读各篇；每篇看完顺着「延伸阅读」深挖你最想搞懂的点。
