# Draws Downtime's app icons into icons/: a plain "d." in Poppins Bold (the wordmark's type) on deep pine.
#   python3 tools/make_icons.py   (needs Pillow and a Poppins-Bold.ttf; set POPPINS_BOLD to its path)
from PIL import Image, ImageDraw, ImageFont
import os
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT = os.environ.get('POPPINS_BOLD', '/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf')
PINE, MIST = (32, 48, 43), (244, 244, 240)

def icon(size, safe=1.0):
    s = size * 4  # draw large, then shrink for smooth edges
    im = Image.new('RGB', (s, s), PINE)
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype(FONT, int(s * 0.56 * safe))
    box = d.textbbox((0, 0), 'd.', font=f)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text(((s - w) / 2 - box[0], (s - h) / 2 - box[1]), 'd.', font=f, fill=MIST)
    return im.resize((size, size), Image.LANCZOS)

os.makedirs(os.path.join(here, 'icons'), exist_ok=True)
icon(192).save(os.path.join(here, 'icons', 'icon-192.png'))
icon(512).save(os.path.join(here, 'icons', 'icon-512.png'))
icon(512, 0.8).save(os.path.join(here, 'icons', 'maskable-512.png'))
icon(180).save(os.path.join(here, 'icons', 'apple-touch-icon.png'))
print('icons written')
