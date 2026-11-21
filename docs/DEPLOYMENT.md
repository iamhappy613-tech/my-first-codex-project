# 词间账号与 Plus 专属 GPT：上线步骤

目前仓库默认是本地学习模式，原有网站仍可用。真实账号、跨设备同步及 GPT 读写只有完成本页配置并测试后才能启用。没有内置模型 API，也不需要开通 OpenAI 模型 API 计费。

## 一、先验证你的 Plus 可以使用 Actions

1. 在你自己的 ChatGPT 中创建自定义 GPT，设置为 **仅自己（Only me）**。选择编辑器中支持 Actions 的可用模型；不是所有模式都支持。
2. 新建 Action，先导入 `gpt/openapi-smoke.json`，这一步认证选择 None。
3. 让它读取测试进度。它访问的是网站公开的 `gpt/smoke.json`，响应必须标记 `synthetic: true`。这不是你的真实学习记录。
4. 如果编辑器没有 Actions，或实际调用失败，先处理账号/工具可用性，不能假装连通。

模拟配置不是生产配置。正式接入时删除模拟 Action，再换入后面的受保护配置，避免把测试进度当成真实数据。

## 二、创建 Supabase 免费项目

1. 访问 https://supabase.com/dashboard ，创建项目，选择适合的免费方案和地区。数据库密码自行保管，不发到聊天或 Git。
2. 在 Connect / Settings → API Keys 获取 **Project URL** 和 **Publishable key**（旧版为 anon key）。这两项可用于网页，不能用 secret/service_role key 替代。
3. 在 SQL Editor 中执行 `supabase/migrations/202611210001_accounts.sql`，再执行 `supabase/seed.sql`。两份都是完整 SQL 文件。首次迁移应在新的专用项目运行；已有同名表时先检查，不要删除旧表强行通过。
4. 在 Authentication 的 URL 配置中填写网站地址：
   - Site URL：`https://iamhappy613-tech.github.io/my-first-codex-project/index.html`
   - 允许回跳：该地址、网站根路径，以及稍后测试使用的 `https://iamhappy613-tech.github.io/my-first-codex-project/cloud-preview.html`。
5. 启用 Email provider、开放注册及邮箱确认。配置真实可发送确认、找回密码邮件的发信服务。默认测试发信可能有额度/收件人限制，不能以管理员收到一封邮件就断言公众注册可用。邮件密码只填 Supabase 安全配置。

免费方案、函数及邮件都有各自限制，具体以服务商当前规则为准。本项目不会自动升级收费方案。

## 三、创建并指定唯一所有者

在 Supabase Authentication → Users 创建或验证你自己的账号，复制该用户的 **UUID**。初始化阶段也可在后台创建本人账号、确认本人拥有该邮箱；不要自动把第一个访客设为管理员。

SQL Editor 执行下列语句，将占位符换成你的实际用户 UUID：

```sql
update public.profiles set role = 'admin'
where id = 'YOUR-VERIFIED-USER-UUID';
select id, email, role, enabled from public.profiles
where id = 'YOUR-VERIFIED-USER-UUID';
```

必须确认恰好是你的账号。普通用户不能通过网页改角色，也不能停用管理员。

## 四、部署两个后端函数

在你自己的电脑安装 Node.js 和 Git，克隆/更新仓库后在仓库目录运行：

```sh
npm ci
npx supabase login
```

Supabase CLI 登录在你自己的终端和浏览器完成，不把访问令牌发到聊天里。项目 Ref 是 Project URL 中的项目标识。

生成连接凭据：

```sh
node scripts/connection-secret.mjs --owner YOUR-VERIFIED-USER-UUID --site https://iamhappy613-tech.github.io
```

它生成两个被 Git 忽略、权限受限的文件，不在终端打印密钥：

- `.env.coach.local`：原始连接口令，稍后仅复制值到私有 GPT 的鉴权设置。
- `.env.functions.local`：所有者 UUID、连接口令的 SHA-256 摘要、网站来源。服务端只需口令摘要。

如果文件已存在，脚本拒绝覆盖，避免误换正在使用的凭据。更换凭据前保存现有配置并同时更新后台和私有 GPT。

```sh
npx supabase secrets set --project-ref YOUR_PROJECT_REF --env-file .env.functions.local
npx supabase functions deploy admin --project-ref YOUR_PROJECT_REF
npx supabase functions deploy coach --project-ref YOUR_PROJECT_REF
```

项目运行时的 SUPABASE_URL、SUPABASE_ANON_KEY、SUPABASE_SERVICE_ROLE_KEY 由平台注入。服务端权限密钥不得放进 `index.html`、GPT 指令或 OpenAPI 文件。

两个 HTTP 函数在处理器里完整鉴权：admin 向 Auth 验证登录令牌，再由数据库检查管理员；coach 验证独立连接口令并固定所有者。普通 PostgREST 接口继续通过用户 JWT 与数据库 RLS 校验。`verify_jwt = false` 不表示接口匿名开放。

## 五、填写网页公开配置

用实际公开配置执行（这里的 key 只能是 publishable/anon）：

```sh
node scripts/configure.mjs --url https://YOUR_PROJECT.supabase.co --key YOUR_PUBLIC_KEY --owner YOUR-VERIFIED-USER-UUID
```

