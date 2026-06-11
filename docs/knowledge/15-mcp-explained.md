# 15 · MCP（Model Context Protocol）讲透

> 回答三个问题：MCP 是什么？它和 Agent 是不是一回事、有什么区别？什么场景该用、项目里怎么实现？

## 一、MCP 是什么

**MCP（模型上下文协议）是一个开放标准，规定"LLM 应用怎么和外部工具/数据连接"。** 由 Anthropic 2024 年提出，现已成为跨厂商的事实标准。

一句类比：**MCP 是"AI 世界的 USB-C 接口"。** 以前每个 Agent 要接每个工具/数据源都得各写各的胶水代码（N×M 的对接地狱）；有了 MCP 这个统一接口，工具方按 MCP 标准做一个"插头"（MCP Server），任何支持 MCP 的应用都能直接插上用。

技术上：基于 **JSON-RPC 2.0** 的**客户端-服务器**模型。

## 二、MCP 的架构与三个原语

```
[Host 宿主应用]  —— 内部跑多个 ——>  [Client 客户端]  —— 各自连一个 ——>  [Server 服务器]
 (Claude Desktop /                  (一个 client 维护                    (暴露能力)
  Cursor / 你的 Agent)               一条到某 server 的会话)
```

- **Host（宿主）**：用户实际用的 AI 应用——Claude Desktop、Cursor、或**你自己写的 Agent**。
- **Client（客户端）**：宿主内部为每个 server 开的一条连接（隔离的，互相不可见，是安全边界）。
- **Server（服务器）**：真正提供能力的一方，通过**三个原语**暴露：

| 原语 | 是什么 | 类比 | 谁触发 |
|---|---|---|---|
| **Tools** | 可执行的函数（查库、调 API、写文件） | 动词/动作 | 模型动态调用 |
| **Resources** | 只读数据/上下文（文件内容、记录、配置），按 URI 引用 | 名词/资料 | 按需读取注入上下文 |
| **Prompts** | 预设的提示词模版/工作流 | 模板 | 用户/应用选用 |

> 记忆口诀：**Tool=能做的事，Resource=能读的数据，Prompt=能套的模版。**

⚠️ **别把三者理解成主从关系**（常见误区："Tool 集合 + 给 Tool 配的资源和提示"）。它们是**平级、独立**的三类能力，区分关键是**谁来控制/触发**：
- **Tool = 模型控制**：LLM 自己决定调。
- **Resource = 应用控制**：宿主应用决定把哪些只读数据塞进上下文（像 @ 一个文件）；**不是"Tool 执行时访问的数据"**——Tool 内部读什么是它自己的实现，与 Resource 原语无关。
- **Prompt = 用户控制**：用户主动选用的模版/工作流（像 slash 命令）；**不是"自动喂给 LLM 的上下文"**。

一个 server 可以只暴露 Tools，也可以三者都有，彼此不构成依赖。

## 三、传输方式（项目里怎么连）

两种传输，消息格式相同（JSON-RPC），所以工具定义在本地/远程间可移植：

- **STDIO（本地）**：宿主把 server 当**子进程**启动，通过标准输入输出通信。适合本地工具（读写文件、本地 DB、跑 shell）。最简单。
- **Streamable HTTP（远程）**：HTTP POST + 可选 SSE 流式。适合把 server 部署成**云端服务**、多客户端共享、配 OAuth 鉴权。**2025-11 起取代了旧的 SSE 传输**，是生产标准。

## 四、MCP 和 Agent 是一回事吗？（核心区别）

**不是。它们根本不在一个范畴，是互补关系。**

| | **Agent** | **MCP** |
|---|---|---|
| 本质 | 一个**会推理、会循环、会决策**的程序（知识点 04） | 一个**连接协议/标准** |
| 类比 | 大脑 + 手 | 大脑和工具之间的**标准插口** |
| 有没有"智能" | 有（靠 LLM 做决策） | 没有，它只是规定"怎么通信" |
| 能独立工作吗 | 能（Agent 本身就是完整系统） | 不能，它是用来**连接**双方的 |

**所以"Agent 调 MCP"准确的说法是**：你的 **Agent 扮演 Host/Client 的角色**，去连接若干 MCP Server，把这些 server 暴露的 **Tools** 接进 Agent 自己的工具调用循环（知识点 03/04）。MCP server 本身通常**不是 Agent**——它只是个"能力提供方"。

> 换句话说：MCP 不替代 Agent，它替代的是"你为 Agent 手写每个工具对接代码"这件事（知识点 03 里那个本地 registry）。工具来源从"本地硬编码"变成"远程/标准化的 MCP server"。

## 五、MCP vs 直接硬编码工具（知识点 03）——什么场景该用 MCP

知识点 03 里我们把工具直接写进 Agent 的 registry。那已经能用，**为什么还要 MCP？**

