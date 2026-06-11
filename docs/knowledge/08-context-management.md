# 08 · 上下文管理

> 阶段 2。Agent 每轮都在往 `messages` 里加东西（用户输入、模型回复、工具结果），迟早会撑爆上下文窗口。本篇讲怎么管。

## 1. 为什么会爆

- 上下文窗口有 token 上限（Ollama 里由 `num_ctx` 决定）。
- Agent Loop（知识点 04）每多走一步，就多 push 几条消息（assistant + 若干 tool 结果），增长很快。
- 工具结果可能很大（一个文件内容、一段网页、一个长 JSON）。

超限的后果：报错、被静默截断、或注意力稀释导致回答变差。

## 2. 几种基本策略

### (a) 截断 / 滑动窗口
只保留最近 N 条消息（或最近 N token），丢掉最老的。
- **必须保留** `system` 消息（规则/工具定义）。
- 简单粗暴，适合闲聊；缺点：早期重要信息直接丢失。

```js
function trim(messages, keep = 12) {
  const sys = messages.filter(m => m.role === 'system')
  const rest = messages.filter(m => m.role !== 'system').slice(-keep)
  return [...sys, ...rest]
}
```

### (b) 摘要压缩（summary / 记忆巩固）
当历史变长，用模型把"较早的一段对话"压成一条简短摘要，替换掉原始多条消息。
- 这正是 MemGPT 思想的最简版（知识点 06）：旧信息摘要后"换出"主上下文。

```js
async function compress(messages) {
  if (messages.length < 20) return messages
  const sys = messages.filter(m => m.role === 'system')
  const old = messages.filter(m => m.role !== 'system').slice(0, -8)
  const recent = messages.filter(m => m.role !== 'system').slice(-8)
  const { message } = await ollama.chat({
    model: 'llama3.1',
    messages: [{ role: 'user', content: '用要点总结以下对话，保留关键事实/决定：\n' + JSON.stringify(old) }],
  })
  return [...sys, { role: 'system', content: '【先前对话摘要】' + message.content }, ...recent]
}
```

### (c) 工具结果裁剪
工具返回的大块内容，先截断/抽取关键字段再回填，别把整页原文塞进去。
- 例：`readFile` 只回填相关行；网页只回填正文摘要。

### (d) 外置 + 检索（RAG 化）
把完整历史/资料存到外部（文件、向量库），上下文里只放摘要 + 当前需要的片段，需要时再检索回来（知识点 07）。这是长任务/长记忆的根本解法。

## 3. 组合使用（实战常见配方）

```
system（固定，恒保留）
+ 早期历史的"摘要"（压缩而来）
+ 最近若干轮原始消息（滑动窗口）
+ 本轮按需检索回来的相关片段（RAG）
```

## 4. 估算与触发

- **何时触发压缩**：按消息条数（简单）或累计 token（更准）。MemGPT 用"达窗口 ~70%"作阈值。
- **token 估算**：粗略可用字符数/经验比例；要准就用 tokenizer。入门阶段按消息条数触发足够。

## 5. 与 Memory 的关系

上下文管理 = **短期记忆**的管理（在窗口内取舍）；当你把"换出去的东西"做成可检索的外部存储并跨会话复用，就升级成了**长期 Memory**（知识点 06）。两者是同一问题的连续体。

---

**要点**：入门先做 (a) 截断 + 保 system；任务变长再加 (b) 摘要；做 RAG/Memory 后用 (d) 外置。

## 延伸阅读
- 📄 [Anthropic《Effective Context Engineering for AI Agents》](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) —— 上下文工程实操指南：系统提示、压缩历史、把结构化笔记存到窗口外、just-in-time 检索、用子 Agent 返回短摘要等。**本主题首推**。
