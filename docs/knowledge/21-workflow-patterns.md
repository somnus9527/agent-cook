# 21 · 工作流 vs 智能体：编排模式菜单

> 阶段 2–3 核心补完。我们之前直接讲了 ReAct（04）和 Plan-Execute（05）这两个 *agent loop*，**跳过了《Building Effective Agents》开宗明义的总框架**：先分清"工作流 vs 智能体"，再掌握一套可组合的**编排模式菜单**。本篇补上——它是 ReAct/Plan-Execute 的上位地图，也解释"很多时候你不需要一个自主 Agent，一个固定工作流更好"。
>
> 每个模式给：核心概念 / 使用场景 / 为什么需要 / 底层逻辑 / 设计 demo / 参考链接。

## 0. 总框架：工作流 vs 智能体

| | 工作流（Workflow） | 智能体（Agent） |
|---|---|---|
| 控制流 | **预定义代码路径**，人写死步骤 | 模型**动态自决**步骤与工具 |
| 可预测性 | 高、可控、好测 | 低、灵活、能应变 |
| 适合 | 任务可拆解、步骤固定 | 开放式、步骤不可预测 |
| 代表 | 下面 1–4 的模式 | ReAct（04）、Plan-Execute（05） |

**关键认知（贯穿本篇）**：Agent ≠ 总是更好。`Building Effective Agents` 的核心建议是 **"先求简单，能用工作流就别上自主 Agent"**——自主性换来灵活，也换来不可预测、难调试、成本高。**先看这个菜单，挑最简单够用的那个。**

> 底座是 **Augmented LLM**（增强型 LLM）= LLM + 检索(07) + 工具(03) + 记忆(06)。下面所有模式都是把若干个"增强型 LLM 调用"按不同拓扑连起来。

---

## 1. Prompt Chaining（提示链）

**核心概念**：把一个任务拆成**固定的、顺序的**若干步，每步处理上一步的输出；步骤之间可以加程序化"门（gate）"做校验，不过关就早停。

**使用场景**：任务能清晰拆成"先 A 再 B 再 C"的线性流程——如"先列大纲→按大纲写正文→翻译"；"先抽取字段→校验→入库"。

**为什么需要**：一步到位让模型"既构思又执行"质量差；拆成小步、每步只干一件事，单步更准、可在中间插校验。是**用确定性结构换质量与可控**。

**底层逻辑**：多次 LLM 调用串联，前一次输出 = 后一次输入；gate 是普通代码 if，不达标 return。

**设计 demo**（对齐我们的口子 A）：
```ts
const outline = await callModel({ messages: ask('列大纲', topic) });
if (!gate(outline)) return fail('大纲不合格');      // 程序化门检查
const draft = await callModel({ messages: ask('按大纲写正文', outline) });
const final = await callModel({ messages: ask('润色', draft) });
```

