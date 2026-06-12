"""Headless smoke test for the generated RapidMeta dashboard: load it, capture
console errors, confirm it actually renders (not a silent empty canvas)."""
import io, sys, pathlib
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

f = pathlib.Path(r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/incretin_obesity_dashboard.html').as_uri()
opts = Options()
opts.add_argument('--headless=new'); opts.add_argument('--no-sandbox'); opts.add_argument('--disable-gpu')
opts.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
d = webdriver.Chrome(options=opts)
try:
    d.set_page_load_timeout(60)
    d.get(f)
    WebDriverWait(d, 30).until(lambda x: x.execute_script('return document.readyState') == 'complete')
    import time; time.sleep(3)  # let the engine boot + render
    title = d.title
    bodylen = d.execute_script('return document.body.innerText.length')
    ntabs = d.execute_script("return document.querySelectorAll('[onclick*=\"switchTab\"],.tab,[data-tab]').length")
    has_data = d.execute_script("return (document.body.innerText.match(/tirzepatide|retatrutide|semaglutide/i)||[]).length>0")
    # severe console errors
    logs = d.get_log('browser')
    severe = [l for l in logs if l['level'] == 'SEVERE'
              and 'favicon' not in l['message'] and 'net::ERR_FILE_NOT_FOUND' not in l['message']]
    syntax = [l for l in logs if 'SyntaxError' in l['message'] or 'Uncaught' in l['message']]
    print(f'title: {title!r}')
    print(f'body text length: {bodylen}  | tab-like elements: {ntabs}  | drug names visible: {has_data}')
    print(f'SEVERE console errors (non-favicon): {len(severe)}')
    for l in severe[:8]:
        print('  -', l['message'][:160])
    print(f'SyntaxError/Uncaught: {len(syntax)}')
    for l in syntax[:5]:
        print('  *', l['message'][:160])
    ok = bodylen > 2000 and has_data and not syntax
    print('\nSMOKE:', 'PASS' if ok else 'FAIL')
finally:
    d.quit()
