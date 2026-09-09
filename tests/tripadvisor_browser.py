"""Interaction smoke checks with a minimal DOM, mocked storage/fetch/animation.
Not a visual-layout, real-network, real-audio, or CDN integration test.
"""
from pathlib import Path
import json, re, shutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).parent
SITE=ROOT.parent
html='''<!doctype html><html lang="sv"><head><meta charset="utf-8"></head><body>
<fieldset id="filters"><input type="checkbox" id="large-groups"><input type="checkbox" id="outdoor"><input type="checkbox" id="remove-winners"></fieldset>
<button id="sound"><svg><use href="#i-volume"></use></svg></button>
<button id="editor-open">Matställen</button><button id="sample-note"></button><button id="history-open">Historik <span id="history-count"></span></button>
<span id="today"></span><span id="footer-date"></span>
<main id="stage"><div id="camera"><svg width="600" height="600"><desc id="wheel-description"></desc><g id="segments"></g><g id="rim-ticks"></g><path id="pointer"></path></svg></div><div id="wheel-caption"></div></main>
<button id="spin"><span id="spin-label"></span></button><span id="option-count"></span>
<div id="empty"><h2 id="empty-title"></h2><p id="empty-description"></p><button id="empty-action"></button></div>
<div id="announcement" aria-live="polite"></div><div id="toast" hidden></div>
<dialog id="winner-dialog"><h2 id="winner-title"></h2><span id="winner-date"></span><a id="winner-link">Till matstället <span>↗</span></a><div id="confetti"></div><button id="again">Igen</button><button data-close="winner-dialog">Stäng</button></dialog>
<dialog id="history-dialog"><div id="history-list"></div><button id="clear-history">Rensa</button><button data-close="history-dialog">Stäng</button></dialog>
<dialog id="editor-dialog"><button id="list-tab">Lista</button><button id="json-tab">JSON</button><div id="editor-error" hidden></div><p id="example-warning"></p><div id="list-panel"><div id="restaurant-list"></div><button id="add-restaurant">Lägg till</button></div><div id="json-panel"><textarea id="json-editor"></textarea></div><button id="save">Spara</button><button id="restore">Återställ</button><button id="import">Importera</button><input type="file" id="import-file"><button id="export">Exportera</button><button data-close="editor-dialog">Stäng</button></dialog>
</body></html>'''
# Fixed import fixture: production restaurant edits must not break this regression test.
config=json.loads((ROOT/'fixtures/tripadvisor-restaurants.json').read_text())
core=(SITE/'src/core.js').read_text().replace('export ','')
app=re.sub(r'^import .*?;\n', '', (SITE/'src/app.js').read_text(), flags=re.M).replace('import.meta.url', "'https://fixture.test/src/app.js'")
stubs='''
const store = new Map();
Object.defineProperty(window, 'localStorage', {value: { getItem: key => store.get(key) ?? null, setItem: (key,value) => store.set(key,value) }});
window.confirm = () => true;
window.fetch = async () => ({ok: true, json: async () => window.__fixture});
const reducedMotion = () => true;
const animateValue = async (from, to, opts) => { opts.onUpdate(to); };
const animateStyle = () => ({ stop() {} });
class WheelAudio { setEnabled() {} async unlock() {} tick() {} win() {} }
'''
with sync_playwright() as p:
    executable=shutil.which('chromium') or shutil.which('chromium-browser')
    browser=p.chromium.launch(**({'executable_path':executable} if executable else {}), headless=True, args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1100})
    errors=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.set_content(html)
    page.evaluate('(data) => window.__fixture = data', config)
    page.add_script_tag(content=stubs+core+'\n'+app+'\nwindow.__state = () => ({ state, config, choices, draft });')
    page.wait_for_function("document.getElementById('option-count').textContent === '121 alternativ'")
    assert page.locator('#segments .wheel-segment').count()==121
    assert page.locator('#segments .segment-name').count()==121
    assert page.locator('#sample-note').inner_text()=='Lunchdagar ej bekräftade'
    print('PASS 121 choices and radial labels, unknown-day notice')
    page.locator('#large-groups').check()
    assert page.locator('#option-count').inner_text()=='24 alternativ'
    page.locator('#outdoor').check()
    assert page.locator('#option-count').inner_text()=='14 alternativ'
    page.locator('#large-groups').uncheck()
    assert page.locator('#option-count').inner_text()=='30 alternativ'
    page.locator('#outdoor').uncheck()
    print('PASS category filters: 24 / 30 / 14')
    page.locator('#editor-open').click()
    assert page.locator('.restaurant-card').count()==121
    page.locator('#restaurant-search').fill('overste')
    assert page.locator('.restaurant-card:visible').count()==1
    assert page.locator('.restaurant-card:visible .restaurant-name').inner_text()=='Överste Mörner'
    page.locator('.restaurant-card:visible summary').click()
    card=page.locator('.restaurant-card:visible')
    assert card.locator('[data-unknown-days]').get_attribute('aria-pressed')=='true'
    card.locator('[data-day="3"]').click()
    assert card.locator('small').inner_text()=='Ons'
    card.locator('[data-unknown-days]').click()
    assert card.locator('small').inner_text()=='Lunchdagar okända'
    card.locator('[data-field="outdoor"]').select_option('false')
    page.locator('#save').click()
    assert page.evaluate("window.__state().config.restaurants.find(r => r.id === 'overste-morner').outdoor") is False
    print('PASS accent-insensitive search, unknown/selected weekdays, typed feature editing, save')
    page.locator('#editor-open').click()
    page.locator('#json-tab').click()
    exported=json.loads(page.locator('#json-editor').input_value())
    assert len(exported['restaurants'])==121
    assert exported['restaurants'][0]['openDays'] is None
    page.locator('#list-tab').click()
    page.locator('#add-restaurant').click()
    assert page.locator('.restaurant-card').count()==122
    new=page.locator('.restaurant-card').last
    assert new.locator('[data-field="outdoor"]').input_value()=='unknown'
    assert new.locator('small').inner_text()=='Lunchdagar okända'
    page.locator('#save').click()
    assert page.locator('#option-count').inner_text()=='122 alternativ'
    print('PASS JSON round trip and adding beyond former 48-item limit')
    page.locator('#spin').click()
    page.wait_for_function("document.getElementById('winner-dialog').open")
    assert page.evaluate('window.__state().state.history.length')==1
    page.locator('[data-close="winner-dialog"]').click()
    page.wait_for_function("document.getElementById('option-count').textContent === '121 alternativ'")
    print('PASS winner stored and excluded from next draw')
    page.locator('#editor-open').click()
    page.locator('#restore').click()
    assert page.evaluate('window.__state().config.restaurants.length')==121
    assert page.evaluate('window.__state().state.history.length')==1
    assert page.evaluate('window.__state().state.override') is None
    print('PASS restore original file preserves winner history')
    assert not errors, errors
    print('PASS no uncaught JavaScript errors')
    browser.close()
