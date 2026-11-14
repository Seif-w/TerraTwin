"""TerraTwin brand mark, drawn deterministically so it can be regenerated.

Writes brand/terratwin-logo.png (also copied to public/logo.png for the site itself).
"""

import math
import os

from PIL import Image, ImageDraw

S = 512
im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(im)


def rgba(rgb, a=255):
    r, g, b = rgb
    return (r, g, b, a)


CYAN = (56, 189, 248)
INDIGO = (129, 140, 248)
ORANGE = (249, 115, 22)
PLATE = (5, 8, 17)

d.rounded_rectangle([8, 8, S - 8, S - 8], radius=96, fill=rgba(PLATE))
d.rounded_rectangle([8, 8, S - 8, S - 8], radius=96, outline=rgba(CYAN, 70), width=3)

cx, cy, R = 222, 278, 148

# Earth twin: disc with graticule
d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=rgba(CYAN), width=13)
for k in (0.35, 0.7):
    w = int(R * math.sqrt(1 - k * k))
    d.ellipse([cx - w, cy - R, cx + w, cy + R], outline=rgba(INDIGO, 190), width=5)
d.line([cx - R, cy, cx + R, cy], fill=rgba(INDIGO), width=7)
for f in (-0.52, 0.52):
    yy = cy + f * R
    half = R * math.sqrt(1 - f * f)
    d.arc([cx - half, yy - 30, cx + half, yy + 30], 180, 360, fill=rgba(INDIGO, 160), width=4)

# candidate site marker on the globe
d.ellipse([cx + 18, cy - 46, cx + 44, cy - 20], outline=rgba((251, 191, 36)), width=6)

# target body
tx, ty, tr = 392, 140, 60
d.ellipse([tx - tr, ty - tr, tx + tr, ty + tr], outline=rgba(ORANGE), width=12)
d.ellipse([tx - 13, ty - 13, tx + 13, ty + 13], fill=rgba(ORANGE))

# transfer trace between the two bodies
d.arc([cx - 170, cy - 250, tx + tr + 26, ty + tr + 130], 292, 352, fill=rgba(CYAN, 150), width=5)

os.makedirs("brand", exist_ok=True)
out = "brand/terratwin-logo.png"
im.save(out, optimize=True)
print(out, os.path.getsize(out), "bytes")