**用 MCP 的场景（要"复用 / 解耦 / 标准化"时）：**
- ✅ **一套工具要被多个宿主复用**：同一个"公司数据查询"能力，想同时给 Claude Desktop、Cursor、你的自研 Agent 用——写成一个 MCP server，三处都能插，不用各写三遍。
- ✅ **把能力做成独立服务**：工具团队维护 server，Agent 团队只管连，**解耦**、各自演进。
- ✅ **复用现成生态**：社区已有大量现成 MCP server（GitHub、数据库、文件系统、各种 SaaS），拿来即插。
- ✅ **跨语言/跨团队**：server 用 Python、Agent 用 Node，靠 JSON-RPC 通信，互不关心实现语言。

**不用 MCP、直接硬编码就好的场景：**
- ❌ 单个应用、工具就那么几个、只你自己用 → MCP 多一层协议和部署，**纯属增加复杂度**。知识点 03 的本地 registry 更直接。

> 判断口诀：**工具只服务"这一个 Agent" → 硬编码；工具要服务"很多 Agent/应用" → 做成 MCP server。**

## 六、项目里怎么实现（最小骨架）

用官方 SDK（TypeScript：`@modelcontextprotocol/sdk`）。

### 1. 写一个 MCP Server（暴露一个工具，stdio 传输）
```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const server = new McpServer({ name: 'weather', version: '1.0.0' })

// 注册一个 Tool（参数用 zod 描述，对应 JSON Schema）
server.registerTool(
  'get_temperature',
  {
    description: '查询某城市当前气温',
    inputSchema: { city: z.string().describe('城市名') },
  },
  async ({ city }) => {
    const temp = { 北京: 30, 上海: 26 }[city] ?? null
    return { content: [{ type: 'text', text: JSON.stringify({ city, temp }) }] }
  }
)

await server.connect(new StdioServerTransport())  // 以子进程方式被宿主拉起
```

### 2. 你的 Agent（Host）连接并使用它
```ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const client = new Client({ name: 'my-agent', version: '1.0.0' })
await client.connect(new StdioClientTransport({ command: 'node', args: ['weather-server.js'] }))

// ① 列出 server 暴露的工具
const { tools } = await client.listTools()

// ② 把它们转成你模型要的工具格式（Ollama/OpenAI），喂给 LLM —— 就是知识点 03 的 tools
// ③ 模型决定调用时，转发给 MCP server 执行：
const result = await client.callTool({ name: 'get_temperature', arguments: { city: '北京' } })
// ④ 把 result 作为 role:'tool' 回填，再请求模型 —— 闭环和知识点 03/04 完全一样
```

**看出来了吗**：MCP 没有改变 Agent 的循环，只是把"工具从哪来、怎么执行"换成了"从 MCP server 列出来、转发给它执行"。这恰好挂在知识点 11 的**口子 B（`dispatchTool`）**上——派发时若工具来自 MCP，就 `client.callTool` 转发即可。

## 七、2026 现状（了解）
- **Streamable HTTP 是生产标准**，旧 SSE 已弃用；鉴权向 OAuth 2.1 / OpenID 靠拢。
- 最新规范（2026-07-28 RC）推动**无状态核心**（更好横向扩展），新增 **Tasks**（长任务）、**MCP Apps**（server 渲染 UI）等扩展。
- 入门**先用 stdio 本地跑通**即可，云端/HTTP 等真要对外提供服务再上。

---

## 八、常见理解辨析："MCP = 带协议的工具集"？

对了一大半，但不完整——值得说清，免得误用：

- ✅ **对的主干**：MCP 确实把能力**标准化、可被任意 Agent 发现和调用**，其中 **Tools 是最常用的一类**。如果你 90% 只用它的工具能力，把它理解成"带统一协议、即插即用的工具服务"是够用的。
- ⚠️ **不完整之处**：
  1. **不止 Tools**：还有 **Resources（只读数据，按 URI 取）** 和 **Prompts（模版）**。它是"工具 + 数据 + 模版"的打包，不只是工具。
  2. **不是静态集合，而是运行中的服务 + 连接协议**：有能力发现（`listTools`）、生命周期、传输（stdio/HTTP）、鉴权。你是"**连上去用**"，不是"**导入一个包**"。这也是它和"本地 registry 里一堆函数"（知识点 03）的本质差别——那才是真正的"静态工具集"。

→ 更准的一句话：**MCP 是一套标准协议，让你把"工具/数据/模版"打包成一个可被任意 Agent 发现并连接的服务。**

## 九、一句话总结
> **Agent 是会决策的大脑，MCP 是给大脑插工具的标准接口。** 工具只给自己用就硬编码（知识点 03）；要被很多 Agent/应用复用，就做成 MCP server。它接入 Agent 的方式，仍是知识点 03/04 那个工具调用闭环，只是工具来源标准化了。

---

**关联**：知识点 03（工具调用，MCP 工具最终也走这个闭环）、04（Agent loop）、11 口子 B（MCP 工具挂在统一派发处）。

**参考**：[MCP 官方规范博客](https://blog.modelcontextprotocol.io/)、[MCP 2026 路线图](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/)。
