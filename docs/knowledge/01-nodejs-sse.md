# 01 · Node.js 服务端 SSE

> 你在前端用过 `EventSource` 接流，本篇只讲**服务端这一侧**：Node 怎么"产出"一条 SSE 流。理解它，就理解了 LLM 流式输出的传输底层。

## 1. SSE 是什么（一句话回顾）

Server-Sent Events：基于普通 HTTP 的**单向**(服务器→客户端)持续推送。一个长连接不关闭，服务器分多次往里写数据块。相比 WebSocket，它更简单、走标准 HTTP、自动重连，适合"服务器不停吐内容"的场景——LLM 逐 token 输出就是典型。

## 2. 协议格式（服务端要写出的字节）

SSE 是纯文本协议，每条消息由若干行组成，**以一个空行结束**：

```
data: 这是一块内容\n\n
```

常用字段：
- `data:` 数据负载（可多行，每行一个 `data:`）
- `event:` 自定义事件名（前端 `addEventListener(name)` 接）
- `id:` 事件 id（断线重连时浏览器会带 `Last-Event-ID`）
- `retry:` 重连间隔(ms)

关键点：**每条消息后面必须是 `\n\n`**(一个空行)，否则客户端不会触发。

## 3. 必需的响应头

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

`text/event-stream` 是 SSE 的标志；`no-cache` 防止中间层缓冲；keep-alive 保持连接。

## 4. 最小可运行示例（原生 http，无框架）

```js
import http from 'node:http'

http.createServer((req, res) => {
  if (req.url !== '/stream') { res.writeHead(404).end(); return }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  let n = 0
  const timer = setInterval(() => {
    // 注意结尾的 \n\n —— 少了客户端收不到
    res.write(`data: tick ${++n}\n\n`)
    if (n >= 5) {
      res.write('event: done\ndata: bye\n\n')
      clearInterval(timer)
      res.end()
    }
  }, 1000)

  // 客户端断开要清理，否则定时器泄漏
  req.on('close', () => clearInterval(timer))
}).listen(3000, () => console.log('http://localhost:3000/stream'))
```

前端验证（你熟悉的那一侧）：

```js
const es = new EventSource('http://localhost:3000/stream')
es.onmessage = (e) => console.log('data:', e.data)       // 收 data:
es.addEventListener('done', (e) => { console.log('done'); es.close() })
```

## 5. 工程注意点

- **`res.write()` 不是 `res.end()`**：write 只推一块、连接不关；end 才结束。
- **flush / 缓冲**：原生 http 一般即时发送；若前面挂了 Nginx，要关掉它的 proxy buffering（`X-Accel-Buffering: no`），否则内容被攒着不发。
- **心跳**：长时间无数据时，定期发一行注释 `: ping\n\n` 防止连接被中间层判定空闲断开。
- **断开清理**：监听 `req.on('close')` 释放资源（定时器、上游请求）。
- **背压**：`res.write` 返回 `false` 表示缓冲已满，理论上要等 `drain`；LLM 这种低速流一般无需处理。

## 6. 和 Agent 的关系

阶段 1 用 Ollama `stream:true` 时，库内部就是在消费一条这样的流。如果你之后要做一个"Web 版聊天 Agent"，就是：**Ollama 流 →(你的 Node 服务转成 SSE)→ 前端 EventSource**。本篇让你能写出中间那一环。

---

**参考**：MDN SSE 规范；前端侧你已掌握的 `EventSource`。
