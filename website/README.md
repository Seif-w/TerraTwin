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

These pictures are not stored in the repository, so the scripts below rebuild them.

```bash
python scripts/build_world_index.py      # 720 worldwide satellite pictures
python scripts/extract_sample_photos.py  # Mars sample photos (needs the Initial Reports PDFs)
python scripts/make_feature_report.py    # updates docs/FEATURE_REPORT.md
```
