/**
 * AgentLoop 抽象（16 §4）。
 *
 * 一个 LoopRunner = 一种编排范式的"跑一个 run"的能力。
 *  - ReActLoop 是原子（04 + 16 §2 两分支）。
 *  - PlanExecuteLoop 是【包在 ReAct 外面】的编排，不是平行兄弟（16 §4）。
 *
 * 约定：调用前，本次用户输入已被 App 追加进 state.messages；run 返回更新后的 state + output。
 * resume 由 App 负责（16 §6）：App 先 load 出 state 再传进来；loop 只管"每 step 存档"。
 */
import type { AgentResult, AgentState, Deps } from '@/types.js';

export interface LoopRunner {
  run(state: AgentState, deps: Deps): Promise<AgentResult>;
}
