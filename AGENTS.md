# AGENTS.md

喵宿（Nekoinn）MC 服务器社区网站 + 配套 AstrBot 机器人插件。本文件定义技术栈、目录结构、编码规则与测试要求，供 AI 编码代理遵守。

## 技术栈

- **前端**：纯静态 HTML/CSS/JS（无框架、无构建步骤、无 `package.json`）。所有页面可直接用浏览器打开（`file://` 预览可用）。
- **动画**：GSAP 3.12.5 + ScrollTrigger，通过 jsDelivr CDN 引入（`https://cdn.jsdelivr.net/npm/gsap@3.12.5/...`）。无 GSAP 时页面必须优雅降级（见编码规则）。
- **后端**：Supabase（Auth 验证码登录、PostgreSQL + RLS、Storage 背景图）。浏览器端用 `@supabase/supabase-js@2`（CDN）。
- **头像**：`mc-heads.net` 为主，`littleskin.cn/textures/` 皮肤为特定玩家覆盖（皮肤哈希硬编码在 `js/avatar-sources.js` 与插件 `main.py` 中）。
- **机器人**：AstrBot Python 插件（`astrbot_plugin_nekoinn_card`），依赖 `httpx` + `Pillow`。
- **部署**：阿里云轻量应用服务器（Ubuntu 18.04 + Nginx 1.14），站点根目录 `/var/www/nekoinn`（仓库 `main` 分支的 git clone），HTTPS 用 Let's Encrypt，SSH 拉取部署（见下方「部署」）。
- **工具脚本**：PowerShell（`tools/`）。

## 目录结构

```
index.html              主页（内联轮播 + 成员头像 + 运行时间 + 随机语录）
about.html              关于
server-exhibition.html  服务器展览（运行时读 Supabase，静态图片列表兜底）
server-bible.html       服务器圣经
projects.html           工程项目（运行时读 Supabase，静态 data/projects.js 兜底）
members.html            个人中心（登录后，签到/排行榜/资料编辑）
login.html              验证码登录
profile.html            公开成员资料页（?player=<名>）
admin.html              隐藏管理页（密码登录后增删改工程项目/展览/投影/成员，无导航入口）
css/
  main.css              主题变量、布局、组件（约 3000 行）
  animations.css        页面过渡、滚动淡入等动画
  admin.css             管理页样式
js/
  theme-init.js         首屏主题初始化（避免闪烁）
  supabase-config.js    暴露 window.NEKOINN_SUPABASE（url + anonKey）
  auth.js               暴露 window.NekoinnAuth（登录/白名单/登出）
  avatar-sources.js     暴露 window.NekoinnAvatars（头像来源解析）
  animations.js         GSAP 动效、轮播、主题切换等（全局脚本）
  login.js / members.js / profile.js   各页逻辑
  admin.js              管理页逻辑（登录/CRUD/上传/排序）
data/
  projects.js           暴露 window.NEKOINN_PROJECTS / NEKOINN_PROJECTION_FILES（现作为 Supabase 兜底数据）
images/                 图片；images/carousel/ 轮播图；images/projects/ 项目图
music/                  背景音乐 mp3
projections/            litematic 投影文件
supabase/
  schema.sql            全部建表/RLS/RPC 函数（改动数据库需重新执行）
  README.md             数据库与登录设置说明
astrbot_plugin_nekoinn_card/   AstrBot 插件（main.py / metadata.yaml / _conf_schema.json / requirements.txt）
tools/
  update-carousel-manifest.ps1  根据 images/carousel/ 重新生成轮播标记与 manifest.json
CNAME                   nekoinn.top（GitHub Pages 时期遗留，现由服务器 nginx 托管）
SESSION_MEMORY.md       本地会话记忆（不应提交）
```

## 编码规则

### 通用

- 界面文案、注释用中文；代码标识符用英文。UI 文案带猫娘口癖（如「喵～」）。
- 无构建步骤：新增 JS/CSS 后直接在 HTML 中 `<script>`/`<link>` 引用，并给 URL 加缓存版本号查询参数（如 `?v=20260721-littleskin`），避免线上缓存旧资源。
- 保持 `file://` 预览可用：不把「本页必需数据」做成运行时 `fetch()` 的唯一依赖。内容类页面（`projects.html`、`server-exhibition.html`）采用「运行时从 Supabase 拉取 + 静态兜底」模式：`file://` 下 fetch 失败仍显示兜底静态数据，线上则展示后台管理的最新数据。

### JavaScript

- 使用 IIFE 包裹页面脚本，避免污染全局作用域；对外只通过 `window.NekoinnXxx` 暴露命名空间。
- 前端全局命名统一：`NEKOINN_SUPABASE`（配置）、`NekoinnAuth`、`NekoinnAvatars`、`NekoinnMotion`、`NEKOINN_PROJECTS` 等。
- 所有注入 HTML 的动态字符串（昵称、语录等）必须经过 `escapeHtml`，防止 XSS。
- 尊重 `prefers-reduced-motion`；无 GSAP / 无 `IntersectionObserver` 时要有降级分支（参考 `js/animations.js`）。
- 图片标签加 `width`/`height`/`alt`/`loading="lazy"`/`decoding="async"`。

### CSS

