# Phase 2 · 能力点优化

> 基线稳了之后，逐个把能力做深。每点 = 理由 / 方向(市面方案优劣，建议各试体会) / 达标标准 / 参考。
> 概念见对应 `docs/knowledge/`，代码位置见 [`AGENTS.md`](../../AGENTS.md) 路由树。挑你最想强化的先做，不必按序。

---

## A. 地基

### A1. Prompt / 指令设计调优
**理由**：最便宜的大杠杆。同模型下，system prompt 与工具描述写法直接决定工具调用正确率与稳定性。
**方向**：
| 方案 | 优 | 劣 |
|---|---|---|
| 一段式 system | 快 | 规则冲突、难维护 |
| 分块 system（身份/工具规则/工作流/输出/红线） | 可读、模型遵循好 | 要花心思组织 |
| + Few-shot 示例 | 定形状、稳格式 | 占 token、可能过拟合 |
| 把"何时规划"烤进 prompt（plan-as-tool 触发） | 复杂任务更稳 | 弱模型未必听 |
**达标标准**：用一组固定任务对比改写前后，工具调用正确率/格式合规率有可量化提升（接 D1 评估）。
**参考**：knowledge/18；[Anthropic Prompt engineering 概览](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview)。

### A2. 模型选择与路由
**理由**：强模型贵、弱模型省但易错；按任务难度路由能省钱保质。
**方向**：
| 方案 | 优 | 劣 |
|---|---|---|
| 单模型固定 | 简单 | 要么贵要么弱 |
| 按任务路由（简单→小模型，复杂→大模型） | 性价比高 | 要判定难度 |
| 分角色用不同模型（规划用强、执行用快） | 各取所长 | 编排复杂 |
**达标标准**：在不明显掉质量前提下，对一批任务的平均成本较"全用大模型"下降可观。
**参考**：knowledge/13；[Anthropic Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents)。

---

## B. 上下文工程

### B1. 历史压缩 / 摘要策略（升级 Phase 1 的截断）
**理由**：截断会丢早期关键信息；长任务需要"压而不丢"。
**方向**：
| 方案 | 优 | 劣 |
|---|---|---|
| 截断/滑窗（Phase 1） | 简单 | 丢早期信息 |
| 摘要压缩（旧段→要点，MemGPT 思想） | 保关键事实 | 多一次 LLM 调用、可能丢细节 |
| 分层（system + 早期摘要 + 最近原文 + 召回片段） | 实战最优配方 | 实现与触发阈值要调 |
| 子 Agent 摘要（重活外包，只回短摘要） | 主上下文极简 | 引入子 Agent |
**达标标准**：超长对话下保持窗口内，且对"早期出现的关键事实"的问答准确率不明显下降。
**参考**：knowledge/08、17(术语 compaction/子Agent摘要)；[Anthropic Effective Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)。

---

## C. 记忆 Memory

