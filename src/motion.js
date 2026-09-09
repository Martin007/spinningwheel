/** Motion is loaded without blocking the UI. Native animation is an offline/CDN-failure fallback. */
let engine;
export const motionReady = import('https://cdn.jsdelivr.net/npm/motion@12.23.24/+esm')
  .then(module => { engine = module; return true; })
  .catch(() => false);
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function animateValue(from, to, { duration = 1, ease = t => t, onUpdate }) {
  if (engine) return engine.animate(from, to, { duration, ease, onUpdate });
  let frame;
  let began;
  const promise = new Promise(resolve => {
    function tick(now) {
      began ??= now;
      const progress = Math.min(1, (now - began) / (duration * 1000));
      onUpdate(from + (to - from) * ease(progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else resolve();
    }
    frame = requestAnimationFrame(tick);
  });
  return { then: promise.then.bind(promise), stop: () => cancelAnimationFrame(frame) };
}

export function animateStyle(element, frames, options = {}) {
  if (engine) return engine.animate(element, frames, options);
  const native = element.animate(frames, {
    duration: (options.duration ?? 0.3) * 1000,
    easing: 'ease-out', fill: 'forwards',
  });
  const finished = native.finished.catch(() => {});
  return { then: finished.then.bind(finished), stop: () => native.cancel() };
}
