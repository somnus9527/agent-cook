# docs/roadmap · 优化路线

> 后续"该往哪走"的清单。每个点用统一四段式写：**为什么(理由) / 怎么做(市面方案优劣) / 达标标准 / 参考**。
> 总索引（含代码位置）在根目录 [`AGENTS.md`](../../AGENTS.md) 的"优化路由树"。

- [`phase-1-stabilization.md`](phase-1-stabilization.md) —— **先做这个**：把 Agent 从"能跑通 demo"打磨到"稳定地真正可用"。
- [`phase-2-capability-optimization.md`](phase-2-capability-optimization.md) —— 各能力点逐个做深：上下文/记忆/检索/工具/安全/编排/评估/可观测/成本/持久化。

## 怎么用

1. 按 Phase 1 把基线稳住（流式、重试、防死循环、校验、上下文不爆、能看轨迹）。
2. 再按 Phase 2 挑你最想强化的能力，照"方向"里的市面方案各试一下，体会优劣，对着"达标标准"验收。
3. 每完成一个点，回 `AGENTS.md` 路由树更新状态。
