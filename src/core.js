/** Pure data / wheel logic. ISO weekdays: Monday=1, Sunday=7. */
export const STORAGE_KEY = 'lunchhjulet:v1';
export const TIME_ZONE = 'Europe/Stockholm';
export const MAX_RESTAURANTS = 200;
export const DAYS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
/** Add future decision methods here; app.js registers their run handlers. */
export const DECISION_MODES = Object.freeze([
  Object.freeze({ id: 'wheel', label: 'Lunchhjul', action: 'Snurra hjulet', again: 'Snurra igen' }),
  Object.freeze({ id: 'slots', label: 'Enarmad bandit', action: 'Dra i spaken', again: 'Dra igen' }),
]);
export const DEFAULT_SETTINGS = Object.freeze({ mode: 'wheel', largeGroups: false, outdoor: false, removeWinners: true, sound: true });
export const mod = (n, m) => ((n % m) + m) % m;

export function dayInfo(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = type => parts.find(p => p.type === type).value;
  const iso = `${get('year')}-${get('month')}-${get('day')}`;
  return { iso, weekday: new Date(`${iso}T12:00:00Z`).getUTCDay() || 7 };
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function parseConfig(input) {
  let data = input;
  if (typeof input === 'string') {
    try { data = JSON.parse(input); }
    catch { throw new Error('JSON kunde inte läsas. Kontrollera kommatecken, citattecken och klamrar.'); }
  }
  if (!data || data.version !== 1 || !Array.isArray(data.restaurants)) {
    throw new Error('JSON måste ha version: 1 och en lista som heter restaurants.');
  }
  if (data.restaurants.length > MAX_RESTAURANTS) throw new Error(`Högst ${MAX_RESTAURANTS} matställen får plats.`);
  if (data.exampleData !== undefined && typeof data.exampleData !== 'boolean') throw new Error('exampleData ska vara true eller false.');
  const ids = new Set();
  const restaurants = data.restaurants.map((r, index) => {
    const label = `Matställe ${index + 1}`;
    if (!r || typeof r !== 'object') throw new Error(`${label}: ogiltigt matställe.`);
    if (typeof r.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(r.id) || ids.has(r.id)) {
      throw new Error(`${label}: id måste vara unikt och bara innehålla bokstäver, siffror, - eller _.`);
    }
    ids.add(r.id);
    if (typeof r.name !== 'string' || !r.name.trim() || r.name.trim().length > 50) throw new Error(`${label}: namnet måste ha 1–50 tecken.`);
    for (const flag of ['largeGroups', 'outdoor']) {
      if (r[flag] !== null && typeof r[flag] !== 'boolean') throw new Error(`${r.name}: ${flag} ska vara true, false eller null (okänt).`);
    }
    if (r.enabled !== undefined && typeof r.enabled !== 'boolean') throw new Error(`${r.name}: enabled ska vara true eller false.`);
    if (r.openDays !== null && (!Array.isArray(r.openDays) || !r.openDays.every(d => Number.isInteger(d) && d >= 1 && d <= 7))) {
      throw new Error(`${r.name}: openDays ska vara null (okänt) eller en lista med veckodagar 1–7 (måndag–söndag).`);
    }
    const dates = key => {
      const values = r[key] ?? [];
      if (!Array.isArray(values) || values.length > 366 || !values.every(validDate)) throw new Error(`${r.name}: ${key} måste innehålla riktiga datum, ÅÅÅÅ-MM-DD.`);
      return [...new Set(values)].sort();
    };
    const url = r.url ?? '';
    if (typeof url !== 'string' || url.length > 2000) throw new Error(`${r.name}: ogiltig webbadress.`);
    if (url) {
      let parsed;
      try { parsed = new URL(url); } catch { throw new Error(`${r.name}: ogiltig webbadress.`); }
      if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error(`${r.name}: använd en http- eller https-adress.`);
    }
    return {
      id: r.id, name: r.name.trim(), enabled: r.enabled ?? true,
      largeGroups: r.largeGroups, outdoor: r.outdoor,
      openDays: r.openDays === null ? null : [...new Set(r.openDays)].sort((a, b) => a - b),
      closedDates: dates('closedDates'), extraOpenDates: dates('extraOpenDates'), url,
    };
  });
  return { version: 1, exampleData: data.exampleData ?? false, restaurants };
}

export function lunchDaysLabel(openDays) {
  return openDays === null ? 'Lunchdagar okända' : openDays.map(day => DAYS[day - 1]).join(' · ') || 'Inga veckodagar';
}

/** Schedule eligibility, not a guarantee of actual opening hours.
 * Unknown lunch days stay selectable; the UI explicitly discloses this.
 */
export function isOpen(restaurant, date = new Date()) {
  const { iso, weekday } = dayInfo(date);
  // An explicit closure wins over both a regular weekday and an extra opening.
  return restaurant.enabled && !restaurant.closedDates.includes(iso)
    && (restaurant.extraOpenDates.includes(iso) || restaurant.openDays === null || restaurant.openDays.includes(weekday));
}

export function eligibleRestaurants(config, settings, history, date = new Date()) {
  const past = new Set(history.map(h => h.restaurantId));
  return config.restaurants.filter(r => isOpen(r, date)
    && (!settings.largeGroups || r.largeGroups === true)
    && (!settings.outdoor || r.outdoor === true)
    && (!settings.removeWinners || !past.has(r.id)));
}

/** Rejection sampling avoids the small bias of uint32 % count. */
export function randomIndex(count, fill = array => globalThis.crypto.getRandomValues(array)) {
  if (!Number.isInteger(count) || count < 1 || count > 0x100000000) throw new Error('Ogiltigt antal alternativ.');
  const limit = Math.floor(0x100000000 / count) * count;
  const value = new Uint32Array(1);
  do { fill(value); } while (value[0] >= limit);
  return value[0] % count;
}

export function selectedIndex(rotation, count) {
  return Math.min(count - 1, Math.floor(mod(-rotation, 360) / (360 / count)));
}

export function spinPlan(start, count, winner, jitter = 0.5, turns = 6) {
  if (count < 1 || winner < 0 || winner >= count || jitter < 0 || jitter > 1) throw new Error('Ogiltig snurr.');
  const segment = 360 / count;
  // Keep the landing well away from a segment boundary.
  const landing = mod(-(winner + 0.5 + (jitter - 0.5) * 0.36) * segment, 360);
  const end = start + turns * 360 + mod(landing - mod(start, 360), 360);
  return { end, segment, zoomAt: segment * 2.75 };
}

export function readState(storage) {
  const empty = { settings: { ...DEFAULT_SETTINGS }, history: [], override: null };
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return empty;
  const s = JSON.parse(raw);
  if (!s || s.version !== 1) throw new Error('Sparad data har ett okänt format.');
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (typeof DEFAULT_SETTINGS[key] === 'boolean' && typeof s.settings?.[key] === 'boolean') empty.settings[key] = s.settings[key];
  }
  if (DECISION_MODES.some(mode => mode.id === s.settings?.mode)) empty.settings.mode = s.settings.mode;
  if (!Array.isArray(s.history)) throw new Error('Historiken kunde inte läsas.');
  const ids = new Set();
  empty.history = s.history.filter(h => h && typeof h.id === 'string' && !ids.has(h.id)
    && typeof h.restaurantId === 'string' && typeof h.name === 'string' && h.name.length <= 50
    && typeof h.at === 'string' && !Number.isNaN(Date.parse(h.at)) && ids.add(h.id));
  if (s.override) empty.override = parseConfig(s.override);
  return empty;
}
