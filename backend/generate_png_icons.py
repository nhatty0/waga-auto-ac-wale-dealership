import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

def render_ac_wale_icon(size=512):
    # Render at 2x supersampling for ultra-crisp edges
    w = size * 2
    h = size * 2
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Background dark rounded rectangle
    radius = int(w * 0.21)
    margin = int(w * 0.02)
    draw.rounded_rectangle(
        [margin, margin, w - margin, h - margin],
        radius=radius,
        fill=(12, 12, 14, 255),
        outline=(245, 158, 11, 200),
        width=int(w * 0.012)
    )

    # Ambient amber glow ellipse in center
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    cx, cy = w // 2, int(h * 0.38)
    rx, ry = int(w * 0.38), int(h * 0.28)
    glow_draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(245, 158, 11, 40))
    img = Image.alpha_composite(img, glow)
    draw = ImageDraw.Draw(img)

    # Fonts
    try:
        font_eng = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", int(w * 0.068))
        font_wale = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", int(w * 0.032))
        font_amh = ImageFont.truetype("C:/Windows/Fonts/nyala.ttf", int(w * 0.052))
    except Exception:
        font_eng = font_wale = font_amh = ImageFont.load_default()

    # 2. Modern Red Car Contour Line (curving over the top)
    # Parametric curve for aerodynamic supercar roofline
    contour_pts = []
    c_start_x, c_start_y = int(w * 0.18), int(h * 0.38)
    c_peak_x, c_peak_y = int(w * 0.50), int(h * 0.12)
    c_end_x, c_end_y = int(w * 0.82), int(h * 0.38)

    for i in range(101):
        t = i / 100.0
        # Quadratic bezier
        x = (1 - t)**2 * c_start_x + 2 * (1 - t) * t * c_peak_x + t**2 * c_end_x
        y = (1 - t)**2 * c_start_y + 2 * (1 - t) * t * c_peak_y + t**2 * c_end_y
        contour_pts.append((x, y))

    # Draw vibrant red glow line
    line_w = int(w * 0.022)
    for i in range(len(contour_pts) - 1):
        draw.line([contour_pts[i], contour_pts[i+1]], fill=(239, 68, 68, 255), width=line_w)

    # 3. Stylized "A" Monogram Blades (Titanium White)
    peak_x, peak_y = int(w * 0.50), int(h * 0.16)
    left_foot_x, foot_y = int(w * 0.30), int(h * 0.52)
    right_foot_x = int(w * 0.70)
    blade_w = int(w * 0.045)

    # Left blade
    draw.polygon([
        (peak_x - blade_w//2, peak_y),
        (peak_x, peak_y),
        (left_foot_x + blade_w, foot_y),
        (left_foot_x, foot_y)
    ], fill=(248, 250, 252, 255))

    # Right blade
    draw.polygon([
        (peak_x, peak_y),
        (peak_x + blade_w//2, peak_y),
        (right_foot_x, foot_y),
        (right_foot_x - blade_w, foot_y)
    ], fill=(248, 250, 252, 255))

    # 4. Embraced Amber-Gold "C" Monogram
    # Curved arc inside the "A"
    c_box = [int(w * 0.38), int(h * 0.24), int(w * 0.62), int(h * 0.48)]
    draw.arc(c_box, start=45, end=315, fill=(245, 158, 11, 255), width=int(w * 0.04))

    # 5. Horizontal Bar with "WALE"
    bar_y = int(h * 0.38)
    bar_h = int(h * 0.075)
    bar_w = int(w * 0.32)
    bar_x = (w - bar_w) // 2
    draw.rounded_rectangle(
        [bar_x, bar_y, bar_x + bar_w, bar_y + bar_h],
        radius=int(bar_h * 0.3),
        fill=(10, 10, 12, 255),
        outline=(245, 158, 11, 255),
        width=int(w * 0.008)
    )
    # WALE text
    wale_text = "WALE"
    bbox_w = draw.textbbox((0, 0), wale_text, font=font_wale)
    tw = bbox_w[2] - bbox_w[0]
    th = bbox_w[3] - bbox_w[1]
    draw.text(
        (bar_x + (bar_w - tw) // 2, bar_y + (bar_h - th) // 2 - int(w * 0.004)),
        wale_text,
        font=font_wale,
        fill=(255, 255, 255, 255)
    )

    # 6. Red Front Splitter Line below feet
    splitter_y = foot_y + int(w * 0.015)
    draw.line([(int(w * 0.25), splitter_y), (int(w * 0.75), splitter_y)], fill=(239, 68, 68, 255), width=int(w * 0.012))

    # 7. Typography Companion
    # Line 1: "AC WALE MARKET" (bold amber-gold)
    t1 = "AC WALE MARKET"
    b1 = draw.textbbox((0, 0), t1, font=font_eng)
    t1_w = b1[2] - b1[0]
    draw.text(((w - t1_w) // 2, int(h * 0.68)), t1, font=font_eng, fill=(245, 158, 11, 255))

    # Line 2: "ኤሲ ዋለ የመኪና መሸጫ እና ኪራይ" (clean white/light gray)
    t2 = "ኤሲ ዋለ የመኪና መሸጫ እና ኪራይ"
    b2 = draw.textbbox((0, 0), t2, font=font_amh)
    t2_w = b2[2] - b2[0]
    draw.text(((w - t2_w) // 2, int(h * 0.79)), t2, font=font_amh, fill=(226, 232, 240, 255))

    # Red accent separator
    sep_y = int(h * 0.89)
    draw.line([(int(w * 0.32), sep_y), (int(w * 0.68), sep_y)], fill=(239, 68, 68, 220), width=int(w * 0.006))

    # Downsample cleanly with LANCZOS
    final_img = img.resize((size, size), Image.Resampling.LANCZOS)
    return final_img

# Generate all required PNG icons
pub = Path("frontend/public")
icons_dir = pub / "icons"
icons_dir.mkdir(parents=True, exist_ok=True)

img512 = render_ac_wale_icon(512)
img512.save(icons_dir / "icon-512x512.png", "PNG")
img512.save(icons_dir / "icon-maskable-512x512.png", "PNG")
img512.save(pub / "logo.png", "PNG")

img192 = render_ac_wale_icon(192)
img192.save(icons_dir / "icon-192x192.png", "PNG")

img_touch = render_ac_wale_icon(180)
img_touch.save(pub / "apple-touch-icon.png", "PNG")

print("✓ Successfully generated all AC WALE PNG icons (512x512, 192x192, apple-touch, logo.png).")
