r"""
TERRATWIN - 05_report_figure.py
===============================
Builds the single figure that explains the model decision to a reviewer:

  A  learned site-quality map of the Western Desert candidates
  B  which statistics survive cross-body comparison (absolutes vs ratios)
  C  domain-classifier AUC decomposition (sensor gap vs real geomorphic gap)
  D  geomorphic archetype mix of each named target

Writes docs/figures/terratwin_model_report.png
Run:  python 05_report_figure.py
"""
import os, sys, json
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
import matplotlib.ticker as mtick

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
OUT_DIR = os.path.join(HERE, "docs", "figures")
os.makedirs(OUT_DIR, exist_ok=True)

plt.rcParams.update({
    "figure.dpi": 140, "font.size": 9, "axes.titlesize": 10.5, "axes.labelsize": 9,
    "axes.edgecolor": "#9aa4b2", "axes.linewidth": 0.8, "axes.grid": True,
    "grid.color": "#dfe4ea", "grid.linewidth": 0.6, "axes.axisbelow": True,
    "font.family": "DejaVu Sans", "legend.frameon": False,
})
INK = "#111827"
plt.rcParams.update({"text.color": INK, "axes.labelcolor": INK, "xtick.color": INK,
                     "ytick.color": INK})
ACC = {"earth": "#0d9488", "mars": "#c2410c", "moon": "#5b21b6",
       "gold": "#b45309", "gray": "#6b7280"}


def _despine(ax, keep=("bottom", "left")):
    for s in ("top", "right", "left", "bottom"):
        ax.spines[s].set_visible(s in keep)


def panel_map(ax, ranked):
    q = ranked.site_quality.to_numpy(float)
    sc = ax.scatter(ranked.approx_lon, ranked.approx_lat, c=q, s=4,
                    cmap="viridis", vmin=np.quantile(q, .02), vmax=np.quantile(q, .99),
                    edgecolors="none")
    top = ranked.nlargest(25, "site_quality")
    ax.scatter(top.approx_lon, top.approx_lat, s=90, facecolors="none",
               edgecolors="#dc2626", linewidths=1.2, label="top-25 camp sites")
    # (feature lon, feature lat, label_x, label_y) - all inside the 25-29E / 23-27N window
    provinces = [("Gilf Kebir sandstone plateaus", 25.70, 24.00, 25.35, 25.05),
                 ("Dakhla Oasis (carbonate flats)", 28.90, 25.50, 26.90, 26.35),
                 ("Abu Ballus / Dakhla line", 28.35, 25.05, 27.35, 24.25)]
    for lab, lon, lat, tx, ty in provinces:
        ax.annotate(lab, (lon, lat), xytext=(tx, ty), fontsize=7.2, color="#f8fafc", ha="left",
                    va="center", annotation_clip=True,
                    arrowprops=dict(arrowstyle="-", lw=.7, color="#cbd5e1", alpha=.85),
                    bbox=dict(boxstyle="round,pad=0.24", fc="#1e293b", ec="#475569",
                              lw=.6, alpha=.94))
    ax.set_title("A  Learned site quality, 7,180 Western Desert tiles (5 km grid)", loc="left")
    ax.set_xlabel("longitude (deg E)"); ax.set_ylabel("latitude (deg N)")
    ax.set_aspect("equal"); _despine(ax)
    cb = fig.colorbar(sc, ax=ax, fraction=.035, pad=.02)
    cb.set_label("site quality (0-1)", fontsize=8); cb.outline.set_visible(False)
    ax.legend(loc="upper left", fontsize=7.5, framealpha=.85)


def panel_transfer(ax, h):
    e = h[h.body == "Earth"]
    specs = [("absolute roughness (m)\nnot comparable", "roughness_m_mean", "linear"),
             ("slope CV\n(dimensionless)", "slope_cv", "log"),
             ("roughness CV\n(dimensionless)", "roughness_cv", "log")]
    width = 0.26
    for i, (title, col, _scale) in enumerate(specs):
        base = i * 1.0
        med = {b: float(h[h.body == b][col].median()) for b in ("Earth", "Mars", "Moon")}
        for j, (b, c) in enumerate((("Earth", ACC["earth"]), ("Mars", ACC["mars"]),
                                    ("Moon", ACC["moon"]))):
            ax.bar(base + j * width, np.log10(max(med[b], 1e-6)), width * .9,
                   color=c, label=b if i == 0 else None)
        ratio_m = med["Mars"] / med["Earth"]; ratio_l = med["Moon"] / med["Earth"]
        ax.text(base + width, -0.62, f"Mars {ratio_m:.1f}x  Moon {ratio_l:.1f}x",
                ha="center", va="bottom", fontsize=7.6, color="#334155", fontweight="bold")
    ax.set_xticks([i + width for i in range(3)])
    ax.set_xticklabels([s[0] for s in specs], fontsize=7.6)
    ax.set_ylabel("log10 of body median"); ax.set_ylim(-0.72, 1.52)
    ax.set_title("B  Absolutes do not transfer; dimensionless ratios nearly do", loc="left")
    ax.legend(loc="upper right", ncol=3, fontsize=8)
    _despine(ax)


