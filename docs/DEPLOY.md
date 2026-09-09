# 部署指南

本项目是 **常驻 Node + Redis + SQLite**，不适合 Vercel / Netlify Serverless。

## 怎么选？

| 需求 | 平台 |
|------|------|
| **$0 + 接受休眠（Demo 够用）** | **Render Free** ← 推荐你现在用这个 |
| 试用期内要更稳、更好配 Redis | Railway 试用（约 30 天 / $5，到期要升级） |
| 完全离线 | 本机 `docker compose up --build -d` |

休眠是什么：Free Web 闲置一段时间后会睡；下次访问可能 **30～60 秒** 才醒。作品集 Demo 完全可以接受——打开前自己先点一次热机即可。

---

## Render Free（$0，推荐）

### 总览

你需要建 **两个服务**：

1. **Web Service** — 跑本仓库 Node 应用  
2. **Key Value（Redis）** — 给缓存 / 秒杀 / 客服记忆用  

再给 Web 挂一块 **Disk**，否则 SQLite 重启会丢数据。

### 1. 登录

打开 [https://render.com](https://render.com) → 用 GitHub 登录 → 授权仓库 `OldPhoneStore`。

### 2. 先建 Redis（Key Value）

1. **Dashboard** → **New +** → **Key Value**（有的界面叫 Redis）  
2. Name：`oldphonestore-redis`  
3. Plan：**Free**  
4. Create  

创建后打开这个服务，复制 **Internal Redis URL**（一般形如 `redis://...`）。  
后面填到 Web 的 `REDIS_URL`。

> 若只有 External URL，Demo 也可用；同一账号内优先用 Internal。

### 3. 再建 Web Service

1. **New +** → **Web Service**  
2. 连 GitHub → 选 `kikiarya/OldPhoneStore`  
3. 大致填：

| 项 | 值 |
|----|-----|
| Name | `oldphonestore` |
| Region | 任选（离你近即可） |
| Branch | `main` |
| Runtime | **Node** |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | **Free** |

### 4. 环境变量（Web → Environment）

| Key | Value |
|-----|--------|
| `NODE_ENV` | `production` |
| `PORT` | `10000`（Render 常注入 `PORT`，一般不用改；若要求手填用面板给的） |
| `REDIS_URL` | 粘贴上一步 Redis 的 URL |
| `JWT_SECRET` | 自己生成一串随机字符 |
| `DATABASE_PATH` | `/data/phones.db` |
| `ORDER_TIMEOUT_MINUTES` | `15` |

LLM **可以不配**（本地 RAG 客服照样能演示）。若要接 DeepSeek：

```
LLM_PROVIDER=deepseek
LLM_API_KEY=sk-你的key
```

### 5. 磁盘 Disk（SQLite 持久化）

Web → **Disks** → **Add Disk**：

| 项 | 值 |
|----|-----|
| Name | `phone-data` |
| Mount Path | `/data` |
| Size | Free 允许的最小值即可（如 1 GB） |

确保 `DATABASE_PATH=/data/phones.db`（挂在 `/data` 下）。

### 6. 部署与域名

点 **Create Web Service** / **Deploy**。  
完成后 Render 会给公网地址，例如：

`https://oldphonestore.onrender.com`

自检：

1. 打开 `https://你的域名/api/health`  
2. 看 `"redis": true`（若为 false，检查 `REDIS_URL`）  
3. 打开首页、`/admin`  
4. Demo 账号见 README  

### 7. 演示前热机

分享链接前自己先访问一次首页；若在睡觉，等它醒过来再给面试官点。

### 8. 写进 README

把 Live Demo 链接贴到 README 顶部（去掉注释），再 `git push`。

---

## 免费方案注意点

- Free Web：**会休眠**；不是 7×24 稳定站。  
- Free Redis / Disk：额度以 Render 当前政策为准，可能调整。  
- 不要把真实支付密钥、生产用户数据放这套 Free Demo 上。  
- `JWT_SECRET` 不要用仓库里的默认字符串。

---

## 本地 Docker（零云费用、功能最全）

```bash
docker compose up --build -d
# http://localhost:3000
```

---

## Railway 试用（可选）

适合想「少配一点、试用期内更稳」的情况；到期会出现 *30 days or $5 / Upgrade to keep online*。  
步骤见旧版思路：GitHub 部署 + 加 Redis + Volume `/data`。要长期挂着需付费，**纯 Demo 优先 Render Free**。

---

## 检查清单

- [ ] `/api/health` → `redis: true`  
- [ ] 能登录 Buyer / Admin  
- [ ] 秒杀、客服、管理端能点  
- [ ] README 已放 Live Demo 链接  
