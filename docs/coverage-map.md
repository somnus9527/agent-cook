# 覆盖图（Coverage Map）

> 防止"又漏掉一个 skill"的工具。**不要只对自己的提纲查覆盖度（自指、查不出提纲本身的盲区）**——对**外部独立参照系**查。本表把本项目文档映射到三个优秀实现 + 一篇权威文章，缺的标 ❌。怀疑有漏时，跑这张表，而不是凭感觉。
>
> ⚠️ **"完整"不可证明**。本表只能说"对照这 N 个参照系无缺口"，N 越多越可信，但永不等于穷尽。

## 参照系

- **Building Effective Agents**（Anthropic）—— 概念/模式权威。
- **Claude Code**（Anthropic CLI Agent）—— 我们对标的形态。
- **Codex CLI**（OpenAI，Rust，开源）—— 见 [docs](https://developers.openai.com/codex/cli)。
- **Hermes Agent**（Nous Research，开源）—— 见 [docs](https://hermes-agent.nousresearch.com/docs/)。

## 覆盖矩阵

| 概念 / 能力 | 本项目文档 | Claude Code | Codex | Hermes | 状态 |
|---|---|---|---|---|---|
| Agent loop（ReAct，session/run/step） | 04, 16 | ✓ | ✓ (turn/thread) | ✓ (ReAct 同步) | ✅ |
| 工作流 vs Agent + 模式菜单 | **21（新）** | ✓ | ✓ | ✓ | ✅ |
| Routing | 16 §5.3 | ✓ | ✓ (/model 路由) | ✓ | ✅ |
| Plan-Execute / orchestrator-workers | 05, 16, 21 | ✓ | ✓ (subagents) | ✓ (子Agent委派) | ✅ |
| 多 Agent / subagent | 11(E), 21 | ✓ | ✓ | ✓ | ⚠️ 概念有，未实现（roadmap F2） |
| 工具 / function calling | 03 | ✓ | ✓ | ✓ | ✅ |
| MCP | 15 | ✓ | ✓ | ✓ | ✅ |
| **Skill（按需加载能力包）** | 20 | ✓ | ✓ | ✓ (自学习skill) | ✅ |
| 工具描述 / ACI / Poka-yoke | 18(§3,§3.5) | ✓ | ✓ | ✓ | ✅ |
| 结构化输出 | 09 | ✓ | ✓ | ✓ | ✅ |
| 上下文管理 / 压缩 compaction | 08, 17 | ✓ | ✓ | ✓ (压缩检查) | ✅ |
| Memory（含反思→沉淀skill） | 06 | ✓ | ✓ | ✓ (闭环学习) | ✅ |
| RAG / 知识库 | 07, 12, 14 | ✓ | ✓ (web cache) | ✓ | ✅ |
| Prompt / 指令设计 | 18 | ✓ | ✓ | ✓ | ✅ |
| AGENTS.md 指令 | AGENTS.md | ✓ | ✓ (指令链/合并) | ✓ | ✅ |
| 多 provider / 模型路由 | 13 | ✓ | ✓ (/model) | ✓ (model-agnostic) | ✅ |
| Checkpoint / resume / 持久执行 | 17, 11§5 | ✓ | ✓ (thread) | ✓ (持久) | ✅ |
| 可观测 / trace | 17 | ✓ | ✓ | ✓ (流式工具输出) | ⚠️ 概念有，trace桩待实现(Phase1) |
| 评估 Evaluation | 19 | ✓ | ✓ | ✓ | ✅ |
| 安全 / 沙箱 / 审批 | 10 | ✓ | ✓ (OS沙箱+审批档) | ✓ (多执行后端) | ⚠️ 概念有，OS级沙箱+审批档较浅 |
| 流式输出 streaming | roadmap P1 | ✓ | ✓ | ✓ | ⚠️ roadmap 待做 |
| 成本 / 缓存 / 预算 | roadmap H1, 17 | ✓ | ✓ (prompt cache) | ✓ | ⚠️ roadmap 待做 |

## 对照后发现、且本轮已补的

- **工作流模式菜单**（prompt chaining / parallelization 分片·投票 / orchestrator-workers / evaluator-optimizer） → 新增 [21](knowledge/21-workflow-patterns.md)。这是和 skill 同源的漏（我们的分层模型没给"工作流模式"留位置）。
- **ACI / Poka-yoke 工具防错** → 补进 [18 §3.5](knowledge/18-prompt-and-instruction-design.md)。
- evaluator-optimizer（在线自纠）→ 21 §5 仅概念登记，按你要求**不展开、不进 roadmap**。

## 对照后发现、尚未处理的（待你定夺，**非自动纠错类**）

| 缺口 | 在哪些实现里有 | 性质 | 建议 |
|---|---|---|---|
| **中断 / 打断重定向**（interrupt / steer，运行中打断模型或工具） | Codex（可中断）、Hermes（interrupt-and-redirect） | 运行时 / UX，**不是自动纠错** | 概念已记入 [16 §7](knowledge/16-runtime-layering-and-loop.md)（三对象 + Controller/Signal + AbortSignal 组合）；实现待定，建议 Phase 1 |
| **斜杠 / 元命令**（/model、/clear、history、doctor、profiles） | Claude Code、Codex、Hermes 都有 | 功能 / UX 层 | 锦上添花，非核心概念 |
| **OS 级沙箱 + 审批档**（Seatbelt/Landlock、workspace-write/danger-full-access、多执行后端） | Codex、Hermes 强 | 10 篇较浅 | 做工具安全(roadmap E2)时深化 |
| **程序化工具调用 / code mode**（模型写代码批量调工具，省多轮往返） | Hermes（execute_code） | 新兴编排手法 | 可作为编排进阶，了解即可 |

> 这几条里只有"中断"我认为够格进 Phase 1（它在 2/3 的实现里都有，且和体验强相关）；其余功能/进阶级，按需再说。

## 怎么用这张表

1. 怀疑有漏 → 先看"尚未处理"区，再挑一个新参照系（如某个生产 Agent 特性清单）扩列。
2. 每补一个能力 → 在矩阵里更新状态。
3. 记住：**这张表减少盲区，但不证明完整**。