此时仍不启用云端入口，方便先准备。脚本同时替换生产 `gpt/openapi.json` 的服务地址。

完成迁移、函数和邮件配置后，生成一个独立的云端测试页，保留正式首页的本地模式：

```sh
node scripts/configure.mjs --url https://YOUR_PROJECT.supabase.co --key YOUR_PUBLIC_KEY --owner YOUR-VERIFIED-USER-UUID --enable-cloud --output cloud-preview.html
```

提交公开的 `cloud-preview.html` 并推送 main，等待 Pages 更新后打开：
`https://iamhappy613-tech.github.io/my-first-codex-project/cloud-preview.html`。

测试页和正式网站拥有相同来源，管理员函数 CORS 能接受它，邮件回跳也指向测试页。该页只含公开项目配置，不含连接口令；不要通过通用静态服务器提供整个仓库。

**本人账号第一次云端登录，必须在以前背单词的同一浏览器、同一设备，打开这个原网站来源的测试页。** 先确认“导入本机旧进度”，完成同步再使用另一设备。不要先在 localhost 或另一个浏览器为本人创建空云端进度，否则后续不会自动覆盖云端已有记录。如果已经创建了空记录，停止初始化并保留旧本机数据，先处理备份与导入，不要清空浏览器存储。

注册、邮件和管理员检查使用单独测试账号；它们可以在其他浏览器打开该测试页。至少验证两账号互不串进度、不能提权，停用后不能读写，恢复后记录仍在；同时验证注册确认、找回密码邮件都回到测试页。

本机查看网页外观时，可直接打开 HTML，或使用安全预览：

```sh
node scripts/preview.mjs
```

访问 `http://127.0.0.1:8000`。此服务器只提供 `index.html`，绑定本机回环地址；它不用于生产云端 CORS、邮件回跳及旧数据导入验收。

所有真实检查通过后，再启用正式首页：

```sh
node scripts/configure.mjs --url https://YOUR_PROJECT.supabase.co --key YOUR_PUBLIC_KEY --owner YOUR-VERIFIED-USER-UUID --enable-cloud
```

提交并推送 main 后，邮件回跳恢复为正式首页。通过测试的云端进度会继续使用。移除临时 `cloud-preview.html` 并在后台移除测试回跳地址。任何检查失败先保留正式首页的本地模式，不发布无法登录的入口。

## 六、配置真实私有 GPT

1. 删除纯模拟 Action，导入配置好服务地址的 `gpt/openapi.json`。
2. Authentication 选择 API Key / Bearer。在专用密钥栏填 `.env.coach.local` 中的连接口令值，不含变量名，也不要写到指令里。这不是模型 API key。
3. 将 `gpt/instructions.md` 填入 GPT 指令。保持 **仅自己**。此连接只授权固定所有者，不能分享成所有人可用的 GPT。
4. 网站中登录本人账号、导入旧记录并确认“已同步”。让 GPT 读取摘要，说出同步时间、学习日和进度版本，核对是否真实一致。
5. 测试读取候选、保存推荐草稿、网站采用、下一学习日生效；写工具可能有 ChatGPT 平台授权提示。
6. 保存私有 GPT 链接，再运行公开配置脚本增加 `--gpt https://chatgpt.com/g/YOUR_PRIVATE_GPT`，更新后推送。

网页不能内嵌你的 Plus 聊天。按钮打开的是专属 GPT；每次依赖进度的回答先读取最新云端，不继承当前这段聊天。

## 七、验收清单

- [ ] 实际 Plus GPT 使用模拟 Action 成功，明确是模拟。
- [ ] 数据库迁移、词库和函数部署成功。
- [ ] 本人及普通账号能注册、验证、登录和重置密码。
- [ ] 两账号进度与本地缓存隔离，普通账号不能使用管理接口。
- [ ] 旧本机进度导入由用户确认，失败时不删除原始记录。
- [ ] 本人两设备同步，冲突保留本机备份；退出不把待同步内容写到别的账号。
- [ ] 停用账号后旧令牌无权读写，恢复保留记录。
- [ ] 错误/撤销的 GPT 连接口令不能读取进度；接口忽略不了伪造 user_id，直接拒绝。
- [ ] 真正完成“学习 → 已同步 → GPT 读取 → 推荐草稿 → 网站采用 → 下一学习日生效”。
- [ ] 工具失败、限额或网络中断时明确提示，不伪造同步/保存成功。

## 开发与验证

运行学习网页不需要安装依赖。只有开发测试需要 Node/Chromium/Docker：

```sh
npm ci
npm test
npm run test:db
npm run test:browser
node scripts/embed.mjs --check
```

`tests/database.integration.mjs` 使用真实 PostgreSQL 和模拟的 Supabase auth.uid 声明测试 SQL 权限；HTTP/浏览器测试使用受控服务响应，不替代上面的真实邮件、项目及 Plus 编辑器验收。

源代码位于 `web/` 和 `supabase/functions/_shared/`；修改后运行 `npm run embed` 更新自包含 `index.html`。这是维护快照的原生 Node 脚本，不是打开网页所需的构建步骤。服务端 SQL及种子位于 `supabase/`。任何 `.env.*` 私密文件不得提交。
