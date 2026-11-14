"""Per-tile land-cover screen for the Western Desert tile table.

The terrain model only sees slope, roughness and albedo, so irrigated oasis fields can
score as "flat, smooth, bright" and rank highly. This screen measures, for every tile,
the share of pixels that look like vegetation in a cloud-free Sentinel-2 mosaic, so the
site can keep farmland and towns out of the analogue results.

Source imagery: EOX Sentinel-2 cloudless 2023 WMS (https://s2maps.eu, contains modified
Copernicus Sentinel data 2023, CC BY-NC-SA 4.0). Fetched in 1 x 1 degree chunks at
~100 m per pixel, cached locally.

Usage: python scripts/landcover_screen.py public/data/terratwin_ml_ranked.json public/data/landcover.json
"""
from __future__ import annotations

import io
import json
import math
import os
import sys
import time
import urllib.request

import numpy as np
from PIL import Image

LAYER = "s2cloudless-2023"
WMS = (
    "https://tiles.maps.eox.at/wms?service=WMS&request=GetMap&version=1.1.1"
    "&layers={layer}&styles=&srs=EPSG:4326&bbox={w},{s},{e},{n}"
    "&width={px}&height={px}&format=image/jpeg"
)
PX_PER_DEG = 1000          # ~100 m per pixel at these latitudes
CACHE = "/tmp/landcover_cache"
HALF_DEG_LAT = 0.0225      # half of a 5 km tile in latitude
GREEN_FLAG = 0.02          # >2 % vegetation pixels -> farmland / oasis tile


def fetch_chunk(lon0: int, lat0: int) -> np.ndarray:
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f"{LAYER}_{lon0}_{lat0}.jpg")
    if not os.path.exists(path):
        url = WMS.format(layer=LAYER, w=lon0, s=lat0, e=lon0 + 1, n=lat0 + 1, px=PX_PER_DEG)
        for attempt in range(4):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "terratwin-landcover/1.0"})
                data = urllib.request.urlopen(req, timeout=90).read()
                Image.open(io.BytesIO(data)).verify()
                open(path, "wb").write(data)
                break
            except Exception as exc:  # network hiccup: retry with backoff
                print(f"  retry {lon0},{lat0}: {exc}", file=sys.stderr)
                time.sleep(2 + attempt * 3)
        else:
            raise RuntimeError(f"could not fetch chunk {lon0},{lat0}")
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)


def vegetation_mask(rgb: np.ndarray) -> np.ndarray:
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    exg = 2 * g - r - b                   # excess-green index
    # desert sand is bright and red-dominant; fields are darker and green >= red
    return (exg > 12) & (g >= r * 0.98) & (g < 200)


def main(ranked_path: str, out_path: str):
    table = json.load(open(ranked_path))
    c = table["columns"]
    i_id, i_lat, i_lon = c.index("id"), c.index("lat"), c.index("lon")
    rows = table["data"]
    lats = np.array([r[i_lat] for r in rows], float)
    lons = np.array([r[i_lon] for r in rows], float)

    lon_range = range(math.floor(lons.min() - 0.05), math.floor(lons.max() + 0.05) + 1)
    lat_range = range(math.floor(lats.min() - 0.05), math.floor(lats.max() + 0.05) + 1)
    W, S = lon_range.start, lat_range.start
    nx, ny = len(lon_range), len(lat_range)
    mosaic = np.zeros((ny * PX_PER_DEG, nx * PX_PER_DEG, 3), np.float32)
    for lat0 in lat_range:
        for lon0 in lon_range:
            chunk = fetch_chunk(lon0, lat0)
            y = (S + ny - 1 - lat0) * PX_PER_DEG   # north at the top
            x = (lon0 - W) * PX_PER_DEG
            mosaic[y:y + PX_PER_DEG, x:x + PX_PER_DEG] = chunk[:PX_PER_DEG, :PX_PER_DEG]
            print(f"chunk {lon0}E {lat0}N ok")
    veg = vegetation_mask(mosaic)
    N = S + ny

    green = np.zeros(len(rows))
    for k, (la, lo) in enumerate(zip(lats, lons)):
        half_lon = HALF_DEG_LAT / math.cos(math.radians(la))
        y0 = int((N - (la + HALF_DEG_LAT)) * PX_PER_DEG)
        y1 = int((N - (la - HALF_DEG_LAT)) * PX_PER_DEG)
        x0 = int((lo - half_lon - W) * PX_PER_DEG)
        x1 = int((lo + half_lon - W) * PX_PER_DEG)
        win = veg[max(0, y0):y1, max(0, x0):x1]
        green[k] = float(win.mean()) if win.size else 0.0

    flagged = green > GREEN_FLAG
    out = {
        "source": f"EOX Sentinel-2 cloudless 2023 ({LAYER}), contains modified Copernicus Sentinel data 2023",
        "license": "CC BY-NC-SA 4.0",
        "method": "share of pixels in the 5 km tile window with excess-green index > 12 and G >= 0.98 R",
        "green_flag_threshold": GREEN_FLAG,
        "n_tiles": len(rows),
        "n_flagged": int(flagged.sum()),
        "columns": ["id", "green"],
        "data": [[rows[k][i_id], round(float(green[k]), 4)] for k in range(len(rows))],
    }
    json.dump(out, open(out_path, "w"), separators=(",", ":"))
    order = np.argsort(-green)[:8]
    print(f"flagged {int(flagged.sum())} of {len(rows)} tiles as farmland/oasis")
    for k in order:
        print("  ", rows[k][i_id], lats[k], lons[k], round(green[k], 3))
    # also save a small preview so the mask can be checked by eye
    prev = Image.fromarray(mosaic.astype(np.uint8)).resize((nx * 250, ny * 250))
    m = Image.fromarray((veg * 255).astype(np.uint8)).resize((nx * 250, ny * 250))
    side = Image.new("RGB", (prev.width * 2 + 10, prev.height), "white")
    side.paste(prev, (0, 0))
    side.paste(m.convert("RGB"), (prev.width + 10, 0))
    side.save("/tmp/landcover_preview.jpg", quality=80)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
