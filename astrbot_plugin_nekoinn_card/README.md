# 喵宿玩家卡片 AstrBot 插件

QQ群里发送 `/玩家 <MC名或昵称>`，机器人会查询 Supabase 成员资料并返回一张 PNG 玩家卡片。

## 安装

1. 把整个 `astrbot_plugin_nekoinn_card` 目录复制到 AstrBot 的 `data/plugins/` 目录。
2. 安装依赖：

```bash
pip install -r data/plugins/astrbot_plugin_nekoinn_card/requirements.txt
```

3. 设置环境变量：

```bash
NEKOINN_SUPABASE_URL=https://dpunqvmelqtmwhmgmbzd.supabase.co
NEKOINN_SUPABASE_SERVICE_ROLE=你的 Supabase service_role key
NEKOINN_SITE_URL=https://nekoinn.top
```

4. 在 Supabase SQL Editor 重新执行仓库里的 `supabase/schema.sql`，确保 `get_bot_member_card` 函数存在。
5. 重启 AstrBot。

## 指令

```text
/玩家 Akari_desu
/player Akari_desu
```

## 安全提醒

`NEKOINN_SUPABASE_SERVICE_ROLE` 权限很高，只能放在机器人服务器环境变量里，不要放进网站前端、GitHub 仓库或群聊。
