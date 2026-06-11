# Agent 开发学习计划（Node.js · 无框架手搓优先）

> 目标：在不依赖任何 Agent 框架的前提下，把"Agent 到底是什么"在裸代码里理解透；用**本地 Ollama 模型**做所有 LLM 调用；能手搓出可用的 Agent 后，再按需引入框架（本计划**暂不涉及框架**）。
>
> 文档约定：本项目所有文档落在 `docs/` 下，计划在 `docs/plan`，知识点在 `docs/knowledge`。

---

## 学习原则

1. **先手搓，再框架**：阶段 1–3 全部裸代码，理解机制；框架（阶段 4）暂缓。
2. **本地优先**：用 Ollama（`ollama` npm 包）调用本地模型，零云端依赖、零费用。
3. **每个阶段都有产出**：能跑、能调试、能解释原理。
4. 知识点与本计划同步，详见 [`docs/knowledge`](../knowledge/README.md)。**入门先读 [`00-overview.md`](../knowledge/00-overview.md)**（分层心智模型 + 阅读地图 + 精选外部资源）。

---

## 阶段 0：前置基础（查漏补缺）

只补一个你没用过的点（**且仅 Web 版 Agent 才需要，本项目两个案例都是 CLI，可跳过**）：

- **Node.js 服务端 SSE**：你在前端用 `EventSource` 接过流，但没在 Node 服务里**产出**过 SSE。它是"Web 版聊天 Agent"里 `Node → 浏览器` 那一段的传输方式。⚠️ 注意：`Ollama → 你的 Node` 那段是 `ollama` 包封装的 HTTP 流，与 SSE 无关；**CLI agent 直接 `stdout` 输出即可，不需要 SSE**。
  - 👉 知识点：[`01-nodejs-sse.md`](../knowledge/01-nodejs-sse.md)（可选）

其余前置（async/await、`for await`、`AbortController`、JSON Schema、TypeScript）你应已具备，遇到再查。

---

## 阶段 1：用 Ollama 裸调用模型（无框架）

目标：不靠任何 Agent 抽象，直接和本地模型多轮对话。

学习点：
1. **消息结构**：`system`/`user`/`assistant` 三角色；模型**无状态**，每次请求都要带完整 `messages` 历史。
2. **核心参数**：`temperature`、上下文窗口（`num_ctx`，工具调用建议 ≥32k）、`stream`。
3. **流式输出**：`stream:true` 返回 AsyncGenerator，`for await` 逐块消费——和阶段 0 的 SSE 对应上。
4. **Token 与上下文窗口**：为什么会超长，为什么后面要做"记忆"和"上下文管理"。

- 👉 知识点：[`02-ollama-calling.md`](../knowledge/02-ollama-calling.md)
- 👉 想切云端更强模型测效果（如 Kimi）：[`13-provider-cloud-kimi.md`](../knowledge/13-provider-cloud-kimi.md)（兼容 OpenAI，只动口子 A 的 adapter）

**产出**：一个终端多轮对话脚本，自己维护 `messages` 数组，支持流式打印。

---

## 阶段 2：Agent 核心机制——手搓（重点）

一句话定义：**Agent = LLM + 工具 + 循环**。框架做的一切，本质都是把下面几件事包起来。

### 2.1 Tool / Function Calling 原理
- 用 JSON Schema 定义工具 → 传给模型 → 模型**不执行**，只在 `response.message.tool_calls` 里返回"我想调用 X、参数 Y"。
- **你的代码**真正执行函数，把结果作为 `role:'tool'` 消息回填，再次请求模型。
- 理解"模型决策 / 你执行 / 结果回填"闭环 = Agent 的命门。
- 👉 知识点：[`03-tool-calling.md`](../knowledge/03-tool-calling.md)

### 2.2 Agent Loop 与 ReAct
- 手写 while 循环：模型想调工具就执行并回填，直到给出最终回答；加**最大轮次**防死循环。
- ReAct = Reason + Act 的交替。
- 👉 知识点：[`04-agent-loop-react.md`](../knowledge/04-agent-loop-react.md)

### 2.3 Plan-Execute-Replan（另一种范式）
- 与 ReAct（走一步看一步）对比：先**整体规划**出多步计划，再逐步执行，必要时**重规划**。
- 各自适合什么任务。
- 👉 知识点：[`05-plan-execute-replan.md`](../knowledge/05-plan-execute-replan.md)

### 2.4 上下文管理
- 上下文为什么会爆、怎么截断/摘要/滑动窗口。
- 👉 知识点：[`08-context-management.md`](../knowledge/08-context-management.md)

### 2.5 结构化输出
- 让模型稳定吐 JSON（Ollama `format:'json'` / schema 约束），解析失败如何重试。
- 👉 知识点：[`09-structured-output.md`](../knowledge/09-structured-output.md)

### 2.6 工程化
- 错误处理、超时、重试退避；工具执行的**安全边界**（路径白名单等）。
- 👉 知识点：[`10-tool-safety.md`](../knowledge/10-tool-safety.md)（模型输出不可信、沙箱、人在环、间接 prompt 注入）

