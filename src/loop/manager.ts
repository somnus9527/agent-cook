/**
 * AgentLoopManager（16 §4 / §5.2）—— 决定一个 run 用哪种编排，并持有可复用的 ReAct 原子。
 *
 * 设计要点：
 *  - ReActLoop 是【默认、可独立运行】的原子（04 + 16 §2）；同时被 PlanExecuteLoop
 *    当作每步执行器复用（嵌套，不是平行兄弟，16 §4）。
 *  - 不靠静态配置在两种 loop 间切换。Plan-Execute 是【需要时才用】的重编排：
 *      · 入门/默认：根本不切 —— 规划做成 ReAct 里的一个工具(plan-as-tool, 16 §5)，永远跑 ReAct。
 *      · 进阶：进 loop 前由 route() 按任务复杂度判定，复杂才升级到 Plan-Execute（16 §5.2 代码决定）。
 *  - 判定永远【在 loop 之外、进 loop 之前】；loop 主体始终只有 "tool_calls | final" 两分支。
 */
import type { AgentConfig } from '@/config.js';
import type { AgentState } from '@/types.js';

import { createPlanExecuteLoop } from './planExecuteLoop.js';
import { createReActLoop } from './reactLoop.js';

import type { LoopRunner } from './agentLoop.js';

export function createLoopManager(config: AgentConfig) {
  const react = createReActLoop(config);
  // PlanExecute 复用 react 作为每步执行器（嵌套）。
  const planExecute = createPlanExecuteLoop(config, react);

  return {
    /** 默认、可独立运行的原子循环（也是 PlanExecute 的每步执行器）。 */
    react,
    /** 重编排，需要时才用；暴露以便测试与 route 升级。 */
    planExecute,

    /**
     * 决定本 run 用哪种编排。默认 ReAct；仅当判定"该任务需要全局先规划"时才升级到 Plan-Execute。
     * 注意：采用 plan-as-tool（推荐默认）时这里恒返回 react —— 规划在 ReAct 内作为工具发生，无需升级。
     */
    route(_state: AgentState): LoopRunner {
      // TODO（需要时才升级，16 §5.2 代码决定路线）：跑个便宜分类/启发式判断任务是否需要全局规划，
      //   复杂则 `return planExecute`。弱模型(本地 Ollama)自决规划不可靠时，更应在这里判定。
      return react;
    },
  };
}
