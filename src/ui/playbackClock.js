export const PLAYBACK_MS = 6000;

export const createPlaybackClock = (now, duration = PLAYBACK_MS) => ({ atMs: 0, updatedAt: now, paused: false, duration });

export function samplePlaybackClock(clock, now) {
  return { ...clock, atMs: Math.min(clock.duration, clock.atMs + (clock.paused ? 0 : Math.max(0, now - clock.updatedAt))), updatedAt: now };
}

export function pausePlaybackClock(clock, now) {
  return { ...samplePlaybackClock(clock, now), paused: true };
}

export function resumePlaybackClock(clock, now) {
  return { ...clock, updatedAt: now, paused: false };
}

export function stepPlaybackClock(clock, events, now) {
  const paused = pausePlaybackClock(clock, now);
  const next = events.find(event => event.atMs > paused.atMs);
  return { ...paused, atMs: Math.min(paused.duration, next?.atMs ?? paused.duration) };
}
