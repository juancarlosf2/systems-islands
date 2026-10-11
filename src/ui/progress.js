const KEY = 'systems-islands-progress';
export function loadProgress() {
  const defaults = { stars: {}, settings: { sound: false, reducedMotion: typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) } };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved?.version !== 1 || !saved.stars || typeof saved.stars !== 'object' || Array.isArray(saved.stars)) return defaults;
    const stars = {};
    for (let id = 1; id <= 16; id++) {
      const value = saved.stars[id];
      if (Number.isInteger(value) && value >= 1 && value <= 3) stars[id] = value;
    }
    return { stars, settings: { sound: saved.settings?.sound === true, reducedMotion: typeof saved.settings?.reducedMotion === 'boolean' ? saved.settings.reducedMotion : defaults.settings.reducedMotion } };
  } catch { return defaults; }
}
export function saveProgress(progress) {
  try { localStorage.setItem(KEY, JSON.stringify({ version: 1, ...progress })); return true; }
  catch { return false; }
}
