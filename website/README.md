# TerraTwin website

The web app: photo finder, 3D globes, coloured result flags and the side-by-side place view.

## Run

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build      # production files in dist/
```

## Folders

| Folder | Contents |
|---|---|
| `src/views/` | Pages: Home, Find a place, Mars samples, Explore, How it works |
| `src/components/` | Globe, flags, place card, charts |
| `src/lib/` | Photo features, matching, data loading |
| `public/data/` | Data exported from the ML pipeline |
| `public/world/` | Worldwide picture index (pictures are downloaded by a script) |
| `scripts/` | Scripts that build the data and pictures |

## Rebuild the pictures

Worldwide reference pictures and the extra demonstration photos are stored together in `assets/reference-images.tar.gz` to keep the repository tidy. `pnpm build` or `npm run build` automatically restores them. The scripts below are available if you want to regenerate the source data.

```bash
python scripts/build_world_index.py      # 720 worldwide satellite pictures
python scripts/extract_sample_photos.py  # Mars sample photos (needs the Initial Reports PDFs)
python scripts/make_feature_report.py    # updates docs/FEATURE_REPORT.md
```

## Deploy on Vercel

Import `Seif-w/TerraTwin` and set the Root Directory to **website**. The included `vercel.json` supplies the build settings and page routing. The build restores the bundled pictures automatically. This static website does not require the optional Python backend or external AI credentials.
