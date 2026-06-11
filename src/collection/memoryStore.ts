/**
 * Memory store（06 + 17）—— 四类收集里的 "Memory"。
 *
 * 给模型"以后记得"用：蒸馏过的耐久事实，跨会话。被口子 C(buildContext) 召回进上下文。
 * 写入侧常异步（巩固/抽取），最终一致即可（17 §7.1：召不到刚发生的事实也无害，那条还在 live 历史里）。
 */

export interface MemoryItem {
  id: string;
  text: string;
  /** 可选向量，用于语义召回（07/14）。 */
  embedding?: number[];
  /** 衰减/冲突消解会用到的元信息（17 §8）。 */
  createdAt?: number;
}

export interface MemoryStore {
  /** 召回与 query 相关的若干条（读出侧，给 buildContext 用）。 */
  recall(query: string, k?: number): Promise<MemoryItem[]>;
  /** 写入/巩固一条事实（写入侧，常由异步的 memorySink 调用）。 */
  write(item: Omit<MemoryItem, 'id'>): Promise<void>;
}

export function createMemoryStore(_dataDir: string): MemoryStore {
  return {
    async recall(_query: string, _k = 5): Promise<MemoryItem[]> {
      // TODO: 关键词或向量检索（07）。入门可先返回 []，让 Agent 先不带长期记忆跑通。
      return [];
    },
    async write(_item): Promise<void> {
      // TODO: 落库 + 索引；进阶加衰减/冲突消解（17 §8）。
    },
  };
}
