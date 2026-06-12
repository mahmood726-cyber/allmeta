import io, sys, pathlib, time
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

f = pathlib.Path(r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/incretin_obesity_dashboard.html').as_uri()
opts = Options()
for a in ('--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1400,2200', '--force-device-scale-factor=1'):
    opts.add_argument(a)
d = webdriver.Chrome(options=opts)
try:
    d.set_page_load_timeout(60); d.get(f)
    WebDriverWait(d, 30).until(lambda x: x.execute_script('return document.readyState') == 'complete')
    time.sleep(4)
    # list visible tab labels
    tabs = d.execute_script(
        "return Array.from(document.querySelectorAll('button,.tab,[role=tab],[onclick]'))"
        ".map(e=>e.textContent.trim()).filter(t=>t&&t.length<30).slice(0,40)")
    print('tab-ish labels:', [t for t in tabs if t][:25])
    d.save_screenshot(r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/_shot_landing.png')
    # try to open a ranking / analysis view
    for kw in ('Analysis', 'Ranking', 'Network', 'Results'):
        try:
            el = d.find_element('xpath', f"//*[contains(text(),'{kw}')][@onclick or self::button or self::a]")
            d.execute_script('arguments[0].click();', el); time.sleep(2)
            d.save_screenshot(rf'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/_shot_{kw.lower()}.png')
            print('captured tab:', kw); break
        except Exception:
            continue
    print('done')
finally:
    d.quit()
