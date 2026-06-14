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

## 7. 中断 / 取消（interrupt / cancel）

用户按 Esc 想打断正在跑的 Agent。先分清**中断的三个对象**——难度和机制都不同：

| 对象 | 中断什么 | 机制 |
|---|---|---|
| **① loop 本身** | 我们自己的循环 | 循环每轮顶部查 `signal.aborted`，置位就 break（源码是我们的，简单） |
| **② 在途的 LLM 调用** | 正在等模型返回的那次请求 | **传输层 abort**，不是"模型功能"（见下） |
| **③ 在途的工具执行** | 正跑的命令/IO | 把 signal 传给工具 / kill 子进程 |

### 7.1 LLM 调用怎么中断——是传输层 abort，不是模型功能

一次 LLM 调用本质是个（常为 SSE 流式的）HTTP 请求。中断它靠 Web 标准的 **`AbortController` / `AbortSignal`**：`fetch(url, { signal })`、OpenAI SDK 的 `create(params, { signal })`、Ollama 都支持。**模型没有"停下来把已想的给我"这种 API**——你切断的是连接与等待。

两个反直觉点：
- **abort 只保证"我不再等/不再收"，不保证服务端立刻停、也不保证不计费**（通常按已生成 token 计）。
- **流式才有"已出半句"可用**，中断体验才顺滑；非流式中断 = 白跑一次。所以**中断与流式是一对**。

### 7.2 Controller（触发） vs Signal（接收）——别混

这是设计上最容易错的地方：

- **`AbortController` = 触发端**：谁 `.abort()`。**集中存一份、在中断源触发，不要透传。**
- **`AbortSignal`（`controller.signal`） = 接收端**：**必须交给要取消的操作**（provider 里的 fetch、工具的 IO）。fetch 消费的是 signal。

所以问题不是"传不传 controller"（不传），而是"**signal 怎么到达 fetch 调用点**"。

### 7.3 归属：Controller 在 App，TTY 只触发，signal 搭已有载体的车

- **Controller 存在 App/Session**（它本就管 run 生命周期），**不能存在 RawTTY**——否则 provider（口子 A）要取 signal 就反向依赖了前端，破坏"前端可替换"分层（§1）。
- **RawTTY 只负责"按 Esc → 喊一声 interrupt"**，由 App 去 `abort()`。
- **signal 不是新加一堆参数**，而是挂在**本来就流到那里的对象**上：`ModelRequest.signal`（provider 取来喂 fetch）、`ToolContext.signal`（工具自觉响应）。几乎零额外管道。

```
TTY 按 Esc ──interrupt 事件──► App 持有的 AbortController.abort()
                                      │ controller.signal
   ┌──────────────┬───────────────────┴───────────────────┐
loop 顶部查 aborted   ModelRequest.signal → provider → fetch    ToolContext.signal → 工具/子进程
（①）                （②，传输层 abort）                       （③）
```

### 7.4 取消作用域树（cancellation scope tree）—— 不是一个 signal，是一棵

你一开始没考虑到的，正是这点：真实 Agent 里**不是一个 controller，而是一棵取消作用域树**，结构与"运行的嵌套结构"同形：

```
run scope（App 每个 run 一个 controller） ← 用户按 Esc abort 这里
   ├─ model call      （直接用 run signal）
   ├─ tool A scope     = run signal ∪ 自己的超时        ← 超时只杀 A，不连累 run
   ├─ tool B scope     = run signal ∪ 自己的超时
   └─ sub-agent scope（将来）= run signal ∪ 子自己的预算  ← 父 abort 级联到子；子超时不连累父
```

规则两条：
1. **父 abort → 级联到整棵子树**（打断 run，里面所有在途 model/tool 一起停）。
2. **子 abort（如某工具超时）→ 只杀自己这棵，不波及父和兄弟**。

一个"存在某处的全局 signal"表达不了这种**级联 + 局部隔离**；它要的是**每个操作一个、按父子组合**的 signal。这就是为什么 signal 要"挂在 request/context 上随操作流动"。

### 7.5 工程实现：三个原语 + 一个派生帮手

现代运行时（Node 20+/浏览器）给了三个标准原语，组合起来就够用，**不用手写监听器**：

| 原语 | 作用 |
|---|---|
| `new AbortController()` | 一个可手动 `.abort(reason)` 的取消源 |
| `AbortSignal.timeout(ms)` | 到点自动 abort 的 signal（做超时） |
| `AbortSignal.any([...signals])` | 组合：**任一**来源 abort，结果就 abort（且内部用弱引用管理监听器，**不手动绑就不漏**） |

