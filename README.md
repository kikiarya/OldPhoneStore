# OldPhoneStore

**Certified pre-owned smartphone marketplace** — Node.js + Express API, SQLite database, and a modern storefront.

> 二手手机商城 Demo：可本地运行、可 Docker 部署、已接入真实数据库（SQLite），并预留下单与库存扣减流程。

![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Database](https://img.shields.io/badge/db-SQLite-lightgrey)

---

## Features

- **Live inventory** from SQLite (`phones` table) with search, brand, condition, and availability filters
- **Product details** — storage, color, battery health, masked IMEI, condition grade
- **Cart + checkout** — creates an `orders` / `order_items` record and marks unique devices as sold
- **Theme toggle** (dark / light) with persistence
- **Health endpoint** for deploy probes: `GET /api/health`
- **Zero-config seed** — first boot loads 12 demo phones from `data/seed-phones.json`

---

## Quick start

### Requirements

- Node.js **18+**
- npm 9+

### Install & run

```bash
git clone https://github.com/kikiarya/OldPhoneStore.git
cd OldPhoneStore
cp .env.example .env
npm install
npm start
```

Open **http://localhost:3000**

Useful scripts:

| Command | Description |
|---------|-------------|
| `npm start` | Run API + static storefront |
| `npm run dev` | Same with Node `--watch` |
| `npm run seed` | Seed DB if empty |
| `npm run db:reset` | Delete SQLite file and re-seed |

---

## Project structure

```
OldPhoneStore/
├── server/
│   ├── index.js          # Express app
│   ├── db.js             # SQLite connection + schema
│   ├── seed.js           # Seed / reset helpers
│   └── routes/
│       ├── phones.js     # GET /api/phones, /meta, /:id
│       └── orders.js     # POST /api/orders, GET /:id
├── public/               # Storefront (HTML/CSS/JS)
├── data/
│   ├── seed-phones.json  # Demo catalog
│   └── phones.db         # Created at runtime (gitignored)
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Service + DB status |
| `GET` | `/api/phones` | List / filter phones (`q`, `category`, `condition`, `available`, `minPrice`, `maxPrice`) |
| `GET` | `/api/phones/meta` | Brands, conditions, stock stats |
| `GET` | `/api/phones/:id` | Single phone |
| `POST` | `/api/orders` | Checkout `{ items: [{ phone_id, quantity }], customer_name?, customer_email? }` |
| `GET` | `/api/orders/:id` | Order detail |

Example:

```bash
curl "http://localhost:3000/api/phones?category=Apple&available=1"
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"customer_email":"buyer@example.com","items":[{"phone_id":1,"quantity":1}]}'
```

---

## Database

### Default: SQLite (local / small deploys)

- File path: `DATABASE_PATH` (default `./data/phones.db`)
- Schema auto-created on boot: `phones`, `orders`, `order_items`
- Good for demos, coursework portfolios, single-instance VPS

Tables (simplified):

```sql
phones(id, brand, model, storage, color, condition, battery_health,
       year, price, rating, available, category, imei_masked, description, img, created_at)
orders(id, customer_name, customer_email, total, status, created_at)
order_items(id, order_id, phone_id, quantity, unit_price)
```

### Production: PostgreSQL (recommended when you scale)

When traffic, multi-instance deploys, or managed backups matter, move to Postgres:

| Host | Why pick it |
|------|-------------|
| **[Neon](https://neon.tech)** / **[Supabase](https://supabase.com)** | Serverless Postgres, free tier, great with Vercel |
| **[Railway](https://railway.app)** / **[Render](https://render.com)** | App + Postgres in one project |
| **[Amazon RDS](https://aws.amazon.com/rds/)** / **[Cloud SQL](https://cloud.google.com/sql)** | Enterprise / compliance |

Migration path (outline):

1. Set `DATABASE_URL=postgresql://...` in the host secrets
2. Replace `better-sqlite3` queries with `pg` / Prisma / Drizzle (same schema)
3. Keep the Express routes; only the data access layer changes
4. Run migrations instead of `CREATE TABLE IF NOT EXISTS` on every boot

`.env.example` already documents `DATABASE_URL` for this next step.

---

## Where to deploy

| Platform | Fit | Notes |
|----------|-----|-------|
| **[Railway](https://railway.app)** | ★ Best overall | Connect GitHub → deploy Node; attach volume or Postgres for persistence |
| **[Render](https://render.com)** | Easy | Web Service + optional Postgres; free tier sleeps |
| **[Fly.io](https://fly.io)** | Global edge | Use a [volume](https://fly.io/docs/apps/volume-storage/) for SQLite, or Fly Postgres |
| **Docker VPS** (Hetzner / DigitalOcean / 阿里云 / 腾讯云) | Full control | `docker compose up -d` with a named volume |
| **[Vercel](https://vercel.com)** / **Netlify** | Frontend only | Static `public/` works; SQLite + long-lived Node does **not** — use a separate API (Railway) + Postgres |
| **[Cloudflare Pages](https://pages.cloudflare.com)** + Workers | Edge | Needs D1 / external API rewrite — advanced |

### Docker (VPS or local)

```bash
docker compose up --build -d
# → http://localhost:3000
```

SQLite data persists in the `phone-data` Docker volume.

### Railway / Render checklist

1. Push this repo to GitHub
2. New project → deploy from repo
3. Start command: `npm start`
4. Env: `PORT` (platform-provided), `NODE_ENV=production`, `DATABASE_PATH=/data/phones.db` **or** attach Postgres and set `DATABASE_URL`
5. For SQLite on ephemeral disks, attach a **persistent volume** mounted at `/data` — otherwise inventory resets on every redeploy

---

## 中文说明

### 这是什么

OldPhoneStore 是一个**可运行的二手手机商城 Demo**：前端商城页面 + Express 后端 API + SQLite 数据库。支持搜索筛选、购物车、下单（写入订单并标记售出）。

### 本地启动

```bash
npm install
npm start
# 浏览器打开 http://localhost:3000
```

### 数据库怎么选

| 阶段 | 建议 |
|------|------|
| 学习 / 作品集 / 单机 Demo | **SQLite**（本仓库默认，零配置） |
| 正式上线、多实例、要备份 | **PostgreSQL**（Neon / Supabase / Railway / 云厂商 RDS） |

### 部署怎么选

1. **想最快上线**：Railway 或 Render，连 GitHub 一键部署  
2. **自己有服务器**：`docker compose up -d`  
3. **只要静态站**：把 `public/` 丢到 Vercel，API 另外部署  

### 和「企业级大平台」的差距（诚实说明）

当前已具备：**商品库、API、下单写库、可部署骨架**。  
要达到闲鱼 / 转转级别，还需要：用户登录与风控、支付网关、物流、卖家入驻、验机工单、客服纠纷、监控与合规等。本仓库适合作为 **MVP / 作品集底座** 继续迭代。

---

## Roadmap (suggested)

- [ ] User auth (JWT / OAuth)
- [ ] Payment (Stripe / 微信 / 支付宝 sandbox)
- [ ] Admin dashboard for listings
- [ ] PostgreSQL adapter via `DATABASE_URL`
- [ ] Image uploads (S3 / R2)
- [ ] Automated tests (Vitest / Playwright)

---

## License

MIT — see [LICENSE](./LICENSE).