def panel_auc(ax, rep):
    metrics = [("auc_raw", "raw"), ("auc_shift_scale_aligned", "+ shift/scale\nalign"),
               ("auc_quantile_mapped", "+ full quantile\nmap (best case)")]
    width = 0.34
    for i, (col, lab) in enumerate(metrics):
        for j, (body, c) in enumerate((("Mars", ACC["mars"]), ("Moon", ACC["moon"]))):
            v = float(rep.loc[rep.target == body, col].iloc[0])
            x = i * (width * 2.6) + j * width
            ax.bar(x, v, width * .92, color=c)
            ax.text(x, v + .012, f"{v:.3f}", ha="center", fontsize=7.4, color=INK)
    ax.axhline(0.5, color=ACC["gray"], ls="--", lw=1)
    ax.text(2.9, .52, "0.5 = bodies indistinguishable", fontsize=7.2, color=ACC["gray"])
    ax.set_xticks([i * (width * 2.6) + width * .5 for i in range(3)])
    ax.set_xticklabels([m[1] for m in metrics], fontsize=7.8)
    ax.set_ylim(0.4, 1.06); ax.set_ylabel("domain-classifier AUC")
    ax.yaxis.set_major_formatter(mtick.FormatStrFormatter("%.2f"))
    ax.set_title("C  How much of the Earth/target gap is only the sensor?", loc="left")
    _despine(ax)


def panel_archetypes(ax, products):
    names = products["archetype_names"]
    targets = list(products["targets"].keys())
    palette = ["#b45309", "#c2410c", "#0d9488", "#5b21b6"]
    bottom = np.zeros(len(targets))
    for k, an in enumerate(names):
        vals = np.array([products["targets"][t]["archetype_mix_native_uncalibrated"].get(an, 0)
                         for t in targets])
        ax.bar(range(len(targets)), vals, 0.55, bottom=bottom, color=palette[k % 4], label=an)
        for i, v in enumerate(vals):
            if v > 0.06:
                ax.text(i, bottom[i] + v / 2, f"{v:.2f}", ha="center", va="center",
                        fontsize=7.2, color="white")
        bottom += vals
    ax.set_xticks(range(len(targets)))
    ax.set_xticklabels([t.replace("_", "\n", 1).replace("_", " ") for t in targets], fontsize=7.6)
    ax.set_ylabel("archetype probability")
    ax.set_title("D  Target archetype mix (native, uncalibrated)", loc="left")
    ax.set_ylim(0, 1.24)
    ax.legend(fontsize=7.2, ncol=4, loc="upper center", handlelength=1.1, columnspacing=1.0)
    ax.set_yticks([0, .25, .5, .75, 1.0])
    _despine(ax)


def main():
    ranked = pd.read_csv(os.path.join(DATA, "terratwin_ml_ranked.csv"))
    h = pd.read_csv(os.path.join(DATA, "terratwin_harmonized.csv"))
    h["body"] = h.body.str.capitalize()
    rep = pd.read_csv(os.path.join(DATA, "transferability_report.csv"))
    products = json.load(open(os.path.join(DATA, "ml_products.json")))

    global fig
    fig = plt.figure(figsize=(13.6, 9.4))
    gs = fig.add_gridspec(2, 2, left=.055, right=.975, top=.90, bottom=.075,
                          wspace=.20, hspace=.30, width_ratios=[1.35, 1.0])
    panel_map(fig.add_subplot(gs[0, 0]), ranked)
    panel_auc(fig.add_subplot(gs[0, 1]), rep)
    panel_transfer(fig.add_subplot(gs[1, 0]), h)
    panel_archetypes(fig.add_subplot(gs[1, 1]), products)

    fig.suptitle("TerraTwin - what the 9,680-tile dataset can and cannot support",
                 fontsize=13, fontweight="bold", x=.055, ha="left", color=INK)
    fig.text(.055, .945,
             "Earth 30 m SRTM vs Mars 200 m HRSC/MOLA vs Moon 118 m LOLA.  "
             "Site-quality CV R2=%.3f (36 spatial blocks); archetype CV accuracy=%.3f vs 0.50 majority baseline."
             % (products["site_quality_model"]["cv_r2"],
                products["archetype_model"]["block_cv_accuracy"]),
             fontsize=8.4, color="#475569", ha="left")
    out = os.path.join(OUT_DIR, "terratwin_model_report.png")
    fig.savefig(out, facecolor="white")
    print("wrote", out)


if __name__ == "__main__":
    main()
