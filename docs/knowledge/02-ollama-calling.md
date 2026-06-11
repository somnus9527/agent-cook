# 02 · 用 Ollama 裸调用模型

> 阶段 1 主线。用官方 `ollama` npm 包直接和本地模型对话——这是个轻量 HTTP 封装，不是 Agent 框架，符合"无框架"原则。

## 0. 先建立心智锚点（贯穿整套学习）

学下去之前，把这两句刻进脑子，后面所有"高级"概念都是它的推论：

1. **LLM 是一个无状态的 next-token 预测器。** 它本身不记得任何事、不会主动行动、碰不到外部世界。每次请求你都要把全部历史重新喂进去。
2. **Agent = 在这个无状态预测器外面，人为搭的脚手架。** "记忆"是我们把对的上下文放进去；"自主行动"是我们套了个循环（知识点 04）并真的去执行它请求的工具（知识点 03）；"工具能力"是它输出请求、你的代码替它执行。

> 一句话：**智能体性不在模型里，在你搭的系统里。** 框架把这套脚手架藏起来了，手搓让你亲手把它建出来——这就是本项目的意义。注意：机制是编排，但能力是真的——给够上下文时它确实能做有用的多步决策。

## 1. 准备

1. 安装并运行 Ollama（守护进程默认监听 `http://localhost:11434`）。
2. 拉一个**支持工具调用**的模型（后面阶段 2 要用）：
   ```bash
   ollama pull llama3.1       # 8B，开发用，快、~5.5GB
   # 或 ollama pull qwen2.5    # 工具选择更稳，适合"生产"
   ```
   ⚠️ 不是所有模型都支持 tools，选型时认准支持工具调用的（llama3.1 / qwen2.5 / qwen3 / mistral 等）。
3. 安装库：
   ```bash
   npm i ollama
   ```

## 2. 消息结构（最重要的心智模型）

- 对话是一个 **`messages` 数组**，每条 `{ role, content }`。
- 三种 role：`system`（设定/规则）、`user`（用户）、`assistant`（模型回复）。后面工具阶段还会加 `tool`。
- **模型是无状态的**：服务器不替你记历史。每次请求你都要把**完整 messages** 发过去；想"多轮"，就自己把上一轮的 assistant 回复 push 回数组。

### `messages` 这套结构是规定还是约定？

是 **API 层的约定，不是 LLM 的物理规律**。底层模型只接受一整条**扁平的 token 序列**，根本不认识 `[{role, content}]` 数组。这个数组会被一个叫 **chat template** 的东西渲染成带特殊标记的字符串再喂给模型，例如：

```
<|im_start|>system\n你是助手<|im_end|>\n<|im_start|>user\n你好<|im_end|>\n<|im_start|>assistant\n
```

不同模型家族（qwen、llama…）模板不同；指令微调时模型被训练成"认这套格式"。所以 role 是各家 chat API 为了好用统一抽象出来的；`ollama` 包内部按模板把你的数组拼成字符串。**理解这点的意义**：换别家模型时数组结构可能略变，但"把角色化的历史渲染成一条序列喂给预测器"这件事是不变的。

## 3. 一次性（非流式）调用

```js
import ollama from 'ollama'

const res = await ollama.chat({
  model: 'llama3.1',
  messages: [
    { role: 'system', content: '你是简洁的助手，中文回答。' },
    { role: 'user', content: '用一句话解释什么是 Agent。' },
  ],
})
console.log(res.message.content)
```

## 4. 流式调用（两段连接，别混为一谈）

先分清数据流的两段——这是很多人卡住的地方：

```
[Ollama 守护进程] --HTTP流(chunked)--> [你的 Node 代码] --(可选)SSE--> [浏览器前端]
        ①  ollama 包已封装成 AsyncGenerator        ②  只有 Web 前端才需要
```

- **① Ollama → 你的 Node**：Ollama 的 HTTP 流式响应，`ollama` 包已经帮你封装成 `for await` 的 AsyncGenerator，**这一段和 SSE 无关，你不用碰协议**。
- **② 你的 Node → 浏览器**：**只有当你有网页前端时**，才需要把 ① 收到的增量用知识点 01 的 SSE 推给浏览器。

