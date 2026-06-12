# 16 · 运行时分层与 Agent Loop 编排

> 阶段 2 进阶。知识点 04/05 讲了 loop 与两种范式，本篇把它们组织成一个**能长大、能换前端、能续跑**的运行时：怎么分层、loop 的决策到底有几条、上下文是持久还是临时、规划该怎么接、谁来决定走不走规划。配套 [11 扩展点](11-extensibility-seams.md) 的 A–E 口子读。

## 1. 分层：I/O 前端不是最顶层

一个常见的错觉是"既然先做 CLI，那 RawTTY 就是最顶层"。这会把**传输层**和**编排层**焊死——等你要加 Web UI 时，"最顶层"就不能是 TTY 了。

正确分层：**前端（I/O）是可替换的适配器，顶层是 App / Session 编排器。**

```
┌─ I/O 前端（可替换）  RawTTY  |  WebSocket/SSE  |  测试 harness ┐
│        ↕ 只负责：读输入、渲染输出、流式 token 回显                │
├─ App / Session 层    管理 sessionId、装配 deps、生命周期、resume  │
├─ AgentLoopManager   route(state)：默认 ReAct，按需升级 Plan-Execute     │
└─ AgentLoop          那个 while 循环（全程只用 A–E 五个口子）        ┘
```

