/**
 * PlanExecuteLoop（壳，05 + 16 §4/§5）。
 *
 * ⚠️ 关系：它【不是】另一种 ReActLoop，而是包在 ReActLoop 外面的一层编排：
 *     plan = planner(goal)
 *     for step in plan:
 *         result = ReActLoop.run(step)   ← 每个步骤的执行器，复用 ReAct 小循环
 *         done.push(result)
 *         plan = replanner(goal, done)   ← 重规划（去掉它就退化成死板按计划走）
 *
 * 入门建议（16 §4）：先只用 ReActLoop，把"规划"做成一个工具（plan-as-tool，16 §5）。
 * 等真有复杂长任务再实现这里。Manager 的 Strategy 口子已留好，不影响先跑通 ReAct。
 */
import type { AgentConfig } from '@/config.js';
import type { AgentResult, AgentState, Deps } from '@/types.js';

import type { LoopRunner } from './agentLoop.js';

export function createPlanExecuteLoop(_config: AgentConfig, _react: LoopRunner): LoopRunner {
  return {
    async run(_state: AgentState, _deps: Deps): Promise<AgentResult> {
      // TODO:
      //  1) planner：调模型产出结构化 plan（09 结构化输出），写入 state.plan。
      //  2) 循环按 cursor 取 step，用 _react.run(...) 执行该 step（嵌套复用）。
      //  3) replanner：基于已完成结果更新剩余 plan / 判断 finished。
      //  4) 每步同样 await store.save（17 §6）。
      throw new Error('PlanExecuteLoop 未实现（入门可先只用 ReActLoop）');
    },
  };
}
