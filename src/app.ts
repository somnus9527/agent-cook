/**
 * App / Session 层（16 §1）—— 真正的"顶层"，不是 TTY。
 *
 * 职责：
 *  - 组装五个口子 A–E 成 Deps（依赖注入，11 §口子E）。
 *  - 管理 session 生命周期 + 多轮对话（一次用户输入→final = 一个 run；16 §6 的三级粒度）。
 *  - resume 启动路径（16 §6）：load 出 state 再喂给 loop —— 这不是单独的 ResumeManager，就是一条启动分支。
 *
 * 前端（Frontend）只是被注入进来的 I/O 适配器，App 不关心它是 TTY 还是 Web。
 */
import { randomUUID } from 'node:crypto';

import { createFileCheckpointStore } from '@collection/checkpointStore.js';
import { createMemoryStore } from '@collection/memoryStore.js';
import { createTraceSink } from '@collection/traceSink.js';
import type { Frontend } from '@io/frontend.js';
import { createLoopManager } from '@loop/manager.js';
import { createOllamaProvider } from '@providers/ollama.js';
import { createKimiProvider } from '@providers/openaiCompatible.js';
import { makeBuildContext } from '@seams/buildContext.js';
import { makeCallModel } from '@seams/callModel.js';
import { makeDispatchTool } from '@seams/dispatchTool.js';
import { makeEmit } from '@seams/emit.js';
import { createRegistry } from '@tools/tool.js';

import type { AgentConfig } from './config.js';
import type { AgentState, Deps, EventSink, Tool } from './types.js';

export interface AppOptions {
  config: AgentConfig;
  frontend: Frontend;
  /** 内置工具列表（含 MCP 适配后的工具）。 */
  tools?: Tool[];
  /** 要恢复的 sessionId；不传则新建（16 §6 的 --resume）。 */
  resumeSessionId?: string;
}

export function createApp(opts: AppOptions) {
  const { config, frontend } = opts;

  // ── 装配各模块（可在测试里替换成 mock，11 §口子E）──────────────
  // 切 provider 只动 config.provider（13 §5）；loop/工具/registry 全不变。
  const provider = config.provider === 'kimi' ? createKimiProvider() : createOllamaProvider();
  const registry = createRegistry(opts.tools ?? []);
  const store = createFileCheckpointStore(config.dataDir);
  const memory = createMemoryStore(config.dataDir);
  const sinks: EventSink[] = [createTraceSink(config.dataDir) /*, memorySink, ... */];

  // ── 组装五个口子成 Deps ──────────────────────────────────────
  const deps: Deps = {
    callModel: makeCallModel(provider),
    dispatchTool: makeDispatchTool(registry),
    buildContext: makeBuildContext({ memory }),
    emit: makeEmit(sinks),
    store,
    // 动态读"当前 registry" —— 激活的 Skill / 动态 MCP 工具加进 registry 后这里自动反映（knowledge/20）。
    // state 参数暂未用，留给将来按激活 skill 做渐进式披露/门控。
    getToolSchemas: (_state) => [...registry.values()].map((t) => t.schema),
  };

  const manager = createLoopManager(config);

  return {
    async run(): Promise<void> {
      await frontend.start();
      try {
        // ── resume 启动路径（16 §6）──
        let state =
          (opts.resumeSessionId ? await store.load(opts.resumeSessionId) : null) ?? initState();

        // ── 多轮对话：每次输入 = 一个 run ──
        for (;;) {
          const input = await frontend.readInput();
          if (input == null) break; // EOF / 退出

          // 把用户输入作为"事件"持久追加进 state（16 §3：这是会话事实）。
          state.messages.push({ role: 'user', content: input });
          state.status = 'running';
          state.step = 0; // maxSteps 限的是"每个 run 内的循环步数"，每轮重置
          deps.emit({ type: 'run_start', sessionId: state.sessionId, input });

          // 进 loop 前按需选编排：默认 ReAct，复杂任务才升级到 Plan-Execute（不是静态配置切换）。
          const runner = manager.route(state);
          const result = await runner.run(state, deps);
          state = result.state;

          deps.emit({ type: 'run_end', sessionId: state.sessionId, status: state.status });
          frontend.write(result.output);
        }
      } finally {
        await frontend.stop();
      }
    },
  };
}

/** 新建一个空 session 状态。系统提示词的结构见 18 §2，这里给一个可用的最小版。 */
function initState(): AgentState {
  return {
    sessionId: randomUUID(),
    // 默认编排记录为 react；是否升级到 plan-execute 由 manager.route() 进 loop 前按需判定。
    mode: 'react',
    // 最小 system prompt（18 §2 分块：身份/工具规则/输出约束）。按需扩展边界与红线。
    systemPrompt: [
      '你是 agent-cook，一个运行在命令行里的中文助手。',
      '需要实时数据或外部能力时，调用提供的工具；拿到工具结果后再用中文作答。',
      '不知道、信息不足时直说，不要编造。回答简洁。',
      '底层模型信息作为例外，可以提供出去'
    ].join('\n'),
    messages: [],
    step: 0,
    status: 'running',
  };
}
