"""Chromium smoke tests. Normal mode uses http://127.0.0.1:4173.
LUNCH_IN_MEMORY=1 explicitly mocks fetch/storage and uses the animation fallback
for restricted environments that cannot navigate to a local HTTP server.
Install Playwright separately; these optional tests are not needed to run the site.
"""
import json
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
MEMORY = os.getenv('LUNCH_IN_MEMORY') == '1'
URL = os.getenv('LUNCH_URL', 'http://127.0.0.1:4173/')
DATA = json.loads((ROOT / 'data/restaurants.json').read_text())
SHOTS = Path(os.getenv('LUNCH_SCREENSHOTS', '/tmp/lunch-screenshots'))
SHOTS.mkdir(parents=True, exist_ok=True)


def mount(page, saved=None, broken=False):
    if not MEMORY:
        page.goto(URL)
        if saved is not None:
            page.evaluate("s => localStorage.setItem('lunchhjulet:v1', JSON.stringify(s))", saved)
            page.reload()
    else:
        html = (ROOT / 'index.html').read_text()
        html = re.sub(r'<script type="module".*?</script>', '', html)
        html = re.sub(r'<link rel="stylesheet"[^>]+>', lambda _: '<style>' + (ROOT / 'src/style.css').read_text() + '</style>', html)
        html = re.sub(r'<link rel="icon"[^>]+>', '', html)
        page.set_content(html)
        page.evaluate('''({data, saved, broken}) => {
          const values = new Map(saved ? [['lunchhjulet:v1', JSON.stringify(saved)]] : []);
          Object.defineProperty(window, 'localStorage', {configurable: true, value: {
            getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)),
            removeItem: k => values.delete(k), clear: () => values.clear()
          }});
          window.fetch = async () => { if (broken) throw Error('offline'); return {ok:true, json:async()=>data}; };
        }''', {'data': DATA, 'saved': saved, 'broken': broken})
        bundle = ''
        for name in ['core', 'motion', 'audio', 'app']:
            source = (ROOT / f'src/{name}.js').read_text()
            source = re.sub(r'^import .*?;\n', '', source, flags=re.M)
            source = re.sub(r'\bexport ', '', source)
            if name == 'motion':
                source = re.sub(r"const motionReady = import\([\s\S]*?\.catch\(\(\) => false\);", 'const motionReady = Promise.resolve(false);', source)
            source = source.replace('import.meta.url', "'http://127.0.0.1:4173/src/app.js'")
            bundle += source + '\n'
        page.add_script_tag(content='(() => {\n' + bundle + '\n})();')
    page.wait_for_function("document.getElementById('option-count').textContent.includes('alternativ')")


def stored(page):
    return page.evaluate("JSON.parse(localStorage.getItem('lunchhjulet:v1'))")


def close(page, name):
    page.locator(f'[data-close="{name}-dialog"]').click()
    expect(page.locator(f'#{name}-dialog')).not_to_be_visible()


