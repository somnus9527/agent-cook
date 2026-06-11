# 09 · 结构化输出

> 阶段 2。让模型**稳定地**吐出可被程序解析的 JSON，而不是自由发挥的自然语言。Agent 内部各环节传递数据、Plan-Execute 传 plan、工具参数校验都靠它。

## 1. 为什么需要

Agent 里经常要让模型"产出数据给代码用"：一个步骤清单、一个分类结果、一组抽取的字段。如果模型回 `"好的，计划是先查天气然后……"`，你没法可靠地 `JSON.parse`。结构化输出就是把模型输出**约束成固定 schema**。

## 2. Ollama 的两种方式

### (a) `format: 'json'`（强制 JSON 模式）
让模型只输出合法 JSON：

```js
import ollama from 'ollama'
const r = await ollama.chat({
  model: 'llama3.1',
  format: 'json',                       // ← 强制 JSON
  messages: [{
    role: 'user',
    content: '把这句话的情绪分类，输出 {sentiment, confidence}：今天太开心了！',
  }],
})
const data = JSON.parse(r.message.content)   // { sentiment: 'positive', confidence: 0.95 }
```

⚠️ `format:'json'` 只保证"是合法 JSON"，**不保证字段符合你要的结构**。务必在 prompt 里**明确给出期望的 JSON 形状和字段**，最好附一个例子。

### (b) JSON Schema（更强约束）
Ollama 也支持传一个 JSON Schema 作为 `format`，让输出贴合 schema：

```js
const schema = {
  type: 'object',
  properties: {
    sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral'] },
    confidence: { type: 'number' },
  },
  required: ['sentiment', 'confidence'],
}
const r = await ollama.chat({
  model: 'llama3.1',
  format: schema,
  messages: [{ role: 'user', content: '分类情绪：今天太开心了！' }],
})
```

## 3. 防御性解析（必做）

模型仍可能出错（多了文字、字段缺失、类型不对）。**永远校验，别裸 parse**：

```js
function safeParse(text, validate) {
  let obj
  try { obj = JSON.parse(text) }
  catch { return { ok: false, error: 'invalid json' } }
  const err = validate(obj)               // 用 zod / 手写校验
  return err ? { ok: false, error: err } : { ok: true, value: obj }
}
```

推荐用 **zod** 定义 schema 并校验，类型安全又能拿到清晰错误。

## 4. 校验失败 → 重试

把错误信息反馈给模型，让它改：

```js
async function getStructured(prompt, validate, { retries = 2 } = {}) {
  let lastErr = ''
  for (let i = 0; i <= retries; i++) {
    const content = lastErr
      ? `${prompt}\n\n上次输出有误：${lastErr}。请只输出符合要求的 JSON。`
      : prompt
    const r = await ollama.chat({ model: 'llama3.1', format: 'json', messages: [{ role: 'user', content }] })
    const res = safeParse(r.message.content, validate)
    if (res.ok) return res.value
    lastErr = res.error
  }
  throw new Error('结构化输出多次失败: ' + lastErr)
}
```

## 5. 和工具调用的关系

知识点 03 的工具参数 `arguments` 本质也是模型产出的结构化数据，同样**不可信、要校验**。可以说工具调用是"结构化输出"的一个内建专用形式。

## 6. 在 Agent 里的用武之地

- **Plan-Execute**（知识点 05）：规划器输出 `string[]` 步骤数组。
- **路由/分类**：判断用户意图走哪条分支。
- **信息抽取**：从文本里抽字段。
- **多 Agent 间传参**：上游 Agent 产出结构化结果给下游。

---

**要点**：`format` 约束 + prompt 给清形状 + 防御性解析 + 失败重试，四件套缺一不可。
