// Secret-name scan (KM-SECRET-01). Boss 5 is a surprise for the kids and the repo is public, so no file of the
// repo (served or not) may carry its plain name in any spelling: Greek upper/lower case, with or without tonos,
// final sigma, Latin transliterations, JS/HTML/URL escapes. index.html keeps it only as encoded code points that
// the game decodes when that fight starts.
//
// This file never holds the name. Each line is folded to a Latin "skeleton" (escapes decoded, NFD, combining marks
// removed, lower case, Greek letters transliterated, v/f/y/w -> u), then every window of WORD_LEN characters is
// hashed and compared with WORD_SHA256 (the skeleton of the name).
//
// CLI: node tests/secret-scan.mjs [dir]  -> prints "file:line secret name found" per hit, exit 1 on any hit.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WORD_LEN = 9;
export const WORD_SHA256 = '38468f152fccd0748df20c1ab46fb6903a2d11328516fede7f7621167c3f8957';

const GREEK = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x',
  ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'u', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
};
const LATIN = { v: 'u', f: 'u', y: 'u', w: 'u' };
const SKIP_DIRS = new Set(['.git', 'node_modules', 'test-results', 'playwright-report', 'blob-report']);

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

/** JS (\uXXXX, \u{X}, \xHH), HTML (&#N; &#xH;) and URL (%HH) escapes -> characters. */
export function decodeEscapes(s) {
  const cp = (n) => (n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '');
  return s
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (_, h) => cp(parseInt(h, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => cp(parseInt(h, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => cp(parseInt(h, 16)))
    .replace(/&#x([0-9a-fA-F]{1,6});?/g, (_, h) => cp(parseInt(h, 16)))
    .replace(/&#([0-9]{1,7});?/g, (_, d) => cp(parseInt(d, 10)))
    .replace(/(?:%[0-9a-fA-F]{2})+/g, (run) => { try { return decodeURIComponent(run); } catch { return run; } });
}

/** Case-, accent- and alphabet-insensitive form of a text (see the header). */
export function fold(s) {
  const plain = decodeEscapes(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  let out = '';
  for (const ch of plain) out += GREEK[ch] ?? LATIN[ch] ?? ch;
  return out;
}

/** True if the text holds the name in any covered spelling. */
export function hasSecret(text) {
  const f = fold(text);
  for (let i = 0; i + WORD_LEN <= f.length; i++) if (sha256(f.slice(i, i + WORD_LEN)) === WORD_SHA256) return true;
  return false;
}

/** 1-based line numbers of the hits in a text. */
export function secretLines(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => { if (line.length >= WORD_LEN && hasSecret(line)) hits.push(i + 1); });
  return hits;
}

/** Every file under root (all text and binary files, e.g. image metadata), minus VCS / dependency / report dirs. */
export function listFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name)); }
      else if (e.isFile()) out.push(path.join(dir, e.name));
    }
  };
  walk(root);
  return out.sort();
}

/** ["rel/path:line", ...] for every hit under root. */
export function scanTree(root) {
  const hits = [];
  for (const file of listFiles(root)) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    for (const n of secretLines(fs.readFileSync(file, 'utf8'))) hits.push(`${rel}:${n}`);
  }
  return hits;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const hits = scanTree(root);
  for (const h of hits) console.log(`${h} secret name found`);
  console.log(`secret-scan: ${listFiles(root).length} files, ${hits.length} hit(s)`);
  process.exit(hits.length ? 1 : 0);
}
