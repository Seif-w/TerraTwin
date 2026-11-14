"""Extract Perseverance sample records from Mars 2020 Initial Reports text dumps.

Usage:
    pdftotext -layout initial_reports_volume2.pdf v2.txt
    pdftotext -layout initial_reports_volume4.pdf v4.txt
    python scripts/extract_mars_samples.py v2.txt:2 v4.txt:4 > /tmp/samples_raw.json

Each Initial Report entry starts with a fixed header block ("Sample Designation:",
"Latitude (N), Longitude (E), Elevation:", "Campaign:", "Lithology:" ...). Only those
header fields and the first paragraph of the Summary Description are read; nothing is
inferred. Witness tubes (WB*) carry no rock and are kept but flagged.
"""
from __future__ import annotations

import json
import re
import sys

FIELD_RE = {
    "designation": r"Sample Designation:\s*(.+)",
    "date": r"Date of (?:Coring|Sealing|Acquisition):\s*(.+)",
    "time": r"Mars Time of Sample (?:Core )?Sealing:\s*(.+)",
    "campaign": r"Campaign:\s*(.+)",
    "region": r"Region of Interest:\s*(.+)",
    "volume_cm3": r"Estimated Volume Recovered:\s*([\d.]+)\s*cm",
    "abrasion": r"Abrasion Patch Name and Depth:\s*(.+)",
    "anomalous": r"Anomalous Behavior:\s*(.+)",
}
# the reports mix glyphs: degree as U+00B0 or U+02DA, minus as '-', U+2013 or U+2212
NUM = r"([-\u2013\u2212]?\s*[\d.]+)"
DEG = r"\s*[\u00b0\u02da\u00ba]?\s*"
LOC_RE = re.compile(
    r"Latitude \(N\), Longitude \(E\), Elevation:\s*" + NUM + DEG + r",\s*" + NUM + DEG + r",\s*" + NUM + r"\s*m"
)


def num(x: str) -> float:
    return float(re.sub(r"\s", "", x).replace("\u2013", "-").replace("\u2212", "-"))


def clean(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def header_blocks(text: str):
    """Yield (start, end) offsets of each header block: designation .. first 'Summary Description'."""
    starts = [m.start() for m in re.finditer(r"Sample Designation:", text)]
    for i, s in enumerate(starts):
        nxt = starts[i + 1] if i + 1 < len(starts) else len(text)
        yield s, nxt


def lithology(block: str) -> str:
    m = re.search(r"Lithology:\s*(.+?)(?:\n\s*Estimated Volume Recovered|\n\s*Coring Bit)", block, re.S)
    return clean(m.group(1)) if m else ""


def summary_first_paragraph(section: str) -> str:
    m = re.search(r"Summary Description\s*\n(.+?)(?:\n\s*\n\s*\S)", section, re.S)
    if not m:
        return ""
    # pdftotext keeps a 2-space paragraph indent; cut at the next indented paragraph
    para = re.split(r"\n {2}(?=\S)", "\n" + m.group(1))
    body = [p for p in para if p.strip()]
    return clean(body[0]) if body else ""


def sample_type(section: str) -> str:
    m = re.search(r"Sample type:\s*(.+)", section)
    return clean(m.group(1)) if m else ""


def parse(path: str, volume: int):
    text = open(path, encoding="utf-8", errors="ignore").read()
    out = []
    for s, e in header_blocks(text):
        section = text[s:e]
        head = section[:4000]
        rec = {"volume": volume}
        for k, rx in FIELD_RE.items():
            m = re.search(rx, head)
            rec[k] = clean(m.group(1)) if m else None
        loc = LOC_RE.search(head)
        if loc:
            lat, lon, elev = (num(x) for x in loc.groups())
            rec.update(lat=lat, lon=lon, elev_m=elev)
        else:
            rec.update(lat=None, lon=None, elev_m=None)
        d = re.match(r"M2020-(\d+)-(\d+)\s+(.+)", rec["designation"] or "")
        if d:
            rec["sol"], rec["seq"], rec["name"] = int(d.group(1)), int(d.group(2)), d.group(3).strip()
        sol = re.search(r"Sol\s+(\d+)", rec.get("time") or "")
        ls = re.search(r"Ls\s+([\d.]+)", rec.get("time") or "")
        rec["sol_sealed"] = int(sol.group(1)) if sol else None
        rec["ls"] = float(ls.group(1)) if ls else None
        rec["lithology"] = lithology(head)
        rec["summary"] = summary_first_paragraph(section)
        rec["sample_type"] = sample_type(section)
        rec["witness"] = bool(re.match(r"WB\d", rec.get("name") or ""))
        out.append(rec)
    return out


def main(argv):
    records = []
    for arg in argv:
        path, vol = arg.rsplit(":", 1)
        records += parse(path, int(vol))
    # one record per designation (a designation line can repeat on continuation pages)
    seen, uniq = set(), []
    for r in records:
        if r["designation"] in seen:
            continue
        seen.add(r["designation"])
        uniq.append(r)
    json.dump(uniq, sys.stdout, indent=1, ensure_ascii=False)


if __name__ == "__main__":
    main(sys.argv[1:])
