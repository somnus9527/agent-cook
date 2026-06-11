# 13 · 接入云端模型（以 Kimi / Moonshot 为例）

> 阶段 1–2 的补充。当本地小模型（如 qwen 2B）跑通了机制、但**正式测效果**需要更强模型时，切到云端模型。本篇以 **Kimi（Moonshot）** 为例，展示"换模型只动一层 adapter"如何落地（呼应知识点 03 §7 与知识点 11 口子 A）。

## 1. 何时切

- 本地小模型：学机制、调流程、零成本——**够用**。
- 切云端（Kimi 等）：当你要**评估真实效果**、需要更强的工具调用可靠性 / 更长上下文 / 多步 agent 能力时。
- 关键认知：**切模型不该改你的 loop 和工具**，只该换"调模型"那一层（口子 A）。本篇就是给口子 A 写一个 Kimi adapter。

## 2. Kimi 的接入方式：兼容 OpenAI

Kimi（Moonshot）提供 **OpenAI 兼容**的 HTTP API，所以**直接用官方 `openai` npm 包**，把 `baseURL` 指过去即可，不需要专用 SDK。

| 配置 | 值 |
|---|---|
| 安装 | `npm i openai` |
| Base URL | `https://api.moonshot.ai/v1`（国际站）/ `https://api.moonshot.cn/v1`（国内站） |
| 模型 id | `kimi-k2.5`（你要用的）；当前最新 `kimi-k2.6`（默认、agent 工具调用优化更强） |
| API Key | 环境变量 `MOONSHOT_API_KEY`，**只放服务端** |
| 工具调用 | 标准 OpenAI `tools` 格式（不是已废弃的 `functions`） |
| 上下文 | K2.6 达 256K |

> ⚠️ **密钥安全**：绝不要在前端 JS 里直连 Kimi（密钥会泄露）。CLI/后端持有 `MOONSHOT_API_KEY`；将来做 Web 版要走后端代理（呼应知识点 10）。

## 3. 基础调用（Node）

```js
import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.MOONSHOT_API_KEY,
  baseURL: 'https://api.moonshot.ai/v1',   // 关键：指向 Kimi
})

const res = await client.chat.completions.create({
  model: 'kimi-k2.5',
  messages: [
    { role: 'system', content: '你是简洁的中文助手。' },
    { role: 'user', content: '用一句话解释什么是 Agent。' },
  ],
})
console.log(res.choices[0].message.content)
```

注意返回结构和 Ollama 不同：内容在 `res.choices[0].message.content`（Ollama 是 `res.message.content`）。

## 4. 工具调用（同一个闭环，字段略不同）

闭环和知识点 03 完全一样（模型决策→你执行→回填→再请求），只是字段名按 OpenAI 风格：

```js
const tools = [{
  type: 'function',
  function: {
    name: 'get_temperature',
    description: '查询某城市当前气温',
    parameters: { type:'object', required:['city'],
      properties:{ city:{ type:'string', description:'城市名' } } },
  },
}]

const messages = [{ role:'user', content:'北京现在多少度？' }]

const r1 = await client.chat.completions.create({ model:'kimi-k2.5', messages, tools })
const choice = r1.choices[0]
messages.push(choice.message)                       // 把含 tool_calls 的 assistant 存回

if (choice.finish_reason === 'tool_calls') {        // ← 用 finish_reason 判断
  for (const call of choice.message.tool_calls) {
    const args = JSON.parse(call.function.arguments) // ← 注意：这里是 JSON 字符串，要 parse！
    const result = getTemperature(args.city)
    messages.push({
      role: 'tool',
      tool_call_id: call.id,                         // ← 注意：要带 tool_call_id 对应回去
      content: JSON.stringify({ city: args.city, temp: result }),
    })
  }
  const r2 = await client.chat.completions.create({ model:'kimi-k2.5', messages, tools })
  console.log(r2.choices[0].message.content)
}
```

### Ollama vs Kim(OpenAI) 工具调用差异速查

| | Ollama | Kimi / OpenAI |
|---|---|---|
| 取回复内容 | `res.message.content` | `res.choices[0].message.content` |
| 工具调用在 | `res.message.tool_calls` | `res.choices[0].message.tool_calls` |
| `arguments` 类型 | **已是对象** | **JSON 字符串，需 `JSON.parse`** |
| 结果回填 | `{role:'tool', tool_name}` | `{role:'tool', tool_call_id}` |
| 是否调工具 | 看 `tool_calls` 是否有 | 看 `finish_reason==='tool_calls'`（或 `tool_calls` 是否有）|

→ **这些差异正是知识点 11 口子 A（`callModel`）+ 知识点 03 §7（adapter）要吸收的全部内容**。你的工具定义、registry、loop 一行都不用改。

## 5. 把 Kimi 做成口子 A 的一个 adapter

目标：`runAgent` 里只调 `callModel(...)`，内部用配置决定走 Ollama 还是 Kimi。

```js
// adapter：把统一入参 → Kimi 调用 → 统一出参（与 Ollama adapter 返回同一种形状）
async function callKimi({ messages, tools, model = 'kimi-k2.5' }) {
  const r = await client.chat.completions.create({ model, messages, tools })
  const m = r.choices[0].message
  return {
    content: m.content,
    // 归一化成和 Ollama adapter 一致的 tool_calls 形状，loop 不必感知差异
    tool_calls: (m.tool_calls ?? []).map(c => ({
      id: c.id,
      name: c.function.name,
      args: JSON.parse(c.function.arguments),
    })),
  }
}

// CONFIG.provider 决定用哪个；其余代码（registry/loop/buildContext）完全不变
const callModel = CONFIG.provider === 'kimi' ? callKimi : callOllama
```

这样切换模型 = 改一个 `CONFIG.provider`。**这就是你坚持"留口子"换来的回报。**

## 6. Kimi 的几个坑（迁移要测）

虽然兼容 OpenAI，但有行为差异，**上线前务必测你的工具调用回路**：
- **temperature 不同**：K2.5 推荐 thinking 模式 `temperature=1.0`、instant 模式 `0.6`，`top_p=0.95`，范围和 OpenAI 不一样。
- **thinking 模式**：是 Kimi 扩展参数，通过 SDK 的 `extra_body`（如 `{ thinking: { type: 'disabled' } }`）传，不是顶层标准参数。
- `n`、`partial` 等参数行为也有差异，按官方迁移指南来。

## 7. 想连别的云模型（OpenAI / Claude / Gemini）？
- **OpenAI 本家 / 其它 OpenAI 兼容服务**：同上，改 `baseURL` + `model` + key 即可，几乎零改动。
- **Claude / Gemini**：工具调用字段不同（见知识点 03 §7 对照表），各写一个 adapter 塞进口子 A 即可，registry/loop 依旧不动。

---

**关联**：知识点 02（Ollama 基础调用）、03 §7（跨供应商可移植性）、10（密钥安全）、11 口子 A（统一 `callModel`）。

**参考**：[Kimi API 平台](https://platform.moonshot.ai/)、[从 OpenAI 迁移到 Kimi](https://platform.moonshot.ai/docs/guide/migrating-from-openai-to-kimi)。
