# Supabase Auth + 成员白名单

这个静态站使用 Supabase Auth 做登录，用 `member_whitelist` 表决定谁能进入个人页面，并用 `member_checkins` 记录每日签到。个人页的文字签名、背景路径和经验值存在 `member_whitelist`，背景图上传到 Supabase Storage 的 `member-backgrounds` bucket。

## 设置步骤

1. 在 Supabase 新建项目。
2. 到 SQL Editor 执行 `supabase/schema.sql`。以后新增签到、个人资料或 Storage 权限变化时，也可以重新执行这个文件。
3. 在 `member_whitelist` 表插入成员邮箱，例如：

```sql
insert into public.member_whitelist (email, nickname, minecraft_name, role)
values ('member@example.com', '成员昵称', 'MinecraftName', 'member');
```

4. 在 Supabase Dashboard 的 Authentication URL Configuration 里设置：

```text
Site URL: https://nekoinn.top
Redirect URLs: https://nekoinn.top/login.html
```

5. 到 Authentication > Email Templates > Magic Link，把模板改成显示验证码：

```html
<h2>喵宿登录验证码</h2>
<p>你的登录验证码是：</p>
<p style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">{{ .Token }}</p>
<p>验证码请勿转发给其他人。</p>
```

6. 把 `js/supabase-config.js` 里的 `url` 和 `anonKey` 换成你的 Supabase Project URL 和 anon/public key。

## 注意

`members.html` 是静态文件，任何人都能打开页面源码。真正需要保护的成员资料应放在 Supabase 表里，通过 RLS 规则限制读取。

签到按北京时间计算日期。每个白名单邮箱每天只能签到一次，排行榜按累计签到天数排序。每天首次签到固定获得 5 EXP；重新执行 `supabase/schema.sql` 时，已有签到次数会按每次 5 EXP 折算为成员的基础经验。等级从 Lv1 到 Lv16，Lv1 升 Lv2 需要 50 EXP，之后每级需求为上一级的 1.2 倍并向上取整。

背景图 bucket 是公开读取的，方便静态网页直接展示图片；上传、删除和资料保存都限制为已登录且在白名单内的成员。前端限制图片最大 4MB，支持 PNG、JPG、WebP 和 GIF。

## AstrBot 机器人

仓库里的 `astrbot_plugin_nekoinn_card` 插件会调用 `get_bot_member_card` 渲染玩家卡片，调用 `bot_check_in_member` 处理 QQ 群 `/签到`，并调用 `bot_wish_member` 处理 `/许愿`。重新执行 `supabase/schema.sql` 后，把 Supabase Project URL 和 `service_role` key 填到 AstrBot WebUI 的插件配置里：

```text
supabase_url: https://dpunqvmelqtmwhmgmbzd.supabase.co
supabase_service_role: 你的 service_role key
site_url: https://nekoinn.top
```

插件也支持环境变量兜底。`service_role` key 权限很高，只能放在机器人本地配置或运行环境里，不要提交到仓库或写进网页。

`/签到` 和 `/许愿` 会把发送者 QQ 号映射成 `QQ号@qq.com`，所以白名单邮箱需要与 QQ 邮箱一致。`/许愿` 每天只能成功一次，每次随机获得 1 到 5 EXP。

## 站点内容管理（admin 页）

`admin.html` 是一个隐藏的管理页面（不在网站导航里出现），用于增删改「工程项目」「服务器展览」「投影文件」三块内容，并支持上传图片。数据存在 `public.projects`、`public.exhibition_items`、`public.projection_files` 三张表里，公开页在运行时读取（带静态兜底）。首次执行 `supabase/schema.sql` 时会把现有静态数据自动灌入这三张表。

`admin.html` 里还有一个「成员管理」标签，用于增改 `member_whitelist` 白名单成员：新增需要填邮箱（成员的登录邮箱，QQ 邮箱则对应机器人 `/签到`、`/许愿`）与 `minecraft_name`；删除是软删除（`is_active=false`，可重新启用）。主页成员列表通过匿名 RPC `get_public_members()` 读取，只返回 `minecraft_name/nickname/role/avatar_url`，不暴露邮箱。成员的头像默认按 `minecraft_name` 从 mc-heads.net 解析（少数特殊成员走 LittleSkin 皮肤覆盖），也可以给成员填 `avatar_url` 自定义头像。

### 一次性设置

1. 在 Supabase Dashboard 的 Authentication → Users → Add user 创建一个管理账号：
   - Email：`admin@nekoinn.top`
   - Password：你的管理员密码（不要在仓库里明文记录）
   - 勾选 **Auto Confirm User**（或把「Email confirmation」关掉），这样无需真实收信即可登录。
2. 记下这个用户的 UUID，把它写入 `site_admins` 表（只能用 `service_role` 执行，例如在 SQL Editor 里跑）：

```sql
insert into public.site_admins (user_id)
values ('<上面的用户 UUID>')
on conflict (user_id) do nothing;
```

3. 重新执行 `supabase/schema.sql` 后，`is_site_admin()` 函数 + 各表的 RLS 会保证：
   - 匿名用户只能读 `is_active = true` 的内容；
   - 只有 `site_admins` 里的账号能增删改内容，以及上传/删除 `site-media` bucket 里的文件；
   - 其他已登录成员（白名单内）和匿名用户都不能写。

### 安全提示

- 管理员密码只存在于 Supabase Auth 里（bcrypt 哈希），不落仓库、不落明文；`admin.html` 里只写死登录邮箱 `admin@nekoinn.top`，密码由使用者输入。
- 永远不要把 `service_role` key 写进 `admin.html` 或任何前端文件；浏览器端只用 anon/publishable key。
- 上传的图片放在公开 bucket `site-media`（≤ 8MB，PNG/JPG/WebP/GIF；投影文件用 `application/octet-stream`）。
