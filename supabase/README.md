# Supabase Auth + 成员白名单

这个静态站使用 Supabase Auth 做登录，用 `member_whitelist` 表决定谁能进入个人页面，并用 `member_checkins` 记录每日签到。个人页的文字签名存在 `member_whitelist`，背景图上传到 Supabase Storage 的 `member-backgrounds` bucket。

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

签到按北京时间计算日期。每个白名单邮箱每天只能签到一次，排行榜按累计签到天数排序。

背景图 bucket 是公开读取的，方便静态网页直接展示图片；上传、删除和资料保存都限制为已登录且在白名单内的成员。前端限制图片最大 4MB，支持 PNG、JPG、WebP 和 GIF。

## AstrBot 机器人

仓库里的 `astrbot_plugin_nekoinn_card` 插件会调用 `get_bot_member_card` 渲染玩家卡片。重新执行 `supabase/schema.sql` 后，把 Supabase Project URL 和 `service_role` key 填到 AstrBot WebUI 的插件配置里：

```text
supabase_url: https://dpunqvmelqtmwhmgmbzd.supabase.co
supabase_service_role: 你的 service_role key
site_url: https://nekoinn.top
```

插件也支持环境变量兜底。`service_role` key 权限很高，只能放在机器人本地配置或运行环境里，不要提交到仓库或写进网页。
