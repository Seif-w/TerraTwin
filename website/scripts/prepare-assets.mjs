import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const archive = resolve(root, 'assets/reference-images.tar.gz');

if (!existsSync(archive)) {
  throw new Error('Missing assets/reference-images.tar.gz: deployment needs the real reference pictures.');
}

// Archive entries are generated locally, restricted to the public/ image folders.
execFileSync('tar', ['-xzf', archive, '-C', root], { stdio: 'inherit' });

const index = JSON.parse(readFileSync(resolve(root, 'public/world/index.json'), 'utf8'));
const records = index.sites;
if (!Array.isArray(records)) throw new Error('World index has no sites array.');
const missing = records.filter(site => !existsSync(resolve(root, 'public', site.image.replace(/^\//, ''))));
if (missing.length) throw new Error(`${missing.length} reference pictures are missing after extraction.`);
console.log(`Ready: ${records.length} real worldwide pictures restored for the build.`);
