"""Full-interface Chromium checks for the wheel and slot machine.

Normal mode: serve the repository and set LUNCH_URL (default http://127.0.0.1:4173/).
LUNCH_IN_MEMORY=1: explicit fetch/storage doubles and the real native-animation
fallback, with the real HTML/CSS/JS inlined because navigation is restricted.
In-memory mode does NOT test HTTP, ES-module loading, CDN Motion or real storage
across navigation. Test-only crypto queues force outcomes without production hooks.
"""
import json
import os
import re
import shutil
import unicodedata
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
import time, builtins
_started=time.monotonic()
def print(*args, **kwargs):
    builtins.print(f"{time.monotonic()-_started:.1f}s", *args, **kwargs, flush=True)

ROOT = Path(__file__).resolve().parents[1]
MEMORY = os.getenv('LUNCH_IN_MEMORY') == '1'
URL = os.getenv('LUNCH_URL', 'http://127.0.0.1:4173/')
DATA = json.loads(Path(os.getenv('LUNCH_FIXTURE', ROOT / 'data/restaurants.json')).read_text())
SHOTS = Path(os.getenv('LUNCH_SCREENSHOTS', '/tmp/lunch-slot-screenshots'))
SHOTS.mkdir(parents=True, exist_ok=True)
DATE = '2026-09-10T10:00:00Z'  # Thursday in Stockholm; freeze wall clock, not timers.
SETUP = """
(() => {
  const NativeDate = Date;
  window.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : ['2026-09-10T10:00:00Z'])); }
  };
  const original = crypto.getRandomValues.bind(crypto);
  window.__draws = [];
  crypto.getRandomValues = array => {
    if (window.__draws.length) { array.fill(0); array[0] = window.__draws.shift(); return array; }
    return original(array);
  };
  window.__audioContexts = [];
  const NativeAudio = window.AudioContext;
  if (NativeAudio) window.AudioContext = class extends NativeAudio {
    constructor(...args) { super(...args); window.__audioContexts.push(this); }
  };
})();
"""

def mount(page, saved=None):
    if not MEMORY:
        page.add_init_script(SETUP)
        page.goto(URL)
        if saved is not None:
            page.evaluate("s => localStorage.setItem('lunchhjulet:v1', JSON.stringify(s))", saved)
            page.reload()
    else:
        html = (ROOT / 'index.html').read_text()
        html = re.sub(r'<script type="module".*?</script>', '', html)
        html = re.sub(r'<link rel="stylesheet"[^>]+href="\./([^"]+)"[^>]*>',
                      lambda match: '<style>' + (ROOT / match[1]).read_text() + '</style>', html)
        html = re.sub(r'<link rel="icon"[^>]+>', '', html)
        page.set_content(html)
        page.evaluate('''({data, saved}) => {
          const values = new Map(saved ? [['lunchhjulet:v1', JSON.stringify(saved)]] : []);
          Object.defineProperty(window, 'localStorage', {configurable: true, value: {
            getItem: key => values.get(key) ?? null,
            setItem: (key, value) => values.set(key, String(value)),
            removeItem: key => values.delete(key), clear: () => values.clear()
          }});
          window.fetch = async () => ({ok: true, json: async () => structuredClone(data)});
        }''', {'data': DATA, 'saved': saved})
        bundle = []
        for name in ['core', 'motion', 'audio', 'slot-core', 'slot-machine', 'app']:
            source = (ROOT / f'src/{name}.js').read_text()
            source = re.sub(r'^import .*?;\n', '', source, flags=re.M)
            source = re.sub(r'\bexport ', '', source)
            if name == 'motion':
                source = re.sub(r"const motionReady = import\([\s\S]*?\.catch\(\(\) => false\);",
                                'const motionReady = Promise.resolve(false);', source)
            source = source.replace('import.meta.url', "'http://127.0.0.1:4173/src/app.js'")
            bundle.append(source)
        page.add_script_tag(content=SETUP + '\n(() => {\n' + '\n'.join(bundle) + '\n})();')
    page.wait_for_function("document.getElementById('option-count').textContent.includes('alternativ')")


def stored(page):
    return page.evaluate("JSON.parse(localStorage.getItem('lunchhjulet:v1'))") or {'history': []}


def close(page, which):
    page.locator(f'[data-close="{which}-dialog"]').click()
    expect(page.locator(f'#{which}-dialog')).not_to_be_visible()


def centered(page):
    distances = page.locator('.slot-reel').evaluate_all('''reels => reels.map(reel => {
      const row = reel.querySelectorAll('.reel-symbol')[1].getBoundingClientRect();
      const box = reel.getBoundingClientRect();
      return Math.abs(row.y + row.height / 2 - box.y - box.height / 2);
    })''')
    assert all(d < 0.6 for d in distances), distances


def eligible(groups=False, outdoor=False):
    def open_today(r):
        return r.get('enabled', True) and '2026-09-10' not in r.get('closedDates', []) and (
            '2026-09-10' in r.get('extraOpenDates', []) or r['openDays'] is None or 4 in r['openDays'])
    return [r for r in DATA['restaurants'] if open_today(r) and (not groups or r['largeGroups'] is True)
            and (not outdoor or r['outdoor'] is True)]


