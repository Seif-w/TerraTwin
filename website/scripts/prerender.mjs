/** Build-time prerender for a small, crawler-readable TerraTwin shell. */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ENTITIES[c]);

function readJson(dir, name) {
  return JSON.parse(readFileSync(resolve(dir, "public", name), "utf8"));
}

export function metaTokens(_products, _bodies, ranked) {
  const count = Number.isFinite(Number(ranked.rows)) ? Number(ranked.rows) : ranked.data.length;
  const DATASET_COUNT = count.toLocaleString("en-US");
  const DESCRIPTION =
    `Explore TerraTwin: compare landscape photos with sampled worldwide satellite pictures. ` +
    `${DATASET_COUNT} supplied Earth records cover Egypt's Western Desert.`;
  return {
    DATASET_COUNT,
    DESCRIPTION,
    OG_DESCRIPTION: DESCRIPTION,
    TWITTER_DESCRIPTION: DESCRIPTION,
  };
}

export function prerender(projectDir) {
  const ranked = readJson(projectDir, "data/terratwin_ml_ranked.json");
  const mars = readJson(projectDir, "data/mars_samples.json");
  const count = Number.isFinite(Number(ranked.rows)) ? Number(ranked.rows) : ranked.data.length;
  const nav = [
    ["/", "Home"],
    ["/photo", "Find a place"],
    ["/mars-samples", "Mars samples"],
    ["/data-layers", "Explore"],
    ["/how-it-works", "How it works"],
  ]
    .map(([href, label]) => `<li><a href="${href}">${esc(label)}</a></li>`)
    .join("");

  return `
  <section>
    <h1>TerraTwin</h1>
    <p>Explore similar landscapes worldwide: choose a photo, click a flag and see a real satellite picture.</p>
    <p><strong>${count.toLocaleString("en-US")}</strong> supplied Earth terrain records cover Egypt's Western Desert. A separate sampled worldwide satellite-reference index extends the photo finder. Visual similarity is not exact geolocation.</p>
    <p><a href="/photo">Find a place from a photo</a> · <a href="/mars-samples">Browse Mars samples</a></p>
    <h2>Explore TerraTwin</h2>
    <ul>${nav}</ul>
    <p>${mars.n_sites.toLocaleString("en-US")} Mars sample places and ${mars.n_samples.toLocaleString("en-US")} paired sample records are available in the gallery.</p>
  </section>
`.replace(/{{([A-Z_]+)}}/g, (_, k) => metaTokens({}, {}, ranked)[k] ?? "");
}

/** Substitute head tokens and fail loudly if a token is missing. */
export function applyTokens(html, tokens) {
  const filled = html.replace(/{{([A-Z_]+)}}/g, (m, k) => {
    if (tokens[k] == null) throw new Error(`prerender: unknown token ${k}`);
    return tokens[k];
  });
  const left = filled.match(/{{[A-Z_]+}}/);
  if (left) throw new Error(`prerender: unfilled token ${left[0]}`);
  return filled;
}
