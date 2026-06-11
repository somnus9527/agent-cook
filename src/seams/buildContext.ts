/**
 * 口子 C：上下文构造器（11 §口子C）。
 *
 * loop 不直接拼 messages，而是每轮调用本函数"根据当前 state 产出本次要发送的 messages"。
 *
 * 关键区分（16 §3 持久追加 vs 临时注入）：
 *  - 持久：state.messages 里的内容（user/assistant/tool 事件），已经在 state 里，本函数原样带上。
 *  - 临时：Memory 召回、RAG 片段、历史摘要 —— 本函数"当场拼进返回值"，【不写回 state】，用完即弃。
 *
 * 现在：原样返回 system + 全部历史。
 * 将来不改 loop 就能在此长出：截断/滑窗、摘要压缩(08)、Memory 召回(06)、RAG 检索(07) —— 都是 pull，只改这里。
 */
import type { AgentState, Message } from '@/types.js';
import type { MemoryStore } from '@collection/memoryStore.js';

export interface BuildContextDeps {
  /** 可选：记忆库，用于 just-in-time 召回（16 §3 的 pull）。 */
  memory?: MemoryStore;
}

export function makeBuildContext(_deps: BuildContextDeps = {}) {
  return async function buildContext(state: AgentState): Promise<Message[]> {
    const system: Message = { role: 'system', content: state.systemPrompt };

    // ── 临时注入区（不写回 state）──────────────────────────────
    // TODO: 召回相关 memory / RAG 片段，拼成 ephemeral 消息插入合适位置。
    //   const recalled = await deps.memory?.recall(...);
    // TODO: 历史过长时做摘要压缩（08）：把早期 messages 折叠成一条 summary。
    const ephemeral: Message[] = [];

    // ── 持久区（来自 state，会进 checkpoint）───────────────────
    return [system, ...ephemeral, ...state.messages];
  };
}
