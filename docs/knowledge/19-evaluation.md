# 19 · 评估（Evaluation）

> 可靠性层，阶段 2–3。00 篇说它"未单独成篇"——本篇补上。**护栏（10 篇）是"防坏"，评估是"度量好不好"**，两回事。没有评估，你改 prompt/换模型全靠感觉，改好改坏都不知道。评估的数据正好接 [17 篇的 trace](17-collection-context-memory-trace-checkpoint.md)。

## 1. 为什么必须评估

LLM 是概率的（02 篇），同一输入不同次输出可能不同。于是：

- 你改了 prompt，**怎么知道是变好还是变坏**？
- 换了模型/加了工具，**有没有把原来对的搞坏（回归）**？
- RAG 检索**到底准不准**？

凭感觉测三五个例子 = 自欺。评估就是把"好不好用"变成**可重复、可量化**的数字，这是 demo 与生产的分水岭。

## 2. 评什么——三个层次

| 层次 | 评估对象 | 例子 |
|---|---|---|
| **端到端结果** | 最终答案对不对、任务完成没 | "北京比上海热几度"答案是否正确 |
| **轨迹 (trajectory)** | 过程对不对：选对工具没、步数、有没有绕路 | 该调 `get_temperature` 却去调了别的；本该 2 步走了 8 步 |
| **单步 / 组件** | 某个环节单独评 | 检索召回的文档相不相关、结构化输出是否合 schema |

> 端到端答案对、但轨迹很烂（绕了一大圈、烧了 10x token）也是问题；只看最终答案会漏掉效率与稳定性问题。

## 3. 怎么评——三种方法

### (a) 确定性断言（有标准答案时，首选）
最可靠、最便宜。能用规则判的就别用模型判：

```js
// 精确/包含/正则/数值容差/JSON schema 校验
expect(answer).toContain('4')
expect(toolCalls.map(c => c.name)).toEqual(['get_temperature', 'get_temperature'])
```

适合：数学、分类、抽取、格式、工具选择序列。

### (b) LLM-as-judge（无标准答案时，如开放问答/摘要质量）
让另一个（通常更强的）模型按**评分标准 (rubric)** 打分：

```js
const verdict = await judge({
  question, answer,
  rubric: '1=答非所问 … 5=准确完整且无臆造。只输出 JSON {score, reason}',
})
```

要点：给明确 rubric、要结构化输出（09）、最好给参考答案当锚、必要时多次取多数票降方差。**judge 有偏差**（偏好长答案、偏好自己风格），别当绝对真理。

### (c) 人工评估
最准但最贵。用于：建初始"黄金集"、校准 LLM-judge 是否和人一致、抽查。

## 4. 评估集从哪来——接 trace

这是 17 篇的红利兑现处：

```
线上/测试跑出的 trace（17 §2）→ 挑代表性 case + 失败 case → 人工标注期望结果 → 沉淀成回归集
```

- **失败 case 必进集**：每修一个 bug，把那个 case 加进评估集，**防止回归**（和 18 篇"prompt 迭代闭环"是同一个环）。
- 从小开始：20–50 个高质量、覆盖典型 + 边界的 case，胜过几千条噪声。

## 5. 离线 replay：可重复地测

评估要可重复，就不能每次真打模型/真调工具（慢、贵、不确定、有副作用）。靠 [11 口子 E](11-extensibility-seams.md#口子-e) 的可注入设计：

- **mock `callModel`**：喂固定的模型响应，确定性地测 loop/工具选择逻辑。
- **replay trace**：拿历史 trace 重放，验证改动后行为是否一致（17 §6 的 replay）。
- 这也是为什么 11/16/17 一直强调"依赖注入 + 状态收敛"——**可评估性是设计出来的，不是事后补的**。

## 6. 指标（按任务选，别全上）

| 指标 | 含义 |
|---|---|
| **成功率 / 准确率** | 端到端任务完成/答对比例 |
| **检索 recall / precision** | RAG 召回的相关性（07/12） |
| **工具选择正确率** | 该调的调了、不该调的没调 |
| **步数 / token / 成本 / 延迟** | 效率与经济性（接口子 A 的账本，17 §3） |
| **回归通过率** | 旧 case 有没有被改坏 |

## 7. 最小实现（Ollama，LLM-as-judge）

```js
const cases = [
  { input: '北京比上海热多少度？', expectIncludes: '4' },
  // …更多 case
]

let pass = 0
for (const c of cases) {
  const answer = await runAgent(c.input)              // 你的 Agent（口子 E）
  const ok = c.expectIncludes                         // 有标准答案 → 确定性断言
    ? answer.includes(c.expectIncludes)
    : (await judge(c.input, answer)).score >= 4        // 无标准答案 → LLM-judge
  pass += ok ? 1 : 0
  if (!ok) console.log('FAIL:', c.input, '→', answer)  // 失败 case 留痕，回流评估集
}
console.log(`通过率 ${pass}/${cases.length}`)
```

跑通后，**每次改 prompt/工具/模型都先跑它**，用数字而不是感觉决策。

## 8. 工程要点 / 坑

- **优先确定性断言**：能用规则判别用模型判，省钱又稳。
- **judge 偏差**：用 rubric + 参考答案 + 多次投票压方差；定期用人工校准 judge。
- **别对评估集过拟合**：评估集不能等于训练/调 prompt 的全部依据，留一部分"不看"的 holdout。
- **数据泄漏**：评估集别混进 few-shot 示例里，否则成绩虚高。
- **小而稳 > 大而乱**：先把 20–50 个高质量 case 跑成闭环，再扩。
- **评估也要进 CI**：改动触发评估，回归通过率掉了就拦住。

---

**关联**：[10 安全护栏](10-tool-safety.md)（防坏 vs 度量好）、[11 口子 E](11-extensibility-seams.md)（可注入→可离线评估）、[17 trace/replay](17-collection-context-memory-trace-checkpoint.md)（评估数据来源）、[18 Prompt 设计](18-prompt-and-instruction-design.md)（迭代闭环）、[09 结构化输出](09-structured-output.md)（judge 输出约束）。

## 延伸阅读
- 💻 [Anthropic Cookbook · Evaluation](https://github.com/anthropics/anthropic-cookbook) —— 可运行的评估/打分示例（含 LLM-as-judge）。
- 📄 [Anthropic 文档 · 创建强评估 (Create strong empirical evaluations)](https://docs.anthropic.com/en/docs/test-and-evaluate/develop-tests) —— 评估集设计、断言 vs 模型评分。
- 📄 [LangSmith / Langfuse 评估文档](https://docs.smith.langchain.com/evaluation) —— 工业级评估流水线、数据集、在线评估的概念可借鉴。
