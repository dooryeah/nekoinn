import os
import re
import tempfile
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from textwrap import wrap
from urllib.parse import quote

import httpx
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

from astrbot.api import AstrBotConfig
from astrbot.api.event import AstrMessageEvent, filter
from astrbot.api.star import Context, Star


BACKGROUND_BUCKET = "member-backgrounds"
CARD_WIDTH = 980
CARD_HEIGHT = 520


@dataclass
class PluginSettings:
    supabase_url: str
    supabase_service_role: str
    site_url: str
    card_title: str

    @classmethod
    def from_config(cls, config: AstrBotConfig | None):
        config = config or {}
        supabase_url = str(
            config.get("supabase_url")
            or os.getenv("NEKOINN_SUPABASE_URL", "")
        ).strip().rstrip("/")
        supabase_service_role = str(
            config.get("supabase_service_role")
            or os.getenv("NEKOINN_SUPABASE_SERVICE_ROLE", "")
        ).strip()
        site_url = str(
            config.get("site_url")
            or os.getenv("NEKOINN_SITE_URL", "https://nekoinn.top")
        ).strip().rstrip("/")
        card_title = str(config.get("card_title") or "Nekoinn Player Card").strip()
        return cls(
            supabase_url=supabase_url,
            supabase_service_role=supabase_service_role,
            site_url=site_url or "https://nekoinn.top",
            card_title=card_title or "Nekoinn Player Card",
        )

    @property
    def is_ready(self):
        return bool(self.supabase_url and self.supabase_service_role)


class NekoinnCardPlugin(Star):
    def __init__(self, context: Context, config: AstrBotConfig | None = None):
        super().__init__(context)
        self.settings = PluginSettings.from_config(config)

    @filter.command("玩家")
    async def player_card_cn(self, event: AstrMessageEvent, name: str = ""):
        async for result in self._render_player(event, name):
            yield result

    @filter.command("player")
    async def player_card_en(self, event: AstrMessageEvent, name: str = ""):
        async for result in self._render_player(event, name):
            yield result

    @filter.command("签到")
    async def check_in(self, event: AstrMessageEvent):
        if not self.settings.is_ready:
            yield event.plain_result("插件还没有配置 Supabase，请在 AstrBot 插件管理里填写配置。")
            return

        if not str(event.get_group_id() or "").strip():
            yield event.plain_result("请在 QQ 群里发送 /签到，这样才能用你的 QQ 号匹配网页账号。")
            return

        qq_number = extract_qq_number(event.get_sender_id())
        if not qq_number:
            yield event.plain_result(
                "没有识别到你的数字 QQ 号，暂时不能自动匹配 QQ 邮箱账号。"
                "如果当前 QQ 适配器返回的是 OpenID，请改用能返回真实 QQ 号的 OneBot/NapCat 连接。"
            )
            return

        email = f"{qq_number}@qq.com"
        try:
            result = await bot_check_in(self.settings, email)
        except httpx.HTTPStatusError as exc:
            detail = response_error_detail(exc.response)
            if "not_whitelisted" in detail:
                yield event.plain_result(f"没有找到 {email} 对应的成员账号，暂时不能签到。")
            else:
                yield event.plain_result(f"签到失败：{detail}")
            return
        except Exception as exc:
            yield event.plain_result(f"签到失败：{exc}")
            return

        if not result:
            yield event.plain_result(f"没有找到 {email} 对应的成员账号，暂时不能签到。")
            return

        display_name = result.get("display_name") or result.get("minecraft_name") or "成员"
        total_count = int(result.get("total_count") or 0)
        if result.get("already_checked"):
            yield event.plain_result(f"{display_name} 今天已经签到过啦。累计签到 {total_count} 天。")
        else:
            yield event.plain_result(f"{display_name} 签到成功！累计签到 {total_count} 天。")

    async def _render_player(self, event: AstrMessageEvent, name: str):
        name = str(name or "").strip()
        if not name:
            yield event.plain_result("用法：/玩家 Akari_desu")
            return

        if not self.settings.is_ready:
            yield event.plain_result("插件还没有配置 Supabase，请在 AstrBot 插件管理里填写配置。")
            return

        try:
            profile = await fetch_profile(self.settings, name)
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text[:160] if exc.response is not None else str(exc)
            yield event.plain_result(f"资料查询失败：{detail}")
            return
        except Exception as exc:
            yield event.plain_result(f"资料查询失败：{exc}")
            return

        if not profile:
            yield event.plain_result(f"没有找到 {name} 的成员资料。")
            return

        try:
            image_path = await render_card(profile, self.settings)
        except Exception as exc:
            yield event.plain_result(f"卡片渲染失败：{exc}")
            return

        yield event.image_result(image_path)


