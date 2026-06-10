"""Drive the RapidMeta dashboard through the attested workflow to prove the
synthesis pipeline lights up: include all trials (screening) -> Extract & Verify
Evidence -> Analysis. Captures the pooled estimate + a screenshot.
(This SIMULATES the human attestation to demonstrate the pipeline end-to-end.)
"""
import io, sys, pathlib, time, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

f = pathlib.Path(r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/incretin_obesity_dashboard.html').as_uri()
opts = Options()
for a in ('--headless=new', '--no-sandbox', '--disable-gpu', '--window-size=1400,2400'):
    opts.add_argument(a)
opts.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
d = webdriver.Chrome(options=opts)
try:
    d.set_page_load_timeout(60); d.get(f)
    WebDriverWait(d, 30).until(lambda x: x.execute_script('return document.readyState') == 'complete')
    time.sleep(4)

    n_inc = d.execute_script("""
        var RM=window.RapidMeta; if(!RM||!RM.state||!RM.state.trials) return -1;
        var n=0; RM.state.trials.forEach(function(t){
            t.status='include'; t.included=true;
            t.screenReview = t.screenReview||{}; t.screenReview.confirmed=true;
            n++;
        }); return n;
    """)
    print('trials marked include+confirmed:', n_inc)

    # go to extraction, click the genuine Extract & Verify Evidence button
    d.execute_script("try{switchTab('extract')}catch(e){}"); time.sleep(2)
    clicked = d.execute_script("""
        var b=[].slice.call(document.querySelectorAll('button,a')).find(function(x){
            return /Extract & Verify Evidence/i.test(x.textContent);});
        if(b){b.scrollIntoView(); b.click(); return b.textContent.trim();} return null;
    """)
    print('extract button clicked:', clicked)
    time.sleep(6)  # extraction may be async

    # how many trials now have data / are pooled?
    state = d.execute_script("""
        var RM=window.RapidMeta, arr=(RM&&RM.state&&RM.state.trials)||[];
        var withData=arr.filter(function(t){return t&&t.data;}).length;
        var inc=(typeof includedTrials==='function')?includedTrials().length:-1;
        return {total:arr.length, withData:withData, included:inc};
    """)
    print('state after extract:', json.dumps(state))

    # click the real "5. Analysis Suite" nav tab
    navd = d.execute_script("""
        var a=[].slice.call(document.querySelectorAll('button,a,div,span,li')).find(function(x){
            return /Analysis Suite/i.test(x.textContent) && x.textContent.length<25;});
        if(a){a.click(); return a.textContent.trim();} return null;
    """)
    print('analysis nav clicked:', navd); time.sleep(3)
    # pick an outcome that several trials share: tirzepatide 15 mg
    sel = d.execute_script("""
        var s=document.querySelector('select'); if(!s) return 'no-select';
        var opts=[].slice.call(s.options);
        var o=opts.find(function(x){return /tirzepatide 15 mg/i.test(x.textContent);})||
              opts.find(function(x){return /semaglutide 2.4 mg/i.test(x.textContent);});
        if(o){s.value=o.value; s.dispatchEvent(new Event('change',{bubbles:true})); return o.textContent.trim();}
        return 'no-match';
    """)
    print('outcome selected:', sel); time.sleep(4)
    # scrape pooled cards: find label then its numeric value
    cards = d.execute_script("""
        function near(label){
          var els=[].slice.call(document.querySelectorAll('*'));
          for(var i=0;i<els.length;i++){var t=(els[i].textContent||'').trim();
            if(t===label||t.toUpperCase()===label){var p=els[i].parentElement;
              if(p){var nums=(p.textContent.match(/-?\\d+\\.\\d+/g)||[]);return nums.slice(0,3);}}}
          return [];}
        return {pooled:near('POOLED MEAN DIFFERENCE (PRIMARY)'),
                pooledRR:near('POOLED RISK RATIO (PRIMARY)'),
                het:near('HETEROGENEITY (I\\u00b2)'),
                anyMD:(document.body.innerText.match(/-?\\d+\\.\\d+\\s*\\(-?\\d+\\.\\d+,\\s*-?\\d+\\.\\d+\\)/g)||[]).slice(0,5)};
    """)
    print('pooled cards:', json.dumps(cards))
    studychar = d.execute_script(
        "var m=document.body.innerText.match(/Total \\((\\d+) trials?\\)/);return m?m[1]:'?'")
    print('study-characteristics trial count:', studychar)
    d.save_screenshot(r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/_shot_pooled.png')
    lit = (cards.get('anyMD') or []) or cards.get('pooled') or cards.get('pooledRR')
    print('SMOKE:', 'PASS-POOLED' if lit else ('PARTIAL-EXTRACTED' if state.get('withData', 0) > 0 else 'FAIL'))
finally:
    d.quit()
