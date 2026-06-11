/**
 * Trace sink（17 §2/§5）—— 四类收集里的 "Trace"。
 *
 * 给人/评估看：只追加、不可变、可采样。【运行中的 loop 永不读回】，所以可异步 fire-and-forget。
 * 是口子 D 的一个 EventSink 实现。
 *
 * TODO 实现要点：
 *  - 把 AgentEvent 落成结构化日志（JSONL）或映射成 OTel span（17 §8 术语）。
 *  - 可加采样、脱敏。
 *  - 进阶：与 checkpoint 共用同一条事件流（17 §7"一处采集多处投影"）。
 */
import type { AgentEvent, EventSink } from '@/types.js';

export function createTraceSink(_dataDir: string): EventSink {
  return {
    handle(_event: AgentEvent) {
      // TODO: 追加写入 trace（JSONL / OTel）。入门可先 console.error(JSON.stringify(event))。
    },
  };
}