### C1. 分级记忆 + 存储选型 + 衰减/冲突
**理由**：跨会话记住用户偏好/事实，是从"工具"到"助理"的关键；但记不好会膨胀、过时、自相矛盾。
**方向**：
| 方案 | 优 | 劣 |
|---|---|---|
| 无长期记忆（现状 recall→[]） | 简单 | 每次从零 |
| 关键词/最近 N 条 | 易实现 | 召回差 |
| 向量检索（embedding 语义召回） | 语义匹配强 | 需 embedding + 向量库 |
| 知识图谱/时序图（Zep 式） | 关系/时间感强 | 重 |
| OS 式分页换入换出（MemGPT/Letta） | 长期记忆系统化 | 复杂 |
并需处理**衰减**（旧记忆降权）与**冲突消解**（新偏好覆盖旧）。
**达标标准**：跨会话能正确召回此前确认的用户偏好；用户更新偏好后旧值不再误用。
**参考**：knowledge/06、14、17(术语 衰减/冲突消解)；[MemGPT 论文](https://arxiv.org/abs/2310.08560)、[Letta](https://github.com/letta-ai/letta)、[mem0](https://github.com/mem0ai/mem0)、[Zep](https://www.getzep.com/)。

---

## D. 检索 RAG / 知识库

### D1. RAG 检索质量
**理由**：召回不准，开卷考试也答不对；检索是 RAG 的命门。
**方向**：
| 方案 | 优 | 劣 |
|---|---|---|
| 纯向量检索 | 语义召回 | 关键词/精确匹配弱 |
| 关键词(BM25) | 精确词命中强 | 无语义 |
| 混合检索 + 重排(rerank) | 召回与精度兼顾 | 多组件 |
| 查询改写 / 多查询 | 提召回 | 多调用 |
配合 chunk 策略、元数据过滤、知识库治理（knowledge/12）。
**达标标准**：在一组带标准答案的问答上，检索 recall/precision 与端到端答对率较纯向量基线提升（接评估 E1）。
**参考**：knowledge/07、12、14；[RAG 原论文](https://arxiv.org/abs/2005.11401)。

---

## E. 工具 / 安全

### E1. 工具设计 + MCP 接入
**理由**：工具是 Agent 的手；描述与边界写不好，再强模型也调错。MCP 让外部工具标准化接入。
**方向**：
| 方案 | 优 | 劣 |
|---|---|---|
| 内置工具（手写 Tool） | 可控 | 每个都要写 |
| MCP server 适配进 registry | 复用生态、标准化 | 引入外部依赖与信任边界 |
工具粒度、命名、`description` 写"何时用/何时不用"是重点（knowledge/18 §3）。
**达标标准**：新增/接入一个工具后，模型在该用时调、不该用时不调，正确率达标；MCP 工具与内置工具对 loop 完全一致（都经口子 B）。
**参考**：knowledge/03、15、18；[MCP 官方文档](https://modelcontextprotocol.io)。

### E2. 沙箱 / 权限 / 注入防护
**理由**：工具输出、检索文档、用户粘贴文本都不可信；prompt 注入会劫持 Agent。
**方向**：
| 方案 | 优 | 劣 |
|---|---|---|
| 全信任 | 简单 | 危险 |
| 指令优先级 + "数据非指令"声明 | 挡大部分注入 | 非绝对 |
| 沙箱执行（限文件/网络/资源） + 最小权限 | 隔离爆炸半径 | 工程量大 |
| 输出过滤 / 审计日志 | 可追责 | 需维护 |
**达标标准**：经典注入样本（"忽略以上指令…"出现在工具结果/文档里）不能改变 Agent 行为；危险操作有权限边界。
**参考**：knowledge/10；[OWASP Top 10 for LLM Apps](https://owasp.org/www-project-top-10-for-large-language-model-applications/)。

---

## F. 编排

### F1. Plan-Execute-Replan 实现
**理由**：长任务（10+ 步、有依赖）ReAct 易绕路；显式 plan 锚定目标更稳。
**方向**：
| 方案 | 优 | 劣 |
|---|---|---|
| 纯 ReAct（现状） | 简单灵活 | 长任务跑偏、token 爆 |
| plan-as-tool（哑工具记录计划） | 轻、主循环不变 | 计划是软约束 |
| 独立 Plan-Execute-Replan 引擎 | 全局视野强、可纠偏 | 调用多、状态管理复杂 |
| ReWOO/LLMCompiler（可并行任务图） | 省调用、提并发 | 实现重 |
落点：`loop/planExecuteLoop.ts`，**每步执行器复用 ReActLoop**（嵌套，不是平行）。
**达标标准**：一个明确的多步任务，Plan-Execute 版比纯 ReAct 更少绕路/更稳完成（用 trace 对比步数与成功率）。
**参考**：knowledge/05、16 §4/§5；[ReAct 论文](https://arxiv.org/abs/2210.03629)、[LangGraph](https://docs.langchain.com/oss/python/langgraph/overview)。

### F2. 多 Agent（Agent-as-tool）
**理由**：复杂域里"一个专精 Agent 当另一个的工具"能分治。
**方向**：
| 方案 | 优 | 劣 |
|---|---|---|
| 单 Agent | 简单 | 上限有限 |
| Orchestrator + 子 Agent（子 Agent 包成 tool，口子 E） | 分治、可复用 | 编排/上下文传递复杂、成本高 |
**达标标准**：把一个子任务封成 Agent-as-tool，主 Agent 调用并正确整合其短摘要结果。
**参考**：knowledge/11 口子E；[Anthropic Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents)。

---

## G. 可靠性

### G1. 评估体系（eval / LLM-as-judge / 回归）
**理由**：没有评估，改 prompt/换模型全靠感觉，无法判断变好变坏。
**方向**：
| 方案 | 优 | 劣 |
|---|---|---|
| 手测几个例子 | 零成本 | 自欺、不可重复 |
| 确定性断言（有标准答案） | 稳、便宜 | 仅适合可判定任务 |
| LLM-as-judge（开放任务，给 rubric） | 覆盖主观质量 | judge 有偏差、需校准 |
| 评估集来自 trace + 失败 case 回归 | 防回归、贴真实 | 需治理数据集 |
落点：新增一个注入 mock callModel 的离线 eval harness（口子 E 已支持）。
**达标标准**：有一个 20–50 例的回归集，CI/本地可一键跑出通过率；每修一个 bug 把 case 入集。
**参考**：knowledge/19；[Anthropic 评估文档](https://docs.anthropic.com/en/docs/test-and-evaluate/develop-tests)、[LangSmith Evaluation](https://docs.smith.langchain.com/evaluation)。

### G2. 可观测 / 追踪（升级 Phase 1 的 JSONL）
**理由**：JSONL 够 debug，但要面板/成本/延迟分析需结构化 span。
**方向**：
| 方案 | 优 | 劣 |
|---|---|---|
| JSONL（Phase 1） | 简单 | 无面板/聚合 |
| OTel span（GenAI 语义约定） | 标准、可接任意后端 | 需埋点规范 |
| Langfuse/LangSmith/Phoenix | 现成面板/评估 | 引外部服务 |
**达标标准**：每个 run 形成 span 树（run→model_call/tool_call），可看耗时/成本/错误聚合。
**参考**：knowledge/17;[OTel GenAI](https://opentelemetry.io/docs/specs/semconv/gen-ai/)、[Langfuse](https://langfuse.com/docs)。

---

## H. 成本与持久化

### H1. 缓存 + token/成本预算
**理由**：重复请求与无上限消耗烧钱；预算上限防失控。
**方向**：
| 方案 | 优 | 劣 |
|---|---|---|
| 无（现状） | 简单 | 重复花钱、可能跑飞 |
| 结果缓存（相同请求命中） | 省钱省时 | 失效/一致性 |
| Prompt 缓存（供应商侧） | 长 system 省钱 | 依赖供应商支持 |
| token/成本账本 + 预算上限 | 可控、可观测 | 需统计与拦截 |
落点：口子 A（`seams/callModel.ts`）统一挂缓存与账本。
**达标标准**：相同请求二次命中缓存；累计成本可统计，超预算能拦截/告警。
**参考**：knowledge/11 口子A、17 §3。

### H2. 事件溯源 + durable execution（升级快照 checkpoint）
**理由**：快照覆盖丢历史、无时间旅行；长任务/审批中断需要更强的持久执行。
**方向**：
| 方案 | 优 | 劣 |
|---|---|---|
| 文件快照（现状） | 简单 | 无历史/回放 |
| 追加日志/事件溯源 | 白送可观测/回放/时间旅行 | 略复杂 |
| 专用引擎（Temporal/Restate/DBOS） | 工业级持久执行、自动重放 | 重、学习成本 |
关键仍是**幂等**（重放有副作用步骤要安全，knowledge/17 §6.5）。
**达标标准**：进程中途被杀后 resume 能从最近 step 继续，且有副作用的步骤不重复执行。
**参考**：knowledge/17 §6；[LangGraph Persistence](https://docs.langchain.com/oss/python/langgraph/persistence)、[Durable Execution 详解](https://vadim.blog/durable-execution-agents-that-survive-failure-and-resume-where-they-left-off)、[Temporal](https://temporal.io/)。

---

## 怎么验收一个点

挑一个点 → 读对应 knowledge 概念 → 按"方向"实现/对比几种方案 → 用"达标标准"验证（最好接 G1 评估量化）→ 回 `AGENTS.md` 路由树更新状态。**始终：先简单跑通，再优化；横切能力挂口子，不散落。**
