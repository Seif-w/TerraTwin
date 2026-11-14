# TerraTwin feature report

What each flag compares, and how well the top results match on each feature.

Data: 720 real satellite reference pictures in 177 countries/areas (EOX Sentinel-2 cloudless 2023) and 9 Mars sample photos from the Perseverance Initial Reports (Vol. 2 and 4).

## Features shown beside each other on every flag

| Feature | What it measures | Match formula (0-100) |
|---|---|---|
| Colour | Average RGB colour of the picture | 100 - 400 x RMS colour difference |
| Brightness | Overall lightness (luminance) | 100 - 300 x brightness difference |
| Light & shadow mix | 8-step brightness histogram | 100 - 100 x half the histogram difference |
| Contrast | Spread of brightness (std. dev.) | 100 - 500 x difference |
| Surface texture | Average edge strength (smooth vs rough) | 100 - 800 x difference |

Overall score = 1 - (0.45 x colour + 0.35 x histogram + 0.20 x texture/contrast distance). It is a visual similarity score, not a location probability.

## Summary over the top 3 results of every Mars sample

| Feature | Average match | Times it was the best feature |
|---|---|---|
| Colour | 74% | 0 |
| Brightness | 92% | 13 |
| Light & shadow mix | 86% | 4 |
| Contrast | 89% | 7 |
| Surface texture | 85% | 3 |

Strongest feature overall: **Brightness**. Weakest: **Colour**.

## Top 3 places per Mars sample

### Skinner Ridge

| # | Place | Overall | Colour | Brightness | Light & shadow mix | Contrast | Surface texture | Best at |
|---|---|---|---|---|---|---|---|---|
| 1 | United States of America (39.0, -117.0) | 92 | 81% | 98% | 88% | 83% | 96% | Brightness |
| 2 | Turkey (39.0, 39.0) | 90 | 67% | 97% | 88% | 74% | 85% | Brightness |
| 3 | Tajikistan (38.8, 71.0) | 90 | 78% | 99% | 82% | 99% | 63% | Brightness |

### Wildcat Ridge

| # | Place | Overall | Colour | Brightness | Light & shadow mix | Contrast | Surface texture | Best at |
|---|---|---|---|---|---|---|---|---|
| 1 | Greenland (75.0, -21.0) | 89 | 89% | 90% | 77% | 96% | 72% | Contrast |
| 2 | Tajikistan (39.0, 69.0) | 89 | 63% | 85% | 86% | 83% | 75% | Light & shadow mix |
| 3 | China (39.0, 75.0) | 88 | 74% | 80% | 76% | 99% | 79% | Contrast |

### Amalik

| # | Place | Overall | Colour | Brightness | Light & shadow mix | Contrast | Surface texture | Best at |
|---|---|---|---|---|---|---|---|---|
| 1 | Afghanistan (33.0, 69.0) | 94 | 75% | 99% | 93% | 89% | 99% | Brightness |
| 2 | Peru (-15.0, -75.0) | 92 | 78% | 97% | 86% | 96% | 95% | Brightness |
| 3 | Iran (27.0, 57.0) | 92 | 79% | 90% | 85% | 96% | 96% | Contrast |

### Hidden Harbor

| # | Place | Overall | Colour | Brightness | Light & shadow mix | Contrast | Surface texture | Best at |
|---|---|---|---|---|---|---|---|---|
| 1 | Benin (9.2, 2.3) | 94 | 73% | 89% | 92% | 96% | 95% | Contrast |
| 2 | Italy (45.0, 9.0) | 92 | 81% | 92% | 88% | 99% | 76% | Contrast |
| 3 | Pakistan (30.4, 70.1) | 92 | 78% | 100% | 88% | 94% | 86% | Brightness |

### Observation Mountain

| # | Place | Overall | Colour | Brightness | Light & shadow mix | Contrast | Surface texture | Best at |
|---|---|---|---|---|---|---|---|---|
| 1 | Qatar (25.3, 51.2) | 94 | 75% | 94% | 96% | 91% | 72% | Light & shadow mix |
| 2 | United Arab Emirates (24.3, 55.0) | 93 | 69% | 90% | 92% | 90% | 89% | Light & shadow mix |
| 3 | Chad (15.3, 18.3) | 91 | 75% | 96% | 86% | 90% | 88% | Brightness |

### Hans Amundsen Workspace

| # | Place | Overall | Colour | Brightness | Light & shadow mix | Contrast | Surface texture | Best at |
|---|---|---|---|---|---|---|---|---|
| 1 | China (33.0, 81.0) | 94 | 82% | 90% | 89% | 97% | 93% | Contrast |
| 2 | Iran (39.0, 45.0) | 93 | 86% | 88% | 88% | 85% | 97% | Surface texture |
| 3 | Chad (15.0, 21.0) | 93 | 93% | 97% | 87% | 75% | 90% | Brightness |

### Turquoise Bay

| # | Place | Overall | Colour | Brightness | Light & shadow mix | Contrast | Surface texture | Best at |
|---|---|---|---|---|---|---|---|---|
| 1 | United States of America (39.0, -111.0) | 89 | 86% | 95% | 79% | 82% | 69% | Brightness |
| 2 | Pakistan (27.0, 69.0) | 88 | 67% | 88% | 85% | 83% | 54% | Brightness |
| 3 | China (36.8, 98.8) | 87 | 68% | 83% | 77% | 90% | 83% | Contrast |

### Bunsen Peak

| # | Place | Overall | Colour | Brightness | Light & shadow mix | Contrast | Surface texture | Best at |
|---|---|---|---|---|---|---|---|---|
| 1 | China (33.0, 81.0) | 90 | 65% | 97% | 90% | 78% | 83% | Brightness |
| 2 | Mexico (27.0, -105.0) | 89 | 60% | 87% | 89% | 81% | 79% | Light & shadow mix |
| 3 | Russia (75.0, 141.0) | 89 | 86% | 89% | 79% | 70% | 88% | Brightness |

### Beaver Falls

| # | Place | Overall | Colour | Brightness | Light & shadow mix | Contrast | Surface texture | Best at |
|---|---|---|---|---|---|---|---|---|
| 1 | United States of America (39.0, -111.0) | 92 | 52% | 99% | 95% | 95% | 88% | Brightness |
| 2 | China (36.8, 98.8) | 91 | 55% | 88% | 89% | 97% | 99% | Surface texture |
| 3 | Somalia (3.0, 45.0) | 87 | 53% | 88% | 81% | 86% | 99% | Surface texture |

## Egypt terrain mode

In the optional Egypt mode each flag compares three measured axes in robust z-units: ground brightness (albedo), texture spread (roughness) and relief (slope). Match = 100 - 33 x |photo z - tile z|.

## Limits

- Satellite views are top-down; rover photos are side views, so shape-based features are weak.
- Reference pictures are a sparse worldwide sample, not every place on Earth.
- This report resizes with PIL; the browser uses canvas smoothing, so numbers can differ by 1-2 points.

Regenerate: `python scripts/make_feature_report.py`
