# 20 · Skill（技能）

> 阶段 3（了解 / 进阶）。Skill 是把"一段专家指令 + 配套脚本/工具 + 资源"打包成一个**按需加载的能力单元**。本篇讲它是什么、与 tool/MCP/prompt 的区别、核心的"渐进式披露"机制，以及**如何落到本项目的口子上**（结论：不是新原语，站在工具+上下文之上）。配 [03 工具](03-tool-calling.md)、[15 MCP](15-mcp-explained.md)、[16 §3/§5](16-runtime-layering-and-loop.md)、[18 Prompt](18-prompt-and-instruction-design.md) 读。

## 1. Skill 是什么

业界（Anthropic Agent Skills）定义：一个 Skill = **`SKILL.md`（元信息 + 一段指令/操作手册）+ 可选的捆绑脚本/工具 + 资源文件**，打包成一个文件夹。模型在需要时**发现并加载**它，从而临时获得一项专长（如"按公司规范写周报""操作某内部系统"）。

和已有概念的区别：

| | 是什么 | 粒度 |
|---|---|---|
| **Prompt/指令**（18） | 喂给模型的文字规则 | 一段文本 |
| **Tool**（03） | 模型可调用的一个函数 | 一个能力点 |
| **MCP**（15） | 工具/数据的标准接入协议 | 一批工具的来源 |
| **Skill** | 指令 + 工具/脚本 + 资源的**打包单元**，按需加载 | 一个"专长包" |

一句话：**Skill ≈ 指令(18) + 工具(03) 的打包 + 按需加载机制。** 它不替代工具，而是组织工具与指令的更高层单位。

## 2. 核心机制：渐进式披露（progressive disclosure）

Skill 的灵魂不在"有指令"，而在**怎么按需加载**——否则把所有 skill 的完整正文都塞进上下文会瞬间爆窗（08/17）。三层加载：

```
① 平时：上下文里只放每个 skill 的【名字 + 一句描述】（便宜，常驻）
② 命中：模型判定某 skill 相关时，载入它的【完整 SKILL.md 正文】到上下文
③ 执行：该 skill 捆绑的脚本/工具变为【可调用】（注册进工具表）
```

这就是 [16 §3](16-runtime-layering-and-loop.md) 讲的 **just-in-time / pull**：描述是 push（常驻），正文与工具是 pull（用时才取）。

## 3. 映射到本项目的口子（不是新原语）

Skill 拆成三块，全部落在已有 seams 上，**loop 主体与两分支不动**：

| Skill 组成 | 本质 | 落在 |
|---|---|---|
| SKILL.md 正文（指令） | 一段上下文/提示 | 口子 C（buildContext 临时注入）+ Prompt(18) |
| 捆绑脚本/工具 | 就是 Tool | 口子 B（dispatchTool）+ registry（已统一收内置/MCP） |
| 描述常驻、正文按需载入 | 渐进式披露 | 口子 C（pull）+ 一个 `use_skill` 工具（B） |

新增的只是一个 **SkillRegistry / SkillLoader 模块**：扫描 `SKILL.md`、对外暴露"名字+描述"、激活时把正文喂给 C、把工具注册进 registry。**它喂现有口子，不开新口子。**

## 4. 激活：又是"模型决定 vs 代码决定"

和 [16 §5](16-runtime-layering-and-loop.md) 的规划判定同构，skill"何时激活"两条路：

| 路线 | 怎么做 | 评价 |
|---|---|---|
| **模型决定** | 给一个 `use_skill(name)` 工具，模型想用就调 → 走 B；激活后把正文作为结果/临时注入回上下文(C) | 简单，模型自分类；弱模型可能不准 |
| **代码决定/自动** | buildContext 用 query 语义匹配相关 skill，自动拉正文进来（RAG 式 pull） | 不依赖模型自觉；要检索逻辑 |

入门用"模型决定 + `use_skill` 工具"最直接。

## 5. 需要的架构支持

1. **工具集动态化（唯一的真改造，已做）**：原 `Deps.toolSchemas` 是启动时定死的数组；已改成 **`getToolSchemas(state)`** 每轮现算（读当前 registry）。skill 激活后把工具加进 registry，模型下一轮就能看到。动态 MCP 同理。
2. **激活态进 state**：哪些 skill 已激活记进 `AgentState`，resume 时恢复（17 §6）。
3. **守上下文预算**：只常驻描述，正文按需载入、可在压缩时换出（08）。
4. **安全（重要）**：skill 捆绑可执行代码 = 供应链/不可信代码风险。加载第三方 skill 要走信任边界/沙箱、对其脚本按工具一样校验与确认（10）。

## 6. 与程序性记忆的关系

[06 §程序性记忆](06-memory-architecture.md) 提过"可复用 skill"：Agent 反思后把"怎么做某事"沉淀成新 skill，本质就是**把学到的流程打包成第 2 节那种单元**。Memory 负责"记住该用哪个 skill"，Skill 负责"装着具体怎么做"。

## 7. 工程要点 / 坑

- **别一上来加载全部正文**：渐进式披露是重点，否则 skill 越多上下文越废。
- **描述要写好**：模型靠"名字+描述"决定激活，写法同工具描述（18 §3 的"何时用"）。
- **skill 的工具仍走口子 B**：校验/确认/审计一视同仁，别因为"来自 skill"就放行。
- **激活态要随会话持久化**，否则 resume 后 skill 没了、上下文里却还引用着它。
- **先简单**：没有强需求时，单独的内置工具 + 好 prompt 往往够用；skill 是"能力多到需要打包按需加载"时才划算。

---

**关联**：[03 工具](03-tool-calling.md)、[15 MCP](15-mcp-explained.md)（同走 registry/口子 B）、[16 §3/§5](16-runtime-layering-and-loop.md)（pull、激活判定）、[18 Prompt](18-prompt-and-instruction-design.md)（skill 正文就是指令）、[10 安全](10-tool-safety.md)（不可信脚本）、[06 Memory](06-memory-architecture.md)（程序性记忆/沉淀 skill）。

## 延伸阅读
- 📄 [Anthropic · Agent Skills 文档](https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills/overview) —— SKILL.md 格式、渐进式披露、如何被发现与加载。
- 📄 [Anthropic 工程博客 · Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/agent-skills) —— 设计动机与最佳实践。
- 📄 [Anthropic《Building Effective Agents》](https://www.anthropic.com/engineering/building-effective-agents) —— 工具/上下文的组合原则（skill 即其打包）。
