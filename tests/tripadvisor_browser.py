"""Run the full interface suite against the frozen 121-restaurant import.
Uses explicit fetch/storage doubles and native animation, not HTTP or CDN Motion.
"""
import os
from pathlib import Path

os.environ['LUNCH_IN_MEMORY'] = '1'
os.environ['LUNCH_FIXTURE'] = str(Path(__file__).parent / 'fixtures/tripadvisor-restaurants.json')
from decision_browser import run

if __name__ == '__main__':
    run()
