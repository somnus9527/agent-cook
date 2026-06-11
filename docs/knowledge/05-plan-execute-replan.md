# 05 · Plan-Execute-Replan

> 与 ReAct（走一步看一步）相对的另一种 Agent 范式：**先整体规划，再逐步执行，必要时重新规划。**

## 1. 动机：ReAct 的痛点

ReAct 每一步都现想现做，没有全局视野。对长任务（10+ 步、有依赖关系、要调度多个子任务）容易：绕路、重复劳动、忘了大目标、token 爆炸。

人类做复杂事会**先列计划**再动手——Plan-Execute 就是把这个思路给 Agent。

## 2. 三个阶段

```
① Plan（规划）
   一个"规划器"LLM 先把大目标拆成一个有序的步骤清单（plan）。
   例：[查北京天气, 查上海天气, 计算差值, 汇总回答]

② Execute（执行）
   逐个执行计划里的步骤。每个步骤可以：
   - 由一个"执行器"（可以是带工具的 ReAct 小循环）完成
   - 产出结果，记录下来

③ Replan（重规划）
   每执行完一步（或若干步），把"已完成的结果 + 原计划"交回规划器：
   - 计划还合理吗？需要增删步骤吗？
   - 出现意外结果要不要换路线？
   - 目标达成了吗？达成 → 结束；没达成 → 更新计划，继续 Execute
```

核心：**规划与执行分离**，且计划**不是一次定死**，而是随执行反馈动态修订（这就是 Re-plan）。

## 3. 最小骨架（伪代码，Ollama 可实现）

```js
// ① 规划：让模型用结构化输出吐出步骤数组（结合知识点 09）
let plan = await planner(goal)        // -> ["step1", "step2", ...]
const done = []

for (let i = 0; i < MAX_ROUNDS && plan.length; i++) {
  const step = plan[0]

  // ② 执行当前步骤（执行器内部可以是一个 ReAct 小循环 + 工具）
  const result = await executor(step, { context: done })
  done.push({ step, result })

  // ③ 重规划：基于已完成结果，让规划器更新剩余计划 / 判断是否完成
  const review = await replanner(goal, done)   // -> { finished, plan: [...剩余步骤] }
  if (review.finished) return summarize(goal, done)
  plan = review.plan
}
```

> 规划器、重规划器、执行器都是对同一个 Ollama 模型的不同 prompt 调用（也可用不同模型）。它们之间靠"结构化输出"传 plan 数组——所以知识点 09 是前置。

## 4. ReAct vs Plan-Execute-Replan

| 维度 | ReAct | Plan-Execute-Replan |
|---|---|---|
| 决策粒度 | 每步即时决策 | 先全局规划，再执行 |
| 全局视野 | 弱（贪心） | 强（有显式 plan） |
| 适合任务 | 短、探索性、依赖实时观察 | 长、多步、有结构/依赖 |
| LLM 调用 | 每步至少 1 次 | 规划 + 每步执行 + 重规划，调用更多 |
| 复杂度 | 低，好实现好调试 | 高，要管理 plan 状态 |
| 跑偏风险 | 中途容易偏离大目标 | 计划锚定目标，更稳；但初始计划错了会带偏 |

**经验**：
- 简单任务、需要随环境灵活应变 → ReAct。
- 复杂、可预先拆解、步骤多 → Plan-Execute；其中 **Replan** 这一环是关键，去掉它就退化成"死板按计划走"，遇到意外无法纠偏。
- 二者可混用：用 Plan 定大框架，每个步骤内部用 ReAct 小循环执行。

## 5. 相关变体（了解）

- **Plan-and-Solve**：早期版本，规划后一次性执行，无 replan。
- **LLMCompiler / ReWOO**：规划出可并行的任务图，减少 LLM 调用、提并发。
- **Tree of Thoughts**：不止一条计划，探索多条路径再择优（更重）。

---

**回到主线**：入门先用 ReAct（知识点 04）把案例 1 跑通；理解 Plan-Execute 作为"复杂任务的进阶范式"即可，不必一上来就实现。
