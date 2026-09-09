import { DAYS, TIME_ZONE, STORAGE_KEY, DEFAULT_SETTINGS, dayInfo, parseConfig, eligibleRestaurants, randomIndex, selectedIndex, spinPlan, readState, mod } from './core.js';
import { animateValue, animateStyle, reducedMotion } from './motion.js';
import { WheelAudio } from './audio.js';

const $ = id => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';
const colors = ['#e8ae77', '#aab58c', '#c5b3d5', '#efd395', '#e39a88', '#b8c9c0', '#c2bf96', '#d6b5a1'];
const sound = new WheelAudio();
let state = { settings: { ...DEFAULT_SETTINGS }, history: [], override: null };
let baseConfig = null;
let config = { version: 1, exampleData: false, restaurants: [] };
let choices = [];
let spinning = false;
let resultActive = false;
let rotation = 0;
let loaded = false;
let loadFailed = false;
let currentDate = dayInfo().iso;
let draft;
let editorMode = 'list';
let dirty = false;
let pendingRemote = false;
let toastTimer;
let pointerAnimation;
const formatDate = (date, options) => new Intl.DateTimeFormat('sv-SE', { timeZone: TIME_ZONE, ...options }).format(date);
const uid = () => globalThis.crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16)).join('-');
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6000);
}
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...state })); return true; }
  catch { toast('Kunde inte spara i webbläsaren. Exportera dina ändringar som JSON.'); return false; }
}
function applyState() {
  config = state.override ?? baseConfig ?? config;
  sound.setEnabled(state.settings.sound);
  render();
}
function reloadState() {
  try { state = readState(localStorage); applyState(); }
  catch { toast('Sparad data kunde inte läsas.'); }
}
function svgElement(tag, attributes, text) {
  const element = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}