### 2.7 扩展点设计（动手前必读）
- 在手搓骨架里留好 5 个"单一收口处"，让将来的可观测、评估、安全策略、成本控制、多 Agent 能无痛接入——现在不实现，只留口子。
- 👉 知识点：[`11-extensibility-seams.md`](../knowledge/11-extensibility-seams.md)

**阶段验收**：能口头解释——Agent 凭什么"会用工具"？循环何时停？上下文怎么不爆？

---

## 阶段 3：进阶能力（仍手搓，按兴趣选）

### 3.1 Memory（记忆）—— 重点理解"为什么这么卷"
- 为什么 Agent 的 Memory 被反复优化：上下文窗口有限且贵、长任务要跨会话持久、相关性/时效性要管理。
- **分级记忆架构**：源头 MemGPT（类操作系统的 RAM/Disk 分层 + 自主分页）；MemoryOS = 3 级（STM/MTM/LPM）；H-MEM = 4 级（按语义抽象度）。
- 著名系统：Hermes Agent（SOUL.md/MEMORY.md/state.db + 反思 pass）、Mem0、Zep、Letta。
- 👉 知识点：[`06-memory-architecture.md`](../knowledge/06-memory-architecture.md)

### 3.2 RAG（检索增强）
- embedding → 切分 → 向量检索 → 拼进 prompt。先用**内存数组手搓**，再上向量库。
- 👉 知识点：[`14-embedding-and-rag-explained.md`](../knowledge/14-embedding-and-rag-explained.md)（**先读，讲透概念**）、[`07-rag.md`](../knowledge/07-rag.md)（查法/实现）、[`12-knowledge-base.md`](../knowledge/12-knowledge-base.md)（被查的知识库：组成/实现/优化）

### 3.3 （了解）多 Agent 编排、MCP、评估与可观测性
- 👉 MCP 知识点：[`15-mcp-explained.md`](../knowledge/15-mcp-explained.md)（给 Agent 插工具的标准接口，不是 Agent 的替代）

---

## 后续维度地图（现在留口子，将来再深入）

理解这条边界（回答"Agent 开发是不是就这些"）：

- **核心原语是稳定的**：`Agent = 无状态 LLM + 工具(03) + 循环(04) + 上下文/记忆管理(06/08)`。后续大部分进阶（多 Agent、复杂规划、各种 Memory 架构、MCP）都是在这些原语上**深入/组合**，不会推翻你现在学的。
- **但有几个横切关注点是新增维度**，不是现有点的延伸，且要求"在每次调模型/每次执行工具处插一脚"——所以**现在就要在骨架里留口子**（见 [`11-extensibility-seams.md`](../knowledge/11-extensibility-seams.md)），将来再填实现：

| 横切维度 | 现在 | 靠哪个口子接入（知识点 11） |
|---|---|---|
| 多供应商 / 模型路由 / 成本预算 | 不做 | 口子 A `callModel` |
| 安全策略 / 人在环 / 审计 | 最小校验（知识点 10） | 口子 B `dispatchTool` |
| 记忆策略（截断/摘要/RAG） | 全量历史 | 口子 C `buildContext` |
| 可观测性 / 链路追踪 | console.log | 口子 D `emit` |
| 评估 / 多 Agent 组合 | 不做 | 口子 E `runAgent`（可注入 + 返回 trace） |

> 一句话：**深入现有点不尴尬，新增没留位置的横切点才尴尬。所以骨架先留好这 5 个收口处，能力以后慢慢长。**

---

## 阶段 4：框架（暂缓，本计划不展开）

等你手搓遇到真实痛点（多供应商适配、复杂状态机、大量集成）再引入。届时再单独出文档说明各框架解决什么、何时用。

---

## 实操案例

### 案例 1（必做）：终端版 ToolAgent —— 巩固阶段 1+2
基于 Ollama 做一个 CLI Agent，给它 3 个工具：
- `getWeather(city)`（先 mock，再接真实 API）
- `calculator(expression)`
- `readFile(path)` / `listDir(path)`（路径白名单做安全限制）

要求**全部手写**：自维护 messages、自写 agent loop、自处理 `tool_calls` 回填、加最大轮次与错误重试。

> 验收：问"北京今天比上海热多少度"，它能**连调两次天气工具再做减法**。跑通即说明 Agent 循环真懂了。

### 案例 2（进阶）：本地文档问答机器人 —— 巩固阶段 3 的 RAG
- 读取一个文件夹的 `.md`/`.txt`，手写切分 → 调 Ollama embedding（如 `nomic-embed-text`）→ **先存内存数组**（`{text, vector}`）。
- 提问时把问题 embedding、算余弦相似度、取 Top-K、拼进 prompt，并让模型**标注引用了哪段**。
> 进阶：内存数组换成 sqlite-vec / LanceDB；再把"检索"包装成**工具**交给案例 1 的 Agent，两个案例打通成"会查资料的 Agent"。

---

## 建议节奏

```
阶段0(补SSE) → 阶段1(Ollama裸调用,1-2天) → 阶段2(手搓Agent,重点,3-5天)
  → 案例1(必做) → 阶段3(RAG优先, Memory理解) → 案例2
  → 遇到真实痛点 → 阶段4按需选框架
```

**忠告**：先手搓再上框架。直接学框架的人，Agent 一出问题完全不会调，因为没理解过那个 while 循环。
