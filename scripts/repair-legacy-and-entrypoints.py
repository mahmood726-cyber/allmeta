"""Run after the guarded remaining-plots patch, never activate archived demos."""
from pathlib import Path
import hashlib,json

def exact(path,expected):
    raw=Path(path).read_bytes()
    actual=hashlib.sha1(f'blob {len(raw)}\0'.encode()+raw).hexdigest()
    assert actual==expected,(path,actual)
    return raw.decode('utf-8')

p=Path('IPD-Meta-Pro/ipd-meta-pro.html');t=p.read_text()
a=t.index('function kMeans(data, k, nRestarts) {')
b=t.index(' const I2ConfidenceIntervals = {',a)
legacy=t[a:b]
assert 'function displayClusteringResults(' in legacy
assert 'setTimeout(addExceedRButtons, 2000);' in legacy
assert 370000<len(legacy)<380000
archive=Path('IPD-Meta-Pro/legacy/unreachable-kmeans-block.txt')
assert not archive.exists();archive.parent.mkdir(parents=True,exist_ok=True)
archive.write_text('ARCHIVED, NOT EXECUTABLE. Previously nested inside kMeans after an early return.\nDo not activate experimental/demo initialisers without independent review.\n\n'+legacy)
t=t[:a]+'/* The unreachable experimental block formerly nested inside kMeans is\n * archived in legacy/unreachable-kmeans-block.txt. Tested clustering lives\n * in the embedded src/clustering-plots.js module. No legacy initialisers run. */\n\n'+t[b:]
module=Path('IPD-Meta-Pro/src/clustering-plots.js').read_text()
assert '</script' not in module.lower()
pos=t.rfind('</body>');assert pos>0
t=t[:pos]+'\n<!-- BEGIN IPD TESTED CLUSTERING -->\n<script>\n'+module+'\n</script>\n<!-- END IPD TESTED CLUSTERING -->\n'+t[pos:]
t=t.replace('nested inside kMeans and does not register when the application loads.','in the archived legacy block and does not register when the application loads.')
p.write_text(t)

p=Path('r-shiny/dta-diagnostic/app.json')
items=json.loads(exact(str(p),'519d565a605e9b3af19a217e4810d64e5d148a11'))
item=next(x for x in items if x['name']=='app.R');r=item['content']
assert r.count('DTOutput(')==4;r=r.replace('DTOutput(','tableOutput(')
for state in ['metrics','advanced','ci']:
    old='datatable(analysis$'+state+', options=list(dom="t"), rownames=FALSE)'
    assert r.count(old)==1;r=r.replace(old,'analysis$'+state,1)
old='datatable(cm_df, options=list(dom="t"), rownames=TRUE)';assert r.count(old)==1;r=r.replace(old,'cm_df',1)
assert r.count('renderDT({')==4;r=r.replace('renderDT({','renderTable({')
old='    cm_df\r\n  })' if '    cm_df\r\n  })' in r else '    cm_df\n  })'
assert r.count(old)==1;r=r.replace(old,old[:-2]+'}, rownames=TRUE)',1)
# These four static metrics tables do not need DataTables. This eliminates the
# reproducible missing $.fn.DataTable dependency without changing calculations.
item['content']=r
p.write_text(json.dumps(items,ensure_ascii=False,separators=(',',':'))+'\n')

p=Path('hub/projects.js');t=exact(str(p),'64beb19fdaa7af1976484590907cc05d989dfa3c')
for name,file in [('adaptsim','adaptsim.html'),('al-mizan','al-mizan.html'),('cardiooracle','CardioOracle.html')]:
    old='path: "https://mahmood726-cyber.github.io/'+name+'/"'
    new='path: "https://mahmood726-cyber.github.io/'+name+'/e156-submission/assets/'+file+'"'
    assert t.count(old)==1,(name,t.count(old));t=t.replace(old,new,1)
p.write_text(t)
print('Legacy definitions archived inertly; tested clustering embedded; DTA static tables fixed; three actual-app links corrected.')
