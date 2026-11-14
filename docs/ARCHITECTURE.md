# TerraTwin — ML Architecture & Data Spec

> Recovered from the session handoff on 2026-11-14. This is the ground-truth spec for the
> model pipeline that feeds the FastAPI backend (`main.py`) and the globe.gl frontend (`index1.html`).

## 1. Project goal

Given a **5 km x 5 km terrain tile = 50 x 50 px at 100 m/px**, with 4 channels `[R, G, B, Hillshade]`,
from **Earth, Mars or the Moon**:

1. Predict a standardized physical terrain signature vector.
2. Rank the closest-matching **Earth analog** locations (Western Desert case study).

## 2. Model: dual-head `TerraTwinNet`

Backbone: `ResNet-34`, first conv modified to accept **4 input channels**.

| Head | Output | Loss |
|---|---|---|
| **Head 1 — Physical Regression** | `["slope_deg_mean", "roughness_m_mean", "albedo_mean"]` (standardized) | Huber, fitted on Earth training **spatial blocks** |
| **Head 2 — Cross-Body Metric Embedding** | 64-D, L2-normalized | Physics-guided contrastive alignment, `target_sim = exp(-cdist(y, y))` |

The contrastive target means visually different planets collapse into the same embedding space
when their **physical geomorphology** matches — that is what makes a Jezero tile retrievable
against Egyptian desert tiles by cosine similarity.

**Inference path:** tile -> physical signature + 64-D embedding -> cosine similarity against all
**7,180 Earth tiles** -> top-K Western Desert analogs.

## 3. Dataset on disk (Windows training machine)

Root: `D:\downloads edge` (C: drive is full — never write there). Venv:
`D:\downloads edge\tf_env\Scripts\python.exe`. Every script must keep the `sys.executable`
auto-guard so VS Code cannot silently run global Python.

| Path | Contents |
|---|---|
| `terratwin_master_dataset.csv` | **9,680 tiles** = 7,180 Earth + 900 Mars + 1,600 Moon |
| `data\chips\<tile_id>.tif` | per-tile 4-channel Float32 GeoTIFF chip |
| `terratwin_earth_labels.csv` | Earth tile labels |
| `terratwin_earth_image_stack_100m.tif` | 4100 x 4432 Float32 Earth stack |
| `data\terratwin_earth_ready.csv` | 7,180 paired Earth tiles |
| `data\raw\mars_jezero_dem_100m.tif` | Mars DEM resampled to 100 m (900 tiles) |
| `data\raw\moon_south_pole_dem_100m.tif` | Lunar DEM resampled to 100 m (1,600 tiles) |
| `02_train_and_rank.py` | training + evaluation + analog ranking entry point |

## 4. Acquisition details

- **Earth** — Google Earth Engine, Cloud Project `nasa-514703`, window `[25E, 23N, 29E, 27N]`, EPSG:32635:
  USGS `SRTMGL1_003` (slope, 300 m stdDev roughness, hillshade), MODIS `MOD11A2` (LST day/night/diurnal range),
  Sentinel-2 `S2_SR_HARMONIZED` (RGB + Liang 2001 broadband albedo), TerraClimate (aridity index).
- **Mars** — GDAL/Rasterio `/vsicurl/` from USGS Astrogeology, `Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif`,
  150 km window around 18.45 N / 77.4 E (Jezero).
- **Moon** — `/vsicurl/` `Lunar_LRO_LOLA_Global_LDEM_118m_Mar2014.tif`, 200 km window at 90 S, Polar Stereographic.

## 5. Known placeholders / open upgrades

1. **Constant albedo placeholders**: Mars `0.16`, Moon `0.12`. Replace with real Mars CTX/THEMIS and
   LROC WAC reflectance rasters.
2. `best_interp.csv` column `planetodetic_latitude` is **corrupted (constant 18.346169)** — use
   `planetocentric_latitude` only.
3. `initial_reports_volume2.pdf` is unreadable; re-upload before citing it.
4. Master CSV is not yet loaded into MySQL `terratwin.Region_Measurements`.

## 6. Ground-truth references

- `initial_reports_volume3.pdf` — Mars 2020 Initial Reports Vol. 3, Jezero Upper Fan (Farley & Stack, 2024-07-11):
  M2020-749-22 **Melyn** (fluvial-deltaic sandstone/conglomerate; olivine, pyroxene, Mg/Fe-carbonate, hydrated
  silica; 1.93 um H2O + 2.22-2.53 um bands), M2020-822-23 **Otis Peak** (boulder-bearing conglomerate),
  M2020-882-24 **Pilot Mountain** (indurated stratified sandstone, WATSON 20-150 um/px).
- `NASA_eCR_134306.pdf` — Apollo Soil Mechanics S-200 (Mitchell et al., 1974): D50 0.04-0.13 mm,
  bulk density 1.50-1.74 g/cm3, cohesion 0.1-1.0 kN/m2, friction angle 35-50 deg, LRV slope limit 19-23 deg.
- `USGS_geoInvestigation.pdf` (Wolfe et al., 1981, PP 1080 p.125) and `LunarSampleStudies.pdf` (NASA SP-418, 1977):
  Apollo 17 Taurus-Littrow 20.19 N / 30.77 E, high-Ti mare basalt albedo 0.07-0.10, orange/black pyroclastic
  glass 0.04-0.10 mm, Light Mantle landslide, Al2O3-rich highland massifs.
