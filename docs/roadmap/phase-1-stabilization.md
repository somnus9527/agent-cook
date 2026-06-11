# Phase 1 · 让 Agent 真正稳定地跑起来

> 目标：从"mock 能跑通"到"接真模型、长对话、出错也不崩"。这一阶段不追求能力多，只追求**稳**。
> 格式：每点 = 理由 / 方向(市面方案优劣) / 达标标准 / 参考。代码位置见 [`AGENTS.md`](../../AGENTS.md) 路由树。

---

## 1. 接真模型，验证工具调用回路

**理由**：mock 验证了 loop 逻辑，但真模型才会暴露格式/字段坑（Ollama 与 OpenAI 的 `arguments` 类型、回填字段都不同，见 knowledge/13 §4）。工具回路跑不通，后面全白搭。

**方向（优劣）**：
| 方案 | 优 | 劣 |
|---|---|---|
| 本地 Ollama（llama3.1 / qwen） | 零成本、可离线、调流程够用 | 小模型工具调用**不稳**，常该调不调/乱调 |
| 云端 Kimi(k2.5/k2.6) | 工具调用可靠、上下文长 | 花钱、需联网、需管密钥 |

建议：**先 Ollama 调通机制，再切 Kimi 测真实效果**（切只动 `AGENT_PROVIDER`）。

**达标标准**：一个需要 2 次工具调用的任务（如"北京比上海热几度"）端到端答对；中途工具报错时模型能据回填的 error 自我修正而非崩溃。

**参考**：knowledge/03、13；[Anthropic Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents)。

---

## 2. 流式输出（streaming）

**理由**：长回答一次性等完才显示，体感很差；Agent CLI 要边出边显。

**方向（优劣）**：
| 方案 | 优 | 劣 |
|---|---|---|
| 非流式（现状） | 实现简单 | 首字延迟高、无"在思考"反馈 |
| 流式 token（provider stream + writeChunk） | 体验好、可中途取消 | 要处理增量拼接、tool_calls 在流中的组装更麻烦 |

落点：`callModel` 增一个流式分支（provider 的 `stream:true`），通过回调把 chunk 喂给 `frontend.writeChunk`。

**达标标准**：纯文本回答能逐字显示；有 tool_calls 时能正确从流中组装出完整调用再执行。

**参考**：knowledge/02（Ollama 流式）、01（SSE，若做 Web）。

---

## 3. 调模型的重试 / 超时 / 限流

**理由**：网络抖动、429、超时是常态。散落处理会很乱——正好收口在口子 A。

**方向（优劣）**：
| 方案 | 优 | 劣 |
|---|---|---|
| 不处理（现状） | 简单 | 一抖就整轮失败 |
| 固定重试 | 易写 | 雪崩风险 |
| 指数退避 + 抖动 + 上限 | 稳健、行业标准 | 多几行代码 |

落点：`seams/callModel.ts` 包一层 retry/backoff + AbortController 超时。

**达标标准**：注入"前 2 次失败、第 3 次成功"的 provider，loop 能自动重试成功；超时能中断而非永久挂起。

