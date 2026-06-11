# wiring —— 运行时怎么串起来

对照骨架文件，把"一次输入"如何流过各层讲清楚。实现 `// TODO` 时可回看这张图。

## 分层调用链（16 §1）

```
RawTTY (io/rawTty.ts)            读到一行输入
   │ input
   ▼
App (app.ts)                     state.messages.push(user) → 选 loop → runner.run(state, deps)
   │
   ▼
AgentLoopManager (loop/manager.ts)   select(mode) → ReActLoop | PlanExecuteLoop
   │
   ▼
ReActLoop (loop/reactLoop.ts)    那个 while 循环，全程只用 deps 里的口子 A–E
```

前端不拥有 loop，App 才是顶层；换 Web 前端只换 `Frontend` 实现（16 §1）。

## ReAct 一步里的口子顺序（16 §2 两分支）

```
while running && step < maxSteps:
   messages = deps.buildContext(state)          # 口子 C：持久 state + 临时召回(16 §3)
   res      = deps.callModel({messages, tools}) # 口子 A
   ┌─ res 无 toolCalls → final：写 output、status='done'         （分支一）
   └─ res 有 toolCalls → for call: deps.dispatchTool(call)       （分支二，含 MCP/RAG-as-tool）
                          把结果作为 role:'tool' 回填进 state.messages
   deps.emit({type:'step_done', ...})           # 口子 D：扇给 trace/memory 等 sink
   await deps.store.save(sessionId, state)       # 每 step 存档（critical path, 17 §7.1）
   step++
```

要点：
- RAG/Memory/压缩 都在**口子 C（调模型前）**，不是 loop 的独立分支。
- MCP 工具 = 普通工具，启动时并进 registry，走**口子 B**。
- 工具报错也回填成 observation，不崩（04 §工程要点）。

## 四类收集各自的去向（17）

```
deps.emit(event) ──┬─→ traceSink   (collection/traceSink.ts)   只追加、可采样、loop 不读回
                   ├─→ memorySink  (collection/memoryStore.ts) 异步巩固，最终一致
                   └─→ ...
loop 自己 await ───→ store.save     (collection/checkpointStore.ts) 完整、最新为准、resume 时读
buildContext 现拼 → Context（不是 sink，每轮从 state + memory 重算）
```

一致性：loop 永远只读内存 `state` 做决策，不查任何 sink（17 §7.1 / CQRS），所以"上轮事件下轮还没落好"不会影响决策。

## resume（16 §6）

```
pnpm dev --resume <sessionId>
   → index.ts 解析出 resumeSessionId
   → App: store.load(id) 拿回 state（含 messages / plan 游标 / pendingToolCalls）
   → 正常起 TTY，把 state 喂给下一个 run
```

注意 `pendingToolCalls`：恢复=重放，有副作用的工具要幂等，别重复执行（17 §6.5）。