def supabase_headers(settings: PluginSettings):
    return {
        "apikey": settings.supabase_service_role,
        "Authorization": f"Bearer {settings.supabase_service_role}",
        "Content-Type": "application/json",
    }


def response_error_detail(response: httpx.Response | None):
    if response is None:
        return "unknown_error"
    try:
        data = response.json()
        if isinstance(data, dict):
            return str(data.get("message") or data.get("details") or data)
    except Exception:
        pass
    return response.text[:180] or f"HTTP {response.status_code}"


def extract_qq_number(sender_id):
    sender_id = str(sender_id or "").strip()
    return sender_id if re.fullmatch(r"\d{5,12}", sender_id) else ""


async def fetch_profile(settings: PluginSettings, name: str):
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            f"{settings.supabase_url}/rest/v1/rpc/get_bot_member_card",
            headers=supabase_headers(settings),
            json={"player_name": name},
        )
        response.raise_for_status()
        data = response.json()

    return data[0] if data else None


async def bot_check_in(settings: PluginSettings, email: str):
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            f"{settings.supabase_url}/rest/v1/rpc/bot_check_in_member",
            headers=supabase_headers(settings),
            json={"member_email": email},
        )
        response.raise_for_status()
        data = response.json()

    return data[0] if data else None


async def load_remote_image(url: str):
    if not url:
        return None
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()
    return Image.open(BytesIO(response.content)).convert("RGBA")


def font(size: int, bold: bool = False):
    candidates = [
        "C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/simhei.ttf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc" if bold else "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc",
        "/usr/share/fonts/truetype/arphic/uming.ttc",
        "/System/Library/Fonts/PingFang.ttc",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def cover(image: Image.Image, size):
    image = image.convert("RGBA")
    image_ratio = image.width / image.height
    target_ratio = size[0] / size[1]
    if image_ratio > target_ratio:
        new_height = size[1]
        new_width = int(new_height * image_ratio)
    else:
        new_width = size[0]
        new_height = int(new_width / image_ratio)
    resized = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
    left = (new_width - size[0]) // 2
    top = (new_height - size[1]) // 2
    return resized.crop((left, top, left + size[0], top + size[1]))


def rounded_mask(size, radius):
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=255)
    return mask


def draw_wrapped(draw, text, xy, draw_font, fill, max_chars, line_gap=8, max_lines=3):
    text = str(text or "")
    lines = []
    for raw_line in text.splitlines() or [""]:
        lines.extend(wrap(raw_line, width=max_chars) or [""])
    lines = lines[:max_lines]
    x, y = xy
    line_height = getattr(draw_font, "size", 18)
    for line in lines:
        draw.text((x, y), line, font=draw_font, fill=fill)
        y += line_height + line_gap


