# 04 · Agent Loop 与 ReAct

> 阶段 2 核心。把知识点 03 的"单次工具调用"升级成"会自己多轮决策直到完成任务"的循环——这就是 Agent 的本体。

## 1. 那个 while 循环

知识点 03 里我们手动调了一次工具。但真实任务往往要连着调好几次（先查 A、再查 B、再算、再答）。Agent Loop 就是把它自动化：

```
loop:
  ① 请求模型(messages + tools)
  ② 模型回复里有 tool_calls 吗？
       有  → 执行所有工具，结果回填进 messages，回到 ①
       没有 → 这是最终回答，跳出循环
  ③ 加一个"最大轮次"上限，防止模型死循环
```

**Agent = LLM + 工具 + 这个循环。** 框架的"AgentExecutor / run()"内核就是它。

## 2. 最小实现（基于 Ollama，可直接跑）

```js
import ollama from 'ollama'

const tools = [/* 见知识点 03 的工具定义，可放多个 */]
const registry = {                       // 工具名 → 真实函数
  get_temperature: ({ city }) => ({ city, temp: { 北京:30, 上海:26 }[city] ?? null }),
}

async function runAgent(userInput, { maxSteps = 8 } = {}) {
  const messages = [
    { role: 'system', content: '你是助手。需要数据时调用工具，拿到结果后用中文作答。' },
    { role: 'user', content: userInput },
  ]

  for (let step = 0; step < maxSteps; step++) {
    const res = await ollama.chat({ model: 'llama3.1', messages, tools })
    messages.push(res.message)

    const calls = res.message.tool_calls
    if (!calls?.length) {
      return res.message.content          // ← 无工具调用 = 最终答案，结束
    }

    // 执行模型点名的每个工具，结果回填
    for (const call of calls) {
      const fn = registry[call.function.name]
      let out
      try {
        out = fn ? fn(call.function.arguments) : { error: 'unknown tool' }
      } catch (e) {
        out = { error: String(e) }        // 工具报错也回填，让模型自己决定怎么办
      }
      messages.push({
        role: 'tool',
        tool_name: call.function.name,
        content: JSON.stringify(out),
      })
    }
  }
  return '已达最大步数，未能完成。'          // 兜底，防死循环
}

console.log(await runAgent('北京比上海热多少度？'))
```

跑通后，它会：调 `get_temperature(北京)` → 调 `get_temperature(上海)` → 自己做减法 → 回答。这就是案例 1 的验收点。

## 3. ReAct 是什么

**ReAct = Reasoning + Acting**（论文 *ReAct: Synergizing Reasoning and Acting in Language Models*）。核心思想：让模型**交替**产出"思考(Reason)"和"行动(Act/工具调用)"，并把"观察(Observation/工具结果)"喂回去：

```
Thought: 我需要先知道北京温度
Action: get_temperature(北京)
Observation: 30
Thought: 再查上海
Action: get_temperature(上海)
Observation: 26
Thought: 30-26=4，可以回答了
Answer: 北京比上海热 4 度
```

**关键认知**：上面第 2 节的循环，配合现代模型原生的 tool calling，本质上**就是 ReAct 的工程实现**。早期 ReAct 靠纯文本 prompt 让模型吐出 `Thought/Action/Observation` 再正则解析；现在 `tool_calls` 是结构化的，更稳，不用自己解析文本。Ollama 的 `think:true` 还能让"思考"部分单独输出。

## 4. ReAct 的特点与局限

| 优点 | 局限 |
|---|---|
| 简单、通用，走一步看一步，能根据观察灵活调整 | 没有全局规划，长任务里容易"绕路"或中途跑偏 |
| 与原生 tool calling 天然契合 | 步数多时 token 累积快，成本/上下文压力大 |
| 容易调试（每步可见） | 局部贪心，可能反复试错 |

→ 对于需要**先谋后动**的复杂多步任务，看下一篇的 **Plan-Execute-Replan**。

## 5. 工程要点

- **必加 `maxSteps`**：模型可能陷入"调工具→看结果→再调同一个"的循环。
- **工具错误也回填**：把异常作为 observation 给模型，让它自我修正，而不是直接崩。
- **每步日志**：把 thought / 工具名 / 参数 / 结果打出来，调试 Agent 全靠它。
- **上下文增长**：每轮都在往 messages 加东西，长任务要配合知识点 08 做压缩。

---

**下一篇**：[05 · Plan-Execute-Replan](05-plan-execute-replan.md)

## 延伸阅读
- 📄 [Anthropic《Building Effective Agents》](https://www.anthropic.com/engineering/building-effective-agents) —— 工作流 vs Agent、何时该用 Agent、设计模式与"先求简单"，**强烈推荐**。
- 📄 [ReAct 论文](https://arxiv.org/abs/2210.03629) —— Reasoning+Acting 交替的原始出处。
- 📄 [Lilian Weng《LLM Powered Autonomous Agents》](https://lilianweng.github.io/posts/2023-06-23-agent/) —— Planning/Memory/Tool 三件套的经典综述。
- 💻 [Anthropic Cookbook · agents patterns](https://github.com/anthropics/anthropic-cookbook/tree/main/patterns/agents) —— 可运行的模式代码。
