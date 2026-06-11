# 17 · 四类收集：Context / Memory / Checkpoint / Trace

> 阶段 2–3 横切。一个 Agent 跑起来会在很多地方做"收集"，最容易被混为一谈的是这四个：**Context（给模型现在想）、Memory（给模型以后记）、Checkpoint（给机器恢复）、Trace（给人/评估看）**。它们原料同源、用途相反。本篇讲清各收集什么、谁用、怎么用、策略差异、市面做法，末尾附术语表。配 [11 扩展点](11-extensibility-seams.md) 的口子 D（emit）读。

## 1. 心智模型：一条事件流，四个 sink

它们的原料是**同一份**——loop 每一步产生的事件（[口子 D](11-extensibility-seams.md#口子-d) `emit`：model_call / tool_call / step_done / error…）。区别在于各自订阅后**用不同策略落到不同地方、给不同人用**。所以正确架构是 **"在口子处采集一次，扇出给多个 sink"**，不是在四处各采一遍。这就是事件溯源里"一份事件日志喂多个投影(projection)"的思路。

```
            loop 事件 (emit)
                  │ 采集一次
   ┌────────────┬─┴──────────┬──────────────┐
Context     Checkpoint     Trace          Memory
(现在想)     (机器恢复)     (人/评估看)     (以后记)
```

> 注意：**Context 不订阅事件流**，它是每轮由 `buildContext` 从 state + memory **现拼**的；Checkpoint / Trace / Memory 才是事件流的 sink。这条线划清，四者就不再纠缠。

## 2. 四者对比（核心）

| 维度 | **Context 上下文** | **Memory 记忆** | **Checkpoint 检查点** | **Trace 追踪** |
|---|---|---|---|---|
| **收集什么** | 本次调模型的工作集：system + tool 定义 + (压缩后)历史 + 召回片段 + 当前输入 | **蒸馏过的**耐久事实：用户偏好、关键结论、学到的流程、实体信息 | **完整可序列化状态**：messages、plan+游标、step、status、pendingToolCalls | **每个事件 + 元数据**：prompt/响应/token/耗时/成本、工具入参出参、错误、决策 |
| **形态** | 一个 prompt（瞬时） | 少而精，人/模型策展 | 一份快照 or 每步一条 | 细粒度、追加、不可变（span） |
| **生命周期** | 瞬时，**每轮重建** | 长期、跨会话 | 活到"可能恢复"为止，常完成即清 | 保留分析窗口（天/周），常采样 |
| **作用域** | 当前 turn | 跨会话（用户/Agent 级） | session / thread | run / span，常分布式 |
| **可变性** | 重算（故意有损） | 更新 / 巩固 / 遗忘 | 覆盖或追加，最新为准 | **只追加、不可变** |
| **完整性** | 装得下窗口即可（lossy） | 选择性 | **必须完整且一致**（每步原子） | 可采样、可有损 |
| **谁读** | **LLM 自己**（它就是输入） | buildContext（召回）→ 喂回 Context | **运行时**（resume 时回灌） | **人 / 流水线**，运行时不读 |
| **何时读** | 每轮、同步 | 召回时（装配上下文中） | 仅崩溃/重启恢复时 | 离线 / 异步 |

**一句话钉死本质区别：**
- **Context** = 给模型**现在**思考 → 瞬时、卡 token 预算、每轮重建。
- **Memory** = 给模型**以后**记得 → 策展、耐久、被召回进 Context。
- **Checkpoint** = 给**机器**精确恢复 → 完整、一致、resume 时回灌。
- **Trace** = 给**人/评估**理解与度量 → 不可变、可采样、运行时绝不回读。

> 最易混的是 **Checkpoint vs Trace**：都"记录每一步"，但 Checkpoint 是**给机器读来续跑**（必须完整、写完即可恢复、最新为准），Trace 是**给人读来 debug/评估**（可丢可采样、永不被 loop 读回）。原料同源，用途相反。

## 3. 还有别的收集吗？有

| 收集物 | 收集什么 | 谁用 / 怎么用 |
|---|---|---|
| **Scratchpad / 工作记忆** | 本 run 内的中间推理、todo、半成品（可落成 agent 写的文件） | 模型自己（介于 Context 与 Memory 之间）；长任务外置成文件省 token |
| **Artifacts / 产物** | 真正交付物：写的代码、生成的文件 | 用户 / 文件系统；这是结果，不是过程记录 |
| **Cost / Usage 账本** | token、$、限流计数 | 预算控制（口子 A）；常从 Trace 派生但单独算 |
| **Cache** | prompt cache、工具结果缓存 | 降本提速；命中则跳过调用 |
| **Audit log 审计** | Trace 中**安全相关**子集，不可变 | 合规 / 安全复盘（口子 B + 知识点 10） |
| **Eval 数据集 / 反馈** | Trace + 人工标注 | 离线评估 / 微调，回灌改进 Agent |

## 4. 收集后各方"具体怎么用"

- **Context** → 直接交给 `callModel`，它**就是** prompt，模型读完产出下一步。
- **Memory** → 两条链：写入侧有个（常异步的）**巩固/抽取**步骤，从历史/Trace 提炼成 memory；读出侧由 `buildContext` 在调模型前**召回**相关条目拼进 Context。即 **Memory 经 Context 间接喂给模型**，模型不直接读裸库（除非给它 recall 工具）。
- **Checkpoint** → 仅在 `--resume` 启动路径：App 调 `store.load(sessionId)` → 回灌 state → 注入 loop 接着跑。
- **Trace** → 三类消费者：① 人用 trace viewer 看链路 debug；② 监控面板看成本/延迟/错误率；③ 评估流水线**离线 replay + 打分**。

## 5. 市面优秀做法

| 领域 | 代表 | 借鉴点 |
|---|---|---|
| **Trace / 可观测** | OpenTelemetry GenAI 语义约定、LangSmith、Langfuse、Arize Phoenix、Braintrust、W&B Weave | span 模型、OTel 对齐、采样、可回放 |
| **Checkpoint / 持久执行** | LangGraph checkpointer（thread + 每步）、Temporal、Restate、DBOS | **事件溯源 + replay** 是核心；幂等 |
| **Memory** | MemGPT/Letta（OS 式换入换出）、mem0、Zep（时序知识图谱）、LangGraph store | 抽取→索引(向量/图)→召回，带衰减/冲突消解 |
| **Context** | Anthropic《Effective Context Engineering》 | just-in-time 检索、子 Agent 摘要、compaction |

## 6. Checkpoint / Resume 数据模型（细节）

### 6.1 粒度三级

```
Session / Thread   一整段会话 = sessionId = 真正的恢复单位
   └─ Run / Turn    一次「用户输入 → final」的完整应答（内部含多次循环）
        └─ Step      循环里的一轮（1 次 callModel + 若干 tool 执行）
```

**存档粒度 = Step**：每走一轮 loop 存一次，崩溃恢复从最近完成的 step 接上。

### 6.2 API 砍到两个方法

状态是**累积**的——session 最新快照已包含到当前 step 的一切（system、完整 messages、plan 游标、step 计数）。所以不存在"只存一个 step 而不带 session 顶层数据"的情况，`save` 与所谓 `saveRun` 是同一操作：

```js
interface CheckpointStore {       // 一个可注入的 store（即口子 E 说的）
  load(sessionId): State | null   // resume 时读最新快照
  save(sessionId, state): void     // 每个 step 结束调一次
}
```

不提供 `load(step)`——理由：**状态累积、单步不自洽**。

### 6.3 state 里装什么

```
sessionId
config / systemPrompt        （或其 hash/引用，省空间）
mode                         react | plan-execute
messages[]                   完整对话历史（resume 的核心）
plan + cursor + done[]       仅 plan-execute 模式需要
step                         计数
status                       running | awaiting_approval | done | failed
pendingToolCalls[]           ★ 崩溃在"模型已要求调工具、但工具还没执行完"时用
```

### 6.4 两种存储模型

| 模型 | 怎么存 | 优点 | 缺点 |
|---|---|---|---|
| **快照覆盖** | `checkpoints/{sessionId}.json`，每 step 覆盖 | 极简，resume=读最新 | 无历史、不能时间旅行 |
| **追加日志（事件溯源）** | 每 step 追加一条 `(sessionId, stepId, state)` | resume 读最新；**白送**可观测/回放/eval/时间旅行 | 略复杂 |

**推荐追加日志**：它让"持久化 + 可观测（Trace）+ 评估数据采集"用**同一条事件流**实现——这正是 §1 "一处采集多处投影"的落地。入门可先用快照覆盖把 resume 跑通，留好"save 即一个 emit sink"的口子，回头升级不动 loop。LangGraph 的 checkpointer（per-thread per-step）就是这个路子。

### 6.5 必须警惕：工具中途崩溃的幂等坑

最危险的时刻——**模型已返回 tool_call、工具是有副作用的操作（发邮件/扣款/写文件）、执行到一半进程挂了**。resume（=replay）时若 `pendingToolCalls` 没标状态，会**重发一遍**。对策（按强度）：

1. `pendingToolCalls` 连同状态（`requested / running / done`）一起存进 state；
2. 有副作用的工具做成**幂等**（带幂等键，check-before-act）；
3. resume 时对 `running` 状态的工具不盲目重放，先查"是否已生效"。

这条和 [口子 B](11-extensibility-seams.md#口子-b) 连着（幂等校验/审批中断都挂 B）。

## 7. 落到你架构的最终建议：一处采集，多处投影

在口子 A/B/C/D 处 `emit` 一次结构化事件，挂多个 sink，各用各的策略：

```
emit(event) ──┬─→ checkpointSink:  累积进 state，每 step store.save()    （完整、最新为准）
              ├─→ traceSink:       append 不可变日志 / OTel span         （可采样）
              ├─→ memorySink:      （异步）够格的事实抽取进 memory 库      （策展）
              └─→ (Context 不是 sink：每轮由 buildContext 从 state+memory 现拼)
```

### 7.1 一致性：会不会"上轮发的事件，下轮还没落好就被查"？

这是用扇出式收集时最自然的担忧——某 sink 异步落数据，下一轮 loop 抢先查到旧数据。结论：**正常运行里不会发生**，因为有个结构性前提——

> **loop 的真相源是内存里的 `state`，不是任何 sink。** sink 是从 state 写出去的镜像/投影。下一轮做决策时读的是同步改过的内存 state，**不去查 sink**。

```js
state = appendTurn(state, res, results)   // 1. 先改内存 state（权威真相，同步）
await store.save(sessionId, state)         // 2. checkpoint：critical path，await 落盘
emit(event)                                // 3. 扇给异步 sink（trace/memory）：fire-and-forget
// 下一轮 buildContext(state) 读第 1 步的内存 state，不读任何 sink
```

race 只在「**既异步写、又被运行中的 loop 读回**」时才存在。挨个 sink 看，几乎没有：

| sink | 被运行中的 loop 读回？ | 写得异步？ | 有 race？ |
|---|---|---|---|
| **Checkpoint** | ❌ 只在冷启动 resume 读一次，运行中只写不读 | 应**同步落盘**（critical path） | **无**，读写时机错开 |
| **Context** | 不是 sink，读内存 state | 内存改是同步的 | **无** |
| **Trace** | ❌ loop 永不读回 | 异步 fire-and-forget | **无**（最终一致即可） |
| **Memory** | ✅ 会被 buildContext 召回 | 巩固/抽取常异步 | 唯一可能"读到旧"，**但无害** |

- **Checkpoint**：loop 不会下一轮去查它，只在进程重启时读一次，运行中只写。
- **Memory** 是唯一可能"召不到刚发生的事实"的——**但无害**：那条事实此刻还在 live message 历史里（Context 已带着它），模型这轮不缺它；Memory 本就为跨轮/跨会话服务，"最终一致"正是它该有的语义。真要 read-your-writes，就把那条写成同步、或先写内存层再异步刷。
- **异步 checkpoint**（图性能）：崩在"内存已 step N、checkpoint 未落 N"之间 → resume 从 N-1 **replay 重做 step N**。这不是 race，是重放，只要 step N 幂等（§6.5）就安全。

**对单进程 CLI 的实操**：你现在单线程、emit 天然有序，最省事就是**全程同步顺序执行**，上述担忧一个都不出现。async 一致性真正成问题，是等 sink 挪到网络外（远程 trace/memory）或并行化 worker 时——那时再补两件事：① critical path 分流（checkpoint 同步 await，trace/memory 异步）；② 每事件带单调 seq/step 号，让异步消费者按序重排。

> 一句话：**loop 永不靠 sink 做决策，只靠内存 state；sink 是写给别人用的投影。** 这正是事件溯源/CQRS 的"写模型权威、读模型最终一致"。

## 8. 术语表

| 名词 | 解释 |
|---|---|
| **span（跨度）** | 追踪里一段带"起止时间 + 名字 + 属性 + 父链"的工作单元。一次 run 是根 span，每次 model_call / tool_call 是子 span，组成一棵树，刻画耗时与嵌套 |
| **OTel 对齐** | OpenTelemetry 是追踪/指标/日志的开放标准。"对齐"= 按它的格式输出 trace，任何兼容后端（Jaeger / Langfuse…）都能接。GenAI 语义约定 = LLM 调用属性名（model、tokens 等）的统一规范 |
| **事件溯源（event sourcing）** | 状态不存"当前快照"，而存"只追加的事件日志"；当前状态 = 把事件从头折叠/重放出来。天生可审计、可时间旅行 |
| **replay（重放）** | 从事件日志/检查点重新执行以重建状态或重跑逻辑。resume 本质就是 replay 到最近检查点 |
| **幂等（idempotency）** | 同一操作执行 1 次和 N 次结果一样。有副作用的工具必须幂等，replay/重试才安全 |
| **衰减 / 冲突消解** | Memory 里：让旧记忆随时间降权淡出（衰减）；新旧记忆矛盾时（用户改了偏好）决定谁胜/如何合并（冲突消解） |
| **just-in-time 检索** | 用到时才取，而非预先全塞进去——即 push/pull 中的 pull 模型（[16 §3](16-runtime-layering-and-loop.md)） |
| **compaction（紧实化）** | 历史膨胀时压成摘要、腾出窗口又保住关键事实（Claude Code 会做；知识点 08 的摘要压缩） |
| **子 Agent 摘要** | 派子 Agent 干重活（读一堆文件），只让它回**短摘要**给主 Agent，主上下文保持精简 |
| **critical path（关键路径）** | 必须**同步完成**、下一步才能继续的操作。checkpoint 落盘在关键路径上（要 await）；trace/memory 写不在，可异步 fire-and-forget |
| **CQRS** | Command Query Responsibility Segregation：**写模型**（权威、强一致，这里=内存 state + checkpoint）与**读模型**（投影、最终一致，这里=trace/memory）分离。loop 只在写模型上做决策，sink 是读模型（[§7.1](#71-一致性会不会上轮发的事件下轮还没落好就被查)） |

---

**关联**：[06 Memory](06-memory-architecture.md)、[08 上下文管理](08-context-management.md)、[10 安全护栏](10-tool-safety.md)（审计/幂等）、[11 扩展点 §5](11-extensibility-seams.md)（持久化口子）、[16 运行时分层](16-runtime-layering-and-loop.md)（resume 启动路径）。

## 延伸阅读
- 📄 [OpenTelemetry GenAI 语义约定](https://opentelemetry.io/docs/specs/semconv/gen-ai/) —— LLM 调用 trace 的标准属性。
- 📄 [LangGraph Persistence 文档](https://docs.langchain.com/oss/python/langgraph/persistence) —— 工业级 checkpointer / thread / 时间旅行。
- 📄 [Durable Execution: Agents That Survive Failure and Resume](https://vadim.blog/durable-execution-agents-that-survive-failure-and-resume-where-they-left-off) —— 持久执行 vs 内存重试、幂等。
- 📄 [Anthropic《Effective Context Engineering for AI Agents》](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) —— just-in-time 检索、compaction、子 Agent 摘要。