**参考**：knowledge/11 口子A；[Google SRE: Handling Overload / backoff](https://sre.google/sre-book/handling-overload/)。

---

## 4. 死循环 / 重复工具调用防护

**理由**：模型可能反复调同一个工具同一参数，烧 token 还不前进。仅靠 maxSteps 太粗。

**方向（优劣）**：
| 方案 | 优 | 劣 |
|---|---|---|
| 仅 maxSteps（现状） | 兜底简单 | 浪费到上限才停 |
| 重复调用检测（同名+同参数连续 N 次→打断/提示） | 早停、省钱 | 需定义"重复"的判定 |
| 进度启发式（无新信息就降权/提示换策略） | 更智能 | 实现复杂 |

落点：`loop/reactLoop.ts` 在分发前查最近若干 tool_call 指纹。

**达标标准**：构造一个"模型死循环调同一工具"的 mock，能在 N 次后打断并给出可解释的失败信息。

**参考**：knowledge/04 §工程要点。

---

## 5. 工具参数校验

**理由**：模型给的参数可能缺字段/类型错。不校验直接执行 = 运行时炸或脏数据。

**方向（优劣）**：
| 方案 | 优 | 劣 |
|---|---|---|
| 不校验（现状） | 简单 | 错参直接进工具体 |
| 手写校验 | 无依赖 | 重复、易漏 |
| Schema 校验（zod / ajv，对齐工具的 JSON Schema） | 声明式、错误信息好、可回填给模型自修 | 引依赖 |

落点：`seams/dispatchTool.ts` 执行前校验，失败把校验错误**回填**让模型重试。

**达标标准**：缺必填参数时不进工具体，错误作为 observation 回填，模型能据此补齐重调。

**参考**：knowledge/09、10；[zod](https://zod.dev/) / [ajv](https://ajv.js.org/)。

---

## 6. 人在环确认（副作用工具）

**理由**：有副作用的工具（写文件/发请求/花钱）误调代价高，且 resume 重放会重复执行（knowledge/17 §6.5）。

**方向（优劣）**：
| 方案 | 优 | 劣 |
|---|---|---|
| 全自动 | 流畅 | 危险操作无刹车 |
| 危险操作前确认（y/N） | 安全、可控 | 打断流程 |
| 白名单/策略（只读自动、写操作确认） | 平衡 | 要维护策略 |

落点：`seams/dispatchTool.ts` 执行前，按工具标记触发 `frontend` 确认；配合幂等。

**达标标准**：标记为副作用的工具执行前必须经确认；拒绝时把"用户拒绝"回填，模型换路线。

**参考**：knowledge/10；[Anthropic Building Effective Agents（human-in-the-loop）](https://www.anthropic.com/engineering/building-effective-agents)。

---

## 7. 上下文不爆（先做截断保 system）

**理由**：多轮 + 工具结果累积，迟早超 `num_ctx`，导致报错或静默截断、答案变差。

**方向（优劣）**：
| 方案 | 优 | 劣 |
|---|---|---|
| 不管（现状） | 简单 | 长对话必爆 |
| 截断/滑窗（保 system + 最近 N） | 简单有效，入门首选 | 丢早期信息 |
| 摘要压缩 / RAG 外置 | 保信息 | 复杂（→ Phase 2） |

落点：`seams/buildContext.ts` 先实现截断保 system；触发阈值按消息数或 token。

**达标标准**：制造超长历史时，发送的 messages 稳定控制在窗口内且始终含 system；不再触发超限错误。

**参考**：knowledge/08；[Anthropic Effective Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)。

---

## 8. 基础可观测（trace 落 JSONL）

**理由**：调 Agent 全靠看每步轨迹。现在 traceSink 是 no-op，出问题没法定位，也没评估素材。

**方向（优劣）**：
| 方案 | 优 | 劣 |
|---|---|---|
| console.log 散落 | 零成本 | 不结构化、难检索 |
| JSONL 落盘（订阅 emit 事件流） | 结构化、可回放、可喂评估 | 需定文件格式 |
| 接 OTel/Langfuse 等 | 工业级面板 | 重（→ Phase 2） |

落点：`collection/traceSink.ts` 把 `AgentEvent` 逐条 append 成 JSONL（按 sessionId 分文件）。

**达标标准**：跑一个 run 后，能从 trace 文件按时序还原"每步调了什么模型/工具、入参出参/耗时/错误"。

**参考**：knowledge/17 §2/§5；[OpenTelemetry GenAI 语义约定](https://opentelemetry.io/docs/specs/semconv/gen-ai/)。

---

## Phase 1 验收

全部达标后，agent-cook 应能：**接真模型、多轮对话、流式输出、出错重试不崩、不死循环、危险操作有确认、长对话不爆、每步可追溯**。这就是"稳定地真正跑起来"。之后进 [Phase 2](phase-2-capability-optimization.md) 做深各能力。
