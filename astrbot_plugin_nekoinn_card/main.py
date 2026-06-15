import os
import tempfile
from io import BytesIO
from pathlib import Path
from textwrap import wrap
from urllib.parse import quote

import httpx
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

from astrbot.api.event import AstrMessageEvent, filter
from astrbot.api.star import Context, Star


SUPABASE_URL = os.getenv("NEKOINN_SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE = os.getenv("NEKOINN_SUPABASE_SERVICE_ROLE", "")
SITE_URL = os.getenv("NEKOINN_SITE_URL", "https://nekoinn.top").rstrip("/")
BACKGROUND_BUCKET = "member-backgrounds"
CARD_WIDTH = 980
CARD_HEIGHT = 520


class NekoinnCardPlugin(Star):
    def __init__(self, context: Context):
        super().__init__(context)

    @filter.command("玩家")
    async def player_card_cn(self, event: AstrMessageEvent, name: str = ""):
        async for result in self._render_player(event, name):
            yield result

    @filter.command("player")
    async def player_card_en(self, event: AstrMessageEvent, name: str = ""):
        async for result in self._render_player(event, name):
            yield result

    async def _render_player(self, event: AstrMessageEvent, name: str):
        name = str(name or "").strip()
        if not name:
            yield event.plain_result("用法：/玩家 Akari_desu")
            return

        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE:
            yield event.plain_result("机器人还没有配置 Supabase 环境变量。")
            return

        try:
            profile = await fetch_profile(name)
        except Exception as exc:
            yield event.plain_result(f"资料查询失败：{exc}")
            return

        if not profile:
            yield event.plain_result(f"没有找到 {name} 的成员资料。")
            return

        try:
            image_path = await render_card(profile)
        except Exception as exc:
            yield event.plain_result(f"卡片渲染失败：{exc}")
            return

        yield event.image_result(image_path)


async def fetch_profile(name: str):
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/get_bot_member_card",
            headers=headers,
            json={"player_name": name},
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


def public_profile_url(minecraft_name: str):
    return f"{SITE_URL}/profile.html?player={quote(minecraft_name or '')}"


async def render_card(profile: dict):
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
        background_url = f"{SUPABASE_URL}/storage/v1/object/public/{BACKGROUND_BUCKET}/{quote(background_path, safe='/')}"

    card = Image.new("RGBA", (CARD_WIDTH, CARD_HEIGHT), "#edf5fb")
    background = None
    if background_url:
        try:
            background = await load_remote_image(background_url)
        except Exception:
            background = None

    if background:
        bg = cover(background, (CARD_WIDTH, CARD_HEIGHT)).filter(ImageFilter.GaussianBlur(1.5))
        card.alpha_composite(bg)
        card.alpha_composite(Image.new("RGBA", card.size, (8, 18, 31, 142)))
    else:
        base = Image.new("RGBA", card.size, "#edf5fb")
        draw_base = ImageDraw.Draw(base)
        draw_base.rectangle((0, 0, CARD_WIDTH, CARD_HEIGHT), fill="#edf5fb")
        draw_base.ellipse((-120, -140, 330, 260), fill="#cfe8dc")
        draw_base.ellipse((650, -180, 1100, 230), fill="#f7dbad")
        draw_base.rectangle((0, 0, CARD_WIDTH, CARD_HEIGHT), fill=(247, 251, 255, 92))
        card.alpha_composite(base)

    panel = Image.new("RGBA", (CARD_WIDTH - 80, CARD_HEIGHT - 80), (255, 255, 255, 226))
    panel_mask = rounded_mask(panel.size, 24)
    card.paste(panel, (40, 40), panel_mask)
    draw = ImageDraw.Draw(card)

    try:
        avatar = await load_remote_image(avatar_url)
    except Exception:
        avatar = None
    if avatar is None:
        avatar = Image.new("RGBA", (132, 132), "#ffffff")
    avatar = ImageOps.fit(avatar, (132, 132), method=Image.Resampling.NEAREST)
    avatar_mask = rounded_mask((132, 132), 18)
    card.paste(avatar, (82, 84), avatar_mask)

    title_font = font(46, bold=True)
    mid_font = font(25, bold=True)
    body_font = font(24)
    small_font = font(19)
    chip_font = font(18, bold=True)

    draw.text((246, 82), display_name, font=title_font, fill="#253241")
    draw.text((248, 146), f"MC ID: {minecraft_name}", font=mid_font, fill="#2f5fa8")
    draw.text((248, 188), f"身份: {role}", font=body_font, fill="#66758a")

    chip_text = "今日已签到" if checked_today else "今日未签到"
    chip_fill = "#e6f5ee" if checked_today else "#eef3f8"
    chip_text_fill = "#1f6d52" if checked_today else "#66758a"
    draw.rounded_rectangle((760, 82, 898, 120), radius=10, fill=chip_fill)
    draw.text((781, 90), chip_text, font=chip_font, fill=chip_text_fill)

    draw.rounded_rectangle((82, 256, 898, 376), radius=18, fill="#ffffff", outline="#d8e4ef", width=2)
    draw_wrapped(draw, signature, (112, 280), body_font, "#253241", max_chars=31, max_lines=3)

    fact_y = 408
    facts = [
        ("累计签到", f"{total_count} 天"),
        ("最近签到", str(last_checkin)),
        ("公开资料", public_profile_url(minecraft_name)),
    ]
    x = 82
    widths = [190, 220, 406]
    for (label, value), width in zip(facts, widths):
        draw.rounded_rectangle((x, fact_y, x + width, fact_y + 62), radius=14, fill="#f7fbff", outline="#d8e4ef")
        draw.text((x + 18, fact_y + 8), label, font=small_font, fill="#66758a")
        draw.text((x + 18, fact_y + 34), value, font=small_font, fill="#253241")
        x += width + 13

    output = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
    card.convert("RGB").save(output.name, "PNG")
    return output.name
