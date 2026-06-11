/**
 * I/O 前端接口（16 §1）。
 *
 * 前端是【可替换的适配器】，不是最顶层。CLI 用 RawTTY，将来 Web 用 WebSocket/SSE，
 * 测试用 mock —— 都实现这个接口即可，loop/App 不动。前端只管"读输入、渲染输出"，不拥有 loop。
 */
export interface Frontend {
  /** 取下一条用户输入（CLI=读一行；EOF/退出返回 null）。 */
  readInput(): Promise<string | null>;
  /** 渲染一段最终输出。 */
  write(text: string): void;
  /** 可选：流式 token 回显（模型边出边显）。 */
  writeChunk?(chunk: string): void;
  /** 启动（进 raw mode、打印欢迎等）。 */
  start(): Promise<void> | void;
  /** 收尾（恢复终端、清理）。 */
  stop(): Promise<void> | void;
}