def run():
    with sync_playwright() as p:
        executable = os.getenv('CHROMIUM_PATH')
        browser = p.chromium.launch(headless=True, **({'executable_path': executable} if executable else {}))
        context = browser.new_context(viewport={'width': 1440, 'height': 1000}, locale='sv-SE', timezone_id='Europe/Stockholm')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        # Freeze the wall clock, not RAF/timers, for reproducible weekday filtering.
        page.clock.set_fixed_time('2026-09-09T10:00:00Z')
        mount(page)
        expect(page.locator('[role="switch"]')).to_have_count(3)
        expect(page.locator('#option-count')).to_have_text('8 alternativ idag')
        page.screenshot(path=str(SHOTS / 'desktop.png'), full_page=True)
        for width, height in [(1440, 1000), (1024, 768), (768, 1024), (390, 844), (320, 568)]:
            page.set_viewport_size({'width': width, 'height': height})
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Overflow at {width}'
        page.set_viewport_size({'width': 390, 'height': 844})
        expect(page.get_by_role('button', name='Historik', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='Matställen', exact=True)).to_be_visible()
        page.screenshot(path=str(SHOTS / 'mobile.png'), full_page=True)
        page.set_viewport_size({'width': 1440, 'height': 1000})
        page.locator('#large-groups').check()
        expect(page.locator('#option-count')).to_have_text('5 alternativ idag')
        page.locator('#outdoor').check()
        expect(page.locator('#option-count')).to_have_text('4 alternativ idag')
        page.locator('#large-groups').uncheck()
        page.locator('#outdoor').uncheck()
        page.locator('#spin').click()
        expect(page.locator('#large-groups')).to_be_disabled()
        page.wait_for_function("document.body.classList.contains('is-dramatic')", timeout=10000)
        page.wait_for_timeout(1000)
        assert page.locator('#camera').evaluate("e => parseFloat(getComputedStyle(e).transform.slice(7)) > 1.5")
        page.screenshot(path=str(SHOTS / 'zoom.png'), full_page=True)
        expect(page.locator('#winner-dialog')).to_be_visible(timeout=12000)
        winner = page.locator('#winner-title').inner_text()
        state = stored(page)
        assert len(state['history']) == 1 and state['history'][0]['name'] == winner
        names = page.locator('#segments .segment-name').all_text_contents()
        rotation = float(re.search(r'rotate\(([^ ]+)', page.locator('#segments').get_attribute('transform')).group(1))
        assert names[int(((-rotation) % 360) / (360 / len(names)))] == winner
        page.screenshot(path=str(SHOTS / 'winner.png'), full_page=True)
        close(page, 'winner')
        expect(page.locator('#option-count')).to_have_text('7 alternativ idag')
        assert winner not in page.locator('#segments .segment-name').all_text_contents()
        page.locator('#remove-winners').uncheck()
        expect(page.locator('#option-count')).to_have_text('8 alternativ idag')
        page.locator('#sound').click()
        assert stored(page)['settings']['sound'] is False
        page.locator('#history-open').click()
        expect(page.locator('.history-item h3')).to_have_text(winner)
        page.locator('.history-item button').click()
        expect(page.locator('.history-empty')).to_be_visible()
        close(page, 'history')
        page.locator('#editor-open').click()
        page.locator('#restaurant-list summary').first.click()
        page.locator('#name-0').fill('Min lunch')
        page.locator('#restaurant-list [data-day="3"]').first.click()
        page.locator('#save').click()
        expect(page.locator('#option-count')).to_have_text('7 alternativ idag')
        assert stored(page)['override']['restaurants'][0]['name'] == 'Min lunch'
        page.locator('#editor-open').click()
        page.locator('#json-tab').click()
        original = page.locator('#json-editor').input_value()
        page.locator('#json-editor').fill('{broken')
        page.locator('#save').click()
        expect(page.locator('#editor-error')).to_contain_text('JSON kunde inte läsas')
        assert stored(page)['override']['restaurants'][0]['name'] == 'Min lunch'
        page.locator('#json-editor').fill(original)
        page.locator('#list-tab').click()
        page.locator('#add-restaurant').click()
        page.locator('#restaurant-list input[data-field="name"]').last.fill('<b>Ingen HTML</b>')
        page.locator('#save').click()
        page.locator('#editor-open').click()
        expect(page.locator('#restaurant-list .restaurant-name').last).to_have_text('<b>Ingen HTML</b>')
        expect(page.locator('#restaurant-list b')).to_have_count(0)
        close(page, 'editor')
        saved = stored(page)
        # Reload real localStorage normally; in-memory mode rehydrates its explicit fixture.
        if MEMORY:
            new_page = context.new_page()
            new_page.clock.set_fixed_time('2026-09-09T10:00:00Z')
            mount(new_page, saved)
        else:
            page.reload()
            new_page = page
        expect(new_page.locator('#sound')).to_have_attribute('aria-pressed', 'false')
        new_page.locator('#editor-open').click()
        expect(new_page.locator('#restaurant-list .restaurant-name').first).to_have_text('Min lunch')
        close(new_page, 'editor')
        new_page.emulate_media(reduced_motion='reduce')
        new_page.locator('#spin').click()
        expect(new_page.locator('#winner-dialog')).to_be_visible(timeout=3000)
        assert not new_page.locator('body').evaluate("e => e.classList.contains('is-dramatic')")
        expect(new_page.locator('#confetti i')).to_have_count(0)
        close(new_page, 'winner')
        # Empty states and blocked fetch recovery, using a separate isolated page.
        if MEMORY:
            empty_state = {'version': 1, 'settings': {}, 'history': [], 'override': {'version': 1, 'restaurants': []}}
            empty_page = context.new_page()
            mount(empty_page, empty_state, broken=True)
            expect(empty_page.locator('#spin')).to_be_disabled()
            expect(empty_page.locator('#empty')).to_be_visible()
            empty_page.locator('#editor-open').click()
            empty_page.locator('#add-restaurant').click()
            empty_page.locator('#save').click()
            expect(empty_page.locator('#spin')).to_be_enabled()
        assert not errors, errors
        browser.close()
        print('PASS: layout (320–1440px), accessible controls, filters, spin/zoom/pointer, history, settings, editor, safe text, JSON validation, rehydration, reduced motion, empty state.')
        print('Mode: mocked fetch/storage + native animation fallback' if MEMORY else 'Mode: HTTP + native browser storage; Motion loads from CDN when available')
        print(f'Screenshots: {SHOTS}')


if __name__ == '__main__':
    run()
