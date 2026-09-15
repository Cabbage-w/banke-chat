# 半刻 · 在线聊天

一个无需 GPT 或 GitHub 账号的中文聊天室。注册自己的用户名和密码，创建房间，再分享邀请链接即可聊天。

- 网页：[GitHub Pages](https://cabbage-w.github.io/banke-chat/)
- 原站：[半刻](https://ban-chat-room.wyhahalife.chatgpt.site)
- 功能：多人聊天室、邀请链接、文字与表情、消息同步、聊天记录、会话搜索、昵称修改、手机适配。

## 运行方式

GitHub Pages 托管前端静态网页；消息 API 和数据库运行在在线 Worker / D1 后端。GitHub 本身不保存用户聊天数据。
使用用户名和密码注册、登录。密码使用 bcrypt 加盐哈希保存，服务端仅保存随机会话令牌的哈希。消息只对已加入房间的成员开放。邀请链接持有者登录后可以加入房间。

登录会话有效期 30 天，退出会撤销当前会话。换设备后使用同一账号登录可以访问原有房间和聊天记录。旧访客可以在原浏览器注册账号以绑定记录。用户名为 3–24 位英文字母、数字或下划线，密码至少 8 位；暂不支持密码找回。昵称不是经过验证的真实身份。此项目不提供端到端加密。

当前 GitHub Pages 已托管前端，但现有 Sites 后端在公网访问测试中返回 Cloudflare 403。账号功能无法绕过该限制；需要可公开访问的后端托管环境才能保证好友正常使用。

## 后端迁移（CloudBase 版，2026-09）

`cloudbase/` 目录包含迁移到腾讯云 CloudBase 免费体验版的完整后端（云函数 + 云数据库，行为与 Worker/D1 版对齐，14 项本地测试全通过）：

- `functions/api/`：云函数源码（index.js 入口、api-core.js 业务逻辑、store.js CloudBase 适配器、memory-store.js 测试用内存实现）
- `test/run-tests.cjs`：本地行为测试，`node cloudbase/test/run-tests.cjs`
- `banke-api.zip`：控制台上传包（勾选自动安装依赖）
- `上线清单.html`：开通 → 部署 → 上线全流程清单

前端 `BANKE_API_ORIGIN` 支持构建时注入，也支持浏览器 `localStorage["banke-api-origin"]` 运行时覆盖。

## 本地开发

需要 Node.js 22.13 或更新版本。

1. `npm ci`
2. `npm run dev`：运行完整应用，使用本地 D1。
3. `npm run build`：构建 Worker，并产生本地 D1 配置。
4. 首次使用 D1 时，依次应用 `drizzle/` 中的迁移：
   `node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/迁移文件.sql`
5. `npm run build:pages`：将 GitHub Pages 前端构建到 `docs/`。

本地调试前端时，把 `BANKE_API_ORIGIN` 设为你的本地 API 地址。跨域来源受 `app/api/http.ts` 的允许列表限制。

## 发布

此仓库使用 main 分支的 docs 目录发布 GitHub Pages。修改页面后，运行 `npm run build:pages` 并提交 docs。
后端变更需要单独构建和部署；数据库变更通过追加 Drizzle 迁移进行，已发布迁移不要重写。
如自行部署后端，请设置自己的 D1 绑定，并修改前端 API 地址和跨域允许来源。
不要将访问令牌、环境密钥、聊天记录或本地数据库提交到仓库。

