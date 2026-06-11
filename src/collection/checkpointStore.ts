/**
 * 检查点 store（17 §6）—— 四类收集里的 "Checkpoint" sink。
 *
 * 给机器恢复用：必须完整、一致。每个 step 由 loop 同步 await save（critical path，17 §7.1）。
 * 运行中只写不读；只有 resume（冷启动）时 load 一次。
 *
 * 这里是落文件的最小实现（快照覆盖模型，17 §6.4）：每 session 一个 json，每步覆盖。
 * 将来要可观测/时间旅行，可换"追加日志/事件溯源"模型，或换 SQLite/Postgres，接口不变。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { AgentState, CheckpointStore } from '@/types.js';

export function createFileCheckpointStore(dataDir: string): CheckpointStore {
  const dir = join(dataDir, '.checkpoints');
  const fileOf = (sessionId: string) => join(dir, `${sessionId}.json`);

  return {
    async load(sessionId: string): Promise<AgentState | null> {
      try {
        const raw = await readFile(fileOf(sessionId), 'utf8');
        return JSON.parse(raw) as AgentState;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; // 没存过 = 新会话
        throw e;
      }
    },

    async save(sessionId: string, state: AgentState): Promise<void> {
      const file = fileOf(sessionId);
      await mkdir(dirname(file), { recursive: true });
      // 原子写：先写临时文件再 rename，避免崩在写一半留下损坏的 checkpoint（一致性，17 §6）。
      const tmp = `${file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(state), 'utf8');
      await rename(tmp, file);
    },
  };
}
