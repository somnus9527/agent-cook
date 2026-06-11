/**
 * AgentLoopManager（16 §4）—— Strategy：按 mode 选 ReAct / Plan-Execute。
 *
 * 关键认知（16 §4/§5.2）：
 *  - 选哪种 loop 的判断【不在 loop 体内】。要么模型自决（plan-as-tool，靠 system prompt），
 *    要么在【进 loop 前】由这里/router 决定。loop 主体永远只有"tool_calls | final"两分支。
 *  - 弱模型（本地 Ollama）自决规划可能不可靠，那就更依赖这里做"代码决定"。
 */
import type { AgentConfig } from '@/config.js';
import type { AgentMode } from '@/types.js';

import { createPlanExecuteLoop } from './planExecuteLoop.js';
import { createReActLoop } from './reactLoop.js';

import type { LoopRunner } from './agentLoop.js';

export function createLoopManager(config: AgentConfig) {
  const react = createReActLoop(config);
  const planExecute = createPlanExecuteLoop(config, react); // 嵌套复用 react

  return {
    /** 按模式选执行器。默认 react（入门）。 */
    select(mode: AgentMode = config.mode): LoopRunner {
      return mode === 'plan-execute' ? planExecute : react;
    },

    // TODO（可选，代码决定路线）：route(input) —— 跑个便宜分类/启发式，
    //   对复杂任务返回 'plan-execute'，否则 'react'（16 §5.2）。
  };
}