function point(radius, angle) {
  const radians = angle * Math.PI / 180;
  return [300 + radius * Math.cos(radians), 300 + radius * Math.sin(radians)];
}
function paintWheel(restaurants) {
  const group = $('segments');
  group.replaceChildren();
  rotation = 0;
  group.setAttribute('transform', 'rotate(0 300 300)');
  const items = restaurants.length ? restaurants : [{ name: '', id: '' }];
  const step = 360 / items.length;
  items.forEach((restaurant, i) => {
    const start = i * step - 90;
    const end = (i + 1) * step - 90;
    const mid = start + step / 2;
    const p1 = point(252, start);
    const p2 = point(252, end);
    const segment = items.length === 1
      ? svgElement('circle', { cx: 300, cy: 300, r: 252, fill: colors[i % colors.length], class: 'wheel-segment' })
      : svgElement('path', { d: `M300 300L${p1}A252 252 0 ${step > 180 ? 1 : 0} 1 ${p2}Z`, fill: colors[i % colors.length], class: 'wheel-segment' });
    segment.append(svgElement('title', {}, restaurant.name));
    group.append(segment);
    const p = point(182, mid);
    const available = 2 * 182 * Math.sin(Math.min(step, 120) * Math.PI / 360) * 0.86;
    const shortName = restaurant.name.length > 24 ? `${restaurant.name.slice(0, 23)}…` : restaurant.name;
    const size = Math.min(17, Math.max(7, available / Math.max(shortName.length * 0.57, 1)));
    const label = svgElement('text', { x: p[0], y: p[1], 'text-anchor': 'middle', 'dominant-baseline': 'middle', transform: `rotate(${mid + 90} ${p[0]} ${p[1]})`, class: 'segment-name', 'font-size': size }, shortName);
    group.append(label);
    if (items.length <= 16) {
      const number = point(230, mid);
      group.append(svgElement('text', { x: number[0], y: number[1], 'text-anchor': 'middle', transform: `rotate(${mid + 90} ${number[0]} ${number[1]})`, class: 'segment-number' }, restaurant.name ? String(i + 1).padStart(2, '0') : ''));
    }
  });
  $('wheel-description').textContent = restaurants.length ? restaurants.map(r => r.name).join(', ') : 'Inga matställen matchar urvalet.';
}
for (let i = 0; i < 72; i++) {
  const a = point(i % 6 === 0 ? 270 : 274, i * 5);
  const b = point(279, i * 5);
  $('rim-ticks').append(svgElement('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }));
}

function render() {
  $('large-groups').checked = state.settings.largeGroups;
  $('outdoor').checked = state.settings.outdoor;
  $('remove-winners').checked = state.settings.removeWinners;
  $('sound').setAttribute('aria-pressed', String(state.settings.sound));
  $('sound').title = state.settings.sound ? 'Stäng av ljud' : 'Slå på ljud';
  $('sound').querySelector('use').setAttribute('href', state.settings.sound ? '#i-volume' : '#i-muted');
  $('history-count').textContent = String(state.history.length);
  $('history-count').hidden = !state.history.length;
  $('today').textContent = formatDate(new Date(), { weekday: 'long' }).toLocaleUpperCase('sv-SE');
  $('footer-date').textContent = formatDate(new Date(), { day: 'numeric', month: 'long', year: 'numeric' }).toLocaleUpperCase('sv-SE');
  $('sample-note').hidden = !config.exampleData;
  if (spinning || resultActive) return;
  choices = eligibleRestaurants(config, state.settings, state.history);
  paintWheel(choices);
  $('spin').disabled = !loaded || choices.length === 0;
  $('spin-label').textContent = choices.length === 1 ? 'Välj matställe' : 'Snurra hjulet';
  $('option-count').textContent = loaded ? `${choices.length} alternativ idag` : 'Laddar matställen…';
  $('wheel-caption').textContent = choices.length ? `${choices.length} matställen · lika stor chans` : 'Dagens lunchhjul';
  $('empty').hidden = !!choices.length || !loaded;
  $('camera').style.opacity = choices.length || !loaded ? '1' : '.3';
  const beforeHistory = eligibleRestaurants(config, { ...state.settings, removeWinners: false }, []).length;
  const exhausted = !choices.length && state.settings.removeWinners && beforeHistory > 0;
  $('empty-title').textContent = loadFailed && !config.restaurants.length ? 'Matställena kunde inte laddas' : exhausted ? 'Alla har vunnit.' : 'Inga alternativ idag';
  $('empty-description').textContent = exhausted ? 'Låt tidigare vinnare vara med igen.' : 'Ändra filter eller matställen.';
  $('empty-action').textContent = exhausted ? 'Visa tidigare vinnare' : 'Ändra matställen';
  $('empty-action').dataset.action = exhausted ? 'include-winners' : 'edit';
}
function setSpinLock(locked) {
  $('filters').disabled = locked;
  for (const id of ['spin', 'editor-open', 'history-open', 'sample-note']) $(id).disabled = locked;
  document.body.classList.toggle('is-spinning', locked);
  $('stage').setAttribute('aria-busy', String(locked));
}

async function spin() {
  if (spinning || resultActive) return;
  render(); // Re-evaluate the Stockholm date at the moment of the click.
  if (!loaded || !choices.length) return;
  spinning = true;
  setSpinLock(true);
  if (matchMedia('(max-width: 720px)').matches) $('stage').scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'instant' : 'smooth' });
  $('spin-label').textContent = 'Snurrar…';
  $('announcement').textContent = 'Hjulet snurrar.';
  void sound.unlock(); // Called directly from a user gesture, including on iOS.
  const frozen = [...choices];
  const winnerIndex = randomIndex(frozen.length);
  const winner = frozen[winnerIndex];
  const plan = spinPlan(rotation, frozen.length, winnerIndex, randomIndex(10001) / 10000, 5 + randomIndex(3));
  let dramatic = false;
  let previous = selectedIndex(rotation, frozen.length);
  const calm = reducedMotion() || frozen.length === 1;
  try {
    if (calm) {
      await animateValue(0, 1, { duration: 0.4, onUpdate: () => {} });
    } else {
      await animateValue(rotation, plan.end, {
        duration: 8.4, ease: t => 1 - (1 - t) ** 4,
        onUpdate(value) {
          rotation = value;
          $('segments').setAttribute('transform', `rotate(${value} 300 300)`);
          if (!dramatic && plan.end - value <= plan.zoomAt) {
            dramatic = true;
            document.body.classList.add('is-dramatic');
            void animateStyle($('camera'), { transform: ['scale(1)', 'scale(1.72)'] }, { duration: 0.95 });
          }
          const current = selectedIndex(value, frozen.length);
          if (current !== previous) {
            previous = current;
            $('wheel-caption').textContent = frozen[current].name;
            sound.tick(dramatic);
            pointerAnimation?.stop();
            pointerAnimation = animateStyle($('pointer'), { transform: ['rotate(-8deg)', 'rotate(0deg)'] }, { duration: 0.14 });
          }
        },
      });
    }
    rotation = mod(plan.end, 360);
    $('segments').setAttribute('transform', `rotate(${rotation} 300 300)`);
    $('wheel-caption').textContent = winner.name;
    if (pendingRemote) { pendingRemote = false; reloadState(); }
    const entry = { id: uid(), restaurantId: winner.id, name: winner.name, at: new Date().toISOString() };
    state.history.unshift(entry);
    persist();
    resultActive = true;
    sound.win();
    $('winner-title').textContent = winner.name;
    $('winner-date').textContent = formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long' });
    $('winner-link').href = winner.url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${winner.name} Linköping`)}`;
    $('winner-link').firstChild.textContent = winner.url ? 'Till matstället ' : 'Hitta hit ';
    $('winner-dialog').showModal();
    $('announcement').textContent = `Det blir ${winner.name}.`;
    $('confetti').replaceChildren();
    if (!calm) {
      for (let i = 0; i < 18; i++) {
        const piece = document.createElement('i');
        piece.style.cssText = `left:${4 + i * 5.2}%;background:${colors[i % colors.length]};animation-delay:${(i % 5) * 0.07}s;`;
        $('confetti').append(piece);
      }
    }
  } catch (error) {
    console.error('Snurren avbröts:', error);
    toast('Snurren kunde inte avslutas. Försök igen.');
  } finally {
    spinning = false;
    setSpinLock(false);
    document.body.classList.remove('is-dramatic');
    if (dramatic) void animateStyle($('camera'), { transform: ['scale(1.72)', 'scale(1)'] }, { duration: 0.6 });
    $('spin').disabled = resultActive;
    render();
  }
}

