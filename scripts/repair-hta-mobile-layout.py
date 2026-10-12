"""Temporary guarded layout repair after screenshot inspection caught clipping."""
from pathlib import Path
import hashlib

def once(s,a,b):
    assert s.count(a)==1,(a[:100],s.count(a))
    return s.replace(a,b,1)
p=Path('HTA/src/ui/synthesisPlots.js');b=p.read_bytes()
assert hashlib.sha1(f'blob {len(b)}\0'.encode()+b).hexdigest()=='9bfa1e50adf61ada8a389bc999f968e12fdc549f'
s=b.decode()
s=once(s,"        const svg = mark(scroll, 'svg', {id, xmlns: NS, viewBox: `0 0 720 ${height}`, role: 'img', 'aria-label': title});", "        const width = Math.max(240, Math.min(720, scroll.clientWidth || 720));\n        const svg = mark(scroll, 'svg', {id, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': title});")
s=once(s,"display:block;width:100%;min-width:520px;height:auto;background:white;color:#172033", "display:block;width:100%;height:auto;background:white;color:#172033")
s=once(s,"{x:0, y:0, width:720, height, fill:'white'}", "{x:0, y:0, width, height, fill:'white'}")
a=s.index('    function axis(svg, domain, y, description) {');b=s.index('    function forest(',a)
s=s[:a]+"""    function axis(svg, domain, y, description) {
        const width=svg.viewBox.baseVal.width;
        const left=width<500?112:210, right=width-20, span=right-left;
        const x=value=>left+(value-domain[0])/(domain[1]-domain[0])*span;
        mark(svg,'line',{x1:left,x2:right,y1:y,y2:y,stroke:'#475569'});
        for(let i=0;i<=4;i++) {
            const v=domain[0]+i*(domain[1]-domain[0])/4;
            mark(svg,'text',{x:x(v),y:y+18,'text-anchor':'middle',fill:'#172033','font-size':width<500?10:11},v.toFixed(2));
        }
        mark(svg,'text',{x:left+span/2,y:y+38,'text-anchor':'middle',fill:'#172033','font-size':width<500?10:12},width<500?'Effect (input scale)':description);
        x.left=left; return x;
    }
"""+s[b:]
s=once(s,"r.name.slice(0,27)","r.name.slice(0,svg.viewBox.baseVal.width<500?15:27)")
s=once(s,"{x:200,y:y(maxSE*i/4)+4", "{x:x.left-10,y:y(maxSE*i/4)+4")
s=once(s,"x:360+190*Math.cos(i*2*Math.PI/nodes.length),y:175+120*Math.sin(i*2*Math.PI/nodes.length)","x:svg.viewBox.baseVal.width/2+svg.viewBox.baseVal.width*.23*Math.cos(i*2*Math.PI/nodes.length),y:175+120*Math.sin(i*2*Math.PI/nodes.length)")
a=s.index('        scores.forEach((s,i)=>{');b=s.index('\n        const f=engine.generateFunnelPlot();',a)
s=s[:a]+"""        const rankWidth=rank.viewBox.baseVal.width, rankLeft=rankWidth<500?120:230, rankSpan=rankWidth-rankLeft-55;
        scores.forEach((s,i)=>{
            mark(rank,'text',{x:10,y:28+i*30,fill:'#172033','font-size':12},s.treatment.slice(0,rankWidth<500?15:40));
            mark(rank,'rect',{x:rankLeft,y:14+i*30,width:s.pScore/100*rankSpan,height:17,fill:'#176b87','data-treatment':s.treatment,'data-pscore':s.pScore});
            mark(rank,'text',{x:rankWidth-45,y:28+i*30,fill:'#172033','font-size':11},s.pScore.toFixed(1));
        });"""+s[b:]
p.write_text(s)

p=Path('tests/playwright/hta-synthesis-plots.spec.mjs');s=p.read_text()
s=once(s,"  await expect(svg).toBeVisible();", """  await expect(svg).toBeVisible();
  expect(await svg.evaluate(s=>{
    const a=s.getBoundingClientRect(),b=s.parentElement.getBoundingClientRect();
    return a.width>100 && a.left>=b.left-1 && a.right<=b.right+1;
  })).toBe(true); // A partially off-screen SVG is not a successful mobile plot.
  expect(await svg.evaluate(s=>{
    const xml=new XMLSerializer().serializeToString(s);
    return !new DOMParser().parseFromString(xml,'image/svg+xml').querySelector('parsererror');
  })).toBe(true);""")
p.write_text(s)
print('Changed display geometry only; no fit, inputs, intervals or diagnostic calculations changed.')
