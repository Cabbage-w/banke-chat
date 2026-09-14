# 半刻 · 在线聊天

一个无需 GPT 或 GitHub 账号的中文聊天室。填写昵称，创建房间，再分享邀请链接即可聊天。

- 网页：[GitHub Pages](https://cabbage-w.github.io/banke-chat/)
- 原站：[半刻](https://ban-chat-room.wyhahalife.chatgpt.site)
- 功能：多人聊天室、邀请链接、文字与表情、消息同步、聊天记录、会话搜索、昵称修改、手机适配。

## 运行方式

GitHub Pages 托管前端静态网页；消息 API 和数据库运行在在线 Worker / D1 后端。GitHub 本身不保存用户聊天数据。
使用随机访客令牌识别身份，服务端只保存令牌哈希。消息只对已加入房间的成员开放。邀请链接持有者可以加入房间。

访客身份在当前浏览器中保存，有效期 180 天。换设备、清除站点数据或令牌过期后，需要填写昵称并通过邀请链接重新加入房间。昵称不是经过验证的真实身份。此项目不提供端到端加密。

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

