// Unit tests (node --test, no browser) for the «🎨 Γραφικά» decision of tier Β (owner decision 16/11 §2, option b):
// the pure functions between the markers `tier:pure:start` / `tier:pure:end` in index.html. The game is one inline
// script with no modules, so this test reads that block from index.html and loads it as a module of its own (a data:
// URL import): the code under test is exactly the code the game runs.
//   node --test tests/unit/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const html = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
const m = /\/\* tier:pure:start \*\/([\s\S]*?)\/\* tier:pure:end \*\//.exec(html);
assert.ok(m, 'index.html has the block /* tier:pure:start */ ... /* tier:pure:end */');
const { tierTrack, tierSlow, tierOf, tierPick } = await import(
  'data:text/javascript,' + encodeURIComponent(m[1] + '\nexport { tierTrack, tierSlow, tierOf, tierPick };'));

const LIMIT = 20, SEC = 3; // the game's CONFIG.gfxSlowMs / gfxSlowSec
/** A window filled frame by frame the way the game fills it. */
const feed = (list, gaps = []) => { for (const ms of list) tierTrack(gaps, ms, SEC); return gaps; };
const frames = (ms, seconds) => Array.from({ length: Math.ceil(seconds * 1000 / ms) }, () => ms);

test('no frames yet: not slow', () => {
  assert.equal(tierSlow([], LIMIT, SEC), false);
});

test('slow frames for less than 3 s: not slow yet', () => {
  assert.equal(tierSlow(feed(frames(40, 2.9)), LIMIT, SEC), false);
});

test('median 40 ms for 3 s: slow', () => {
  assert.equal(tierSlow(feed(frames(40, 3.05)), LIMIT, SEC), true);
});

test('60 Hz (16.7 ms) for a long time: never slow', () => {
  assert.equal(tierSlow(feed(frames(16.7, 30)), LIMIT, SEC), false);
});

test('median exactly at the limit is not slow (strictly greater)', () => {
  assert.equal(tierSlow(feed(frames(20, 5)), LIMIT, SEC), false);
  assert.equal(tierSlow(feed(frames(20.5, 5)), LIMIT, SEC), true);
});

test('the median, not the mean: a few long frames among fast ones do not switch', () => {
  const list = []; for (let i = 0; i < 300; i++) list.push(i % 5 < 3 ? 16 : 120); // mean 57.6 ms, median 16 ms
  assert.equal(tierSlow(feed(list), LIMIT, SEC), false);
});

test('the median, not the mean: mostly slow frames with some fast ones switch', () => {
  const list = []; for (let i = 0; i < 300; i++) list.push(i % 5 < 3 ? 25 : 10); // mean 19 ms, median 25 ms
  assert.equal(tierSlow(feed(list), LIMIT, SEC), true);
});

test('only the last 3 s count: slow first, then fast for 3 s is not slow', () => {
  const gaps = feed([...frames(60, 10), ...frames(16, 3.2)]);
  assert.equal(tierSlow(gaps, LIMIT, SEC), false);
});

test('a stall (tab switch, alert, GC) of a second or more is ignored, not counted as 3 s of slow play', () => {
  const gaps = feed([16, 16, 5000, 16]);
  assert.equal(gaps.includes(5000), false);
  assert.equal(tierSlow(gaps, LIMIT, SEC), false);
  assert.equal(tierSlow(feed([3100]), LIMIT, SEC), false);
});

test('not-a-number and negative frame times are ignored', () => {
  const gaps = feed([NaN, -5, Infinity, 16]);
  assert.deepEqual(gaps, [16]);
});

test('the window keeps only what covers the last 3 s (bounded memory)', () => {
  const gaps = feed(frames(16, 60));
  const sum = gaps.reduce((a, b) => a + b, 0);
  assert.ok(sum >= SEC * 1000, 'still covers 3 s');
  assert.ok(sum - gaps[0] < SEC * 1000, 'the oldest frame is needed to cover 3 s');
  assert.ok(gaps.length <= Math.ceil(SEC * 1000 / 16) + 1);
});

test('tierTrack returns the same array (the game keeps one window, no garbage per frame)', () => {
  const gaps = [];
  assert.equal(tierTrack(gaps, 16, SEC), gaps);
});

test('tierOf: «Κανονικά» = tier Α, «Πλούσια» = tier Β whatever the speed, «Αυτόματα» = Β until the device is slow', () => {
  assert.equal(tierOf('normal', false), 'a');
  assert.equal(tierOf('normal', true), 'a');
  assert.equal(tierOf('rich', false), 'b');
  assert.equal(tierOf('rich', true), 'b');
  assert.equal(tierOf('auto', false), 'b');
  assert.equal(tierOf('auto', true), 'a');
});

test('tierPick: reads the stored JSON, anything unknown or broken is «Αυτόματα» on a fast device', () => {
  assert.deepEqual(tierPick(null), { pick: 'auto', slow: false });
  assert.deepEqual(tierPick(''), { pick: 'auto', slow: false });
  assert.deepEqual(tierPick('{not json'), { pick: 'auto', slow: false });
  assert.deepEqual(tierPick('"rich"'), { pick: 'auto', slow: false });
  assert.deepEqual(tierPick('{"pick":"fast","slow":"yes"}'), { pick: 'auto', slow: false });
  assert.deepEqual(tierPick('{"pick":"rich","slow":false}'), { pick: 'rich', slow: false });
  assert.deepEqual(tierPick('{"pick":"normal"}'), { pick: 'normal', slow: false });
  assert.deepEqual(tierPick('{"pick":"auto","slow":true}'), { pick: 'auto', slow: true });
});