**参考**：[Building Effective Agents · Prompt chaining](https://www.anthropic.com/engineering/building-effective-agents)。

---

## 2. Routing（路由）

**核心概念**：先**分类**输入，再分派到专门的后续处理。

**使用场景**：输入有明显类别、不同类别该走不同处理——如客服分流（退款/技术/咨询）、难易分流（简单→小模型，复杂→大模型或 Plan-Execute）。

**为什么需要**：用一个万能 prompt 应付所有类别会互相拖累；分类后各走最优路径，质量与成本都更好。

**底层逻辑**：一次分类（启发式 / 小模型分类器 / 模型自决）→ 选分支。

> 本项目已落地：**`route(state)` 选 ReAct 还是 Plan-Execute** 就是 Routing 的实例，四档判定（启发式/LLM 分类器/模型自决/动态升级）详见 **[16 §5.3](16-runtime-layering-and-loop.md)**，不在此重复。

**参考**：[Building Effective Agents · Routing](https://www.anthropic.com/engineering/building-effective-agents)；本库 16 §5.3。

---

## 3. Parallelization（并行）

**核心概念**：多个 LLM 调用**并行**跑，再聚合。两个变体：
- **Sectioning（分片）**：把任务拆成**互相独立**的子任务并行做，各管一段。
- **Voting（投票）**：**同一个**任务跑多次，取多数/择优，降随机性。

**使用场景**：
- 分片：审一份长文档的多个维度（事实/语气/合规）、一次处理多文件。
- 投票：要高可靠的判断（"这段代码有无漏洞"跑 3 次取多数）、降低单次幻觉影响。

**为什么需要**：分片 = 拆开并行**省墙钟时间**且各子任务上下文更聚焦；投票 = 用冗余**换可靠性**（单次概率输出不稳，多次聚合更稳）。

**底层逻辑**：`Promise.all` 并发若干独立调用 → 聚合函数（拼接 / 多数票 / 打分择优）。

**设计 demo**：
```ts
// 分片：三个维度并行审，再合并
const dims = ['事实准确', '语气合规', '安全红线'];
const reviews = await Promise.all(dims.map((d) => callModel({ messages: review(d, doc) })));
const merged = mergeReviews(reviews);

// 投票：同一判断跑 N 次取多数（self-consistency）
const votes = await Promise.all(Array.from({ length: 3 }, () => callModel({ messages: judge(code) })));
const verdict = majority(votes);
```

**参考**：[Building Effective Agents · Parallelization](https://www.anthropic.com/engineering/building-effective-agents)；[Self-Consistency 论文](https://arxiv.org/abs/2203.11171)（投票的理论出处）。

---

## 4. Orchestrator-Workers（编排者-工人）

**核心概念**：一个中心"编排者"LLM**动态地**把任务拆成子任务、分给"工人"LLM 执行，再汇总结果。**与分片的区别：子任务不是预先写死的，而是编排者运行时决定的。**

**使用场景**：子任务数量/形态**事先不知道**、要看输入才能定——如"改一个跨多文件的需求"（先看代码再决定改哪些文件，每个文件派一个工人）、复杂研究（边查边决定查什么）。

**为什么需要**：当你**无法预先拆解**任务时，分片/链都不适用，需要一个会"看情况拆活"的中枢。这就是它比固定工作流更"Agent"的地方，但仍有明确的"拆-派-合"结构。

**底层逻辑**：编排者调用产出子任务列表（结构化输出 09）→ 对每个子任务派工人（常并行）→ 编排者综合。**工人本身常是一个 ReAct 小循环——这正是我们 Plan-Execute（05/16 §4）里"每步执行器复用 ReAct"的同构**；也对应"多 Agent / Agent-as-tool"（11 口子 E）。

**设计 demo**：
```ts
const subtasks = await callModel({ messages: planSubtasks(goal), /* 结构化输出 */ });
const results = await Promise.all(
  subtasks.map((t) => runReActLoop(t)),     // 每个工人 = 一个 ReAct 小循环（嵌套复用）
);
const answer = await callModel({ messages: synthesize(goal, results) });
```

**参考**：[Building Effective Agents · Orchestrator-workers](https://www.anthropic.com/engineering/building-effective-agents)；本库 05、16 §4、11 口子 E。

---

## 5. Evaluator-Optimizer（生成-评判环）

> ⚠️ 你已说明**自动纠错暂不需要**，本节仅作**概念登记**，不展开 demo、不进 roadmap。需要时再深化。

**核心概念**：一个 LLM 生成，另一个 LLM 评判并给反馈，循环优化，直到达标。

**使用场景**：有明确评价标准、且"多改几轮能更好"的任务（翻译润色、代码按 lint/测试反馈迭代）。

**为什么需要**：单次生成常不够好；引入"评判→反馈→再生成"的闭环能逼近更高质量。与 [19 评估](19-evaluation.md) 的区别：19 是**离线度量好不好**，这里是**在线自我纠错**。

**参考**：[Building Effective Agents · Evaluator-optimizer](https://www.anthropic.com/engineering/building-effective-agents)；[Reflexion 论文](https://arxiv.org/abs/2303.11366)。

---

## 6. 怎么选（决策顺序）

```
能一次调用搞定？           → 就别拆（先求简单）
能拆成固定线性步骤？        → Prompt chaining（+ gate）
输入分类别、各走各路？      → Routing（16 §5.3）
能拆成独立并行子任务？      → Parallelization·分片
要高可靠、靠冗余降随机？    → Parallelization·投票
子任务要运行时才知道？      → Orchestrator-workers
有明确标准、值得多轮打磨？  → Evaluator-optimizer（本项目暂不做）
步骤完全不可预测、要自主？  → Agent（ReAct 04 / Plan-Execute 05）
```

**一句话**：ReAct/Plan-Execute 是这张菜单最右端"自主"的那档；左边那些**固定工作流往往更简单、更可控、更便宜**——别一上来就上自主 Agent。

---

**关联**：[04 ReAct](04-agent-loop-react.md)、[05 Plan-Execute](05-plan-execute-replan.md)（最右端的自主档）、[16 §5.3 routing](16-runtime-layering-and-loop.md)、[09 结构化输出](09-structured-output.md)（模式间传数据的粘合剂）、[11 口子 E](11-extensibility-seams.md)（orchestrator-workers/多 Agent）、[19 评估](19-evaluation.md)（vs evaluator-optimizer）。

## 延伸阅读
- 📄 [Anthropic《Building Effective Agents》](https://www.anthropic.com/engineering/building-effective-agents) —— **本篇主源**，五个模式 + 工作流 vs Agent + 先求简单，必读。
- 📄 [Self-Consistency Improves Chain of Thought (Wang et al.)](https://arxiv.org/abs/2203.11171) —— 投票/多数表决的理论。
- 📄 [Reflexion (Shinn et al.)](https://arxiv.org/abs/2303.11366) —— 生成-评判-反思环。
- 💻 [Anthropic Cookbook · agents patterns](https://github.com/anthropics/anthropic-cookbook/tree/main/patterns/agents) —— 各模式可运行代码。