def run():
    with sync_playwright() as p:
        executable = os.getenv('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('chromium-browser')
        browser = p.chromium.launch(headless=True, **({'executable_path': executable} if executable else {}), args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, locale='sv-SE', timezone_id='Europe/Stockholm')
        page = context.new_page()
        page.on('dialog', lambda dialog: dialog.accept())
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        mount(page)
        count = len(eligible())
        assert count >= 3, 'This interaction fixture needs at least three eligible places.'
        expect(page.locator('[role="switch"]')).to_have_count(3)
        expect(page.locator('#decision-mode')).to_have_value('wheel')
        expect(page.locator('#slot-machine')).to_be_hidden()
        page.select_option('#decision-mode', 'slots')
        assert stored(page)['settings']['mode'] == 'slots'
        expect(page.locator('#camera')).to_be_hidden()
        expect(page.locator('.slot-reel')).to_have_count(3)
        expect(page.locator('.reel-symbol')).to_have_count(9)
        for width, height in [(1440, 1000), (1024, 900), (768, 1024), (390, 844), (320, 640)]:
            page.set_viewport_size({'width': width, 'height': height})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), width
            centered(page)
            page.screenshot(path=str(SHOTS / f'slots-{width}.png'), full_page=True)
        print('PASS Swedish selector, persisted mode, three switches, payline alignment, five responsive widths')
        page.set_viewport_size({'width': 1440, 'height': 1000})
        for groups, outdoor in [(True, False), (True, True), (False, True), (False, False)]:
            page.locator('#large-groups').set_checked(groups)
            page.locator('#outdoor').set_checked(outdoor)
            expect(page.locator('#option-count')).to_contain_text(f'{len(eligible(groups, outdoor))} alternativ')
        page.locator('.slot-rules summary').click()
        expect(page.locator('.slot-rules p')).to_contain_text('1 på 4')
        page.locator('.slot-rules summary').click()
        print('PASS shared feature/day filtering and disclosed match odds')
        page.evaluate('window.__draws = [1, 0]')  # Genuine, deterministic non-winning payline.
        page.locator('#spin').click()
        for control in ['spin', 'slot-lever', 'decision-mode', 'editor-open', 'history-open', 'large-groups']:
            expect(page.locator('#' + control)).to_be_disabled()
        page.locator('#slot-lever').dispatch_event('click')  # Reentrancy guard, not another pull.
        expect(page.locator('#sound')).to_be_enabled()
        page.locator('#sound').click()
        assert stored(page)['settings']['sound'] is False
        page.set_viewport_size({'width': 320, 'height': 750})  # Resize during motion.
        page.wait_for_function("document.querySelector('#slot-machine').classList.contains('slot-miss')")
        expect(page.locator('#spin')).to_be_enabled()
        assert stored(page)['history'] == []
        expect(page.locator('#winner-dialog')).to_be_hidden()
        expect(page.locator('#slot-status')).to_have_text('Ingen träff. Dra igen.')
        centered(page)
        page.set_viewport_size({'width': 1440, 'height': 1000})
        page.locator('#sound').click()
        print('PASS loss/retry, zero false history, locking, double-click guard, mute during motion, responsive landing')
        # A short drag does not commit a pull. A full physical lever pull does.
        lever = page.locator('#slot-lever').bounding_box()
        x, y = lever['x'] + lever['width'] / 2, lever['y'] + 35
        page.mouse.move(x, y); page.mouse.down(); page.mouse.move(x, y + 20, steps=3); page.mouse.up()
        expect(page.locator('#slot-status')).to_have_text('Ingen träff. Dra igen.')
        page.evaluate('window.__draws = [0, 2]')
        page.mouse.move(x, y); page.mouse.down(); page.mouse.move(x, y + 65, steps=6); page.mouse.up()
        page.wait_for_function("document.querySelector('#slot-machine').classList.contains('slot-hit')")
        centered(page)
        target = eligible()[2]
        assert page.locator('.slot-reel').evaluate_all('rs=>rs.map(r=>r.dataset.restaurantId)') == [target['id']] * 3
        page.screenshot(path=str(SHOTS / 'slots-match.png'), full_page=True)
        expect(page.locator('#winner-dialog')).to_be_visible()
        expect(page.locator('#winner-title')).to_have_text(target['name'])
        assert len(stored(page)['history']) == 1
        assert stored(page)['history'][0]['restaurantId'] == target['id']
        assert page.evaluate('window.__audioContexts.some(c=>c.state === "running")'), 'Web Audio did not unlock'
        close(page, 'winner')
        expect(page.locator('#option-count')).to_contain_text(f'{count - 1} alternativ')
        print('PASS lever gesture, exact triple/pointer agreement, one recorded jackpot, exclusion, running Web Audio context')
        # Wheel/history integration; its full-motion path is covered separately.
        page.emulate_media(reduced_motion='reduce')
        page.select_option('#decision-mode', 'wheel')
        expect(page.locator('#slot-machine')).to_be_hidden()
        expect(page.locator('#camera')).to_be_visible()
        page.evaluate('window.__draws = [0, 0, 0]')
        page.locator('#spin').click()
        page.wait_for_function("document.getElementById('winner-dialog').open", timeout=12000, polling=100)
        assert len(stored(page)['history']) == 2
        close(page, 'winner')
        page.locator('#history-open').click()
        expect(page.locator('.history-item')).to_have_count(2)
        page.locator('.history-item button').first.click()
        assert len(stored(page)['history']) == 1
        page.locator('#clear-history').click()
        assert len(stored(page)['history']) == 0
        close(page, 'history')
        print('PASS wheel selection regression, shared history, individual/full history deletion')
        assert not errors, errors
        print(f'PASS no uncaught JavaScript errors; mode={"in-memory doubles/native animation" if MEMORY else "HTTP"}')
        browser.close()


if __name__ == '__main__':
    run()
