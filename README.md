# TerraTwin

Explore Earth environments that resemble a landscape photograph, measured terrain in Egypt's Western Desert, and sample sites from the Mars 2020 Initial Reports.

## Run the website

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://localhost:3000`. Build with `pnpm typecheck && pnpm build`. Deploy `dist/` to a static host with SPA fallback to `/index.html`.

## Pages and features

Home, Find a place, Mars samples, Explore, and How it works. Photo analysis runs locally in the browser. Up to 18 geographically spaced matches use red/orange/yellow flags for the top 3/next 5/next 10 results. Clicking a flag or result opens the actual coordinate-centered satellite view. A minimum-score filter hides lower-scoring results.

Scores are experimental visual similarity, not calibrated location confidence. The current photo matcher compares brightness/contrast and a weak relief proxy against terrain measurements. It is not a trained image-location model and does not search the whole planet.

## Structure

- `src/`: React interface, local image extraction, visual matcher, globes and result cards.
- `public/data/`: exported terrain, landmark references, vegetation screen and Mars sample records.
- `public/samples/`: credited demonstration images extracted from the supplied reports and existing examples.
- `scripts/`: report extraction, artifact export and build-time initial HTML.
- `ml/`: terrain ML scripts, fitted estimators, metadata and the user-supplied dataset. See [ML instructions](ml/README.md).
- `GITHUB_UPLOAD.md`: commands for adding this update to the existing repository.

## Sources and limits

The supplied Initial Reports volumes 2 and 4 provide 9 sample sites and 13 sample records, not verified Earth-Mars image pairs. Figure/page citations are kept in `public/data/mars_samples.json`.

Earth result pictures use EOX Sentinel-2 cloudless 2023: modified Copernicus Sentinel data, CC BY-NC-SA 4.0. These are satellite views, not ground-level photos. Review the noncommercial license before commercial use. Landmark coordinates come from OpenStreetMap contributors, ODbL.

The vegetation screen is an RGB heuristic, not a validated land-use classifier. It does not establish safety, accessibility, land ownership or suitability for development.

The saved terrain classifier learns threshold-defined labels; the quality regressor approximates an engineering formula. Earlier high validation scores measure reproduction of those rules, not independent geological truth or photo-location accuracy.

Training a learned photo-to-Earth system still requires georeferenced Earth pictures, meaningful analogue pair labels, scale/lighting metadata, and held-out geographic regions.

## Worldwide mode (version 2)

The default photo finder now matches real EOX satellite-image references sampled on a global six-degree land grid plus interior country points. This is a new image corpus, not a claim that the supplied terrain data is global. The original Egypt terrain mode remains separately selectable. A flag/result click immediately opens a picture dialog, rather than a detail card hidden below the map.

Rebuild the index with `python scripts/build_world_index.py` after installing `requests`, `Pillow`, `numpy` and `shapely`. Actual counts, coverage and skipped responses are recorded in `public/world/index.json`. Every preview is bundled locally. Source and license information is in WORLD_SOURCES.md.

Uploads accept JPEG/PNG/WebP below 12 MB, run locally, and are not stored by the site. Tooltip content is escaped, raster paths are validated, external links are HTTPS with noopener/noreferrer, and limited CSP/referrer protections are included. This is hardening, not an independent security audit. The hosting platform owns HTTPS and response headers.

## Project documents

- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) – plain-language summary: what TerraTwin is, the problem, and why it matters
- [FEATURE_REPORT.md](FEATURE_REPORT.md) – per-feature match results for the Mars samples (regenerate with `python scripts/make_feature_report.py`)
- [WORLD_SOURCES.md](WORLD_SOURCES.md) – worldwide satellite imagery sources and licences
- [ml/README.md](ml/README.md) – saved terrain models and how to reload them
- [docs/](docs/) – architecture, modelling decision, runbook and the original FastAPI backend notes (`main.py`, `ml_router.py`, `requirements-backend.txt`)

## Images not stored in this repository

To keep the repository small, two image folders are generated rather than committed:

- `public/world/images/` (720 satellite pictures): run `python scripts/build_world_index.py`
- `public/samples/` photos (Mars sample sites): run `python scripts/extract_sample_photos.py` with the Initial Reports PDFs

The live website already includes all of them.
