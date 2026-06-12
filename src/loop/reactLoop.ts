/**
 * ReActLoop —— Agent 的本体循环（04 + 16 §2）。
 *
 * 决策只有两条分支（16 §2）：
 *   模型本轮输出 → 有 toolCalls ? 经口子 B 执行(含 MCP/RAG-as-tool)，结果回填，继续
 *                └ 无 toolCalls ? final，出口
 * RAG/Memory/压缩 全在口子 C（调模型前）；异常不分支，回填成 observation 继续（04 §工程要点）。
 *
 * 本文件给出【控制流骨架】；具体的 state 变换（怎么追加消息、抽取 output、标记 done）留给你实现。
 */
import type { AgentConfig } from '@/config.js';
import type { AgentResult, AgentState, Deps, Message, ToolResult } from '@/types.js';

import type { LoopRunner } from './agentLoop.js';

export function createReActLoop(config: AgentConfig): LoopRunner {
  return {
    async run(state: AgentState, deps: Deps): Promise<AgentResult> {
      // 兜底上限，防死循环（04 §工程要点）。step 跨 run 累计，按需在 App 里决定是否每 run 重置。
      while (state.status === 'running' && state.step < config.maxSteps) {
        // ── 口子 C：装配本轮上下文（持久 state + 临时召回，16 §3）──
        const messages = await deps.buildContext(state);

        // ── 口子 A：调模型 ──
        deps.emit({ type: 'model_call', step: state.step });
        const res = await deps.callModel({ messages, tools: deps.getToolSchemas(state) });
        deps.emit({
          type: 'model_result',
          step: state.step,
          hasToolCalls: !!res.toolCalls?.length,
        });

        if (!res.toolCalls?.length) {
          // ── 分支一：final（无 toolCalls）—— 写回 assistant、标记 done，循环随即退出 ──
          appendAssistant(state, res.content);
          state.output = res.content;
          state.status = 'done';
        } else {
          // ── 分支二：调工具（有 toolCalls）──
          // 先把 assistant(含 toolCalls) 入栈，并记录 pendingToolCalls（17 §6.5，崩溃恢复要用）。
          appendAssistant(state, res.content, res.toolCalls);
          state.pendingToolCalls = res.toolCalls;

          for (const call of res.toolCalls) {
            deps.emit({ type: 'tool_call', step: state.step, name: call.name, args: call.args });
            // ── 口子 B：派发执行（含 MCP/RAG-as-tool）──
            const result = await deps.dispatchTool(call, { sessionId: state.sessionId, state });
            deps.emit({
              type: 'tool_result',
              step: state.step,
              name: call.name,
              isError: !!result.isError,
            });
            // 结果作为 observation 回填，下一轮模型据此继续（04 §1）。
            appendToolResult(state, call.name, result);
          }
          state.pendingToolCalls = undefined; // 本轮工具都跑完，清空
        }

        // ── 每 step 存档（critical path，崩溃续跑的关键；17 §6.1 / §7.1）──
        deps.emit({ type: 'step_done', step: state.step, state });
        await deps.store.save(state.sessionId, state);
        state.step += 1;
      }

      // 若因 maxSteps 退出而非 done，给个兜底（04 §工程要点：防死循环不静默）。
      if (state.status === 'running') {
        state.status = 'failed';
        state.output = `已达最大步数 ${config.maxSteps}，未能完成任务。`;
        deps.emit({ type: 'error', step: state.step, message: state.output });
        await deps.store.save(state.sessionId, state);
      }
      return { output: state.output ?? '', state };
    },
  };
}

// ── 下面是 state 变换的 helper（04 §1：assistant 入栈、observation 回填）──────

/** 追加一条 assistant 消息（可带 toolCalls）。 */
function appendAssistant(
  state: AgentState,
  content: string,
  toolCalls?: Message['toolCalls'],
): void {
  state.messages.push({ role: 'assistant', content, ...(toolCalls?.length ? { toolCalls } : {}) });
}

/** 把工具结果作为 observation 回填（成功或 {error} 都回填，让模型自我修正）。 */
function appendToolResult(state: AgentState, _toolName: string, result: ToolResult): void {
  state.messages.push({
    role: 'tool',
    toolCallId: result.toolCallId,
    content: JSON.stringify(result.output),
  });
}
