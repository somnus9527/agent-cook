/**
 * RawTTY 前端 —— 真·raw mode 实现（16 §1）。
 *
 * 为什么不用 readline 的 Interface（cooked/行模式）？
 *   那种模式下行编辑由【终端/OS】接管，程序只在用户按回车后拿到整行 —— Agent CLI 拿不到
 *   按键级控制：无法拦截快捷键、做自定义行编辑、渲染 TUI、精细处理 Ctrl-C。
 *
 * 正确姿势：process.stdin.setRawMode(true) 拿到终端绝对控制，再用 readline.emitKeypressEvents
 *   把原始字节解析成"按键事件"（拿到 name/ctrl/meta），自己维护输入缓冲与回显。
 *   注意 raw 模式下【什么都不会自动回显】，可打印字符要我们手动 write 出去。
 *
 * 本实现是最小可用版（单行输入 + 退格 + Ctrl-C/D）。方向键/历史/多行等留作升级，
 * 接口 (Frontend) 不变，App/loop 无感。
 */
import { stdin, stdout } from 'node:process';
import { emitKeypressEvents } from 'node:readline';

import type { Frontend } from './frontend.js';
import type { Key } from 'node:readline';

const PROMPT = 'you › ';

export function createRawTtyFrontend(): Frontend {
  let buffer = '';
  /** 当前是否正在等待一行输入；非读取期的按键忽略。 */
  let pending: ((line: string | null) => void) | null = null;

  function finish(line: string | null) {
    const resolve = pending;
    pending = null;
    resolve?.(line);
  }

  function onKeypress(str: string | undefined, key: Key) {
    if (!pending) return;

    // Ctrl-C：中断，当作退出（自己处理，而非让 OS 直接杀进程）
    if (key.ctrl && key.name === 'c') {
      stdout.write('\n');
      finish(null);
      return;
    }
    // Ctrl-D：EOF（仅在空行时退出，符合终端惯例）
    if (key.ctrl && key.name === 'd') {
      if (buffer.length === 0) {
        stdout.write('\n');
        finish(null);
      }
      return;
    }
    // 回车：提交当前行
    if (key.name === 'return' || key.name === 'enter') {
      const line = buffer;
      buffer = '';
      stdout.write('\n');
      finish(line);
      return;
    }
    // 退格：删一个字符并在屏幕上抹掉（退格-空格-退格）
    if (key.name === 'backspace') {
      if (buffer.length > 0) {
        buffer = buffer.slice(0, -1);
        stdout.write('\b \b');
      }
      return;
    }
    // 可打印字符：raw 模式下需手动回显（排除控制键/方向键 —— 它们 str 为空或带 ctrl/meta）
    if (str && !key.ctrl && !key.meta && str >= ' ') {
      buffer += str;
      stdout.write(str);
      return;
    }
    // 其它（方向键/功能键/Tab…）最小版忽略，留作升级
  }

  return {
    start() {
      emitKeypressEvents(stdin); // 把原始字节流解析成 keypress 事件
      if (stdin.isTTY) stdin.setRawMode(true); // ← 关键：拿到终端绝对控制
      stdin.resume();
      stdin.on('keypress', onKeypress);
      stdout.write('agent-cook · raw 模式。输入消息回车发送，Ctrl-C / Ctrl-D 退出。\n');
    },

    readInput(): Promise<string | null> {
      return new Promise<string | null>((resolve) => {
        buffer = '';
        pending = resolve;
        stdout.write(`\n${PROMPT}`);
      });
    },

    write(text: string) {
      stdout.write(`\nagent › ${text}\n`);
    },

    writeChunk(chunk: string) {
      // 流式回显：模型边出边打（配合口子 A 的 stream 分支）
      stdout.write(chunk);
    },

    stop() {
      stdin.off('keypress', onKeypress);
      if (stdin.isTTY) stdin.setRawMode(false); // 恢复终端，别把用户终端留在 raw 态
      stdin.pause();
    },
  };
}
