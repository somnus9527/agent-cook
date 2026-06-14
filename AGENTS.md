# AGENTS.md · agent-cook 项目总纲与路由树

> 本文件是项目的**单一入口**：讲清期望、架构大纲、当前状态，并给出一棵**优化路由树**——
> 每个能力点指向「概念文档(knowledge) + 优化文档(roadmap) + 代码位置」，让后续优化有方向、可索引。
> 详细的「为什么优化 / 怎么选方案 / 达标标准 / 参考资料」在 `docs/roadmap/` 下分篇展开。

---

## 一、项目期望（这是什么 / 要什么 / 不要什么）

**agent-cook 是一个"手搓、可学习、可成长"的 Agent CLI**：不依赖 LangChain 等框架，自己把 Agent 的每一层搭出来，理解每个决策为什么这么做。

- **目标**：一个跑在终端的单 Agent，能多轮对话、调工具、断点续跑；能在 Ollama(本地) 与 Kimi(云端) 间切换；架构上为未来能力（Memory/RAG/评估/可观测/多 Agent）**留好口子**。
- **核心原则**（贯穿全项目）：
  1. **五个口子单一收口**（A 调模型 / B 执行工具 / C 装上下文 / D 发事件 / E 可注入入口）——横切能力都挂在口子上，不散落。见 `docs/knowledge/11`。
  2. **loop 只读内存 state 做决策**，sink 都是投影（CQRS）。见 `docs/knowledge/17 §7.1`。
  3. **先简单，再优化**：每个点先有"能跑的最小实现"，再按 roadmap 升级；不过度设计。
- **非目标（暂不做）**：Web UI（前端可替换，接口已留）、多 Agent 编排（口子 E 已留位）、分布式/高并发。

---

## 二、架构大纲（一张图 + 代码位置）

```
I/O 前端(可替换)   src/io/{frontend,rawTty}.ts        只读写终端，不拥有 loop
      ↕
App / Session     src/app.ts                          装配五口子成 Deps、多轮对话、--resume
      ↕
AgentLoopManager  src/loop/manager.ts                 route(state)：默认 ReAct，按需升级 Plan-Execute
      ↕
AgentLoop         src/loop/reactLoop.ts               两分支：tool_calls | final
   └─ 全程只用 Deps 的五个口子：
        A callModel     src/seams/callModel.ts  → providers/{ollama,openaiCompatible}.ts
        B dispatchTool  src/seams/dispatchTool.ts → tools/tool.ts (registry)
        C buildContext  src/seams/buildContext.ts → collection/memoryStore.ts
        D emit          src/seams/emit.ts        → collection/traceSink.ts
        E (runAgent)    reactLoop 本体，输入→{output,state}
   收集：checkpoint = collection/checkpointStore.ts（critical path，每 step 存档）
```

数据怎么串、ReAct 一步的口子顺序、resume 路径：见 `docs/examples/wiring.md`。
分层与两分支的设计依据：`docs/knowledge/16`；四类收集：`docs/knowledge/17`。

---

## 三、当前状态（已实现并验证 / 仍是桩）

| 模块 | 状态 |
|---|---|
| 类型契约 `types.ts`、配置 `config.ts` | ✅ 完成 |
| App/Session、`index.ts` 入口、`--resume` 路径 | ✅ 完成 |
| ReAct loop（两分支 + 工具回填 + maxSteps 兜底） | ✅ 完成，确定性 e2e 通过 |
| 五口子 A/B/D + C(透传) | ✅ 完成 |
| Provider：Ollama + 通用 OpenAI 兼容(Kimi 预设) | ✅ 完成（真模型工具回路待你接真模型验证） |
| CheckpointStore（文件快照 + 原子写 + load/resume） | ✅ 完成 |
| RawTTY（真 raw mode + keypress） | ✅ 完成（交互回显需真 TTY 手验） |
| 工具 registry | ✅ 完成，但**未注册任何工具**（仿 `docs/examples/example-tool.ts`） |
| TraceSink | ⛳ 桩（no-op）→ Phase 1 |
| MemoryStore（recall→[]、write→noop） | ⛳ 桩 → Phase 2 |
| buildContext 的压缩/召回 | ⛳ 仅透传 → Phase 1(截断) / Phase 2(压缩·召回) |
| PlanExecuteLoop | ⛳ 抛未实现 → Phase 2 |

---

## 四、优化路由树（后续方向总索引）

