/**
 * 核心类型定义 —— 整个 Agent 的"词汇表"。
 *
 * 这些类型是骨架里少数"写满"的部分：契约定清楚，后面填实现才有依靠。
 * 设计依据：
 *  - docs/knowledge/16-runtime-layering-and-loop.md  分层、loop 两分支、持久/临时上下文
 *  - docs/knowledge/17-collection-context-memory-trace-checkpoint.md  AgentState / 事件 / 四类收集
 *  - docs/knowledge/11-extensibility-seams.md  五个口子 A–E（见 Deps）
 */

// ──────────────────────────────────────────────────────────────────────────
// 消息 / 工具（对齐 03 tool-calling、04 agent-loop）
// ──────────────────────────────────────────────────────────────────────────

export type Role = 'system' | 'user' | 'assistant' | 'tool';

/** 一条对话消息。注意：这是"会话事实"，属于会持久化进 checkpoint 的内容（16 §3）。 */
export interface Message {
  role: Role;
  content: string;
  /** assistant 轮里模型请求的工具调用（无则为 final，见 16 §2 两分支）。 */
  toolCalls?: ToolCall[];
  /** role==='tool' 时，标明这条结果对应哪个 toolCall。 */
  toolCallId?: string;
}

/** 模型"点名"要调用的一个工具（B 口子 dispatchTool 的输入）。 */
export interface ToolCall {
  id: string;
  name: string;
  /** 已解析的参数对象（解析/校验放在 B，见 09 结构化输出）。 */
  args: Record<string, unknown>;
}

/** 工具执行后的结果（会作为 observation 回填进 messages，04 §1）。 */
export interface ToolResult {
  toolCallId: string;
  /** 成功的输出，或失败时的 { error }，都回填让模型自我修正（04 §工程要点）。 */
  output: unknown;
  isError?: boolean;
}

// ──────────────────────────────────────────────────────────────────────────
// 规划（plan-execute 模式专用，05 + 16 §4/§5）
// ──────────────────────────────────────────────────────────────────────────

export interface PlanStep {
  id: string;
  description: string;
  status: 'pending' | 'done' | 'skipped';
  result?: unknown;
}

export interface Plan {
  goal: string;
  steps: PlanStep[];
  /** 当前执行到的游标（17 §6.3 的 plan+cursor）。 */
  cursor: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Agent 状态 = checkpoint 的存档对象（17 §6.3）
// 这是"权威真相源"：loop 只读它做决策，sink 都是它的投影（17 §7.1 / CQRS）
// ──────────────────────────────────────────────────────────────────────────

export type AgentMode = 'react' | 'plan-execute';

export type AgentStatus =
  | 'running'
  | 'awaiting_approval' // 人在环中断（10 篇）
  | 'done'
  | 'failed';

export interface AgentState {
  sessionId: string;
  mode: AgentMode;
  /** system prompt / 关键配置；大对象可改存 hash 引用以省空间（17 §6.3）。 */
  systemPrompt: string;
  /** 完整对话历史 —— resume 的核心。 */
  messages: Message[];
  /** 仅 plan-execute 模式使用。 */
  plan?: Plan;
  /** step 计数（粒度三级 Session > Run > Step，存档按 Step；17 §6.1）。 */
  step: number;
  status: AgentStatus;
  /**
   * ★ 崩溃恢复关键：模型已要求、但尚未确认执行完成的工具调用。
   * resume 时据此避免重复执行有副作用的工具（17 §6.5 幂等坑）。
   */
  pendingToolCalls?: ToolCall[];
  /** 最终输出（status==='done' 时）。 */
  output?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// 事件（口子 D emit 的载荷；一处采集，多处投影 —— 17 §1/§7）
// ──────────────────────────────────────────────────────────────────────────

export type AgentEvent =
  | { type: 'run_start'; sessionId: string; input: string }
  | { type: 'model_call'; step: number }
  | { type: 'model_result'; step: number; hasToolCalls: boolean }
  | { type: 'tool_call'; step: number; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; step: number; name: string; isError: boolean }
  | { type: 'step_done'; step: number; state: AgentState }
  | { type: 'run_end'; sessionId: string; status: AgentStatus }
  | { type: 'error'; step: number; message: string };

/** 收集方（sink）订阅事件。trace/memory 等都是 sink；Context 不是（17 §7.1）。 */
export interface EventSink {
  handle(event: AgentEvent): void | Promise<void>;
}

// ──────────────────────────────────────────────────────────────────────────
// 模型调用的入参/出参（口子 A callModel）
// ──────────────────────────────────────────────────────────────────────────

export interface ModelRequest {
  messages: Message[];
  tools?: ToolSchema[];
  model?: string;
}

export interface ModelResponse {
  /** 模型的文本输出（可能为空，当它只发 toolCalls 时）。 */
  content: string;
  /** 有则走"调工具"分支，无则是 final（16 §2）。 */
  toolCalls?: ToolCall[];
  /** 可选用量信息，给成本账本用（17 §3）。 */
  usage?: { promptTokens?: number; completionTokens?: number };
}

// ──────────────────────────────────────────────────────────────────────────
// 工具定义（注入给模型的 schema + 真实执行体；03 + 18 §3 工具描述怎么写）
// ──────────────────────────────────────────────────────────────────────────

export interface ToolSchema {
  name: string;
  /** 写清"何时用/何时不用" —— 直接影响模型调用正确率（18 §3）。 */
  description: string;
  /** JSON Schema 参数定义（09）。 */
  parameters: Record<string, unknown>;
}

export interface Tool {
  schema: ToolSchema;
  /** 真实执行。可有副作用 —— 务必考虑幂等（17 §6.5）。 */
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown>;
}

/** 执行工具时可用的上下文（按需扩展：sessionId、审批回调等）。 */
export interface ToolContext {
  sessionId: string;
  state: Readonly<AgentState>;
}

// ──────────────────────────────────────────────────────────────────────────
// 口子 E：可注入依赖（11 §口子E）—— loop 全程只用这里的东西
// ──────────────────────────────────────────────────────────────────────────

export interface Deps {
  /** 口子 A：唯一的"调模型"入口。 */
  callModel(req: ModelRequest): Promise<ModelResponse>;
  /** 口子 B：唯一的"执行工具"入口。 */
  dispatchTool(call: ToolCall, ctx: ToolContext): Promise<ToolResult>;
  /** 口子 C：根据 state 产出本轮要发送的 messages（含 Memory/RAG/压缩）。 */
  buildContext(state: AgentState): Promise<Message[]>;
  /** 口子 D：发事件，扇出给各 sink。 */
  emit(event: AgentEvent): void;
  /** 检查点 store：每 step 存档 / resume 时加载（17 §6.2）。 */
  store: CheckpointStore;
  /**
   * 本轮可用工具的 schema —— **随 state 动态**（不是启动时定死的固定数组）。
   * 激活的 Skill、动态接入的 MCP 工具都在这里体现（见 knowledge/20、15）。
   * 实现通常读"当前 registry"；state 参数留给"按激活 skill 做渐进式披露/门控"用。
   */
  getToolSchemas(state: AgentState): ToolSchema[];
}

/** runAgent 的返回（口子 E：输入 → { output, trace }）。 */
export interface AgentResult {
  output: string;
  state: AgentState;
}

// ──────────────────────────────────────────────────────────────────────────
// 检查点 store 接口（17 §6.2）—— 只有两个方法，状态累积，不提供 load(step)
// ──────────────────────────────────────────────────────────────────────────

export interface CheckpointStore {
  load(sessionId: string): Promise<AgentState | null>;
  save(sessionId: string, state: AgentState): Promise<void>;
}
