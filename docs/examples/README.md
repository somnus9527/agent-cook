# docs/examples —— 示例提示

这里放**参考片段**，帮助理解骨架怎么用，**不是**项目源码（`src/` 才是）。你照着自己实现 `src/` 里的 `// TODO`。

- [`example-tool.ts`](./example-tool.ts) —— 一个写好的 `Tool`，重点示范 `schema.description` 怎么写（对应 [knowledge/18 §3](../knowledge/18-prompt-and-instruction-design.md)）。
- [`wiring.md`](./wiring.md) —— 运行时数据怎么串：分层调用链 + ReAct 两分支 + 每 step 存档，对应 [knowledge/16](../knowledge/16-runtime-layering-and-loop.md)、[17](../knowledge/17-collection-context-memory-trace-checkpoint.md)。
