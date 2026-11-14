/**
 * Side-by-side feature comparison for one result.
 * Every value here is computed from pixels (worldwide) or from the measured tile table
 * (Egypt terrain). Nothing is typed by hand. "match" is a 0-100 closeness score per feature.
 */
export interface FeatureRow {
  key: string;
  label: string;
  /** what the feature means, in plain words */
  hint: string;
  photo: string;
  place: string;
  match: number;
  /** optional colour swatches for the colour row */
  swatch?: [string, string];
}

export interface FeatureSummary {
  rows: FeatureRow[];
  best: FeatureRow;
  weakest: FeatureRow;
}

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
const pct = (v: number) => `${Math.round(v * 100)}%`;
const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');

function toneName(hist: number[]): string {
  const dark = hist.slice(0, 3).reduce((a, v) => a + v, 0);
  const bright = hist.slice(5).reduce((a, v) => a + v, 0);
  if (dark > 0.55) return 'mostly dark';
  if (bright > 0.55) return 'mostly bright';
  return 'mid-tones';
}

function summarise(rows: FeatureRow[]): FeatureSummary {
  const sorted = [...rows].sort((a, b) => b.match - a.match);
  return { rows, best: sorted[0], weakest: sorted[sorted.length - 1] };
}

/**
 * Worldwide descriptor (13 numbers, same as build_world_index.py):
 * [meanR, meanG, meanB, brightnessSpread, edgeStrength, 8-bin brightness histogram].
 * The per-feature distances are the same terms matchWorld() adds up for the score.
 */
export function compareWorld(photo: number[], place: number[]): FeatureSummary {
  const colourDist = Math.sqrt(place.slice(0, 3).reduce((a, v, i) => a + (v - photo[i]) ** 2, 0) / 3);
  const histDist = place.slice(5).reduce((a, v, i) => a + Math.abs(v - photo[i + 5]), 0) / 2;
  const contrastDist = Math.abs(place[3] - photo[3]);
  const edgeDist = Math.abs(place[4] - photo[4]);
  const lum = (f: number[]) => 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
  const rows: FeatureRow[] = [
    {
      key: 'colour',
      label: 'Colour',
      hint: 'Average colour of the whole picture',
      photo: hex(photo[0], photo[1], photo[2]),
      place: hex(place[0], place[1], place[2]),
      match: clamp(100 - colourDist * 400),
      swatch: [hex(photo[0], photo[1], photo[2]), hex(place[0], place[1], place[2])],
    },
    {
      key: 'brightness',
      label: 'Brightness',
      hint: 'How light or dark the ground looks overall',
      photo: pct(lum(photo)),
      place: pct(lum(place)),
      match: clamp(100 - Math.abs(lum(photo) - lum(place)) * 300),
    },
    {
      key: 'tones',
      label: 'Light & shadow mix',
      hint: 'Share of dark, mid and bright areas (8-step histogram)',
      photo: toneName(photo.slice(5)),
      place: toneName(place.slice(5)),
      match: clamp(100 - histDist * 100),
    },
    {
      key: 'contrast',
      label: 'Contrast',
      hint: 'Spread between the darkest and brightest parts',
      photo: photo[3].toFixed(3),
      place: place[3].toFixed(3),
      match: clamp(100 - contrastDist * 500),
    },
    {
      key: 'texture',
      label: 'Surface texture',
      hint: 'Edge strength: smooth sand vs rough rock and ridges',
      photo: photo[4].toFixed(3),
      place: place[4].toFixed(3),
      match: clamp(100 - edgeDist * 800),
    },
  ];
  return summarise(rows);
}

/** Egypt terrain mode: the matcher's own [photo, tile] robust z-scores per axis. */
export function compareTerrain(z: {
  albedo: [number, number];
  spread: [number, number];
  relief: [number, number];
}): FeatureSummary {
  const row = (key: string, label: string, hint: string, pair: [number, number]): FeatureRow => ({
    key,
    label,
    hint,
    photo: `${pair[0] >= 0 ? '+' : ''}${pair[0].toFixed(2)} z`,
    place: `${pair[1] >= 0 ? '+' : ''}${pair[1].toFixed(2)} z`,
    match: clamp(100 - Math.abs(pair[0] - pair[1]) * 33),
  });
  return summarise([
    row('albedo', 'Ground brightness', 'Photo brightness vs the tile’s measured albedo', z.albedo),
    row('spread', 'Texture spread', 'Photo grain vs the tile’s measured roughness', z.spread),
    row('relief', 'Relief / slope', 'Shadow-gradient proxy vs the tile’s measured slope', z.relief),
  ]);
}
