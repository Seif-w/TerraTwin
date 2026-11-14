"""Build public/data/mars_samples.json and clean analysis crops from the extracted
Initial Reports records and figure photos.

Usage: python scripts/make_mars_samples.py

Inputs : scripts/samples_raw.json            (scripts/extract_mars_samples.py)
         public/samples/mars/photos.json     (scripts/extract_sample_photos.py)
Outputs: public/data/mars_samples.json
         public/samples/mars/<site>_crop.jpg (largest rectangle without mosaic fill/labels
                                              margins, used by the photo finder)

Every number (dates, sols, coordinates, elevations, volumes) is copied from the parsed
report headers. The one-line plain-language captions are written for this site from the
reports' lithology and summary paragraphs.
"""
from __future__ import annotations

import json
import os

import numpy as np
from PIL import Image
from scipy.ndimage import binary_opening

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "scripts", "samples_raw.json")
PHOTOS = os.path.join(ROOT, "public", "samples", "mars", "photos.json")
OUT = os.path.join(ROOT, "public", "data", "mars_samples.json")

# site -> (display name, sample names in order, rock in plain words, one-line story, water clue)
SITES = {
    "skinner_ridge": (
        "Skinner Ridge",
        ["Swift Run", "Skyland"],
        "Sandstone",
        "A layered sandstone ledge at the foot of the delta. A river carried these sand grains into Jezero's old lake.",
        "The grains are glued by iron-magnesium carbonate, a mineral that forms in water.",
    ),
    "wildcat_ridge": (
        "Wildcat Ridge",
        ["Hazeltop", "Bearwallow"],
        "Mudstone with sulfate salts",
        "Fine mud that settled on the bottom of the lake, packed with sulfate salts.",
        "Signals in this rock may come from organic molecules.",
    ),
    "amalik": (
        "Amalik",
        ["Shuyak", "Mageik"],
        "Olivine mudstone",
        "Lake-bottom mud made mostly of olivine grains and the minerals water turned them into, such as serpentine.",
        "Serpentine only forms when water reacts with olivine.",
    ),
    "hidden_harbor": (
        "Hidden Harbor",
        ["Kukaklek"],
        "Fine sandstone with sulfate salts",
        "Fine sandstone higher up the delta, rich in sulfate salts and cut by white calcium-sulfate veins.",
        "Veins mean water flowed through cracks after the rock formed.",
    ),
    "observation_mountain": (
        "Observation Mountain",
        ["Atmo Mountain", "Crosswind Lake"],
        "Loose soil (regolith)",
        "Loose soil from a big wind-built ripple: grains up to 5 mm, sand, silt and dust. The rover scuffed it with a wheel first.",
        "Soil samples help plan how astronauts and machines will handle Martian dust.",
    ),
    "hans_amundsen": (
        "Hans Amundsen Workspace",
        ["Pelican Point"],
        "Sandstone with carbonate and silica",
        "First rock from the Margin unit near the crater rim: coarse grains glued by silica, with carbonate coatings.",
        "The first hydrated carbonates ever found in Jezero.",
    ),
    "turquoise_bay": (
        "Turquoise Bay",
        ["Lefroy Bay"],
        "Sandstone with carbonate",
        "A high spot of the same Margin unit, chosen because orbiters saw a strong carbonate signal here.",
        "Carbonate and silica cements are good places to look for traces of past life.",
    ),
    "bunsen_peak": (
        "Bunsen Peak",
        ["Comet Geyser"],
        "Carbonate-rich rock",
        "A dark, tough slab standing above a flat landscape. It is mostly carbonate and silica.",
        "Either a coarse sandstone or a volcanic rock completely changed by water.",
    ),
    "beaver_falls": (
        "Beaver Falls",
        ["Sapphire Canyon"],
        "Veined mudstone",
        "A light-toned, veined rock in Neretva Vallis, the old river channel that fed the crater.",
        "It holds small 'reduction spots' and organic signals that the team lists as potential biosignatures.",
    ),
}


