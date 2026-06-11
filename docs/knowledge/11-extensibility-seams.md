# 11 · 扩展点 / 接缝设计（为未来留口子）

> 阶段 2 必读。你现在**不实现**可观测、评估、安全策略、成本控制、多 Agent——但你要在手搓的代码里**留好它们将来的接入点**。本篇就是这份"口子清单"。

## 0. 为什么这篇最重要

回顾一个区分：
- **深入/优化现有点**（把 Memory 做得更好、检索更准）——事后做**不会让你尴尬**，因为接口还是那几个。
- **新增一个当初没留位置的横切关注点**（可观测、评估、安全策略、成本、多 Agent）——事后做**会逼你重写**。

为什么？因为这些横切能力的共同特征是：**它们要在"每一次 LLM 调用"和"每一次工具执行"处都插一脚。** 如果你的代码里这两件事散落在十几个地方各写各的，将来想统一加一层就得改十几处；如果它们各自只有**一个收口处**，将来加能力就是改一个函数。

**结论：你现在唯一要做的，就是把"调模型"和"执行工具"各自收敛到单一入口，并让 Agent 的输入输出干净可注入。** 这几个口子留好，你就有了无限往上长的空间，而代价几乎为零。

## 1. 五个核心口子

### 口子 A：单一"调模型"入口 `callModel()`
把所有对 Ollama 的调用，**全部**经过一个函数，而不是到处 `ollama.chat(...)`。

```js
async function callModel({ messages, tools, model = CONFIG.model }) {
  // 现在：就是转发
  return ollama.chat({ model, messages, tools, options: CONFIG.options })
}
```

**将来不改 loop 就能加**：换供应商（内部换 adapter，知识点 03）、成本/token 统计与预算上限、模型路由（简单任务走小模型）、结果缓存、重试退避、对"模型调用"这一步的 tracing。
**不留的代价**：上述每一项都要改遍全代码。

### 口子 B：单一"执行工具"入口 `dispatchTool()`
模型请求的每个工具，**都经过这一个派发函数**执行，绝不在 loop 里直接 `registry[name](args)`。

```js
async function dispatchTool(call, ctx) {
  const tool = registry[call.function.name]
  if (!tool) return { error: 'unknown tool' }
  // ↓↓↓ 将来所有"执行前/后"的横切逻辑都挂在这里 ↓↓↓
  // 1) 参数校验(知识点09)  2) 权限/确认(知识点10)  3) 超时  4) tracing
  return tool.run(call.function.arguments, ctx)
}
```

**将来不改 loop 就能加**：参数校验、人在环确认、沙箱/权限策略、限流、对"工具执行"这一步的 tracing——全部集中在这一个函数。
**不留的代价**：安全和审计是横切的，散落后无法统一保证。

### 口子 C：上下文构造器 `buildContext(state)`
loop 不直接操作 `messages` 数组，而是调用一个"根据当前状态产出本次要发送的 messages"的函数。

```js
function buildContext(state) {
  // 现在：原样返回全部历史
  return [state.system, ...state.history]
  // 将来：截断 / 摘要 / RAG 检索（知识点 06/08），loop 完全无感
}
```

**将来不改 loop 就能加**：任意 Memory 策略（截断、摘要巩固、向量检索召回）。这正好接住你之前那两个想法（发前筛选 / RAG 化）——它们都只改这一个函数。
**不留的代价**：Memory 逻辑和循环逻辑缠在一起，难替换、难比较不同策略。

### 口子 D：事件/追踪钩子 `emit(event)`
loop 的每个关键节点（开始、调模型、收到 tool_calls、执行某工具、结束）发一个事件，而不是 `console.log` 散落各处。

```js
function emit(event) { /* 现在：console.log(event)；将来：写 trace / 指标 / 落库 */ }
// 用法：emit({ type:'tool_call', name, args, step })
```

**将来不改 loop 就能加**：可观测性/链路追踪、调试回放、**以及评估所需的数据采集**（每一步都有结构化记录）。
**不留的代价**：可观测和评估都依赖"全过程结构化记录"，事后补等于给每个节点重新埋点。

### 口子 E：干净、可注入的 Agent 入口 `runAgent(input, deps)`
把 Agent 做成一个**纯粹的函数**：输入 → `{ output, trace }`，并且**依赖（模型客户端等）从外部注入**，不在内部写死。

```js
async function runAgent(input, deps = { callModel, dispatchTool, buildContext, emit }) {
  // ... loop，全程只用 deps 里的四个口子 ...
  return { output, trace }   // 返回结构化结果，含全过程 trace
}
```