> 两个阶段：**Phase 1 = 让它稳定地真正跑起来**；**Phase 2 = 每个能力点做深做好**。
> 每个点的「理由 / 方向(市面方案优劣) / 达标标准 / 参考」在右列 roadmap 文档里展开。

### Phase 1 · 稳定跑起来（详见 [`docs/roadmap/phase-1-stabilization.md`](docs/roadmap/phase-1-stabilization.md)）

| 点 | 概念文档 | 代码位置 |
|---|---|---|
| 接真模型验证工具回路 | knowledge/03,13 | providers/* |
| 流式输出 streaming | knowledge/02 | seams/callModel + io/rawTty(writeChunk) |
| 调模型的重试/超时/限流 | knowledge/11(A) | seams/callModel.ts |
| 死循环/重复工具调用防护 | knowledge/04 | loop/reactLoop.ts |
| 工具参数校验 | knowledge/09 | seams/dispatchTool.ts |
| 人在环确认（副作用工具） | knowledge/10 | seams/dispatchTool.ts |
| 上下文不爆（截断保 system） | knowledge/08 | seams/buildContext.ts |
| 基础可观测（trace 落 JSONL） | knowledge/17 | collection/traceSink.ts |

### Phase 2 · 能力点优化（详见 [`docs/roadmap/phase-2-capability-optimization.md`](docs/roadmap/phase-2-capability-optimization.md)）

| 领域 | 优化点 | 概念文档 | 代码位置 |
|---|---|---|---|
| 地基 | Prompt/指令设计调优 | knowledge/18 | app.ts(initState) / 工具 description |
| 地基 | 模型选择与路由 | knowledge/13 | seams/callModel.ts |
| 上下文 | 历史压缩/摘要策略 | knowledge/08 | seams/buildContext.ts |
| 记忆 | 分级 Memory / 向量·图 / 衰减·冲突 | knowledge/06,14 | collection/memoryStore.ts |
| 检索 | RAG 检索质量 + 知识库 | knowledge/07,12,14 | buildContext / memoryStore |
| 工具 | 工具设计 + MCP 接入 | knowledge/03,15,18 | tools/tool.ts |
| 工具 | Skill（按需加载的能力包） | knowledge/20 | tools/(新增 SkillRegistry) + seams/buildContext |
| 安全 | 沙箱/权限/注入防护 | knowledge/10 | seams/dispatchTool.ts |
| 编排 | Plan-Execute-Replan 实现 | knowledge/05,16 | loop/planExecuteLoop.ts |
| 编排 | 多 Agent（Agent-as-tool） | knowledge/11(E) | loop/* + tools/* |
| 可靠性 | 评估体系（eval/judge/回归） | knowledge/19 | 新增 eval harness |
| 可靠性 | 可观测/追踪（OTel/span） | knowledge/17 | collection/traceSink.ts |
| 成本 | 缓存 + token/成本预算 | knowledge/11(A),17 | seams/callModel.ts |
| 持久化 | 事件溯源 + durable execution | knowledge/17 | collection/checkpointStore.ts |

---

## 五、给后续协作者（含 AI agent）的约定

- 改任何横切能力，先问："它是否要在每次调模型/执行工具处插一脚？" 是 → 改对应口子，别散落（knowledge/11 §4）。
- 保持 `pnpm typecheck` 绿；新增可注入依赖优先，方便 mock 做评估（knowledge/11 口子E、19）。
- 文档约定：**概念**进 `docs/knowledge/`，**优化路线**进 `docs/roadmap/`，**参考片段**进 `docs/examples/`，源码在 `src/`。查漏用 [`docs/coverage-map.md`](docs/coverage-map.md)（对照 Claude Code/Codex/Hermes + 权威文章的覆盖图，**对外部参照系查、别只对自己提纲查**）。
- 运行（dev）：本地 `ollama serve` + `pnpm dev`；云端 `pnpm dev --provider kimi`（key 放系统环境变量 `MOONSHOT_API_KEY`）。
- 打包/分发：`pnpm build`（rollup → `dist/index.js`，node shebang，deps external）→ `pnpm start` 跑产物，或 `pnpm link --global` 后直接 `agent-cook`。
- 配置：`agent-cook.toml`（用户级 `~/.agent-cook/` 或项目级 `./`，见 `agent-cook.toml.example`）。优先级：默认 < 用户级 < 项目级 < 环境变量 < CLI(`--provider/--model`)。**密钥纪律**：toml 只写 `env_key`（环境变量名），真实 key 在使用者系统环境变量里，仓库/配置永不碰真 key。