function closeDialog(id) {
  if (id === 'editor-dialog' && dirty && !confirm('Stäng utan att spara ändringarna?')) return;
  $(id).close();
}
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => closeDialog(button.dataset.close));
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => {
  const bounds = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) closeDialog(dialog.id);
});
$('winner-dialog').addEventListener('close', () => { resultActive = false; render(); $('spin').focus(); });
$('again').addEventListener('click', () => {
  $('winner-dialog').close();
  resultActive = false;
  render();
  // Let the queued close event finish before starting the next animation.
  requestAnimationFrame(() => { void spin(); });
});
$('spin').addEventListener('click', () => { void spin(); });
for (const [id, key] of [['large-groups', 'largeGroups'], ['outdoor', 'outdoor'], ['remove-winners', 'removeWinners']]) {
  $(id).addEventListener('change', event => { state.settings[key] = event.target.checked; persist(); render(); });
}
$('sound').addEventListener('click', () => {
  state.settings.sound = !state.settings.sound;
  sound.setEnabled(state.settings.sound);
  if (state.settings.sound) void sound.unlock();
  persist(); render();
});
$('empty-action').addEventListener('click', () => {
  if ($('empty-action').dataset.action === 'include-winners') { state.settings.removeWinners = false; persist(); render(); }
  else openEditor();
});

function renderHistory() {
  const list = $('history-list');
  list.replaceChildren();
  if (!state.history.length) {
    const p = document.createElement('p'); p.className = 'history-empty'; p.textContent = 'Dina vinnare dyker upp här.'; list.append(p);
  }
  state.history.forEach((entry, index) => {
    const row = document.createElement('article'); row.className = 'history-item';
    row.innerHTML = `<span class="history-number">${String(state.history.length - index).padStart(2, '0')}</span><div><h3>${escape(entry.name)}</h3><time datetime="${escape(entry.at)}">${escape(formatDate(new Date(entry.at), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', year: 'numeric' }))}</time></div><button type="button" class="icon-button" aria-label="Ta bort ${escape(entry.name)} ur historiken"><svg class="icon" aria-hidden="true"><use href="#i-trash"/></svg></button>`;
    row.querySelector('button').addEventListener('click', () => { state.history = state.history.filter(h => h.id !== entry.id); persist(); renderHistory(); render(); });
    list.append(row);
  });
  $('clear-history').disabled = state.history.length === 0;
}
$('history-open').addEventListener('click', () => { renderHistory(); $('history-dialog').showModal(); });
$('clear-history').addEventListener('click', () => {
  if (!confirm('Rensa hela historiken? Tidigare vinnare kommer med i hjulet igen.')) return;
  state.history = []; persist(); renderHistory(); render();
});

