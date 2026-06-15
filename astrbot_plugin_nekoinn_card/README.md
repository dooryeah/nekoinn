# 喵宿玩家卡片 AstrBot 插件

QQ群里发送 `/玩家 <MC名或昵称>`，机器人会查询 Supabase 成员资料并返回一张 PNG 玩家卡片。

## 安装

1. 把整个 `astrbot_plugin_nekoinn_card` 目录复制到 AstrBot 的 `data/plugins/` 目录。
2. 安装依赖：

```bash
pip install -r data/plugins/astrbot_plugin_nekoinn_card/requirements.txt
```

3. 在 AstrBot WebUI 的插件管理里打开本插件配置，填写：

```text
supabase_url: https://dpunqvmelqtmwhmgmbzd.supabase.co
supabase_service_role: 新生成的 Supabase service_role key
site_url: https://nekoinn.top
```

当前卡片不会显示公开资料链接；`site_url` 只是保留为站点标识和后续扩展配置。

插件也支持环境变量兜底：

```text
NEKOINN_SUPABASE_URL
NEKOINN_SUPABASE_SERVICE_ROLE
NEKOINN_SITE_URL
```

4. 在 Supabase SQL Editor 重新执行仓库里的 `supabase/schema.sql`，确保 `get_bot_member_card` 函数存在。
5. 重启 AstrBot。

## 指令

```text
/玩家 Akari_desu
/player Akari_desu
```

## 安全提醒

`service_role` key 权限很高。你之前泄露过的 key 必须在 Supabase 里轮换/重置，不要继续使用。新的 key 只填在 AstrBot 本地 WebUI 配置或服务器环境变量里，不要放进网站前端、GitHub 仓库或群聊。
