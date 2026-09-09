# OldPhoneStore

二手手机商城全栈项目 · Docker 一键启动 · Redis 高并发 · 智能客服

[![Live Demo](https://img.shields.io/badge/Live%20Demo-onrender-blue?logo=render)](https://oldphonestore.onrender.com/)
![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![Redis](https://img.shields.io/badge/redis-7-red)
![Docker](https://img.shields.io/badge/docker--compose-ready-blue)
![License](https://img.shields.io/badge/license-MIT-blue)

**Stack:** Express · SQLite · Redis · JWT · Lua / Stream · RAG Chat

**Live Demo:** https://oldphonestore.onrender.com/  
（Render Free 可能休眠，首次打开需等待冷启动）

| 文档 | 说明 |
|------|------|
| [项目讲解](./docs/项目讲解.md) | 每个核心设计的完整口述稿 |
| [部署指南](./docs/DEPLOY.md) | Render Free / 本地 Docker |

## 核心技术点

| 模块 | 技术点 |
|------|--------|
| 商品缓存 | Cache Aside；空值缓存防穿透；互斥锁防击穿；TTL 随机抖动防雪崩 |
| 限时秒杀 | Redis + Lua 原子扣库存、一人一单；成功后写入 Stream，Worker 异步落库 |
| 订单链路 | 状态机 `pending → paid → shipped → completed / cancelled`；`Idempotency-Key` 防重复下单；条件更新幂等支付；超时关单并回滚库存 |
| 用户体系 | JWT 登录注册；Redis Session |
| 管理端 | `/admin` 仪表盘、订单流转、秒杀库存监控 |

### 智能客服

右下角聊天窗接入客服 Agent：

- **FAQ RAG** — 保修 / 物流 / 退货 / 成色等知识库检索
- **Tool 调用** — 搜手机、查订单、列秒杀活动
- **多轮记忆** — Redis 保存近期对话上下文
- **可选大模型** — OpenAI / DeepSeek / Kimi（`LLM_PROVIDER` + `LLM_API_KEY`）；未配置时本地规则引擎仍可完整演示
- **流式输出** — 支持 SSE（`stream: true`）

```mermaid
flowchart LR
  Client --> API[Express API]
  API --> SQLite
  API --> Redis
  Redis -->|Lua| Stream[Redis Stream]
  Stream --> Worker --> SQLite
  API --> Chat[AI Customer Service]
```

---

## Quick start

```bash
git clone https://github.com/kikiarya/OldPhoneStore.git
cd OldPhoneStore
docker compose up --build -d
```

| | |
|--|--|
| 商城 | http://localhost:3000 |
| 管理端 | http://localhost:3000/admin |
| Buyer | `buyer@oldphonestore.demo` / `buyer123` |
| Admin | `admin@oldphonestore.demo` / `admin123` |

本地开发：`cp .env.example .env && npm install && npm start`（建议本机起 Redis；未启动时秒杀自动降级 SQLite）。

云端部署（**Render Free / $0**，可休眠）：见 [docs/DEPLOY.md](./docs/DEPLOY.md)。

---

## 推荐演示路径

1. `GET /api/health` → 确认 `redis: true`、功能列表  
2. 连续打开同一商品详情 → 看响应头 `X-Cache-Source`  
3. Buyer 登录 → Flash **Seckill** → 再抢同一场应失败（一人一单）  
4. 客服：「保修多久」「推荐 iPhone」「有哪些秒杀」  
5. Admin 看仪表盘、改订单状态  

---

## Modules

- **Catalog** — 搜索 / 品牌 / 成色筛选，详情接口带 `X-Cache-Source`
- **Cart checkout** — 事务扣库存 + 幂等下单
- **Flash deals** — 首页秒杀区，登录后抢购
- **Chat widget** — 智能客服；可接 OpenAI / DeepSeek / Kimi
- **Admin** — 营收 / 库存 / 订单状态 / 超时扫描

---

## API

| | Path |
|--|--|
| Auth | `POST /api/auth/login` `register` · `GET /api/auth/me` |
| Phones | `GET /api/phones` ` /meta` ` /:id` |
| Orders | `POST /api/orders` · `POST /:id/pay` · `GET /mine` |
| Flash | `GET /api/flash` · `POST /api/flash/:id/buy` |
| Chat | `POST /api/chat` |
| Admin | `GET /api/admin/dashboard` · orders / phones |
| Health | `GET /api/health` |

```bash
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"buyer@oldphonestore.demo","password":"buyer123"}' | jq -r .token)
curl -s -X POST localhost:3000/api/flash/1/buy -H "Authorization: Bearer $TOKEN"
```

---

## Layout

```
server/
  lua/seckill.lua          # 秒杀原子脚本
  services/cacheService.js # 缓存穿透 / 击穿 / 雪崩
  services/llmConfig.js    # OpenAI / DeepSeek / Kimi
  services/seckillService.js
  services/orderWorker.js  # Stream 消费 + 超时关单
  services/chatService.js  # RAG + Tools
  routes/
public/                    # 商城 + /admin
docs/                      # 讲解 + 部署
docker-compose.yml         # web + redis
```

---

## License

MIT
