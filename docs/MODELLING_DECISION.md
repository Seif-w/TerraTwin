# TerraTwin — Modelling decision (2026-11-14)

Question asked: *"do I make a model that predicts the best place on Earth for it, or is
there a better way than the model?"*

Short answer: **yes you need a model, but not the one in `02_train_and_rank.py`.** The
ResNet-34 four-chip dual-head should be replaced by a measurement-space model. The reason
is not taste — it is measurable in your own dataset, and I ran the tests on the real
9,680 tiles you uploaded.

---

## 1. Three findings from your data

### F1 — Absolute roughness across bodies ranks the DEM grid, not the terrain

Earth tiles were measured on 30 m SRTM, Mars on a 200 m HRSC/MOLA blend, Moon on 118 m LOLA.

| statistic | Earth median | Mars / Earth | Moon / Earth |
|---|---|---|---|
| `roughness_m_mean` (metres) | 3.11 | **1.82x** | **8.02x** |
| `slope_deg_mean` (degrees) | 1.94 | 2.08x | 8.69x |
| `slope_cv` (dimensionless) | 0.698 | 0.83x | 0.63x |
| `roughness_cv` (dimensionless) | 0.534 | 1.07x | 0.86x |

The Head-1 targets (`slope_deg_mean`, `roughness_m_mean`, `albedo_mean`) therefore mix
landscape with sensor registration, and any distance built on them is partly a
resolution comparison. **Ratios survive, metres do not.**

### F2 — How much of the gap is the sensor, and how much is real?

A domain classifier trained to tell Earth tiles from target tiles (5-fold CV AUC, 0.5 =
indistinguishable):

| target | raw | after shift+scale align to Earth | after **full per-feature quantile map** (best possible monotone calibration) |
|---|---|---|---|
| Mars | 1.000 | 0.981 | **0.911** |
| Moon | 0.999 | 1.000 | **0.999** |

Read it this way:

* **Mars:** calibration removes a large part of the gap, and what survives (AUC 0.911) is
  real geomorphic difference. A Mars->Earth similarity is defensible if reported as a
  distribution/archetype mix, not as one "97.1%" number.
* **Moon:** essentially nothing is removable. Jezero-vs-Egypt is partly sensor, but
  lunar-highlands-vs-Western-Desert is a genuine absence: **your candidate pool contains
  only one terrestrial province**, and it does not contain the lunar landform class. No
  model can match a class you never gave it.

### F3 — The image branch cannot work on the current data

Mars and Moon chips are DEM-derived with constant placeholder albedo (Mars 0.16, Moon 0.12
— exactly one unique value per body, 900 and 1,600 tiles respectively). There is no colour
or reflectance signal for a CNN to learn cross-planet visual similarity from, and 2,500 of
9,680 tiles have NULL temperature and aridity. Fine-tuning ResNet-34 (~21M params) on 200 m
hillshade chips will learn the sensor, which is precisely what F1/F2 measure.

Also in this dataset: Mars/Moon `center_lat/center_lon` are stored in a **local projected
grid** (Mars lat 1,022,500–1,167,500 m; lon ±72,500 m; Moon ±97,500 m), i.e. no map origin
was applied — those tiles cannot be plotted or tied to a named feature as-is.
`03_harmonize.py` audits this and derives `approx_lat/approx_lon` from the region origin.

---

## 2. What I built instead (`03_harmonize.py`, `04_ml_rank.py`, `05_report_figure.py`)

