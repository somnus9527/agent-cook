/**
 * 口子 D：事件 / 追踪钩子（11 §口子D）。
 *
 * loop 的每个关键节点发一个结构化事件，而不是 console.log 散落各处。
 * 一处采集，多处投影（17 §1/§7）：把同一份事件流扇给多个 sink，各用各的策略。
 *
 * 注意一致性（17 §7.1）：
 *  - checkpoint 落盘在 critical path（由 loop 自己 await store.save，不在这里）。
 *  - 这里的 sink（trace/memory）可 fire-and-forget；它们都【不会被运行中的 loop 读回】，最终一致即可。
 */
import type { AgentEvent, EventSink } from '@/types.js';

export function makeEmit(sinks: EventSink[]) {
  return function emit(event: AgentEvent): void {
    for (const sink of sinks) {
      // fire-and-forget：不阻塞 loop。异常吞掉以免 sink 拖垮主流程。
      // TODO: 如需顺序保证/失败上报，在此加 seq 号或错误处理（17 §7.1）。
      try {
        void sink.handle(event);
      } catch {
        /* 观测性失败不应影响主流程 */
      }
    }
  };
}
