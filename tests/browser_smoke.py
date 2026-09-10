"""Compatibility entry point for the full wheel/slot browser suite.
Normal mode uses HTTP. LUNCH_IN_MEMORY=1 enables explicit fetch/storage doubles.
"""
from decision_browser import run

if __name__ == '__main__':
    run()