**将来不改 loop 就能加**：
- **评估/测试**：注入一个 mock 的 `callModel` 就能离线、确定性地测 Agent；返回的 `trace` 就是评估素材。
- **多 Agent**：因为 Agent 是"输入→输出"的统一单元，它可以**被包装成另一个 Agent 的一个工具**（`tool.run = (args) => runAgent(args.task)`），多 Agent 编排自然成立。
**不留的代价**：依赖写死 → 无法 mock → 无法自动化评估；输入输出不规整 → 无法把 Agent 当积木组合。

## 2. 一张映射表（口子 ↔ 将来的能力）

| 留的口子 | 现在 | 将来在这里长出 |
|---|---|---|
| A `callModel` | 转发 ollama | 多供应商、成本/预算、模型路由、缓存、重试 |
| B `dispatchTool` | 执行工具 | 校验、人在环、沙箱、限流、审计（知识点 10） |
| C `buildContext` | 返回全历史 | 截断/摘要/RAG 等 Memory 策略（知识点 06/08） |
| D `emit` | console.log | 可观测、追踪回放、评估数据采集 |
| E `runAgent(注入+返回trace)` | 跑循环 | 自动化评估、多 Agent 组合 |

## 3. 配置外置（小但有用）

模型名、各种上限（maxSteps、超时、token 预算）放进一个 `CONFIG` 对象/环境变量，别散落成魔法值。将来模型路由、不同环境配置都从这里改。

## 4. 把握分寸：留口子 ≠ 过度设计

- **要做的**：上面 A–E 五个**单一收口** + 配置外置。它们都是"现在就是一行转发，几乎零成本"，却换来无限扩展空间。
- **不要做的**：现在就去实现插件系统、抽象出十层接口、为还没出现的需求写空壳。**留的是"一个函数收口"，不是"一套框架"。** 收口处函数体现在越简单越好，复杂度等真需要时再往里加。

> 判断标准：如果某个未来能力要求"在每次调模型/每次执行工具处都插一脚"，那它就需要一个口子（A 或 B/D）；如果它只是"把某个步骤做得更好"，那不需要预留，将来直接改那个步骤即可。

## 5. 进阶：持久化与断点续跑（checkpoint / resume）

长任务（几十步、跑几分钟甚至更久）一旦进程崩溃、被杀、或要人工审批中断，**不能从头再跑一遍**（浪费时间和 token，副作用还可能重复）。解法叫 **durable execution（持久执行）**：**每完成一个逻辑步骤，就把 Agent 的状态存到持久存储；崩溃/重启后从最近的检查点（checkpoint）恢复（resume），而不是从头。**

它和口子 E 天然契合：`runAgent` 既然已经把状态收敛、并返回 `trace`，只要再做两件事就能支持续跑——
1. **每步存档**：在 loop 每轮结束（或每次工具执行后）把当前状态（messages、已完成步骤、游标）写入存储（文件 / SQLite / Postgres），打上 `thread_id`。
2. **启动时尝试恢复**：`runAgent` 开始先按 `thread_id` 读最近 checkpoint，有就接着跑，没有就从头。

```js
async function runAgent(input, { threadId, store, ...deps }) {
  let state = (await store.load(threadId)) ?? initState(input)   // 尝试恢复
  while (!state.done && state.step < MAX_STEPS) {
    state = await stepOnce(state, deps)        // 走一步
    await store.save(threadId, state)          // 每步存档 ← 断点续跑的关键
  }
  return state.output
}
```

**要注意的坑（重要）**：恢复通常是**重放整个步骤**，不是"从崩溃那行源码接着跑"。所以**有副作用的步骤必须幂等**（重复执行结果一致），否则续跑会重复发邮件/重复扣款。这点和知识点 10 的安全是连着的。

> 入门不必现在就实现，但**口子 E 的"状态收敛 + 可注入 store"先留好**，将来加持久化就是补 `store.load/save` 两行，不动 loop 主体。
>
> 📎 完整的检查点数据模型（state 装什么、快照 vs 追加日志、幂等坑、三级粒度 Session/Run/Step）见 [17 §6](17-collection-context-memory-trace-checkpoint.md)；resume 作为启动路径的分层见 [16 §6](16-runtime-layering-and-loop.md)。

---

**关联**：知识点 03（A 的供应商 adapter）、06/08（C 的 Memory 策略）、09/10（B 的校验与安全）。案例 1 建议直接按 A–E 搭骨架。

## 延伸阅读（持久化 / 断点续跑）
- 📄 [LangGraph Persistence 文档](https://docs.langchain.com/oss/python/langgraph/persistence) —— 工业级 checkpointer/thread/时间旅行的设计，概念可直接借鉴（即便你不用 LangGraph）。
- 📄 [Durable Execution: Agents That Survive Failure and Resume](https://vadim.blog/durable-execution-agents-that-survive-failure-and-resume-where-they-left-off) —— 把"持久执行 vs 内存重试"和幂等问题讲清楚。
