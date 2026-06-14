/**
 * 测试帮手 —— 关键：注入"假 callModel"做确定性测试（口子 E 的回报，knowledge/11、19）。
 * loop 周围的脚手架（dispatchTool/buildContext/emit/store）用【真实现】，只 mock 模型。
 */
import type { AgentConfig } from '@/config.js';
import type { AgentState, CheckpointStore, Deps, Tool } from '@/types.js';
import { makeBuildContext } from '@seams/buildContext.js';
import { makeDispatchTool } from '@seams/dispatchTool.js';
import { makeEmit } from '@seams/emit.js';
import { createRegistry } from '@tools/tool.js';

export const TEST_CONFIG: AgentConfig = {
  provider: 'ollama',
  model: 'test',
  maxSteps: 8,
  dataDir: '.tmp-test',
};

export function freshState(userInput: string): AgentState {
  return {
    sessionId: 'test-session',
    mode: 'react',
    systemPrompt: 'test',
    messages: [{ role: 'user', content: userInput }],
    step: 0,
    status: 'running',
  };
}

/** 内存版 checkpoint store（不落盘），并记录每次 save 供断言。 */
export function memoryStore(): CheckpointStore & { saved: AgentState[] } {
  const map = new Map<string, AgentState>();
  const saved: AgentState[] = [];
  return {
    saved,
    async load(id) {
      return map.get(id) ?? null;
    },
    async save(id, state) {
      const snap = structuredClone(state);
      map.set(id, snap);
      saved.push(snap);
    },
  };
}

export interface MockDepsOverrides {
  callModel: Deps['callModel'];
  tools?: Tool[];
  store?: CheckpointStore;
}

/** 组装 Deps：只有 callModel 是 mock，其余口子都用真实现。 */
export function makeMockDeps(o: MockDepsOverrides): Deps {
  const registry = createRegistry(o.tools ?? []);
  return {
    callModel: o.callModel,
    dispatchTool: makeDispatchTool(registry),
    buildContext: makeBuildContext({}),
    emit: makeEmit([]),
    store: o.store ?? memoryStore(),
    getToolSchemas: () => [...registry.values()].map((t) => t.schema),
  };
}