- 主题色、阴影、圆角等一律用 `:root` 的 CSS 变量；日/夜主题通过 `html[data-theme="night"]` 覆盖变量，不要写死颜色。
- 页面共用样式放 `css/main.css`；动画类（`fade-up`、页面过渡等）放 `css/animations.css`。

### Supabase / 数据库

- 所有表、RLS 策略、RPC 函数改动必须同步更新 `supabase/schema.sql`，并在部署前于 Supabase SQL Editor 重新执行。
- 安全关键：**绝不**在文件或回复中提交/暴露 `service_role` key（仅机器人本地配置用）；浏览器只用 anon/publishable key（`js/supabase-config.js`）。
- 内容管理（`admin.html`）：`projects` / `exhibition_items` / `projection_files` 三张表匿名只读活跃项，写权限通过 `site_admins` 表 + `is_site_admin()` 函数（security definer）限定给管理员账号。管理员是专用 Supabase Auth 账号（密码哈希由 Supabase 存储，不落明文、不落仓库），管理页只写死登录邮箱、密码由使用者输入。
- 成员管理（`admin.html` 的「成员管理」标签）：`member_whitelist` 由管理员增改（软删除 = `is_active=false`，可恢复）；主页成员列表走匿名 RPC `get_public_members()`，只返回 `minecraft_name/nickname/role/avatar_url`，**绝不暴露 email**。
- 管理页上传的文件存公开 bucket `site-media`（≤ 8MB，图片 PNG/JPG/WebP/GIF，投影文件 `application/octet-stream`）。
- 经验/等级逻辑与 Python 端 `level_info()` 保持一致：Lv1 起，升 Lv2 需 50 EXP，之后每级 1.2 倍向上取整，封顶 Lv16。签到 +5 EXP/日，许愿随机 1–5 EXP/日，按北京时间（`Asia/Shanghai`）计日。
- 字段限制：签名 ≤ 80 字、语录 ≤ 120 字；背景图 ≤ 4MB，仅 PNG/JPG/WebP/GIF，存于 `member-backgrounds` bucket，路径为 `<邮箱>/background-<时间戳>.<ext>`。

### Python（AstrBot 插件）

- 命令：`/玩家`、`/player`、`/签到`、`/许愿`、`/留言`；均返回中文结果，异常要给出友好提示而非裸堆栈。
- `/签到`、`/许愿` 将发送者数字 QQ 号映射为 `QQ号@qq.com` 查白名单；`/留言` 写 `site_quotes`（≤120 字）。
- 配置优先级：AstrBot 配置 > 环境变量（`NEKOINN_SUPABASE_URL` / `NEKOINN_SUPABASE_SERVICE_ROLE` / `NEKOINN_SITE_URL`）。

## 部署

- 服务器：阿里云轻量应用服务器，公网 IP `47.98.250.11`（域名 `nekoinn.top` 解析到该 IP），Ubuntu 18.04 + Nginx 1.14。
- 站点根目录：`/var/www/nekoinn`，为仓库的 git clone（`main` 分支），属主 `admin:www`。
- SSH（Windows 本地密钥）：`ssh -i C:\Users\18779\nekinn.pem root@47.98.250.11`。
- 更新流程：本地推送到 GitHub 后，SSH 到服务器在 `/var/www/nekoinn` 执行 `git pull`（root 下需先 `git config --global --add safe.directory /var/www/nekoinn`，或切到 `admin` 用户），nginx 直接托管静态文件。
- 大陆服务器直连 GitHub 常被 GFW 超时；可在本地开代理后用 SSH 反向隧道拉取：`ssh -i <key> -R 10091:127.0.0.1:10090 root@<ip> "cd /var/www/nekoinn && git -c http.proxy=http://127.0.0.1:10091 pull origin main"`（`10090` 为本地代理端口，按需调整）。
- HTTPS：Let's Encrypt（certbot），证书 `/etc/letsencrypt/live/nekoinn.top-0001/`；HTTP 80 自动 301 到 HTTPS。
- Nginx 站点配置：`/etc/nginx/sites-enabled/nekoinn.top`；`/term/` 路径反代到 `127.0.0.1:7681`（终端）。

## 测试要求

- 无自动化测试框架。每次改动后至少执行以下静态检查：
  - JS：`node --check js\xxx.js`（及 `data\projects.js`）。
  - Python：`python -m py_compile astrbot_plugin_nekoinn_card\main.py`。
  - 提交前：`git diff --check`（当前存在 Windows CRLF 警告，可忽略但不引入新的空白错误）。
- 视觉/交互改动：用浏览器直接打开对应 HTML 做 `file://` 预览，并在桌面与移动宽度下各验证一次（轮播、主题切换、淡入动画、登录流程需在线上/Supabase 环境验证）。
- 涉及 Supabase RPC/RLS 的改动，需确认 `supabase/schema.sql` 已在真实环境重新执行并验证权限生效。
- 管理页改动需在线上验证：匿名/非管理员无法写、管理员可增删改与上传；`admin.html` 不加入任何导航入口（直接输 URL 访问，`noindex` 防收录）。
- 不要提交 `SESSION_MEMORY.md`、`tools/`、`images/carousel/manifest.json` 等本地/辅助文件，除非用户明确要求。
