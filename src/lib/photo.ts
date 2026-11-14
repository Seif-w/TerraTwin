/** Photo feature extraction, 100% client side on HTML5 canvas.
 *
 *  Every number here is measured from the uploaded pixels. The constants are documented
 *  proxies, not calibrated instrument conversions, and the panel states that.
 */

import type { PhotoFeatures } from "./types";

const SPEC_N = 256; // square side used for the spectral analysis (centre crop)
const GRID = 160; // working grid for brightness / contrast / gradient statistics
const GAIN_UNCAL = 0.35; // unknown radiometric gain of a raw JPEG (documented proxy)
export const ALBEDO_HALF_BAND = 0.12; // +/- half width of the brightness-derived albedo band

export interface PhotoAnalysis extends PhotoFeatures {
  groundFraction: number;
  thumbData: string;
  cropData: string;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image could not be decoded"));
    img.src = src;
  });
}

function draw(img: HTMLImageElement, w: number, h: number): ImageData {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/** Iterative radix-2 Cooley-Tukey FFT, in place on re/im. */
function fft1d(re: Float64Array, im: Float64Array, invert: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((2 * Math.PI) / len) * (invert ? -1 : 1);
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (invert) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

/** Radially averaged power spectrum of a square real image, Hann-windowed. */
function radialPower(gray: Float64Array, n: number): number[] {
  const re = new Float64Array(n * n);
  const im = new Float64Array(n * n);
  // 2D Hann window
  const win = (i: number) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      re[y * n + x] = gray[y * n + x] * win(x) * win(y);
    }
  }
  // rows
  const rowRe = new Float64Array(n);
  const rowIm = new Float64Array(n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      rowRe[x] = re[y * n + x];
      rowIm[x] = 0;
    }
    fft1d(rowRe, rowIm, false);
    for (let x = 0; x < n; x++) {
      re[y * n + x] = rowRe[x];
      im[y * n + x] = rowIm[x];
    }
  }
  // columns
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      rowRe[y] = re[y * n + x];
      rowIm[y] = im[y * n + x];
    }
    fft1d(rowRe, rowIm, false);
    for (let y = 0; y < n; y++) {
      re[y * n + x] = rowRe[y];
      im[y * n + x] = rowIm[y];
    }
  }
  const bins = Math.floor(n / 2);
  const sum = new Float64Array(bins);
  const cnt = new Float64Array(bins);
  const half = n / 2;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const fx = x <= half ? x : x - n;
      const fy = y <= half ? y : y - n;
      const r = Math.round(Math.hypot(fx, fy));
      if (r >= bins) continue;
      const p = re[y * n + x] * re[y * n + x] + im[y * n + x] * im[y * n + x];
      sum[r] += p;
      cnt[r] += 1;
    }
  }
  const out: number[] = [];
  for (let r = 1; r < bins; r++) out.push(cnt[r] ? sum[r] / cnt[r] : 0);
  return out;
}

function logLogSlope(y: number[]): { slope: number; hf: number; peak: number } {
  // fit log P = a + b log f over the inertial decade (f 2..fmax/2)
  const f = (i: number) => i + 1;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let n = 0;
  const hi = Math.max(4, Math.floor(y.length / 2));
  for (let i = 1; i < hi; i++) {
    if (y[i] <= 0) continue;
    const lx = Math.log(f(i));
    const ly = Math.log(y[i]);
    sx += lx;
    sy += ly;
    sxx += lx * lx;
    sxy += lx * ly;
    n++;
  }
  const slope = n > 1 ? (n * sxy - sx * sy) / (n * sxx - sx * sx) : 0;
  const total = y.reduce((a, b) => a + b, 0) || 1;
  const hfBand = y.slice(8).reduce((a, b) => a + b, 0);
  let peak = 0;
  let best = -1;
  for (let i = 0; i < y.length; i++) {
    if (y[i] > best) {
      best = y[i];
      peak = i;
    }
  }
  return { slope, hf: hfBand / total, peak: f(peak) };
}

function medianFromHist(hist: number[], bins: number, max: number): number {
  const total = hist.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  let acc = 0;
  for (let i = 0; i < bins; i++) {
    acc += hist[i];
    if (acc >= total / 2) return ((i + 0.5) / bins) * max;
  }
  return max;
}

function toDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/jpeg", 0.85);
}

