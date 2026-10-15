# Draws Downtime's app icons into icons/: a low sun sitting on the horizon, on deep pine.
#   python3 tools/make_icons.py
from PIL import Image, ImageDraw
import os
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PINE, SUN, MIST = (32, 48, 43), (240, 174, 56), (233, 236, 227)

def icon(size, safe=1.0):
    s = size * 4  # draw large, then shrink for smooth edges
    im = Image.new('RGB', (s, s), PINE)
    d = ImageDraw.Draw(im)
    k = safe  # maskable icons keep the drawing inside the middle 80%
    r = s * 0.27 * k
    cx, hy = s / 2, s * (0.5 + 0.12 * k)
    d.pieslice([cx - r, hy - r, cx + r, hy + r], 180, 360, fill=SUN)
    w = s * 0.62 * k
    t = max(4, s * 0.035 * k)
    d.rounded_rectangle([cx - w / 2, hy, cx + w / 2, hy + t], radius=t / 2, fill=MIST)
    return im.resize((size, size), Image.LANCZOS)

os.makedirs(os.path.join(here, 'icons'), exist_ok=True)
icon(192).save(os.path.join(here, 'icons', 'icon-192.png'))
icon(512).save(os.path.join(here, 'icons', 'icon-512.png'))
icon(512, 0.78).save(os.path.join(here, 'icons', 'maskable-512.png'))
icon(180).save(os.path.join(here, 'icons', 'apple-touch-icon.png'))
print('icons written')
