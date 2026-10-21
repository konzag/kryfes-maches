// Secret-name scan (KM-SECRET-01). Boss 5 is a surprise for the kids and the repo is public, so no file of the
// repo (served or not) may carry its plain name in any spelling: Greek upper/lower case, with or without tonos,
// final sigma, Latin transliterations, JS/HTML/URL escapes. index.html keeps it only as encoded code points that
// the game decodes when that fight starts.
//
// This file never holds the name. Each line is folded to a Latin "skeleton" (escapes decoded, NFD, combining marks
// removed, lower case, Greek letters transliterated, v/f/y/w -> u), then every window of WORD_LEN characters is
// hashed and compared with WORD_SHA256 (the skeleton of the name).
//
// KM-SECRET-02: the intro line of that fight (its disguise and place) is encoded too. Any two consecutive words of
// it (folded the same way, words = runs of letters/digits) count as a fragment: INTRO_PAIR_SHA256 holds the SHA-256
// of each such "word word" pair, never the words. INTRO_FOLD_SHA256 pins the folded intro as a whole.
//
// CLI: node tests/secret-scan.mjs [dir]  -> prints "file:line secret name found" / "file:line secret intro fragment
// found" per hit, exit 1 on any hit.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WORD_LEN = 9;
export const WORD_SHA256 = '38468f152fccd0748df20c1ab46fb6903a2d11328516fede7f7621167c3f8957';
export const INTRO_FOLD_SHA256 = 'fe01ac0f501abef1913950d153858648455536735871efedf2547901818a621f';
export const INTRO_PAIR_SHA256 = new Set([
  '97368100a470a165ce45af2f33cb9546a3962508f864db29bf25dff3884774f7',
  'f4e9dfe735b76bc3c1ab9caa76e9189682ea8df2912c7d762734c8a5894ee0f1',
  'e680f32ee0e44a343184094089470440fd9ba67271360c6e975837ad8fd8124e',
  '0e2f2c88a1e5c9f9c1f3bcb4754b060c4108d226210bfbdda0c2cdd475a1624c',
  'b20b26f5ef012e66aec8087502d6ab48e7440cae162e1ad89eeeb152f2ebd826',
  'c4a1157adb49519ac315423718f610a35d45f4ea7288947250f81eba01f48c6e',
  '9d63e2e424625cecbb381ae68b1838e2738fa83319263dc75b532f003290cf11',
]);

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

/** Folded words of a text (runs of letters / digits after fold). */
export function foldedWords(text) {
  return fold(text).match(/[\p{L}\p{N}]+/gu) || [];
}

/** SHA-256 of every "word word" pair of a text, in order. */
export function wordPairHashes(text) {
  const words = foldedWords(text), out = [];
  for (let i = 0; i + 1 < words.length; i++) out.push(sha256(words[i] + ' ' + words[i + 1]));
  return out;
}

/** True if the text holds two consecutive words of the secret intro line in any covered spelling. */
export function hasIntroFragment(text) {
  return wordPairHashes(text).some((h) => INTRO_PAIR_SHA256.has(h));
}

/** 1-based line numbers of the name hits in a text. */
export function secretLines(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => { if (line.length >= WORD_LEN && hasSecret(line)) hits.push(i + 1); });
  return hits;
}

/** 1-based line numbers of the intro-fragment hits in a text. */
export function introLines(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => { if (hasIntroFragment(line)) hits.push(i + 1); });
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

/** ["rel/path:line", ...] for every name hit under root. */
export function scanTree(root) {
  const hits = [];
  for (const file of listFiles(root)) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    for (const n of secretLines(fs.readFileSync(file, 'utf8'))) hits.push(`${rel}:${n}`);
  }
  return hits;
}

/** ["rel/path:line", ...] for every intro-fragment hit under root. */
export function scanTreeIntro(root) {
  const hits = [];
  for (const file of listFiles(root)) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    for (const n of introLines(fs.readFileSync(file, 'utf8'))) hits.push(`${rel}:${n}`);
  }
  return hits;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  const hits = scanTree(root), intro = scanTreeIntro(root);
  for (const h of hits) console.log(`${h} secret name found`);
  for (const h of intro) console.log(`${h} secret intro fragment found`);
  console.log(`secret-scan: ${listFiles(root).length} files, ${hits.length} name hit(s), ${intro.length} intro hit(s)`);
  process.exit(hits.length || intro.length ? 1 : 0);
}
