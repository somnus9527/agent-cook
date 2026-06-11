# 07 · RAG 检索增强

> 阶段 3。让 Agent 能基于"你自己的文档/知识库"回答，而不是只靠模型内置知识。案例 2 的核心。

## 1. 为什么需要 RAG

模型不知道你的私有资料（公司文档、个人笔记），也记不住超出训练数据的内容，更新还慢。RAG = Retrieval-Augmented Generation：**先检索到相关片段，再把它拼进 prompt 让模型基于这些片段作答**。本质是"开卷考试"。

## 2. 核心概念

- **Embedding（向量化）**：把一段文本变成一个数字向量，语义相近的文本向量也相近。
- **相似度**：常用**余弦相似度**衡量两个向量有多"像"。
- **Chunking（切分）**：长文档切成小片段，分别 embedding（因为整篇太大、检索粒度也太粗）。
- **向量库**：存 `{文本, 向量}`，支持"给一个查询向量，找最相近的 K 条"。

## 3. RAG 全流程

```
【离线建库】
文档 → 切分(chunk) → 每个chunk调embedding → 存 {text, vector}

【在线问答】
用户问题 → embedding → 在库里算相似度取 Top-K → 把这K段拼进prompt → 模型作答(并标注引用)
```

## 4. 先用内存数组手搓（强烈建议第一版这么做）

Ollama 自带 embedding 模型（先 `ollama pull nomic-embed-text`）：

```js
import ollama from 'ollama'

const EMBED_MODEL = 'nomic-embed-text'
async function embed(text) {
  const r = await ollama.embeddings({ model: EMBED_MODEL, prompt: text })
  return r.embedding              // number[]
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]**2; nb += b[i]**2 }
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// ① 建库（内存数组就是最朴素的"向量库"）
const docs = ['北京是中国首都。', 'TypeScript 是 JS 的超集。', '猫是哺乳动物。']
const store = []
for (const text of docs) store.push({ text, vector: await embed(text) })

// ② 检索 Top-K
async function retrieve(query, k = 2) {
  const q = await embed(query)
  return store
    .map(d => ({ ...d, score: cosine(q, d.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

// ③ 拼进 prompt 让模型作答
async function ask(question) {
  const hits = await retrieve(question)
  const context = hits.map((h, i) => `[${i+1}] ${h.text}`).join('\n')
  const r = await ollama.chat({
    model: 'llama3.1',
    messages: [
      { role: 'system', content: '只根据【资料】回答，并标注引用编号[n]；资料里没有就说不知道。' },
      { role: 'user', content: `【资料】\n${context}\n\n【问题】${question}` },
    ],
  })
  return r.message.content
}

console.log(await ask('中国的首都是哪？'))
```

跑通这一版，你就**彻底理解 RAG 了**——后面的向量库只是把 `store` 数组换成更高效、可持久化的存储。

## 5. 进阶（第二版再上）

- **持久化向量库**：sqlite-vec、LanceDB、pgvector、Qdrant、Chroma。解决"内存放不下、重启丢失、检索慢"。
- **更好的切分**：按语义/标题切，重叠窗口(overlap)，控制 chunk 大小。
- **混合检索**：向量 + 关键词(BM25)，召回更全。
- **重排序 (rerank)**：检索回来的候选再用模型/rerank 模型精排。
- **把检索做成工具**：交给 Agent（知识点 03/04），模型自己决定"要不要查、查什么"——这就把案例 1 和案例 2 打通成"会查资料的 Agent"。

## 6. RAG vs 长期 Memory 的关系

二者技术高度重叠：长期 Memory 的"按需召回"往往就是用 RAG 实现的（见知识点 06 第 7 节）。区别在用途——RAG 偏"外部知识库问答"，Memory 偏"记住与用户/任务相关的事实并跨会话复用"。

---

**回主线**：先手搓内存版（案例 2 第一步），再考虑持久化与做成工具。