def valid_rectangle(im: Image.Image) -> tuple[int, int, int, int]:
    """Largest axis-aligned rectangle free of mosaic fill (near black) and page white.

    Classic maximal-rectangle-in-histogram on a downsampled validity mask."""
    small = im.copy()
    small.thumbnail((256, 256))
    a = np.asarray(small.convert("RGB"), dtype=np.int16)
    lum = a.mean(axis=2)
    spread = a.max(axis=2) - a.min(axis=2)
    fill_black = (lum < 42) & (spread < 16)   # mosaic fill is flat dark grey, real shadows are tinted
    fill_white = (lum > 238) & (spread < 12)
    # thin strokes (labels, arrows, grid ticks) survive in the crop; only solid fill areas
    # such as mosaic padding and page margins are excluded
    solid = binary_opening(fill_black | fill_white, structure=np.ones((3, 3)), iterations=2)
    ok = ~solid
    H, W = ok.shape
    heights = np.zeros(W, int)
    best: tuple[int, int, int, int, int] = (0, 0, 0, 0, 0)  # area, x0, y0, x1, y1
    for y in range(H):
        heights = np.where(ok[y], heights + 1, 0)
        stack: list[int] = []
        for x in range(W + 1):
            bar = heights[x] if x < W else 0
            while stack and heights[stack[-1]] >= bar:
                top = stack.pop()
                height = int(heights[top])
                left = stack[-1] + 1 if stack else 0
                width = x - left
                # any sub-rectangle of a valid one is valid: keep it photo-shaped (<= 2:1)
                w = min(width, 2 * height)
                h = min(height, 2 * width)
                area = w * h
                if area > best[0]:
                    cx = left + (width - w) // 2
                    best = (area, cx, y - h + 1, cx + w, y + 1)
            stack.append(x)
    _, x0, y0, x1, y1 = best
    sx, sy = im.width / W, im.height / H
    inset = 2
    return (int((x0 + inset) * sx), int((y0 + inset) * sy), int((x1 - inset) * sx), int((y1 - inset) * sy))


def main():
    raw = {r["name"]: r for r in json.load(open(RAW))}
    photos = {p["site"]: p for p in json.load(open(PHOTOS))}
    sites = []
    for key, (title, names, rock, story, clue) in SITES.items():
        samples = []
        for n in names:
            r = raw[n]
            samples.append({
                "name": n,
                "designation": r["designation"],
                "sol": r["sol"],
                "date": r["date"],
                "lat": r["lat"],
                "lon": r["lon"],
                "elev_m": round(r["elev_m"], 1),
                "volume_cm3": float(r["volume_cm3"]) if r["volume_cm3"] else None,
                "campaign": r["campaign"],
                "region": r["region"],
                "report_volume": r["volume"],
            })
        ph = photos[key]
        src = Image.open(os.path.join(ROOT, "public", "samples", "mars", ph["file"])).convert("RGB")
        box = valid_rectangle(src)
        crop = src.crop(box)
        crop_file = f"{key}_crop.jpg"
        crop.save(os.path.join(ROOT, "public", "samples", "mars", crop_file), quality=86)
        first = samples[0]
        sites.append({
            "key": key,
            "title": title,
            "rock": rock,
            "story": story,
            "clue": clue,
            "campaign": first["campaign"],
            "region": first["region"],
            "lat": first["lat"],
            "lon": first["lon"],
            "elev_m": first["elev_m"],
            "sol": first["sol"],
            "date": first["date"],
            "photo": f"/samples/mars/{ph['file']}",
            "photo_crop": f"/samples/mars/{crop_file}",
            "photo_size": [ph["width"], ph["height"]],
            "crop_size": [crop.width, crop.height],
            "figure": ph["figure"],
            "samples": samples,
        })
        print(f"{key:22s} crop {crop.width}x{crop.height} of {src.width}x{src.height}")
    sites.sort(key=lambda s: s["sol"])
    elevs = [s["elev_m"] for s in sites]
    out = {
        "source": "Mars 2020 Initial Reports, Vol. 2 (Delta Front Campaign) and Vol. 4 (Margin Campaign)",
        "photo_credit": "NASA/JPL-Caltech/ASU/MSSS, figures from the Mars 2020 Initial Reports",
        "coordinates": "planetocentric latitude N, longitude E; elevation in metres relative to the Mars aeroid",
        "n_sites": len(sites),
        "n_samples": sum(len(s["samples"]) for s in sites),
        "elev_min_m": min(elevs),
        "elev_max_m": max(elevs),
        "sites": sites,
    }
    json.dump(out, open(OUT, "w"), indent=1, ensure_ascii=False)
    print(f"wrote {OUT}: {out['n_sites']} sites, {out['n_samples']} samples, climb {max(elevs) - min(elevs):.1f} m")


if __name__ == "__main__":
    main()
