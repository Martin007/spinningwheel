"""Focused singleton, reduced-motion, rehydration and empty-state checks.
Uses decision_browser's normal HTTP mode or explicit LUNCH_IN_MEMORY=1 doubles.
"""
from decision_browser import *


def run_state():
    with sync_playwright() as p:
        executable = os.getenv('CHROMIUM_PATH') or shutil.which('chromium')
        browser = p.chromium.launch(headless=True, **({'executable_path': executable} if executable else {}), args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
        page = context.new_page()
        page.on('dialog', lambda dialog: dialog.accept())
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        one = {'version': 1, 'exampleData': False, 'restaurants': [
            {'id': 'only', 'name': 'Lunch med ett långt restaurangnamn & vänner',
             'enabled': True, 'openDays': None, 'largeGroups': None, 'outdoor': None,
             'closedDates': [], 'extraOpenDates': [], 'url': ''}]}
        saved = {'version': 1, 'settings': {'mode': 'slots', 'sound': False}, 'history': [], 'override': one}
        mount(page, saved)
        expect(page.locator('#decision-mode')).to_have_value('slots')
        expect(page.locator('#sound')).to_have_attribute('aria-pressed', 'false')
        expect(page.locator('#winner-dialog')).to_be_hidden()  # Idle triple isn't a recorded lunch.
        assert stored(page)['history'] == []
        page.locator('#slot-lever').focus(); page.keyboard.press('Enter')
        page.wait_for_function("document.getElementById('winner-dialog').open", timeout=2500)
        assert len(stored(page)['history']) == 1
        assert page.locator('#confetti i').count() == 0
        assert page.locator('.reel-symbol').count() == 9
        close(page, 'winner')
        expect(page.locator('#empty')).to_be_visible()
        expect(page.locator('#spin')).to_be_disabled()
        expect(page.locator('#slot-lever')).to_be_disabled()
        page.locator('#empty-action').click()
        assert len(stored(page)['history']) == 1
        expect(page.locator('#slot-lever')).to_be_enabled()
        print('PASS persisted mode/mute, keyboard lever, reduced motion, immediate singleton, exhausted recovery')
        restored = context.new_page(); restored.on('dialog', lambda dialog: dialog.accept())
        restored.on('pageerror', lambda error: errors.append(str(error)))
        mount(restored, stored(page))
        expect(restored.locator('#decision-mode')).to_have_value('slots')
        assert len(stored(restored)['history']) == 1
        restored.locator('#editor-open').click(); restored.locator('#restore').click()
        assert stored(restored)['override'] is None
        assert len(stored(restored)['history']) == 1
        expect(restored.locator('#option-count')).to_contain_text(f'{len(eligible())} alternativ')
        print('PASS serialized-state rehydration and restoring the shared list without deleting history')
        empty = context.new_page(); empty.on('pageerror', lambda error: errors.append(str(error)))
        saved['override']['restaurants'] = []
        mount(empty, saved)
        expect(empty.locator('#empty')).to_be_visible()
        expect(empty.locator('#slot-lever')).to_be_disabled()
        expect(empty.locator('#spin')).to_be_disabled()
        assert not errors, errors
        print('PASS truly empty list and no uncaught errors')
        browser.close()


if __name__ == '__main__':
    run_state()