function editorError(message = '') { $('editor-error').textContent = message; $('editor-error').hidden = !message; }
function renderRestaurantList() {
  $('restaurant-list').innerHTML = draft.restaurants.map((r, index) => `
    <details class="restaurant-card" data-index="${index}">
      <summary><span class="restaurant-name">${escape(r.name)}</span><small>${r.openDays.map(day => DAYS[day - 1]).join(' · ') || 'Inga veckodagar'}</small></summary>
      <div class="restaurant-fields">
        <label class="field-label" for="name-${index}">Namn</label><input class="field-input" id="name-${index}" data-field="name" value="${escape(r.name)}" maxlength="50" autocomplete="off">
        <span class="field-label">Lunchdagar</span><div class="day-buttons" role="group" aria-label="Lunchdagar för ${escape(r.name)}">${DAYS.map((day, i) => `<button type="button" data-day="${i + 1}" aria-label="${['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lördag', 'Söndag'][i]}" aria-pressed="${r.openDays.includes(i + 1)}">${day}</button>`).join('')}</div>
        <div class="restaurant-flags">${[['enabled', 'Med i hjulet'], ['largeGroups', 'Stort sällskap'], ['outdoor', 'Uteservering']].map(([key, label]) => `<label><input type="checkbox" data-field="${key}" ${r[key] ? 'checked' : ''}>${label}</label>`).join('')}</div>
        <label class="field-label" for="url-${index}">Webbadress (valfritt)</label><input class="field-input" id="url-${index}" data-field="url" type="url" value="${escape(r.url)}" placeholder="https://" autocomplete="off">
        <div class="date-fields"><div><label class="field-label" for="closed-${index}">Stängt: datum, separera med komma</label><input class="field-input" id="closed-${index}" data-field="closedDates" value="${escape(r.closedDates.join(', '))}" placeholder="2026-12-24, 2026-12-25"></div><div><label class="field-label" for="extra-${index}">Extra öppet: datum, separera med komma</label><input class="field-input" id="extra-${index}" data-field="extraOpenDates" value="${escape(r.extraOpenDates.join(', '))}" placeholder="2026-12-26"></div></div>
        <div class="restaurant-bottom"><button class="text-button danger" type="button" data-delete="${index}">Ta bort matställe</button></div>
      </div>
    </details>`).join('');
  $('example-warning').hidden = !draft.exampleData;
}
function captureDraft() {
  return parseConfig(editorMode === 'json' ? $('json-editor').value : draft);
}
function setEditorMode(mode) {
  if (mode !== editorMode) {
    try { draft = captureDraft(); } catch (error) { editorError(error.message); return; }
  }
  editorError(); editorMode = mode;
  $('list-panel').hidden = mode !== 'list'; $('json-panel').hidden = mode !== 'json';
  for (const current of ['list', 'json']) {
    $(`${current}-tab`).setAttribute('aria-selected', String(mode === current));
    $(`${current}-tab`).tabIndex = mode === current ? 0 : -1;
  }
  if (mode === 'list') renderRestaurantList();
  else $('json-editor').value = JSON.stringify(draft, null, 2);
}
function openEditor() {
  if (spinning) return;
  draft = structuredClone(config); dirty = false; editorMode = 'list'; setEditorMode('list');
  $('editor-dialog').showModal();
}
$('editor-open').addEventListener('click', openEditor);
$('sample-note').addEventListener('click', openEditor);
$('editor-dialog').addEventListener('cancel', event => {
  if (dirty && !confirm('Stäng utan att spara ändringarna?')) event.preventDefault();
});
$('editor-dialog').addEventListener('close', () => { dirty = false; });
for (const mode of ['list', 'json']) {
  $(`${mode}-tab`).addEventListener('click', () => setEditorMode(mode));
  $(`${mode}-tab`).addEventListener('keydown', event => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      setEditorMode(event.key === 'Home' ? 'list' : event.key === 'End' ? 'json' : mode === 'list' ? 'json' : 'list');
      $(`${editorMode}-tab`).focus();
    }
  });
}
$('restaurant-list').addEventListener('input', event => {
  const field = event.target.dataset.field;
  if (!field) return;
  const card = event.target.closest('[data-index]');
  const restaurant = draft.restaurants[Number(card.dataset.index)];
  restaurant[field] = event.target.type === 'checkbox' ? event.target.checked
    : ['closedDates', 'extraOpenDates'].includes(field) ? event.target.value.split(',').map(v => v.trim()).filter(Boolean) : event.target.value;
  if (field === 'name') card.querySelector('.restaurant-name').textContent = event.target.value;
  dirty = true;
});
$('restaurant-list').addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  const card = button.closest('[data-index]');
  const index = Number(card.dataset.index); const restaurant = draft.restaurants[index];
  if (button.dataset.day) {
    const day = Number(button.dataset.day);
    restaurant.openDays = restaurant.openDays.includes(day) ? restaurant.openDays.filter(d => d !== day) : [...restaurant.openDays, day].sort((a, b) => a - b);
    button.setAttribute('aria-pressed', String(restaurant.openDays.includes(day)));
    card.querySelector('small').textContent = restaurant.openDays.map(d => DAYS[d - 1]).join(' · ') || 'Inga veckodagar';
    dirty = true;
  } else if (button.dataset.delete !== undefined && confirm(`Ta bort ${restaurant.name}?`)) {
    draft.restaurants.splice(index, 1); dirty = true; renderRestaurantList();
  }
});
$('json-editor').addEventListener('input', () => { dirty = true; });
$('add-restaurant').addEventListener('click', () => {
  if (draft.restaurants.length >= 48) { editorError('Högst 48 matställen får plats.'); return; }
  draft.restaurants.push({ id: uid(), name: 'Nytt matställe', enabled: true, largeGroups: false, outdoor: false, openDays: [1, 2, 3, 4, 5], closedDates: [], extraOpenDates: [], url: '' });
  dirty = true; renderRestaurantList();
  const card = $('restaurant-list').lastElementChild; card.open = true;
  const input = card.querySelector('input'); input.focus(); input.select();
});
$('save').addEventListener('click', () => {
  try {
    const next = captureDraft();
    state.override = next; config = next; loaded = true; loadFailed = false;
    const saved = persist(); dirty = false; $('editor-dialog').close(); render();
    if (saved) toast('Matställena har sparats.');
  } catch (error) { editorError(error.message); }
});
$('restore').addEventListener('click', () => {
  if (!baseConfig) { editorError('Originalfilen kunde inte laddas. Ladda om sidan eller importera en JSON-fil.'); return; }
  if (!confirm('Återställ till data/restaurants.json? Dina lokala matställen ersätts. Historiken behålls.')) return;
  state.override = null; config = structuredClone(baseConfig); persist(); dirty = false; $('editor-dialog').close(); render();
});
$('import').addEventListener('click', () => $('import-file').click());
$('import-file').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (file.size > 256 * 1024) throw new Error('Filen får vara högst 256 kB.');
    const next = parseConfig(await file.text());
    if (dirty && !confirm('Ersätt dina osparade ändringar med filen?')) return;
    draft = next; dirty = true; editorMode = 'list'; setEditorMode('list');
  } catch (error) { editorError(`Importen misslyckades. ${error.message}`); }
  finally { event.target.value = ''; }
});
$('export').addEventListener('click', () => {
  try {
    const data = captureDraft();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'restaurants.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); editorError();
  } catch (error) { editorError(error.message); }
});

function checkDate() {
  const next = dayInfo().iso;
  if (next !== currentDate) { currentDate = next; render(); }
}
setInterval(checkDate, 30000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkDate();
});
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  if (spinning) { pendingRemote = true; return; }
  reloadState();
  if ($('history-dialog').open) renderHistory();
});

async function init() {
  try { state = readState(localStorage); }
  catch { toast('Sparad data kunde inte läsas. Den här sessionen börjar utan historik.'); }
  if (state.override) { config = state.override; loaded = true; }
  sound.setEnabled(state.settings.sound); render();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(new URL('../data/restaurants.json', import.meta.url), { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    baseConfig = parseConfig(await response.json());
    config = state.override ?? baseConfig;
  } catch {
    loadFailed = true;
    if (!state.override) toast('Matställena kunde inte laddas. Importera en JSON-fil via Matställen.');
  } finally {
    clearTimeout(timeout); loaded = true; render();
  }
}
void init();
