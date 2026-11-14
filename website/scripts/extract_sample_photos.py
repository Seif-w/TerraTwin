"""Cut one outcrop photograph per Perseverance sampling site out of the Initial Reports PDFs.

Usage: python scripts/extract_sample_photos.py <volume2.pdf> <volume4.pdf> <out_dir>

Pages that carry the photo as its own embedded raster are extracted with pdfimages
(full resolution). Pages that are a single full-page scan are rendered and the largest
photographic block is located automatically (rows/columns dominated by non-white pixels).
The figure number and page of every crop are recorded so each photo is citable.
"""
from __future__ import annotations

import glob
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

# site key, volume, page, method, figure label from the report caption
SITES = [
    ("skinner_ridge", 2, 21, "scan", "Vol. 2 Fig. 3 (p. 21): layered Rockytop ridge, Hawksbill Gap"),
    ("wildcat_ridge", 2, 68, "embedded", "Vol. 2 Fig. 5 (p. 68): Mastcam-Z workspace image of Wildcat Ridge"),
    ("amalik", 2, 106, "scan", "Vol. 2 Fig. 3 (p. 106): Enchanted Lake at the base of the Alagnak ridge"),
    ("hidden_harbor", 2, 158, "scan", "Vol. 2 Fig. 3 (p. 158): Hidden Harbor and Yori Pass below Whale Mountain"),
    # p195 reuses the Amalik panorama, so take the Navcam wheel-scuff panel (A) of Fig. 11 instead
    ("observation_mountain", 2, 204, "box:726,909,1244,1246", "Vol. 2 Fig. 11A (p. 204): wheel-scuffed Observation Mountain megaripple"),
    ("hans_amundsen", 4, 23, "embedded", "Vol. 4 Fig. 7 (p. 23): Mastcam-Z mosaic of the Hans Amundsen Memorial Workspace"),
    ("turquoise_bay", 4, 56, "scan", "Vol. 4 (p. 56): Mastcam-Z context image of the Turquoise Bay workspace"),
    ("bunsen_peak", 4, 96, "embedded", "Vol. 4 Fig. 7 (p. 96): Mastcam-Z mosaic of Bunsen Peak"),
    ("beaver_falls", 4, 132, "embedded", "Vol. 4 Fig. 10 (p. 132): Mastcam-Z mosaic of the Beaver Falls workspace"),
]

MAX_W = 1280


def largest_embedded(pdf: str, page: int, tmp: str) -> Image.Image:
    prefix = os.path.join(tmp, f"p{page}")
    subprocess.run(["pdfimages", "-f", str(page), "-l", str(page), "-j", "-png", pdf, prefix], check=True)
    files = [f for f in glob.glob(prefix + "*") if os.path.getsize(f) > 2000]
    ims = [(Image.open(f).convert("RGB"), f) for f in files]
    ims = [(im, f) for im, f in ims if min(im.size) > 200]
    return max(ims, key=lambda t: t[0].size[0] * t[0].size[1])[0]


def runs(mask: np.ndarray):
    """(start, end) of consecutive True runs."""
    out, start = [], None
    for i, v in enumerate(mask):
        if v and start is None:
            start = i
        if not v and start is not None:
            out.append((start, i))
            start = None
    if start is not None:
        out.append((start, len(mask)))
    return out


def largest_photo_block(pdf: str, page: int, tmp: str) -> Image.Image:
    prefix = os.path.join(tmp, f"r{page}")
    subprocess.run(["pdftoppm", "-f", str(page), "-l", str(page), "-r", "150", "-png", pdf, prefix], check=True)
    im = Image.open(glob.glob(prefix + "*.png")[0]).convert("RGB")
    g = np.asarray(im.convert("L"), dtype=np.float32)
    ink = g < 232
    row_fill = ink.mean(axis=1)
    rr = [r for r in runs(row_fill > 0.45) if r[1] - r[0] > 60]
    y0, y1 = max(rr, key=lambda r: r[1] - r[0])
    col_fill = ink[y0:y1].mean(axis=0)
    cc = [c for c in runs(col_fill > 0.45) if c[1] - c[0] > 60]
    x0, x1 = min(c[0] for c in cc), max(c[1] for c in cc)
    pad = 2
    return im.crop((x0 + pad, y0 + pad, x1 - pad, y1 - pad))


def fixed_box(pdf: str, page: int, tmp: str, box: tuple) -> Image.Image:
    """Crop a known panel (pixel box at 300 dpi) when panels touch and cannot be split by gaps."""
    prefix = os.path.join(tmp, f"b{page}")
    subprocess.run(["pdftoppm", "-f", str(page), "-l", str(page), "-r", "300", "-png", pdf, prefix], check=True)
    return Image.open(glob.glob(prefix + "*.png")[0]).convert("RGB").crop(box)


def main(v2: str, v4: str, out_dir: str):
    os.makedirs(out_dir, exist_ok=True)
    meta = []
    with tempfile.TemporaryDirectory() as tmp:
        for key, vol, page, how, fig in SITES:
            pdf = v2 if vol == 2 else v4
            if how == "embedded":
                im = largest_embedded(pdf, page, tmp)
            elif how.startswith("box:"):
                im = fixed_box(pdf, page, tmp, tuple(int(v) for v in how[4:].split(",")))
            else:
                im = largest_photo_block(pdf, page, tmp)
            if im.width > MAX_W:
                im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
            path = os.path.join(out_dir, f"{key}.jpg")
            im.save(path, quality=84, optimize=True, progressive=True)
            meta.append({"site": key, "file": f"{key}.jpg", "volume": vol, "page": page,
                         "figure": fig, "width": im.width, "height": im.height})
            print(f"{key:22s} {im.width}x{im.height}  <- vol{vol} p{page} ({how})")
    json.dump(meta, open(os.path.join(out_dir, "photos.json"), "w"), indent=1)


if __name__ == "__main__":
    main(*sys.argv[1:4])