async def render_card(profile: dict, settings: PluginSettings):
    display_name = profile.get("display_name") or profile.get("minecraft_name") or "成员"
    minecraft_name = profile.get("minecraft_name") or "未填写"
    role = profile.get("role") or "member"
    signature = profile.get("signature") or "还没有签名。"
    total_count = int(profile.get("total_count") or 0)
    last_checkin = profile.get("last_checkin_date") or "-"
    checked_today = bool(profile.get("checked_in_today"))
    avatar_url = profile.get("avatar_url") or f"https://mc-heads.net/avatar/{quote(minecraft_name)}"
    background_path = profile.get("background_path")
    background_url = ""
    if background_path:
        background_url = f"{settings.supabase_url}/storage/v1/object/public/{BACKGROUND_BUCKET}/{quote(background_path, safe='/')}"

    card = Image.new("RGBA", (CARD_WIDTH, CARD_HEIGHT), "#edf5fb")
    background = None
    if background_url:
        try:
            background = await load_remote_image(background_url)
        except Exception:
            background = None

    base = Image.new("RGBA", card.size, "#edf5fb")
    draw_base = ImageDraw.Draw(base)
    draw_base.rectangle((0, 0, CARD_WIDTH, CARD_HEIGHT), fill="#edf5fb")
    draw_base.ellipse((-120, -120, 360, 250), fill="#d8ede3")
    draw_base.ellipse((650, -170, 1120, 240), fill="#f8dfb8")
    draw_base.rectangle((0, 0, CARD_WIDTH, CARD_HEIGHT), fill=(247, 251, 255, 132))
    card.alpha_composite(base)

    panel_pos = (46, 40)
    panel_size = (CARD_WIDTH - 92, CARD_HEIGHT - 80)
    panel_mask = rounded_mask(panel_size, 16)
    panel = Image.new("RGBA", panel_size, (255, 255, 255, 222))
    card.paste(panel, panel_pos, panel_mask)

    banner_size = (panel_size[0], 178)
    banner = Image.new("RGBA", banner_size, (47, 95, 168, 255))
    if background:
        banner = cover(background, banner_size)
        banner = banner.filter(ImageFilter.GaussianBlur(0.6))
        banner.alpha_composite(Image.new("RGBA", banner_size, (14, 31, 51, 84)))
    else:
        banner_draw = ImageDraw.Draw(banner)
        banner_draw.rectangle((0, 0, banner_size[0], banner_size[1]), fill="#2f5fa8")
        banner_draw.ellipse((-60, -80, 380, 230), fill="#3a9b75")
        banner_draw.ellipse((560, -120, 980, 200), fill="#f2aa4c")
        banner.alpha_composite(Image.new("RGBA", banner_size, (255, 255, 255, 18)))

    banner_mask = rounded_mask(banner_size, 16)
    square_fix = Image.new("L", banner_size, 0)
    square_draw = ImageDraw.Draw(square_fix)
    square_draw.rectangle((0, 70, banner_size[0], banner_size[1]), fill=255)
    banner_mask = Image.composite(Image.new("L", banner_size, 255), banner_mask, square_fix)
    card.paste(banner, panel_pos, banner_mask)
    draw = ImageDraw.Draw(card)

    try:
        avatar = await load_remote_image(avatar_url)
    except Exception:
        avatar = None
    avatar_size = 116
    avatar_pos = (90, 138)
    draw.rounded_rectangle(
        (avatar_pos[0] - 8, avatar_pos[1] - 8, avatar_pos[0] + avatar_size + 8, avatar_pos[1] + avatar_size + 8),
        radius=18,
        fill="#ffffff",
        outline="#d8e4ef",
        width=2,
    )
    if avatar is None:
        avatar = Image.new("RGBA", (avatar_size, avatar_size), "#ffffff")
    avatar = ImageOps.fit(avatar, (avatar_size, avatar_size), method=Image.Resampling.NEAREST)
    avatar_mask = rounded_mask((avatar_size, avatar_size), 12)
    card.paste(avatar, avatar_pos, avatar_mask)

    title_font = font(44, bold=True)
    mid_font = font(24, bold=True)
    body_font = font(23)
    small_font = font(18)
    chip_font = font(17, bold=True)
    caption_font = font(15, bold=True)
    fact_label_font = font(17, bold=True)

    draw.rounded_rectangle((82, 72, 286, 104), radius=8, fill=(20, 37, 58, 110))
    draw.text((100, 79), settings.card_title, font=caption_font, fill="#ffffff")

    draw.text((236, 154), display_name, font=title_font, fill="#253241")
    draw.text((238, 214), f"@{minecraft_name}", font=mid_font, fill="#2f5fa8")

    chip_text = "今日已签到" if checked_today else "今日未签到"
    chip_fill = "#e6f5ee" if checked_today else "#eef3f8"
    chip_text_fill = "#1f6d52" if checked_today else "#66758a"
    draw.rounded_rectangle((738, 204, 876, 244), radius=8, fill=chip_fill)
    draw.text((759, 213), chip_text, font=chip_font, fill=chip_text_fill)

    fact_y = 292
    facts = [
        ("MC ID", minecraft_name),
        ("身份", role),
        ("累计签到", f"{total_count} 天"),
        ("最近签到", str(last_checkin)),
    ]
    fact_width = 188
    fact_gap = 16
    x = 82
    for label, value in facts:
        draw.rounded_rectangle((x, fact_y, x + fact_width, fact_y + 72), radius=8, fill=(255, 255, 255, 150), outline="#d8e4ef")
        draw.text((x + 16, fact_y + 12), label, font=fact_label_font, fill="#66758a")
        draw.text((x + 16, fact_y + 40), value, font=small_font, fill="#253241")
        x += fact_width + fact_gap

    draw.rounded_rectangle((82, 392, 898, 462), radius=8, fill=(58, 155, 117, 22), outline="#c9e8dc")
    draw.text((106, 410), "文字签名", font=fact_label_font, fill="#1f6d52")
    draw_wrapped(draw, signature, (210, 408), body_font, "#253241", max_chars=30, max_lines=2)

    output = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
    card.convert("RGB").save(output.name, "PNG")
    return output.name