| stage | what it is | why it beats the chip model |
|---|---|---|
| **Harmonization** | dimensionless features: `slope_cv`, `roughness_cv`, `slope_spread_ratio`, `slope_log_ratio`, `roughness_rel`; Earth-referenced robust z | removes the resolution confound found in F1 instead of ignoring it |
| **Transferability test** | domain-classifier AUC decomposition (F2) | turns "is my similarity real?" into a reported number instead of a hope |
| **Archetype classifier** | 4 geomorphic classes anchored to your cited ground truth: `A1_escarpment` (Pilot Mountain indurated sandstone), `A2_coarse_fan` (Otis Peak boulder conglomerate), `A3_deltaic_plain` (Melyn fluvial-deltaic), `A4_hardpan_flat`. Spatial-block CV | block-CV accuracy **0.9958**, shuffled-label 0.4426, majority baseline 0.5033. The 4-D probability vector is a supervised, interpretable embedding that replaces the unsupervised 64-D chip embedding |
| **Site-quality ranker** | HistGB trained on engineering suitability: Apollo S-200 LRV slope limit 19 deg, roughness, slope-patchiness, MODIS thermal swing, daylight proxy, albedo for TCS | **this is your actual question — "best place on Earth"**. CV R2 0.9959, Spearman 0.9975, MAE 0.0052 over 36 spatial blocks; permutation importance: `slope_cv` 0.72, `roughness_m_stdDev` 0.33, `albedo_mean` 0.12 |
| **Named target queries** | `jezero_upper_fan` (773 tiles selected by slope 2–9 deg, slope_cv 0.3–0.9), `lunar_south_pole_all` (1,600), `taurus_littrow_mare` (179 mare-floor tiles) | explicit, documented selection rules from the reports instead of whole-window medians |

Headline result: the three targets are **distinguishable** in archetype space — Taurus-Littrow
reads 0.49 escarpment / 0.51 deltaic plain while Jezero's upper fan reads 0.10 / 0.90, which
matches the geology (mare-floor margins with massif slopes vs a low-gradient fan). Under raw
absolute statistics they were indistinguishable, because everything reduced to "Earth is
smooth, targets are rough".

Figure: `docs/figures/terratwin_model_report.png`.

---

## 3. What is still missing, in priority order

1. **Widen the Earth candidate pool (highest impact).** Add Atacama, Iceland highlands,
   McMurdo Dry Valleys, Death Valley, Namib, Arabian An Nafud — same 5 km tile recipe via
   GEE. This is the only fix for F2's Moon result: a lunar-highland analog must exist in
   the pool before it can be ranked. Expect Moon AUC-after-calibration to drop toward 0.7
   once it does.
2. **Measure the calibration instead of assuming it.** Re-run the *identical* statistics
   code on the existing `terratwin_earth_image_stack_100m.tif` resampled to 118 m and
   200 m. Output is one factor per statistic, and it replaces the sqrt(resolution) guess.
   ~30 lines in the existing Earth script; it is what makes Mars numbers publishable.
3. **Real albedo** (Mars CTX/THEMIS, Moon LROC WAC) instead of the two constants — then
   albedo can re-enter the distance.
4. **MySQL**: load `data/terratwin_ml_ranked.csv` (7,180 rows with `site_quality`,
   `archetype`, `arch_*` probabilities) into `terratwin.Region_Measurements`; keep
   `terratwin_harmonized.csv` alongside for cross-body work. DDL is in `RUNBOOK.md`.
5. **Chip CNN later, and only as an Earth-side visual prior** (RGB is real for Earth;
   frozen ImageNet ResNet-34 features, no fine-tuning on 2,500 synthetic-colour tiles).

Do **not** spend effort on: tuning Head-2 contrastive temperature, swapping ResNet for
ConvNeXt, or adding epochs. Those cannot fix a resolution confound or an absent class.

---

## 4. What the website does now

* `index1.html` calls the same API origin (`/app`), shows the demo ranking **and** a
  "Measured, not hardcoded" block with real top camp sites + CV numbers.
* A per-target confidence line states the calibrated AUC: Moon 0.999 ("so lunar similarity
  is reported as an archetype mix, not one percentage"), Mars 0.911 ("mostly calibration;
  residual is real geomorphic difference").
* New endpoints: `POST /api/similarity/scale-stable`, `GET /api/model/products`,
  `/api/model/transferability`, `/api/model/target-signature/{name}`,
  `/api/model/site-quality`. See `INTEGRATION.md`.