`stream:true` 返回一个 **AsyncGenerator**，用 `for await` 逐块消费：

```js
const stream = await ollama.chat({
  model: 'llama3.1',
  messages: [{ role: 'user', content: '写一首两行小诗' }],
  stream: true,
})
for await (const part of stream) {
  process.stdout.write(part.message.content) // 每块是增量 token
}
process.stdout.write('\n')
```

> 库内部就是在消费 Ollama 服务端的流；如果你把它再转发给浏览器，就是知识点 01 里的"Node 产出 SSE"。**做 CLI Agent 则完全不需要 SSE**：直接 `process.stdout.write()` 打到终端即可（本项目两个案例都是 CLI，知识点 01 对它们是可选的）。

## 5. 手搓多轮对话（阶段 1 产出物雏形）

```js
import ollama from 'ollama'
import readline from 'node:readline/promises'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const messages = [{ role: 'system', content: '你是中文助手。' }]

while (true) {
  const q = await rl.question('你> ')
  if (q === 'exit') break
  messages.push({ role: 'user', content: q })

  const stream = await ollama.chat({ model: 'llama3.1', messages, stream: true })
  let full = ''
  process.stdout.write('AI> ')
  for await (const p of stream) { full += p.message.content; process.stdout.write(p.message.content) }
  process.stdout.write('\n')

  messages.push({ role: 'assistant', content: full }) // 关键：把回复存回历史
}
rl.close()
```

注意最后一行——**把 assistant 回复 push 回 messages**，下一轮模型才"记得"上文。这就是"无状态模型 + 你维护历史"的本质。

## 6. 常用参数

| 参数 | 说明 |
|---|---|
| `model` | 模型名 |
| `messages` | 完整对话历史 |
| `stream` | `true` 返回 AsyncGenerator |
| `format` | `'json'` 强制 JSON 输出（见知识点 09） |
| `tools` | 工具列表（见知识点 03） |
| `think` | `true`/`'high'`/`'medium'`/`'low'` 开启思考 |
| `options.temperature` | 随机性，0=确定 |
| `options.num_ctx` | 上下文窗口大小；**工具调用建议 ≥32k**（更稳） |

```js
await ollama.chat({ model:'llama3.1', messages, options:{ temperature:0, num_ctx:32768 } })
```

## 7. 也可以用 OpenAI 兼容端点（了解即可）

Ollama 暴露了 `http://localhost:11434/v1` 的 OpenAI 兼容接口，所以很多"OpenAI SDK 写法"的教程可以直接指过来。但本项目统一用官方 `ollama` 包，更贴近其原生能力（如 `think`）。

---

**参考**：[npm `ollama`](https://www.npmjs.com/package/ollama)、[ollama-js GitHub](https://github.com/ollama/ollama-js)、[Ollama 工具调用文档](https://docs.ollama.com/capabilities/tool-calling)。

## 延伸阅读：大模型到底是什么、怎么运转的

本篇只教"怎么调"；想搞懂"它内部是什么、怎么实现、核心是什么"，看这些（按由浅入深）：
- 🎥 [Karpathy《Intro to LLMs》(1hr)](https://www.youtube.com/watch?v=zjkBMFhNj_g) —— 非技术向建立整体心智模型，**首推**。
- 🎥 [3Blue1Brown《But what is a GPT?》](https://www.3blue1brown.com/lessons/gpt) + [《Attention, step-by-step》](https://www.3blue1brown.com/lessons/attention) —— 可视化讲透 Transformer/注意力。
- 📄 [The Illustrated Transformer](https://jalammar.github.io/illustrated-transformer/) —— 图解经典。
- 🎥 [Karpathy《Let's build GPT, from scratch, in code》](https://www.youtube.com/watch?v=kCc8FmEb1nY) —— 想从代码层手写理解 next-token 预测，看这个。
- 📄 [Attention Is All You Need（原论文）](https://arxiv.org/abs/1706.03762) —— Transformer 起源。