**派生子作用域的帮手**（既跟随父、又能因自身原因独立取消）：

```ts
/** 从父 signal 派生一个子作用域：父 abort 会级联下来；也可因 local 原因独立取消。 */
function deriveScope(parent: AbortSignal, ...extra: AbortSignal[]) {
  const local = new AbortController();
  return {
    signal: AbortSignal.any([parent, local.signal, ...extra]), // 任一触发即取消
    cancel: (reason?: unknown) => local.abort(reason),         // 只取消这棵子树
  };
}
```

**用 abort reason 区分"为什么停"**（关键工程细节）——同样是 aborted，处理可能完全不同：

```ts
controller.abort({ type: 'user-interrupt' });   // 用户打断 → 停下、回到等输入
// vs 超时触发的 reason 是 DOMException('TimeoutError')
if (signal.aborted) {
  const why = signal.reason;   // 据此分流：用户打断 / 超时 / 预算耗尽 …
}
```

**串到我们架构里**（落点示意，尚未实现）：

```ts
// App：每个 run 一个根 controller；TTY 的 Esc 触发
const runCtl = new AbortController();
frontend.onInterrupt(() => runCtl.abort({ type: 'user-interrupt' }));

// loop：顶部主动 bail；把 run signal 放进 ModelRequest
while (state.status === 'running' && state.step < cfg.maxSteps) {
  runCtl.signal.throwIfAborted();                              // 步间中断点（①）
  const res = await deps.callModel({ messages, tools, signal: runCtl.signal }); // ②
  // …工具分支：给每个工具派生"run ∪ 超时"的子作用域（③）
  for (const call of res.toolCalls ?? []) {
    const { signal } = deriveScope(runCtl.signal, AbortSignal.timeout(cfg.toolTimeoutMs));
    await deps.dispatchTool(call, { ...ctx, signal });
  }
}

// provider（口子 A）：把 signal 喂给真正的请求
await client.chat.completions.create(params, { signal: req.signal }); // OpenAI
// fetch(url, { signal: req.signal })                                  // 通用

// 收尾：把 AbortError 翻译成可恢复状态，而不是崩
try { /* run */ } catch (e) {
  if (runCtl.signal.aborted) state.status = 'interrupted';   // 回到等输入；"redirect"=append 新输入续跑
  else throw e;
}
```

要点回顾：
- **Controller 一份在 App（根），按操作派生子作用域**；TTY 只触发，不持有 signal 消费方。
- **signal 搭 `ModelRequest.signal`/`ToolContext.signal` 的车**到达 fetch 与工具。
- **组合用 `AbortSignal.any` / `AbortSignal.timeout`**，别手写 `addEventListener`（要写就记得 `removeEventListener` 防泄漏）。
- **`abort(reason)` 带类型化原因**，下游据此分流（用户打断 vs 超时 vs 预算）。

> ⚠️ 取舍：若永远只有"单 run、单次在途调用、无并行/超时/子 Agent"，那"存一个 controller、abort 一下"也够，上面整棵树是为这些"多/组合"场景留的余量——与本项目一贯"留口子、按需长大"一致。
>
> 工程落点（尚未实现）：`ModelRequest`/`ToolContext` 加 `signal?: AbortSignal`，provider/工具透传消费；loop 顶部 `signal.throwIfAborted()`；App 每 run 建根 controller、TTY 的 Esc 触发；工具用 `deriveScope` 叠超时。新增 `AgentStatus: 'interrupted'`。

---

**关联**：[04 ReAct](04-agent-loop-react.md)、[05 Plan-Execute](05-plan-execute-replan.md)（本篇的两种范式）、[08 上下文管理](08-context-management.md)（§3 的压缩）、[11 扩展点](11-extensibility-seams.md)（A–E 口子；中断 signal 走口子 A/B）、[17 四类收集](17-collection-context-memory-trace-checkpoint.md)（§6 的 checkpoint 数据模型）。

## 延伸阅读
- 📄 [Anthropic《Building Effective Agents》](https://www.anthropic.com/engineering/building-effective-agents) —— 工作流 vs Agent、何时该用编排、"先求简单"。
- 📄 [Anthropic《Effective Context Engineering for AI Agents》](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) —— push/pull、just-in-time 检索、压缩。
- 💻 [Anthropic Cookbook · agents patterns](https://github.com/anthropics/anthropic-cookbook/tree/main/patterns/agents) —— 可运行的编排模式。
