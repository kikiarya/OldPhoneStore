# 部署指南

本项目是 **常驻 Node 进程 + Redis + SQLite 文件**，不适合 Vercel / Netlify 纯 Serverless。

## 选哪个平台？

| | Railway（推荐） | Render |
|--|-----------------|--------|
| 上手难度 | 更简单：同项目加 Redis，变量可一键引用 | 要分别建 Web + Redis，自己填连接串 |
| 免费情况 | 试用额度 / Hobby 含月度 credit，策略会变 | Free Web 会**休眠**，冷启动几十秒 |
| 对本仓库 | Node + Redis 同项目最省事 | 能跑，展示体验一般（休眠） |

**结论：想尽快挂上公网链接 → 用 Railway。**  
只想 $0、能接受首访很慢 → 可试 Render Free。

---

## Railway（推荐，约 10 分钟）

### 1. 准备

1. 代码已在 GitHub：`main` 分支最新  
2. 打开 [railway.app](https://railway.app) → Login with GitHub  

### 2. 部署 Web

1. **New Project** → **Deploy from GitHub repo** → 选 `OldPhoneStore`  
2. Railway 会识别 Node（已有 `package.json` + `Procfile`）  
3. Settings → 确认 Start Command 为 `npm start`（或留空让其用 Procfile：`web: node server/index.js`）  

### 3. 添加 Redis

1. 项目里 **Add Service** → **Database** → **Redis**  
2. 打开 Web 服务 → **Variables** → **Add Variable**  
3. 名称：`REDIS_URL`  
4. 值：点右侧引用 Redis 的 **`REDIS_URL`**（或 `Connection URL`）变量，不要手抄错  

### 4. 其它环境变量

在 Web 服务 Variables 里再加：

| Key | Value |
|-----|--------|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | 随机长字符串（不要用仓库默认值） |
| `DATABASE_PATH` | `/data/phones.db` |
| `ORDER_TIMEOUT_MINUTES` | `15` |

可选 LLM（不配也能用本地客服）：

```
LLM_PROVIDER=deepseek
LLM_API_KEY=sk-...
```

或 `kimi` / `openai`。

### 5. 持久化 SQLite（重要）

默认磁盘是临时的，**redeploy 可能丢库**。作品集建议挂 Volume：

1. Web 服务 → **Settings** → **Volumes**（或 Mount）  
2. Mount Path：`/data`  
3. 确保 `DATABASE_PATH=/data/phones.db`  

首次启动会自动建表并 seed Demo 账号。

### 6. 生成公网域名

Web 服务 → **Settings** → **Networking** → **Generate Domain**  

得到类似：`https://oldphonestore-xxxx.up.railway.app`

自检：

```text
https://你的域名/api/health
```

应看到 `"redis": true`。然后打开首页与 `/admin`。

### 7. 回填 README

把 README 里 Live Demo 注释改成真实链接并 push。

---

## Render（备选）

1. [render.com](https://render.com) → New **Web Service** → 连 GitHub 仓库  
2. Runtime：Node；Build：`npm install`；Start：`npm start`  
3. 另建 **Key Value（Redis）**，把 Internal Redis URL 填到 Web 的 `REDIS_URL`  
4. Web 加 **Disk**，挂载 `/data`，`DATABASE_PATH=/data/phones.db`  
5. 同样设置 `JWT_SECRET`、`NODE_ENV=production`  

注意：Free Web **闲置会睡**，作品集演示前先访问一次热机。

---

## 本地 Docker（零云费用）

```bash
docker compose up --build -d
# http://localhost:3000
```

已包含 `web` + `redis` + 数据卷，和线上能力最接近。

---

## 部署后检查清单

- [ ] `/api/health` → `redis: true`  
- [ ] Buyer 登录能秒杀  
- [ ] 客服能回答「保修」  
- [ ] `/admin` 能进仪表盘  
- [ ] README 放上 Live Demo 链接  

费用与套餐以官网当前说明为准；作品集低频访问通常消耗很小。
