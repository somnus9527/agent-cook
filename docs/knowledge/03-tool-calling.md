# 03 · Tool / Function Calling 原理

> 阶段 2 命门。理解了这一篇，你就明白 Agent 凭什么"会用工具"。

## 1. 核心误区先澄清

**模型不会执行任何函数。** 它没有运行环境，碰不到你的文件、网络、数据库。所谓"工具调用"，是模型**输出一段结构化的请求**："我想调用名为 `getWeather`、参数 `{city:'北京'}` 的工具"。真正执行的是**你的代码**。

## 2. 完整闭环（四步）

```
①你: 把【工具定义】+【messages】发给模型
②模型: 不执行，返回 message.tool_calls = [{name, arguments}]
③你: 解析 tool_calls → 真正运行对应函数 → 拿到结果
④你: 把结果作为 { role:'tool' } 消息 push 回 messages，再次请求模型
   → 模型看到结果，决定"再调一个工具" 还是 "给最终回答"
```

这个"模型决策 / 你执行 / 结果回填"的闭环，重复若干次，就是 Agent Loop（知识点 04）。

## 3. 工具定义 = JSON Schema

你用 JSON Schema 描述工具的名字、用途、参数。**`description` 极其重要**——模型靠它判断"何时该用、怎么填参数"，写得含糊模型就乱用。

```js
const tools = [{
  type: 'function',
  function: {
    name: 'get_temperature',
    description: '查询某城市当前气温。当用户问到天气/温度时使用。',
    parameters: {
      type: 'object',
      required: ['city'],
      properties: {
        city: { type: 'string', description: '城市名，如"北京"' },
      },
    },
  },
}]
```

## 4. 用 Ollama 跑一遍单次工具调用

```js
import ollama from 'ollama'

// 真正的本地实现（这部分由你掌控）
function getTemperature(city) {
  const db = { '北京': 30, '上海': 26, '东京': 18 }
  return db[city] ?? null
}

const messages = [{ role: 'user', content: '北京现在多少度？' }]

// ② 第一次请求：模型决定调工具
const r1 = await ollama.chat({ model: 'llama3.1', messages, tools })
messages.push(r1.message)            // 把 assistant(含 tool_calls) 存回历史

// ③ 执行模型点名的工具
if (r1.message.tool_calls?.length) {
  for (const call of r1.message.tool_calls) {
    const args = call.function.arguments          // 已是对象
    const result = getTemperature(args.city)
    // ④ 结果回填，role 必须是 'tool'
    messages.push({
      role: 'tool',
      tool_name: call.function.name,              // Ollama: 告诉模型这是哪个工具的结果
      content: JSON.stringify({ city: args.city, temp: result }),
    })
  }
}

// 再次请求：模型基于工具结果给自然语言回答
const r2 = await ollama.chat({ model: 'llama3.1', messages, tools })
console.log(r2.message.content)   // 例如："北京现在 30 度。"
```

## 5. 关键细节

- **`tool_calls` 可能是数组**：模型一轮可能要调多个工具，要遍历。
- **`arguments` 是模型生成的**：它可能给错类型、漏字段、编造城市。**永远校验**再执行（结合知识点 09）。
- **回填消息的 role 是 `'tool'`**，并带上 `tool_name`（Ollama）让模型对应上是哪个调用的结果。
- **assistant 那条带 tool_calls 的消息也要 push 回去**，否则历史断裂、模型看不到自己刚才的请求。
- **安全边界**：工具能 `readFile`/执行命令时，务必做白名单、参数校验、超时——模型的参数不可信。
- **流式 + 工具**：Ollama 已支持流式下的工具调用，入门阶段先用非流式把闭环跑通。

## 6. 为什么这套设计很强

工具把"模型的语言能力"和"真实世界的执行能力"解耦：模型负责**判断与编排**，你的代码负责**确定性执行**。Agent 的所有外部能力（查库、调 API、读写文件、再调另一个 Agent）都通过这一个机制接入。

## 7. 跨供应商可移植性（重要：别把代码焊死在 Ollama 上）

**概念 100% 通用，线格式各家略有差异，但你的核心资产可移植。**

通用、可直接复用的部分：
- 用 **JSON Schema 描述工具**——所有主流家一致。
- "模型返回请求 → 你执行 → 回填 → 再请求" 的**闭环**——完全一致。
- 你的**工具实现 + 注册表 (registry)**——与模型无关，纯你自己的代码。

各家不同、需要一层薄 adapter 的部分：

| | 工具定义字段 | 调用返回在 | 结果回填 |
|---|---|---|---|
| **Ollama / OpenAI** | `tools:[{type:'function',function:{name,description,parameters}}]` | `message.tool_calls` | `role:'tool'` 消息 |
| **Anthropic (Claude)** | `tools:[{name,description,input_schema}]` | `content` 里的 `tool_use` 块 | `tool_result` 块 |
| **Gemini** | `functionDeclarations` | `functionCall` part | `functionResponse` part |

**结论**：你现在给 Ollama 的信息（name + description + JSON Schema 参数）就是**充分集**，各家都能从它派生自己的格式。所以正确设计是——

> **工具定义 + 执行逻辑写成与模型无关；把"组装请求 / 解析响应"隔离成一个 per-provider 的 adapter。** 将来换 Claude/OpenAI，只写一个新 adapter，工具和 loop 全不动。

这层 adapter 正是框架（尤其 Vercel AI SDK）的主要价值。即便你现在只用 Ollama，也建议在案例 1 里就把 `chatWithTools()`（调模型那一层）和工具实现分开——这就是知识点 11 说的"留口子"之一。

---

**下一篇**：[04 · Agent Loop 与 ReAct](04-agent-loop-react.md) —— 把上面的单次调用，变成会自己多轮决策的循环。