这正是 [口子 E](11-extensibility-seams.md#口子-e) 的精神：`runAgent(input, deps)` 是个**纯函数**，输入 → `{ output, trace }`，依赖外部注入。TTY 只是把 stdin 喂给它、把输出流渲染出来——它**不拥有** loop。

> 一句话：TTY 是"嘴和耳朵"，不是"大脑"。别让大脑长在嘴里。换前端时，loop / Manager / Session 一行不改。

## 2. loop 的决策只有两条：`tool_calls | final`

新手容易把 loop 的决策写成一个大 switch：`final / 调 Tool / 调 MCP / 走 RAG / 查 Memory / 失败`。这是把**两类不同的东西**摆在了同一层，会让 loop 越写越臃肿。拆开看，它们其实塌缩成两条：

| 看似的分支 | 真相 | 落点 |
|---|---|---|
| **final** | 模型本轮没有 tool_calls | loop 出口 |
| **调 Tool** | 模型本轮有 tool_calls | [口子 B](11-extensibility-seams.md#口子-b) `dispatchTool` |
| **调 MCP** | MCP server 暴露的就是 tool，启动时并进 registry | **就是"调 Tool"**，走 B |
| **走 RAG / 查 Memory** | 不是模型回完才决定的（见 §3） | 调模型**前**的 [口子 C](11-extensibility-seams.md#口子-c)，或作为工具回到 B |
| **失败** | 工具/模型异常 | 不分支——错误**回填**成 observation 继续走（知识点 04） |

```
模型本轮输出 →  有 tool_calls ? → 经 B 执行(含 MCP / RAG-as-tool)，结果回填，继续循环
              └ 无 tool_calls ? → final，出口
```

能力全部沉到口子里：RAG/Memory/压缩 → **C（调模型前装配）**；MCP/各种工具 → **B（调模型后执行）**；异常不分支只回填。loop 主体就剩这两条，干净、稳定。Claude Code 这类成熟 Agent 的主循环就是这个样子。

> 纠一个常见措辞：把模型输入列成 `用户输入 + Memory + Tools + Context Engineering` 四个并列项是错的。**Context Engineering 是伞，不是兄弟**——Memory 召回、RAG、历史压缩、排序都是它在 C 里干的活，Memory/RAG 只是它的素材源。真正喂给模型的是 `system(身份/规则/策略) + tool 定义 + 装配后的 messages（C 的产物）`。

## 3. 上下文：持久追加 vs 临时注入——由「来路」决定，不靠运行时猜

loop 里你不需要每次判断"这条上下文要不要存"。生命周期由内容的**来路**结构性决定，两条来路对应两种寿命：

```
经「事件」进来 → append 进 state.history → 持久 + 进 checkpoint
   user 说了 / assistant 输出了 / 工具跑出结果 —— "发生过的事实"(primary event)

经「buildContext 检索」进来 → 每轮现拼、用完即弃 → 临时
   memory 召回 / RAG 片段 / 历史摘要 —— "为本轮临时取来的视图"(derived view)，可再取
```

**判据一句话**：发生了一件事 → 持久；为帮这轮临时取来、且可再取一遍 → 临时。

因为 `buildContext(state)` 是 state 的**纯函数、每轮重跑**，所以"追加上下文"不是特殊操作——你只要改 state，下轮自然反映：

- 工具结果、用户中途插话、子 Agent 返回 → push 进 state → 持久。
- 这轮 RAG/memory 召回 → buildContext 当场拼进返回的 messages，**不写回 state** → 临时。

这套能干净支持"追加"，靠的正是把**会话事实（state）** 和 **本轮呈现（buildContext 产物）** 解耦。若把 messages 当全局数组到处 push，这个区分就做不出来。

> 灰色地带——超大工具结果：默认工具结果持久（模型基于它推理过、resume 要用），但太大时**持久化摘要/引用、原文留外部可再取**（知识点 08 的"工具结果裁剪"）。

## 4. ReAct 与 Plan-Execute 是嵌套，不是平行兄弟

`AgentLoopManager` 在两种范式间切换（Strategy 模式）作为**接缝**没问题，但要清楚二者真实关系（知识点 05 §4 也点了）：**ReActLoop 是原子，Plan-Execute 是包在它外面的编排。**

```
PlanExecuteLoop 不是另一种 ReActLoop，而是用它搭起来的一层：
  plan = planner(goal)
  for step in plan:
      result = ReActLoop.run(step)   ← 每个步骤的执行器，本身就是一个 ReAct 小循环
      done.push(result)
      plan = replanner(goal, done)   ← 重规划
```

Manager 选"模式"OK，但内部应是**组合关系**，不是两套互不相干的循环各写一遍。

**入门建议**：先只做 `AgentReActLoop`，把规划做成一个工具试水（见 §5）；`AgentLoopManager` 暴露一个 **`route(state)`**——**默认返回 ReAct，仅在按需判定该任务要全局规划时才升级到 `PlanExecuteLoop`**（判定怎么做见 §5.3）。不要用静态的"`mode` 配置开关"在两种 loop 间切换：那等于整个会话被钉死成一种范式，背离了"需要时才用 Plan-Execute"。等真有复杂长任务再补 `PlanExecuteLoop`，别一上来写两套引擎。

## 5. 规划接入：三档 + 谁来决定走规划

### 5.1 "plan 作为工具"有三档，别一上来选最重的

工具就是个函数，函数里可以调 LLM、调子 Agent（这正是 [口子 E](11-extensibility-seams.md#口子-e) 的 agent-as-tool）。但"规划"多半**不需要**工具去调 LLM：

| 档次 | 谁来规划 | plan 工具干啥 | 何时用 |
|---|---|---|---|
| **① 纯上下文规划** | 主循环模型在回复里写出计划 | 不需要工具 | 最省，先试 |
| **② 哑工具记录**（TodoWrite 式） | **还是主模型**把计划当 tool 参数吐出来 | 只**存/回显**进上下文当锚点，**不调 LLM** | 推荐默认 |
| **③ planner 子 Agent** | 工具内部**另起一个 LLM**专门规划 | 调 LLM/子 Agent | 想用不同 prompt/更便宜模型/强隔离时，即 `PlanExecuteLoop` |

关键认知：**你的主循环本身就是 LLM**，让它规划无需"再调一个 LLM"——它在自己输出里就能规划，`write_plan` 工具往往是个**哑工具**，只把计划钉进上下文当锚点（还能后续更新）。这就是 Claude Code 的做法。只有要"独立 planner 模型/prompt"时才走 ③。

### 5.2 loop 怎么判断走不走 plan？——**loop 不判断**

判断权交出去，两个位置，**都不在 loop 体内**：

| 方案 | 谁决定 | 怎么做 | 评价 |
|---|---|---|---|
| **模型决定**（ReAct 原生） | 模型 | plan 工具放进工具集 + **system prompt 常驻指令**"复杂多步任务先调 write_plan" + 工具描述写明何时用。模型拿每个任务对照指令**自我分类** | 推荐起步；loop 零特判，维持 §2 的两分支 |
| **代码决定**（编排器） | AgentLoopManager | 进 loop **前**跑个便宜 router/分类，或启发式（长度/关键词）→ 选 ReAct 还是 PlanExecute，或对复杂任务**强制第 1 轮调 plan** | 复杂任务多了、或弱模型不听话时上 |

> ⚠️ **重要现实**：模型不会自发"觉悟"某任务很大就去规划——它规划是因为 **system prompt 这条常驻指令叫它对大任务先规划**，它在对照分类。所以你不用每条用户消息都要求规划，把"大任务先规划"烤进 system prompt 一次即可。
>
> 而这种"模型自决"的可靠性**随模型能力下降而崩**：Claude 等前沿模型遵循得好；**本地 Ollama（llama3.1 等）很可能跟不住**——这时更应转向"代码决定"（router 或强制规划），别指望它自觉。这是两方案的现实分界线。

### 5.3 `route()` 的升级判定具体怎么做

把 §5.2 的"代码决定"那格钻深：`route(state)` 本质是一个**分类/路由决策**——把"这个任务"映射到"需不需要全局先规划？"。这正是 Anthropic《Building Effective Agents》里的 **Routing（路由）工作流**：先分类输入，再分派到对应处理路径。按"成本/智能"从低到高有四档：

| 档 | 怎么判定 | 原理 | 优 / 劣 |
|---|---|---|---|
| **① 启发式/规则**（最便宜，无 LLM） | 输入长度/token 阈值、关键词（"重构整个/迁移/逐个/分多步"）、是否枚举了步骤、是否涉及多文件 | 纯规则匹配，零延迟零成本 | 免费、确定性 / 脆、易误判 |
| **② LLM 分类器 / router**（进 loop 前一次便宜调用） | 用小模型问："这是简单任务还是需多步规划的复杂任务？"结构化输出 `{complexity}`（09） | 语义判断，Routing 模式的标准做法 | 灵活语义 / 多一次往返+成本、也会错 |
| **③ 模型自决（=plan-as-tool，推荐默认）** | 不在代码里 route：给模型 plan 工具 + system prompt 常驻指令，让它自己分类（即 §5.2"模型决定"） | 判定让给主模型，规划作为一次工具调用自然发生 | 无独立 router、最简 / 弱模型不可靠 |
| **④ 动态升级（按信号）** | 先跑 ReAct，loop 检测到"绕路"（步数超标/重复调同工具/无进展）才中途升级到 Plan-Execute | start simple，出问题才付规划成本 | 只在真需要时花钱 / 要进度信号、最复杂 |

**怎么选**：
- 对**强模型**，最佳是 **③**——`route()` 恒返回 ReAct，规划作为工具发生，代码不判定。
- `route()` 里的代码判定（①②④）主要是给**弱模型兜底**（本地 Ollama 不会稳定自觉规划，才替它判一次）。
- 入门顺序：先 ③（恒 ReAct）跑通 → 不够再加 ① 启发式 → 还不够上 ② LLM router 或 ④ 动态升级。
- 无论哪档，**判定永远在 loop 外、进 loop 前**；loop 主体始终只有 `tool_calls | final` 两分支（§2）。

> 工程落点：`src/loop/manager.ts` 的 `route(state)`，当前恒返回 react（对应 ③）；要升级就在此加 ①/②/④ 的判定，复杂任务 `return planExecute`。详见 `docs/roadmap/phase-2-capability-optimization.md` F1。

## 6. resume 是一条启动路径，不是一个 Manager

很多人会想再立一个 `ResumeManager` 去"重启 TTY + 恢复上下文"。这把**两件不同责任**揉在了一起：

- **加载状态** = 持久化职责 → 归 `CheckpointStore.load`（见 [17 检查点](17-collection-context-memory-trace-checkpoint.md)）。
- **重建运行时/前端** = App 启动职责 → 归 App/Session 层。

而且 **TTY 不需要"被恢复"**：resume 要恢复的只有**会话状态**（messages、plan 游标），TTY 跟冷启动一样正常起即可。所以 resume 就是 App 的一条启动分支，不必单立类：

```
agent-cli                 → 新 session：initState
agent-cli --resume <id>   → App 调 store.load(id) → 拿 state → 正常起 TTY
                            → 注入 runAgent → 下一个 run 接着跑
```

`save`/`load` 由一个可注入的 `CheckpointStore` 收口（文件/SQLite/PG 可换），resume 是读它的一条代码路径。检查点存什么、event sourcing / replay / 幂等等细节，全在 [17](17-collection-context-memory-trace-checkpoint.md)。

---

**关联**：[04 ReAct](04-agent-loop-react.md)、[05 Plan-Execute](05-plan-execute-replan.md)（本篇的两种范式）、[08 上下文管理](08-context-management.md)（§3 的压缩）、[11 扩展点](11-extensibility-seams.md)（A–E 口子）、[17 四类收集](17-collection-context-memory-trace-checkpoint.md)（§6 的 checkpoint 数据模型）。

## 延伸阅读
- 📄 [Anthropic《Building Effective Agents》](https://www.anthropic.com/engineering/building-effective-agents) —— 工作流 vs Agent、何时该用编排、"先求简单"。
- 📄 [Anthropic《Effective Context Engineering for AI Agents》](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) —— push/pull、just-in-time 检索、压缩。
- 💻 [Anthropic Cookbook · agents patterns](https://github.com/anthropics/anthropic-cookbook/tree/main/patterns/agents) —— 可运行的编排模式。
