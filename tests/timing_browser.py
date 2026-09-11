"""Deterministic timing checks against the real application code and HTML.

Run: python3 tests/timing_browser.py (requires Playwright and Chromium).
Uses a controlled RAF clock plus explicit fetch/storage/audio doubles. This is
not a visual-layout, HTTP/CDN integration, or audible-sound test.
"""
import json
import os
import re
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
DATA = {'version': 1, 'restaurants': [
    {'id': f'lunch-{i}', 'name': f'Lunch {i}', 'enabled': True,
     'largeGroups': True, 'outdoor': True, 'openDays': None,
     'closedDates': [], 'extraOpenDates': [], 'url': ''}
    for i in range(34)
]}
SETUP = r"""
window.__clock = { now: 0, next: 0, pending: new Map() };
window.requestAnimationFrame = callback => {
  const id = ++__clock.next; __clock.pending.set(id, callback); return id;
};
window.cancelAnimationFrame = id => __clock.pending.delete(id);
window.__advance = async seconds => {
  const target = __clock.now + seconds * 1000;
  do {
    __clock.now = Math.min(target, __clock.now + 50);
    const callbacks = [...__clock.pending.values()]; __clock.pending.clear();
    for (const callback of callbacks) callback(__clock.now);
    for (let i = 0; i < 12; i++) await Promise.resolve();
  } while (__clock.now < target);
};
const values = new Map();
Object.defineProperty(window, 'localStorage', { configurable: true, value: {
  getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value))
}});
window.fetch = async () => ({ ok: true, json: async () => structuredClone(window.__fixture) });
window.AudioContext = undefined; window.webkitAudioContext = undefined;
window.__draws = [];
const originalRandom = crypto.getRandomValues.bind(crypto);
crypto.getRandomValues = array => {
  if (__draws.length) { array.fill(0); array[0] = __draws.shift(); return array; }
  return originalRandom(array);
};
window.__stops = [];
"""


def mount(browser, *, mode='wheel', calm=False, singleton=False):
    page = browser.new_page()
    page.emulate_media(reduced_motion='reduce' if calm else 'no-preference')
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    html = re.sub(r'<script type="module".*?</script>', '', (ROOT / 'index.html').read_text())
    html = re.sub(r'<link\b[^>]*>', '', html)
    page.set_content(html)
    data = {**DATA, 'restaurants': DATA['restaurants'][:1]} if singleton else DATA
    page.evaluate('(data) => window.__fixture = data', data)
    bundle = []
    for name in ['core', 'motion', 'audio', 'slot-core', 'slot-machine', 'app']:
        source = (ROOT / f'src/{name}.js').read_text()
        source = re.sub(r'^import .*?;\n', '', source, flags=re.M)
        source = re.sub(r'\bexport ', '', source)
        if name == 'motion':
            source = re.sub(r"const motionReady = import\([\s\S]*?\.catch\(\(\) => false\);",
                            'const motionReady = Promise.resolve(false);', source)
        source = source.replace('import.meta.url', "'https://fixture.test/src/app.js'")
        bundle.append(source)
    page.add_script_tag(content=SETUP + '\n(() => {\n' + '\n'.join(bundle) + '''
      WheelAudio.prototype.reelStop = column => window.__stops.push({ column, at: __clock.now });
      window.__history = () => state.history;
    })();''')
    page.wait_for_function("document.querySelector('#option-count').textContent.includes('alternativ')", polling=50)
    page.evaluate("mode => { const el = document.querySelector('#decision-mode'); el.value = mode; el.dispatchEvent(new Event('change')); }", mode)
    return page, errors


def advance(page, seconds):
    page.evaluate('seconds => window.__advance(seconds)', seconds)


def start(page, draws):
    page.evaluate('draws => { window.__draws = draws; document.querySelector("#spin").click(); }', draws)
    advance(page, 0)


def history_count(page):
    return page.evaluate('window.__history().length')


def wheel(browser):
    page, errors = mount(browser)
    start(page, [0, 0, 0])
    advance(page, 8.4)
    assert page.evaluate('document.querySelector("#spin").disabled')
    assert history_count(page) == 0
    advance(page, 33.1)  # 41.5 seconds: final zoom, but still no winner.
    assert page.evaluate('document.body.classList.contains("is-dramatic")')
    assert history_count(page) == 0
    assert not page.evaluate('document.querySelector("#winner-dialog").open')
    advance(page, 0.5)
    assert page.evaluate('document.querySelector("#winner-dialog").open')
    assert history_count(page) == 1
    assert page.evaluate('window.__history()[0].restaurantId') == 'lunch-0'
    assert not errors, errors
    page.close()
    print('PASS wheel still spins after 8.4s, zooms near landing, records only at 42s', flush=True)


def slots(browser):
    page, errors = mount(browser, mode='slots')
    start(page, [1, 0])
    for seconds, stopped in [(2.8, 0), (0.2, 1), (3.8, 1), (0.2, 2), (3.8, 2)]:
        advance(page, seconds)
        assert page.evaluate('window.__stops.length') == stopped
        assert page.locator('.slot-reel.is-rolling').count() == 3 - stopped
        assert page.evaluate('document.querySelector("#slot-lever").disabled')
        assert page.evaluate('document.querySelector("#decision-mode").disabled')
        assert history_count(page) == 0
    advance(page, 0.5)
    stops = page.evaluate('window.__stops')
    assert [s['column'] for s in stops] == [0, 1, 2]
    for actual, expected in zip(stops, [2900, 6900, 10900]):
        assert abs(actual['at'] - expected) <= 50, stops
    assert page.evaluate('document.querySelector("#slot-machine").classList.contains("slot-miss")')
    assert history_count(page) == 0
    assert not page.evaluate('document.querySelector("#spin").disabled')
    start(page, [0, 2])
    advance(page, 10.8)
    assert history_count(page) == 0
    advance(page, 1.5)
    assert page.evaluate('document.querySelector("#winner-dialog").open')
    assert page.locator('.slot-reel').evaluate_all('rs => rs.map(r => r.dataset.restaurantId)') == ['lunch-2'] * 3
    assert history_count(page) == 1
    assert not errors, errors
    page.close()
    print('PASS reels land 4s apart; locks, loss/retry, exact triples and history remain correct', flush=True)


def fast_paths(browser):
    for mode in ['wheel', 'slots']:
        for calm, singleton in [(True, False), (False, True)]:
            page, errors = mount(browser, mode=mode, calm=calm, singleton=singleton)
            start(page, [0, 0, 0])
            advance(page, 1)
            assert page.evaluate('document.querySelector("#winner-dialog").open'), (mode, calm, singleton)
            assert history_count(page) == 1
            assert not errors, errors
            page.close()
    print('PASS reduced-motion and singleton selections still finish within 1s in both modes', flush=True)


def run():
    with sync_playwright() as p:
        executable = os.getenv('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('chromium-browser')
        browser = p.chromium.launch(headless=True, **({'executable_path': executable} if executable else {}), args=['--no-sandbox'])
        try:
            wheel(browser)
            slots(browser)
            fast_paths(browser)
        finally:
            browser.close()


if __name__ == '__main__':
    run()
