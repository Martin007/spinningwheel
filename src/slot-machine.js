import { randomIndex, mod } from './core.js';
import { animateValue, reducedMotion } from './motion.js';
import { reelProgress, slotWinner, SLOT_MATCH_DENOMINATOR } from './slot-core.js';

/** Presentation only: never selects a winner or writes history. */
export function createSlotMachine(host, audio, onPull) {
  const root = document.createElement('div');
  root.id = 'slot-machine'; root.className = 'slot-scene'; root.hidden = true;
  root.innerHTML = `
    <div class="slot-cabinet">
      <div class="slot-marquee" aria-hidden="true">
        <div class="slot-stars"><span>✦</span><span>✦</span><span>✦</span></div>
        <div class="slot-logotype">lunch<span>.</span></div><div class="slot-subtitle">BANDITEN</div>
      </div>
      <div class="slot-bezel">
        <div class="slot-lights" aria-hidden="true">${Array.from({ length: 20 }, (_, i) => `<i style="--lamp:${i}"></i>`).join('')}</div>
        <div class="slot-glass" role="group" aria-label="Tre rullar. Mittraden är vinstraden.">
          ${[1, 2, 3].map(n => `<div class="slot-reel" role="img" aria-label="Rulle ${n}"><div class="reel-strip" aria-hidden="true"></div><span class="reel-shade" aria-hidden="true"></span></div>`).join('')}
          <div class="slot-payline" aria-hidden="true"><span></span><span></span></div>
        </div>
        <div class="slot-payline-label" aria-hidden="true">VINSTRAD</div>
      </div>
      <div class="slot-console"><span class="slot-grille" aria-hidden="true"></span><output id="slot-status" role="status" aria-live="polite">3 lika = lunch</output><span class="slot-grille" aria-hidden="true"></span></div>
      <div class="slot-foot" aria-hidden="true"><i></i><span>✦</span><i></i></div>
    </div>
    <button id="slot-lever" class="slot-lever" type="button" aria-label="Dra i spaken" title="Klicka eller dra nedåt" disabled>
      <span class="lever-socket" aria-hidden="true"></span><span class="lever-arm" aria-hidden="true"><span class="lever-ball"></span></span><span class="lever-direction" aria-hidden="true">↓</span>
    </button>
    <details class="slot-rules"><summary aria-label="Så fungerar banditen">i</summary><p>Tre lika på mittraden väljer lunch. Annars drar du igen. Träffchansen är 1 på ${SLOT_MATCH_DENOMINATOR} per drag, oavsett antal matställen. Alla har lika stor chans att vinna. Ett ensamt alternativ vinner direkt.</p></details>`;
  host.insertBefore(root, host.querySelector('#empty'));
  const lever = root.querySelector('#slot-lever');
  const reels = [...root.querySelectorAll('.slot-reel')];
  const status = root.querySelector('#slot-status');
  let signature = null;
  let active = false;
  let visibleIndices = [0, 1, 2];
  let drag = null;
  let suppressClickUntil = 0;

  function symbol(restaurant) {
    const cell = document.createElement('div'); cell.className = 'reel-symbol';
    if (!restaurant) { cell.classList.add('symbol-empty'); cell.textContent = '✦'; return cell; }
    // Stable colors/initials are cosmetic; matching uses the full restaurant ID.
    let hash = 0; for (const char of restaurant.id) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
    cell.dataset.restaurantId = restaurant.id; cell.title = restaurant.name;
    cell.dataset.tone = String(hash % 4);
    const emblem = document.createElement('span'); emblem.className = 'symbol-emblem';
    const initials = restaurant.name.split(/[\s&]+/).filter(Boolean).slice(0, 2).map(word => Array.from(word)[0]).join('');
    emblem.textContent = initials.toLocaleUpperCase('sv-SE');
    const name = document.createElement('span'); name.className = 'symbol-name'; name.textContent = restaurant.name;
    cell.append(emblem, name);
    return cell;
  }
  function settle(reel, index, restaurants, number) {
    const strip = reel.querySelector('.reel-strip');
    strip.replaceChildren(...[-1, 0, 1].map(delta => symbol(restaurants[mod(index + delta, restaurants.length)])));
    strip.style.transform = 'translate3d(0,0,0)';
    const name = restaurants[index]?.name ?? 'Inga alternativ';
    reel.setAttribute('aria-label', `Rulle ${number + 1}: ${name}`);
    reel.dataset.restaurantId = restaurants[index]?.id ?? '';
    reel.classList.remove('is-rolling');
  }
  function render(restaurants) {
    const next = JSON.stringify(restaurants.map(r => [r.id, r.name]));
    if (active || next === signature) return;
    signature = next;
    root.classList.remove('slot-hit', 'slot-miss');
    status.textContent = restaurants.length ? '3 lika = lunch' : 'Inga alternativ';
    visibleIndices = [0, 1, 2].map(i => restaurants.length ? i % restaurants.length : 0);
    reels.forEach((reel, i) => settle(reel, visibleIndices[i], restaurants, i));
  }
  function setLocked(locked) { lever.disabled = locked; }
  async function animateLever() {
    if (reducedMotion()) return;
    await animateValue(0, 1, { duration: 0.14, onUpdate: n => lever.style.setProperty('--pull', n) });
    await animateValue(1, 0, { duration: 0.38, ease: t => 1 - (1 - t) ** 3, onUpdate: n => lever.style.setProperty('--pull', n) });
  }
  async function spin(restaurants, indices) {
    if (active) throw new Error('Banditen snurrar redan.');
    if (indices.length !== 3 || indices.some(i => !Number.isInteger(i) || !restaurants[i])) throw new Error('Ogiltig vinstrad.');
    active = true; root.classList.remove('slot-hit', 'slot-miss'); root.classList.add('slot-running');
    setLocked(true); status.textContent = 'Rullarna snurrar…';
    const calm = reducedMotion() || restaurants.length === 1;
    // Unlock starts synchronously within the original click. Audio never gates animation.
    void audio.unlock().then(() => { if (active && !document.hidden) { audio.pull(); if (!calm) audio.startReels(); } });
    if (!calm) void animateLever();
    try {
      await Promise.all(reels.map(async (reel, column) => {
        const strip = reel.querySelector('.reel-strip');
        const target = indices[column];
        if (calm) {
          await animateValue(0, 1, { duration: 0.25, onUpdate() {} });
        } else {
          const steps = 30 + column * 8;
          const rows = Array.from({ length: steps + 3 }, () => restaurants[randomIndex(restaurants.length)]);
          // Physical strip: the old row starts centered, the planned row ends centered.
          [-1, 0, 1].forEach((delta, i) => {
            rows[i] = restaurants[mod(target + delta, restaurants.length)];
            rows[steps + i] = restaurants[mod(visibleIndices[column] + delta, restaurants.length)];
          });
          strip.replaceChildren(...rows.map(symbol));
          strip.style.transform = `translate3d(0,${-steps / rows.length * 100}%,0)`;
          reel.classList.add('is-rolling');
          reel.setAttribute('aria-label', `Rulle ${column + 1} snurrar`);
          let lastStep = 0;
          await animateValue(0, steps, {
            duration: 2.9 + column * 0.8, ease: reelProgress,
            onUpdate(value) {
              strip.style.transform = `translate3d(0,${(value - steps) / rows.length * 100}%,0)`;
              // Blur only at speed, leaving the last symbols sharp and readable.
              reel.classList.toggle('at-speed', value > 2 && value < steps - 2);
              if (Math.floor(value) !== lastStep) { lastStep = Math.floor(value); if (!document.hidden) audio.reelTick(); }
            },
          });
        }
        settle(reel, target, restaurants, column);
        reel.classList.remove('at-speed');
        if (!document.hidden) audio.reelStop(column);
        if (!calm) {
          await animateValue(0, 1, { duration: 0.18, onUpdate: n => {
            strip.style.transform = `translate3d(0,${Math.sin(n * Math.PI) * 3}px,0)`;
          } });
          strip.style.transform = 'translate3d(0,0,0)';
        }
      }));
      visibleIndices = [...indices];
      const hit = slotWinner(indices) !== null;
      root.classList.add(hit ? 'slot-hit' : 'slot-miss');
      status.textContent = hit ? 'Tre lika. Lunchen är klar!' : 'Ingen träff. Dra igen.';
      if (!hit && !document.hidden) audio.miss();
      return [...indices];
    } finally {
      active = false; audio.stopReels(); root.classList.remove('slot-running');
      reels.forEach(reel => reel.classList.remove('at-speed', 'is-rolling'));
      // App owns the lock until the shared winner dialog or error recovery is ready.
    }
  }

  lever.addEventListener('click', () => {
    if (performance.now() < suppressClickUntil || lever.disabled) return;
    onPull();
  });
  lever.addEventListener('pointerdown', event => {
    if (lever.disabled || event.button !== 0 || !event.isPrimary) return;
    drag = { id: event.pointerId, start: event.clientY, distance: 0 };
    lever.setPointerCapture(event.pointerId);
  });
  lever.addEventListener('pointermove', event => {
    if (!drag || drag.id !== event.pointerId) return;
    drag.distance = Math.max(0, event.clientY - drag.start);
    lever.style.setProperty('--pull', Math.min(1, drag.distance / 80));
  });
  function endDrag(event, cancelled = false) {
    if (!drag || drag.id !== event.pointerId) return;
    const distance = drag.distance; drag = null;
    if (lever.hasPointerCapture(event.pointerId)) lever.releasePointerCapture(event.pointerId);
    lever.style.setProperty('--pull', 0);
    if (cancelled || distance > 8) suppressClickUntil = performance.now() + 500;
    if (!cancelled && distance >= 38 && !lever.disabled) onPull();
  }
  lever.addEventListener('pointerup', event => endDrag(event));
  lever.addEventListener('pointercancel', event => endDrag(event, true));
  lever.addEventListener('lostpointercapture', event => endDrag(event, true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) audio.stopReels(); });
  window.addEventListener('pagehide', () => audio.stopReels());
  return { root, render, spin, setLocked, status };
}
