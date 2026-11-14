"""Generate FEATURE_REPORT.md: per-feature side-by-side matches for the Mars sample photos.

Uses the same 13-number descriptor and the same per-feature formulas as the website
(src/lib/world.ts + src/lib/features.ts). Inputs are real files in public/.
Note: the browser resizes with canvas smoothing; PIL bilinear is used here, so scores
can differ from the site by a point or two.
"""
import json, math
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUB = ROOT / "public"


def signature(path: Path) -> list[float]:
    im = Image.open(path).convert("RGB").resize((64, 64), Image.BILINEAR)
    a = np.asarray(im, dtype=np.float64) / 255.0
    g = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    hist = np.bincount(np.minimum(7, (g * 8).astype(int)).ravel(), minlength=8) / 4096
    edge = (np.abs(np.diff(g, axis=0)).sum() + np.abs(np.diff(g, axis=1)).sum()) / (2 * 64 * 63)
    return [*a.reshape(-1, 3).mean(0), g.std(), edge, *hist]


def compare(q, s):
    lum = lambda f: 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]
    c = math.sqrt(sum((s[i] - q[i]) ** 2 for i in range(3)) / 3)
    h = sum(abs(s[i] - q[i]) for i in range(5, 13)) / 2
    clamp = lambda v: max(0, min(100, round(v)))
    rows = {
        "Colour": clamp(100 - c * 400),
        "Brightness": clamp(100 - abs(lum(q) - lum(s)) * 300),
        "Light & shadow mix": clamp(100 - h * 100),
        "Contrast": clamp(100 - abs(s[3] - q[3]) * 500),
        "Surface texture": clamp(100 - abs(s[4] - q[4]) * 800),
    }
    dist = c * 0.45 + h * 0.35 + (abs(s[3] - q[3]) * 1.5 + abs(s[4] - q[4]) * 2) * 0.2
    return rows, max(0, min(0.99, 1 - dist))


def haversine(a, b):
    p1, p2 = math.radians(a["lat"]), math.radians(b["lat"])
    dl = math.radians(b["lon"] - a["lon"])
    return 6371 * 2 * math.asin(math.sqrt(math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2))


def top(index, q, k=3):
    scored = []
    for s in index["sites"]:
        rows, score = compare(q, s["features"])
        scored.append((score, rows, s))
    scored.sort(key=lambda t: -t[0])
    out, counts = [], {}
    for score, rows, s in scored:
        if counts.get(s["country"], 0) >= 2 or any(haversine(o[2], s) < 100 for o in out):
            continue
        counts[s["country"]] = counts.get(s["country"], 0) + 1
        out.append((score, rows, s))
        if len(out) == k:
            break
    return out


def main():
    index = json.loads((PUB / "world/index.json").read_text())
    mars = json.loads((PUB / "data/mars_samples.json").read_text())
    feats = ["Colour", "Brightness", "Light & shadow mix", "Contrast", "Surface texture"]
    best_counts = {f: 0 for f in feats}
    all_scores = {f: [] for f in feats}
    lines = []
    for site in mars["sites"]:
        q = signature(PUB / site["photo_crop"].lstrip("/"))
        res = top(index, q)
        lines.append(f"\n### {site['title']}\n")
        lines.append("| # | Place | Overall | " + " | ".join(feats) + " | Best at |")
        lines.append("|---|---|---|" + "---|" * len(feats) + "---|")
        for i, (score, rows, s) in enumerate(res, 1):
            best = max(rows, key=rows.get)
            best_counts[best] += 1
            for f in feats:
                all_scores[f].append(rows[f])
            place = f"{s['country']} ({s['lat']:.1f}, {s['lon']:.1f})"
            lines.append(f"| {i} | {place} | {round(score*100)} | " + " | ".join(f"{rows[f]}%" for f in feats) + f" | {best} |")
    n = len(mars["sites"])
    head = [
        "# TerraTwin feature report",
        "",
        "What each flag compares, and how well the top results match on each feature.",
        "",
        f"Data: {index['count']} real satellite reference pictures in {index['countries']} countries/areas "
        f"(EOX Sentinel-2 cloudless 2023) and {n} Mars sample photos from the Perseverance Initial Reports (Vol. 2 and 4).",
        "",
        "## Features shown beside each other on every flag",
        "",
        "| Feature | What it measures | Match formula (0-100) |",
        "|---|---|---|",
        "| Colour | Average RGB colour of the picture | 100 - 400 x RMS colour difference |",
        "| Brightness | Overall lightness (luminance) | 100 - 300 x brightness difference |",
        "| Light & shadow mix | 8-step brightness histogram | 100 - 100 x half the histogram difference |",
        "| Contrast | Spread of brightness (std. dev.) | 100 - 500 x difference |",
        "| Surface texture | Average edge strength (smooth vs rough) | 100 - 800 x difference |",
        "",
        "Overall score = 1 - (0.45 x colour + 0.35 x histogram + 0.20 x texture/contrast distance). "
        "It is a visual similarity score, not a location probability.",
        "",
        "## Summary over the top 3 results of every Mars sample",
        "",
        "| Feature | Average match | Times it was the best feature |",
        "|---|---|---|",
    ]
    for f in feats:
        avg = sum(all_scores[f]) / max(1, len(all_scores[f]))
        head.append(f"| {f} | {avg:.0f}% | {best_counts[f]} |")
    strongest = max(feats, key=lambda f: sum(all_scores[f]))
    weakest = min(feats, key=lambda f: sum(all_scores[f]))
    head += [
        "",
        f"Strongest feature overall: **{strongest}**. Weakest: **{weakest}**.",
        "",
        "## Top 3 places per Mars sample",
    ]
    tail = [
        "",
        "## Egypt terrain mode",
        "",
        "In the optional Egypt mode each flag compares three measured axes in robust z-units: "
        "ground brightness (albedo), texture spread (roughness) and relief (slope). "
        "Match = 100 - 33 x |photo z - tile z|.",
        "",
        "## Limits",
        "",
        "- Satellite views are top-down; rover photos are side views, so shape-based features are weak.",
        "- Reference pictures are a sparse worldwide sample, not every place on Earth.",
        "- This report resizes with PIL; the browser uses canvas smoothing, so numbers can differ by 1-2 points.",
        "",
        "Regenerate: `python scripts/make_feature_report.py`",
    ]
    (ROOT.parent / "docs" / "FEATURE_REPORT.md").write_text("\n".join(head + lines + tail) + "\n")
    print("wrote FEATURE_REPORT.md", strongest, weakest, best_counts)


if __name__ == "__main__":
    main()