export async function analysePhoto(src: string): Promise<PhotoAnalysis> {
  const img = await loadImage(src);
  const full = draw(img, GRID, GRID);
  const px = full.data;
  const n = GRID * GRID;

  const luma = new Float64Array(n);
  const rgbSum = [0, 0, 0];
  const histR = new Array(32).fill(0);
  const histG = new Array(32).fill(0);
  const histB = new Array(32).fill(0);
  const lumaHist = new Array(64).fill(0);

  for (let i = 0; i < n; i++) {
    const r = px[i * 4] / 255;
    const g = px[i * 4 + 1] / 255;
    const b = px[i * 4 + 2] / 255;
    luma[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    rgbSum[0] += r;
    rgbSum[1] += g;
    rgbSum[2] += b;
    histR[Math.min(31, Math.floor(r * 32))]++;
    histG[Math.min(31, Math.floor(g * 32))]++;
    histB[Math.min(31, Math.floor(b * 32))]++;
    lumaHist[Math.min(63, Math.floor(luma[i] * 64))]++;
  }
  const mean = (s: number) => s / n;
  const meanR = mean(rgbSum[0]);
  const meanG = mean(rgbSum[1]);
  const meanB = mean(rgbSum[2]);
  const meanLuma = mean(Array.from(luma).reduce((a, b) => a + b, 0));
  const varL =
    Array.from(luma).reduce((a, b) => a + (b - meanLuma) ** 2, 0) / n;
  const stdLuma = Math.sqrt(varL);
  const medianLuma = medianFromHist(lumaHist, 64, 1);

  // ---- horizon / sky -------------------------------------------------------
  // Row edge energy: a landscape photo has one strong horizontal structure line.
  const rowEdge = new Float64Array(GRID);
  const rowVar = new Float64Array(GRID);
  for (let y = 1; y < GRID - 1; y++) {
    let e = 0;
    let s = 0;
    for (let x = 0; x < GRID; x++) {
      const i = y * GRID + x;
      e += Math.abs(luma[i + GRID] - luma[i - GRID]);
      s += luma[i];
    }
    rowEdge[y] = e / GRID;
    const m = s / GRID;
    let v = 0;
    for (let x = 0; x < GRID; x++) {
      const i = y * GRID + x;
      v += (luma[i] - m) ** 2;
    }
    rowVar[y] = v / GRID;
  }
  // candidate horizon: max edge energy between 15% and 85% height
  let horizonRow: number | null = null;
  let bestEdge = 0;
  for (let y = Math.floor(GRID * 0.15); y < Math.floor(GRID * 0.85); y++) {
    if (rowEdge[y] > bestEdge) {
      bestEdge = rowEdge[y];
      horizonRow = y;
    }
  }
  // Sky = above the horizon and smoother than the ground (or, for the Moon, pure black)
  let sky = 0;
  let ground = 0;
  const groundLuma: number[] = [];
  const hRow = horizonRow ?? GRID;
  const groundVar = rowVar.slice(hRow).reduce((a, b) => a + b, 0) / Math.max(1, GRID - hRow);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const i = y * GRID + x;
      const isBlack = luma[i] < 0.04; // space/PSR shadow, not sky light
      if (y < hRow && (rowVar[y] < 0.65 * groundVar || isBlack)) sky++;
      else if (y >= hRow) ground++;
    }
  }
  for (let y = hRow; y < GRID; y++)
    for (let x = 0; x < GRID; x++) groundLuma.push(luma[y * GRID + x]);
  const groundFraction = (sky + ground) ? ground / (sky + ground) : 1;
  const groundMean = groundLuma.length
    ? groundLuma.reduce((a, b) => a + b, 0) / groundLuma.length
    : meanLuma;

  // ---- shadow-gradient slope proxy (ground only) ---------------------------
  let gSum = 0;
  let gCnt = 0;
  for (let y = hRow + 1; y < GRID - 1; y++) {
    for (let x = 1; x < GRID - 1; x++) {
      const i = y * GRID + x;
      const gx = (luma[i + 1] - luma[i - 1]) / 2;
      const gy = (luma[i + GRID] - luma[i - GRID]) / 2;
      gSum += Math.hypot(gx, gy);
      gCnt++;
    }
  }
  const gradMean = gCnt ? gSum / gCnt : 0;
  const slopeProxy =
    (Math.atan(gradMean / (GAIN_UNCAL * Math.max(groundMean, 1e-3))) * 180) / Math.PI;

  // ---- texture: local variance + FFT --------------------------------------
  let localVar = 0;
  let lc = 0;
  for (let y = 2; y < GRID - 2; y++) {
    for (let x = 2; x < GRID - 2; x++) {
      let m = 0;
      const w: number[] = [];
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const v = luma[(y + dy) * GRID + (x + dx)];
          w.push(v);
          m += v;
        }
      m /= w.length;
      localVar += w.reduce((a, b) => a + (b - m) ** 2, 0) / w.length;
      lc++;
    }
  }
  localVar = lc ? localVar / lc : 0;

  // centre square crop of the raw image, SPEC_N x SPEC_N, for the spectrum
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const cx = Math.floor((img.naturalWidth - side) / 2);
  const cy = Math.floor((img.naturalHeight - side) / 2);
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = SPEC_N;
  cropCanvas.height = SPEC_N;
  const cctx = cropCanvas.getContext("2d", { willReadFrequently: true });
  if (!cctx) throw new Error("canvas 2d context unavailable");
  cctx.drawImage(img, cx, cy, side, side, 0, 0, SPEC_N, SPEC_N);
  const cropData = cctx.getImageData(0, 0, SPEC_N, SPEC_N).data;
  const gray = new Float64Array(SPEC_N * SPEC_N);
  for (let i = 0; i < gray.length; i++) {
    gray[i] =
      (0.2126 * cropData[i * 4] + 0.7152 * cropData[i * 4 + 1] + 0.0722 * cropData[i * 4 + 2]) /
      255;
  }
  const rp = radialPower(gray, SPEC_N);
  const spec = logLogSlope(rp);

  // ---- palette -------------------------------------------------------------
  const maxC = Math.max(meanR, meanG, meanB);
  const minC = Math.min(meanR, meanG, meanB);
  const saturation = maxC > 0 ? (maxC - minC) / maxC : 0;
  const warmth = meanB > 0 ? (meanR - meanB) / (meanR + meanB) : 0;
  let hue = 0;
  if (maxC - minC > 1e-4) {
    if (maxC === meanR) hue = 60 * (((meanG - meanB) / (maxC - minC)) % 6);
    else if (maxC === meanG) hue = 60 * ((meanB - meanR) / (maxC - minC) + 2);
    else hue = 60 * ((meanR - meanG) / (maxC - minC) + 4);
    if (hue < 0) hue += 360;
  }
  const paletteClass =
    saturation < 0.12
      ? meanLuma < 0.1
        ? "space / shadow black (no surface light)"
        : "achromatic grey - basalt, regolith or monochrome render"
      : warmth > 0.22
        ? "oxidised dust - Mars-like ferric palette"
        : warmth > 0.06
          ? "warm silicate - sand, silt and desert pavement"
          : hue > 190 && hue < 260
            ? "cool blue - sky, water or ice dominated"
            : hue > 60 && hue < 170
              ? "green - vegetation, not a planetary analogue"
              : "mixed / other";

  const albedoProxy = groundMean;
  const albedoBand: [number, number] = [
    Math.max(0, groundMean - ALBEDO_HALF_BAND),
    Math.min(1, groundMean + ALBEDO_HALF_BAND),
  ];

  // preview thumbnails for the UI
  const thumbCanvas = document.createElement("canvas");
  const tw = 360;
  const scale = tw / Math.max(1, full.width);
  thumbCanvas.width = tw;
  thumbCanvas.height = Math.max(1, Math.round(full.height * scale));
  thumbCanvas.getContext("2d")?.drawImage(img, 0, 0, thumbCanvas.width, thumbCanvas.height);

  return {
    meanLuma,
    medianLuma,
    albedoProxy,
    albedoBand,
    contrast: meanLuma > 1e-4 ? stdLuma / meanLuma : 0,
    textureLocalVar: localVar,
    fftSlope: spec.slope,
    fftHFraction: spec.hf,
    grainScalePx: spec.peak,
    skyFraction: sky / n,
    horizonRow: horizonRow == null ? null : horizonRow / GRID,
    slopeProxy,
    hue,
    saturation,
    warmth,
    histogram: [histR, histG, histB, lumaHist],
    radialPower: rp,
    width: img.naturalWidth,
    height: img.naturalHeight,
    paletteClass,
    groundFraction,
    thumbData: toDataUrl(thumbCanvas),
    cropData: cropCanvas.toDataURL("image/jpeg", 0.85),
  };
}
