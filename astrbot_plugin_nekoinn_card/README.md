# 喵宿玩家卡片 AstrBot 插件

QQ群里发送 `/玩家 <MC名或昵称>`，机器人会查询 Supabase 成员资料并返回一张 PNG 玩家卡片。发送 `/签到` 或 `/许愿` 时，机器人会用发送者 QQ 号自动匹配 `QQ号@qq.com` 的网页账号并写入经验。

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

4. 在 Supabase SQL Editor 重新执行仓库里的 `supabase/schema.sql`，确保 `get_bot_member_card`、`bot_check_in_member` 和 `bot_wish_member` 函数存在。
5. 重启 AstrBot。

## 指令

```text
/玩家 Akari_desu
/player Akari_desu
/签到
/许愿
```

`/签到` 和 `/许愿` 只在 QQ 群内使用。插件会读取发送者 QQ 号，拼成 `QQ号@qq.com`，再去 Supabase 白名单里查找同邮箱账号。比如 QQ `2574515089` 会匹配 `2574515089@qq.com`。

`/签到` 每天首次成功固定获得 5 EXP；`/许愿` 每次随机获得 1 到 5 EXP。等级从 Lv1 到 Lv16，Lv1 升 Lv2 需要 50 EXP，之后每级需求为上一级的 1.2 倍并向上取整。

如果机器人提示无法识别数字 QQ 号，说明当前 QQ 适配器返回的是 OpenID，不是真实 QQ 号；需要改用能提供真实 QQ 号的 OneBot/NapCat 等连接方式，或者后续改成单独维护 QQ OpenID 与邮箱的映射表。

## 安全提醒

`service_role` key 权限很高。你之前泄露过的 key 必须在 Supabase 里轮换/重置，不要继续使用。新的 key 只填在 AstrBot 本地 WebUI 配置或服务器环境变量里，不要放进网站前端、GitHub 仓库或群聊。
