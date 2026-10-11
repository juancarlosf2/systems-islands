import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaybackClock, samplePlaybackClock, pausePlaybackClock, resumePlaybackClock, stepPlaybackClock } from '../src/ui/playbackClock.js';

test('pause holds presentation time across long waits and resume completes only remaining duration', () => {
  let clock = createPlaybackClock(100);
  clock = pausePlaybackClock(clock, 1600);
  assert.equal(clock.atMs, 1500);
  clock = samplePlaybackClock(clock, 90000);
  assert.equal(clock.atMs, 1500);
  clock = resumePlaybackClock(clock, 90000);
  assert.equal(samplePlaybackClock(clock, 94400).atMs, 5900);
  assert.equal(samplePlaybackClock(clock, 94500).atMs, 6000);
});

test('step pauses at successive event times including simultaneous events and stays paused at end', () => {
  const events = [{ atMs: 0 }, { atMs: 100 }, { atMs: 100 }, { atMs: 450 }, { atMs: 6000 }];
  let clock = stepPlaybackClock(createPlaybackClock(0), events, 20);
  assert.equal(clock.atMs, 100);
  assert.equal(clock.paused, true);
  clock = stepPlaybackClock(clock, events, 900);
  assert.equal(clock.atMs, 450);
  clock = stepPlaybackClock(clock, events, 1000);
  assert.equal(clock.atMs, 6000);
  assert.equal(samplePlaybackClock(clock, 90000).atMs, 6000);
  assert.equal(clock.paused, true);
});

test('clock clamps to duration, ignores backwards clocks, and leaves prior values untouched', () => {
  const clock = createPlaybackClock(1000);
  assert.equal(samplePlaybackClock(clock, 900).atMs, 0);
  assert.equal(samplePlaybackClock(clock, 20000).atMs, 6000);
  assert.equal(clock.atMs, 0);
});
