(function () {
  'use strict';
  const P=AlmGoshPlus, pointFields=['mu','I2','H2','Q','tau2','tau'];
  // Semantic expectations belong to the validator, not P.axes/columnLabels.
  const axisNames={I2:'I² (%)',H2:'H²',Q:'Q',tau2:'τ²',tau:'τ'};
  const tableFields=['with_n','without_n','with_mean','without_mean','diff_mean','with_median','without_median','diff_median','with_i2','without_i2','diff_i2'];
  const columnNames=['Study','With: count','Without: count','With: mean estimate','Without: mean estimate','Difference: mean estimate','With: median estimate','Without: median estimate','Difference: median estimate','With: mean I²','Without: mean I²','Difference: mean I²'];
  const finite=x=>typeof x==='number'&&Number.isFinite(x);
  const memberKey=p=>{if(!Array.isArray(p.members)||!p.members.length||p.members.some(x=>!Number.isInteger(x)||x<1)||new Set(p.members).size!==p.members.length)throw Error('Invalid membership');return [...p.members].sort((a,b)=>a-b).join(',');};
  // Generated pins are loaded by manifest-plus.js; no downloaded manifest can replace them.
  const manifest=window.AlmGoshPlusManifest;
  // Structural display guards do not add numerical comparisons to the pinned corpus.
  function controls(a) {
    for(const [id,expected] of [
      ['plus-study',a.labels.map((label,i)=>[String(i+1),`${i+1}: ${label}`])],
      ['plus-het',Object.entries(axisNames).filter(([q])=>a.model==='DL'||!q.startsWith('tau'))]
    ]) {
      const select=document.getElementById(id), options=[...select.options];
      if(options.length!==expected.length||options.some((o,i)=>o.value!==expected[i][0]||o.textContent!==expected[i][1]||o.label!==expected[i][1]||o.disabled||o.hidden)||!expected.some(([v])=>v===select.value))throw Error('Invalid extra selector '+id);
    }
  }
  function tableOrder(a,rows) {
    const headers=[...document.querySelectorAll('#plus-table thead th')],keys=['study',...tableFields];
    if(headers.length!==keys.length||headers.some((h,i)=>h.querySelector('button')?.dataset.sort!==keys[i]||!['none','ascending','descending'].includes(h.getAttribute('aria-sort'))))throw Error('Invalid extra sort declaration');
    const active=headers.filter(h=>h.getAttribute('aria-sort')!=='none');
    if(active.length!==1)throw Error('Invalid extra sort declaration');
    const key=active[0].querySelector('button').dataset.sort,sign=active[0].getAttribute('aria-sort')==='ascending'?1:-1;
    const ids=rows.map(r=>Number(r.dataset.study));
    if(ids.length!==a.k||new Set(ids).size!==a.k)throw Error('Extra quantity coverage mismatch');
    const expected=[...a.rows].sort((x,y)=>sign*(x[key]-y[key])||x.study-y.study).map(r=>r.study);
    if(ids.some((id,i)=>id!==expected[i]))throw Error('Invalid extra table order');
  }
  // Capture clean DOM context and authored CSS, not resolved inherited lengths
  // (e.g. unitless line-height must scale with each label's font size).
  const cleanRoot=document.getElementById('plus-plot'),rootTemplate=cleanRoot.cloneNode(false),ancestors=[];
  for(let n=cleanRoot.parentElement;n;n=n.parentElement)ancestors.unshift(n.cloneNode(false));
  const cleanSheets=[...document.styleSheets].map(sheet=>[...sheet.cssRules].map(r=>r.cssText).join('\n')).join('\n');
  function styleContract(svg,a) {
    const host=document.createElement('div');
    host.style.cssText='position:fixed;left:-100000px;top:0;width:'+document.documentElement.clientWidth+'px';
    const shadow=host.attachShadow({mode:'closed'}),css=document.createElement('style');
    // Root variables/media rules belong to the isolated host, not the live page.
    css.textContent=':host {all:initial}\n'+cleanSheets.replace(/:root\b/g,':host');
    shadow.append(css);
    let parent=shadow;
    for(const template of ancestors){const n=template.cloneNode(false);parent.append(n);parent=n;}
    const ref=rootTemplate.cloneNode(false);parent.append(ref);document.body.append(host);
    try {
      P.drawPlot(ref,a,Number(document.getElementById('plus-study').value),document.getElementById('plus-het').value);
      // Flush both layout trees before reading resolved SVG box properties.
      svg.getBoundingClientRect();ref.getBoundingClientRect();
      const actual=[svg,...svg.querySelectorAll('*')],expected=[ref,...ref.querySelectorAll('*')];
      if(actual.length!==expected.length)throw Error('Extra style role coverage mismatch');
      for(let i=0;i<actual.length;i++) {
        const n=actual[i],r=expected[i],s=getComputedStyle(n),t=getComputedStyle(r);
        if(n.tagName!==r.tagName|| (i&&n.parentElement!==svg)||n.children.length&&i)throw Error('Extra style ancestry mismatch');
        const noStroke=z=>z.stroke==='none'||parseFloat(z.strokeWidth)===0||Number(z.strokeOpacity)===0;
        const unpaintedStroke=i&&noStroke(t)&&noStroke(s),differences=[],properties=Array.from(t);
        // Enumerate ALL browser properties; no paint-property allowlist.
        for(const p of properties) {
          // Outer SVG margins place the viewport, not paint within it. Chromium
          // resolves auto margins differently after harmless mark mutations in
          // the live/offscreen contexts. Dimensions and transforms stay checked.
          if(!i&&['margin-left','margin-right','margin-inline-start','margin-inline-end'].includes(p))continue;
          // App-region controls native window dragging, never SVG paint.
          if(p==='app-region'||p==='-webkit-app-region'||p==='cursor')continue;
          // A straight open tick has no fill area. Unpainted strokes may vary
          // only if the actual stroke also contributes no paint.
          if(r.tagName==='path'&&(p==='fill'||p==='fill-opacity'))continue;
          if(unpaintedStroke&&(p==='stroke'||p.startsWith('stroke-')))continue;
          if(s.getPropertyValue(p)!==t.getPropertyValue(p))differences.push(p+': '+s.getPropertyValue(p)+' != '+t.getPropertyValue(p));
        }
        if(differences.length)throw Error('Extra style contract '+n.tagName+' '+differences.join('; '));
      }
    } finally {host.remove();}
  }

// Axis-label coverage is separate from the numerical and geometry contracts.
let axisLabels=[];
const axisSummary=rows=>['Axis labels: '+rows.filter(r=>r.checked).length+' checked; '+rows.filter(r=>!r.checked).length+' not checked.',...rows.filter(r=>!r.checked).map(r=>(r.id?r.id+' ':'')+r.axis+': '+r.message)];
function calibratedTicks(samples,ticks,digits,name,domain) {
 const row={axis:name,checked:false,message:'axis labels: not checked (scale not determined by validated marks)'};
 axisLabels.push(row);
 const fail=message=>{throw Error(name+' calibrated axis '+message);};
 const length=Math.abs(ticks[1]?.position-ticks[0]?.position);
 if(samples.length<2||samples.some(p=>!p.every(Number.isFinite))||!Number.isFinite(length)||length===0)return;
 const values=samples.map(p=>p[0]),lo=values.reduce((a,b)=>Math.min(a,b),Infinity),hi=values.reduce((a,b)=>Math.max(a,b),-Infinity),span=hi-lo;
 const positions=samples.map(p=>p[1]);
 row.coverage=(positions.reduce((a,b)=>Math.max(a,b),-Infinity)-positions.reduce((a,b)=>Math.min(a,b),Infinity))/length;
 if(!Number.isFinite(span)||span===0||!Number.isFinite(row.coverage)||row.coverage<.2)return;
 const sum=xs=>{let s=0,c=0;for(const x of xs){const t=s+x;c+=Math.abs(s)>=Math.abs(x)?(s-t)+x:(x-t)+s;s=t;}return s+c;};
 const z=values.map(v=>(v-lo)/span),zm=sum(z)/z.length;
 const pm=sum(positions)/samples.length,variance=sum(z.map(v=>(v-zm)**2));
 const slope=sum(z.map((v,i)=>(v-zm)*(positions[i]-pm)))/variance,intercept=pm-slope*zm;
 row.residual=samples.reduce((r,p,i)=>Math.max(r,Math.abs(p[1]-(intercept+slope*z[i]))),0);
 if(!Number.isFinite(slope)||slope===0||!Number.isFinite(row.residual)||row.residual>1e-7)return;
 const labels=ticks.map(t=>Number(t.text));
 if(ticks.some(t=>!Number.isFinite(t.position)))return;
 if(ticks.some(t=>!t.text.trim())||!labels.every(Number.isFinite))fail('tick coverage');
 const inferred=ticks.map(t=>lo+span*(t.position-intercept)/slope);
 if(!inferred.every(Number.isFinite))return;
 const ordered=ticks.map((t,i)=>({position:t.position,value:inferred[i],label:labels[i]})).sort((a,b)=>a.position-b.position);
 const spacings=ordered.slice(1).map((t,i)=>Math.abs(t.value-ordered[i].value)).sort((a,b)=>a-b);
 const middle=Math.floor(spacings.length/2);
 const step=spacings.length%2?spacings[middle]:spacings[middle-1]/2+spacings[middle]/2;
 if(!Number.isFinite(step)||step<=0||step/2===0)return;
 row.step=step;
 // Shown resolution is only an eligibility gate, never an error allowance.
 const units=ticks.map((t,i)=>{
  const match=t.text.trim().match(/^[+-]?(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i);
  if(!match)return Infinity; // Finite numeric syntax with unknown decimal resolution.
  const shown=10**(Number(match[3]||0)-(match[2]||'').length);
  // Number(toPrecision(digits)) strips trailing zeroes in ordinary integers.
  // Recover the formatter's quantum from the inferred value, independently of
  // the displayed label. This is eligibility only, never an error tolerance.
  const exponent=inferred[i]===0?0:Number(Math.abs(inferred[i]).toExponential().split('e')[1]);
  const formatted=inferred[i]===0?0:10**(exponent-digits+1);
  return Math.max(shown,formatted);
 });
 if(ordered.slice(1).some((t,i)=>t.label===ordered[i].label)||units.some(unit=>!Number.isFinite(unit)||unit>step/2)){
  row.checked=false;row.message='axis labels: not checked (labels coarser than tick spacing)';return;
 }
 row.checked=true;row.message='axis labels: checked';
 for(let i=0;i<labels.length;i++)if(Math.abs(labels[i]-inferred[i])>step/2)fail('label does not match mark scale');
}

  function plotGeometry(svg,circles,a,refs) {
    axisLabels=[];
    styleContract(svg,a);
    const view=svg.viewBox.baseVal, root=svg.getScreenCTM(), box=svg.getBoundingClientRect();
    if(!root||box.width<=0||box.height<=0||view.x!==0||view.y!==0||view.width!==600||view.height!==420)throw Error('Invalid extra plot viewport');
    const inverse=root.inverse(),seen=new Set(),styles=new Map();
    const style=e=>{if(!styles.has(e))styles.set(e,getComputedStyle(e));return styles.get(e);};
    const screen=(n,x,y)=>new DOMPoint(x,y).matrixTransform(n.getScreenCTM());
    const near=(p,q)=>{if(![p.x,p.y,q.x,q.y].every(finite)||Math.hypot(p.x-q.x,p.y-q.y)>.02)throw Error('Invalid extra screen geometry');};
    // Arbitrary masks/clip paths cannot establish full paint coverage: fail closed.
    // Overflow rectangles are checked in screen space, including the SVG viewport.
    function painted(n) {
      const b=n.getBoundingClientRect();
      if(!(b.width>0&&b.height>0)&&!(n.tagName==='path'&&b.width+b.height>0))throw Error('Invisible extra geometry');
      for(let e=n;e;e=e.parentElement){const s=style(e);
        if(s.display==='none'||s.visibility!=='visible'||Number(s.opacity)<=0||s.clipPath!=='none'||(s.maskImage&&s.maskImage!=='none')||(s.mask&&s.mask!=='none'&&s.maskImage!=='none'))throw Error('Invisible or clipped extra geometry');
        if(e!==n&&e!==document.body&&e!==document.documentElement){
          const r=e.getBoundingClientRect();
          if((e===svg||['hidden','clip','scroll','auto'].includes(s.overflowX))&&(b.left<r.left-.02||b.right>r.right+.02))throw Error('Clipped extra geometry '+n.tagName+' '+n.textContent+' by '+e.tagName+'#'+e.id+' '+JSON.stringify({paint:[b.left,b.top,b.right,b.bottom],clip:[r.left,r.top,r.right,r.bottom]}));
          if((e===svg||['hidden','clip','scroll','auto'].includes(s.overflowY))&&(b.top<r.top-.02||b.bottom>r.bottom+.02))throw Error('Clipped extra geometry '+n.tagName+' '+n.textContent+' by '+e.tagName+'#'+e.id+' '+JSON.stringify({paint:[b.left,b.top,b.right,b.bottom],clip:[r.left,r.top,r.right,r.bottom]}));
        }
      }
      const s=style(n);
      if(n.tagName==='path'&&(s.stroke==='none'||s.stroke==='transparent'||/rgba\([^)]*,\s*0\s*\)/.test(s.stroke)||Number(s.strokeOpacity)<=0||!(parseFloat(s.strokeWidth)>0)))throw Error('Invisible extra tick');
      if(n.tagName!=='path'&&(Number(s.fillOpacity)<=0||s.fill==='none'||s.fill==='transparent'||/rgba\([^)]*,\s*0\s*\)/.test(s.fill)))throw Error('Invisible extra paint');
      return b;
    }
    const ticks=[...svg.querySelectorAll('[data-plus-tick]')],coords=[[60,370],[580,370],[60,370],[60,20]];
    if(ticks.length!==4)throw Error('Missing extra ticks');
    const anchors=ticks.map((n,i)=>{painted(n);const p=n.getPointAtLength(0),q=screen(n,p.x,p.y);near(q,screen(svg,...coords[i]));return q;});
    const labels=[...svg.querySelectorAll('text')],labelCoords=[[240,415],[5,15],[60,390],[580,390],[5,370],[5,30]];
    if(labels.length!==6)throw Error('Missing extra axes');
    labels.forEach((n,i)=>{
      if(!n.textContent.trim())throw Error('Missing extra axis value');
      painted(n);for(const child of n.querySelectorAll('*'))painted(child);
      if(!(parseFloat(style(n).fontSize)>0)||!n.getNumberOfChars())throw Error('Invisible extra label');
      // Character positions include dx/dy, tspan offsets and text transforms.
      for(let j=0;j<n.getNumberOfChars();j++){
        const p=n.getStartPositionOfChar(j),q=n.getEndPositionOfChar(j),[anchor,y]=labelCoords[i],x=anchor-(i===3?n.getComputedTextLength():0);
        near(screen(n,p.x,p.y),screen(svg,x+(j?n.getSubStringLength(0,j):0),y));
        near(screen(n,q.x,q.y),screen(svg,x+n.getSubStringLength(0,j+1),y));
      }
    });
    const het=document.getElementById('plus-het').value,xs=a.points.map(p=>p.mu),ys=a.points.map(p=>p[het]);

    for(const [axis,quantity,indices] of [['x','mu',[0,1]],['y',het,[2,3]]]){
      const samples=circles.map((c,i)=>[refs?refs[quantity+'.'+i]:a.points[i][quantity],screen(c,Number(c.getAttribute('cx')),Number(c.getAttribute('cy')))[axis]]);
      calibratedTicks(samples,indices.map((j,i)=>({text:labels[2+j].textContent,position:anchors[j][axis]})),12,'extra '+axis,axis==='x'?[samples[0][0],samples[0][0]]:[Math.min(0,samples[0][0]),samples[0][0]]);
    }
    const lo=Math.min(...xs),hi=Math.max(...xs),yl=Math.min(0,...ys),yh=Math.max(...ys);
    const fraction=(v,l,h)=>l===h?.5:(v/Math.max(Math.abs(l),Math.abs(h))-l/Math.max(Math.abs(l),Math.abs(h)))/(h/Math.max(Math.abs(l),Math.abs(h))-l/Math.max(Math.abs(l),Math.abs(h)));
    return circles.map((c,i)=>{
      if(c.dataset.index!==String(i)||seen.has(c.dataset.index)||i>=a.points.length)throw Error('Invalid extra subset coverage');
      seen.add(c.dataset.index);painted(c);
      const s=style(c),m=c.getScreenCTM(),b=c.getBBox();
      if(!m||!(parseFloat(s.r)>0)||!finite(m.a*m.d-m.b*m.c)||m.a*m.d-m.b*m.c===0)throw Error('Invisible extra point');
      const u=fraction(xs[i],lo,hi),v=fraction(ys[i],yl,yh);
      near(screen(c,b.x+b.width/2,b.y+b.height/2),{x:anchors[0].x+u*(anchors[1].x-anchors[0].x)+v*(anchors[3].x-anchors[2].x),y:anchors[0].y+u*(anchors[1].y-anchors[0].y)+v*(anchors[3].y-anchors[2].y)});
      const colour=a.points[i].members.includes(Number(document.getElementById('plus-study').value))?'rgb(0, 114, 178)':'rgb(213, 94, 0)';
      if(s.fill!==colour)throw Error('Invalid extra computed colour');
      // Retain the pinned 1e-9 numeric contract separately from the .02 CSS-pixel
      // screen guard (browser SVG bounding boxes are float-rounded).
      return new DOMPoint(Number(c.getAttribute('cx')),Number(c.getAttribute('cy'))).matrixTransform(inverse.multiply(m));
    });
  }

  function values(refs) {
    const a=P.state;if(!a)throw Error('No extras to validate');const out=[];
    controls(a);
    const add=(key,value,exact=false)=>{if(!exact&&!finite(value))throw Error('Invalid displayed '+key);out.push({key,label:key,value,exact});};
    const headings=[...document.querySelectorAll('#plus-table thead button')].map(e=>e.textContent);
    if(JSON.stringify(headings)!==JSON.stringify(columnNames))throw Error('Invalid extra table headers');
    const rows=[...document.querySelectorAll('#plus-table tbody tr')];
    tableOrder(a,rows);
    add('row_count',rows.length,true);
    for(const row of rows){const i=Number(row.dataset.study);if(!Number.isInteger(i)||i<1||i>a.k||row.querySelector('th button')?.textContent!==`${i}: ${a.labels[i-1]}`)throw Error('Invalid extra study label');for(const q of P.fields){const cells=row.querySelectorAll(`[data-quantity="${q}"]`);if(cells.length!==1||!cells[0].textContent.trim())throw Error('Missing displayed '+q);add(`study.${i}.${q}`,Number(cells[0].textContent),q.endsWith('_n'));}}
    a.points.forEach((p,i)=>{add('members.'+i,memberKey(p),true);for(const q of pointFields)if(a.model==='DL'||!q.startsWith('tau'))add(q+'.'+i,p[q]);});
    const circles=[...document.querySelectorAll('#plus-plot circle')];add('plot_count',circles.length,true);
    const positions=plotGeometry(document.getElementById('plus-plot'),circles,a,refs);
    circles.forEach((c,i)=>{add('plot_x.'+i,positions[i].x);add('plot_y.'+i,positions[i].y);add('included.'+i,c.dataset.includes,true);add('colour.'+i,getComputedStyle(c).fill==='rgb(0, 114, 178)'?'#0072b2':'#d55e00',true);});
    add('highlight_counts',document.getElementById('plus-counts').textContent,true);
    const ticks=[...document.querySelectorAll('#plus-plot text')];if(ticks.length!==6)throw Error('Missing extra axes');
    // Keep the numerical domain replay independent of the conditional label audit.
    const xs=a.points.map(p=>p.mu),ys=a.points.map(p=>p[document.getElementById('plus-het').value]);
    const domain=[Math.min(...xs),Math.max(...xs),Math.min(0,...ys),Math.max(...ys)];
    ['x_title','y_title','xmin','xmax','ymin','ymax'].forEach((q,i)=>{const text=ticks[i].textContent.trim();if(i>=2&&!text)throw Error('Missing extra axis value '+q);add(q,i<2?ticks[i].textContent:domain[i-2],i<2);});
    return out;
  }
  function referenceValues(r,k,model) {
    if(!Array.isArray(r.rows)||r.rows.length!==k||!Array.isArray(r.points)||!r.points.length)throw Error('Invalid reference shape');
    const grouped=new Map();for(const p of r.points){const key=memberKey(p);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(p);}
    const ordered=P.state.points.map(p=>{const queue=grouped.get(memberKey(p));if(!queue?.length)throw Error('Reference membership coverage mismatch');return queue.shift();});
    if([...grouped.values()].some(queue=>queue.length))throw Error('Reference membership coverage mismatch');
    r={...r,points:ordered};
    const v={row_count:k};const seen=new Set();
    for(const row of r.rows){if(!Number.isInteger(row.study)||row.study<1||row.study>k||seen.has(row.study))throw Error('Invalid study coverage');seen.add(row.study);for(const q of P.fields){if(!finite(row[q]))throw Error('Missing reference '+q);v[`study.${row.study}.${q}`]=row[q];}}
    r.points.forEach((p,i)=>{if(p.members.some(m=>m>k))throw Error('Invalid reference membership');v['members.'+i]=memberKey(p);for(const q of pointFields)if(model==='DL'||!q.startsWith('tau')){if(!finite(p[q]))throw Error('Missing reference '+q);v[q+'.'+i]=p[q];}});
    const selected=Number(document.getElementById('plus-study').value),het=document.getElementById('plus-het').value;
    if(!Number.isInteger(selected)||selected<1||selected>k||!Object.hasOwn(axisNames,het)||(model!=='DL'&&het.startsWith('tau')))throw Error('Invalid extra controls');
    const xs=r.points.map(p=>p.mu),ys=r.points.map(p=>p[het]),lo=Math.min(...xs),hi=Math.max(...xs),yl=Math.min(0,...ys),yh=Math.max(...ys);
    const pos=(x,l,h,o,n)=>{if(l===h)return o+n/2;const s=Math.max(Math.abs(l),Math.abs(h));return o+n*((x/s-l/s)/(h/s-l/s));};
    v.plot_count=r.points.length;Object.assign(v,{x_title:'Pooled effect',y_title:axisNames[het],xmin:lo,xmax:hi,ymin:yl,ymax:yh});
    r.points.forEach((p,i)=>{v['plot_x.'+i]=pos(p.mu,lo,hi,60,520);v['plot_y.'+i]=400-pos(p[het],yl,yh,30,350);v['included.'+i]=String(p.members.includes(selected));v['colour.'+i]=p.members.includes(selected)?'#0072b2':'#d55e00';});
    const row=r.rows.find(x=>x.study===selected);v.highlight_counts=`Includes study ${selected}: ${row.with_n} (blue); excludes study ${selected}: ${row.without_n} (orange).`;
    return v;
  }
  function compare(r,k,model,check) {
    const refs=referenceValues(r,k,model), actual=values(refs);
    if(actual.length!==Object.keys(refs).length||new Set(actual.map(v=>v.key)).size!==actual.length)throw Error('Extra quantity coverage mismatch');
    for(const v of actual){if(!Object.hasOwn(refs,v.key))throw Error('Unknown extra quantity');check(v.key,v.value,refs[v.key],v.exact?'exact':'rel');}
  }
  async function replay(loaded,progress) {
    const corpus=loaded[manifest.files[0].path],refs=loaded[manifest.files[1].path];
    if(!Array.isArray(corpus)||corpus.length!==manifest.configurations||!Array.isArray(refs)||refs.length!==manifest.model_configurations)throw Error('Corpus cardinality mismatch');
    const index=new Map(refs.map(r=>[r.key,r]));if(index.size!==refs.length)throw Error('Duplicate reference key');
    const ids=new Set();for(const c of corpus){if(ids.has(c.id)||!Number.isInteger(c.k)||c.k<3||c.k>100||!Array.isArray(c.te)||!Array.isArray(c.se)||c.te.length!==c.k||c.se.length!==c.k||c.te.some(x=>!finite(x))||c.se.some(x=>!finite(x)||x<=0))throw Error('Invalid corpus input');ids.add(c.id);for(const m of ['FE','DL'])if(!index.has(c.id+'::'+m))throw Error('Missing reference');}
    const status=document.getElementById('plus-status').textContent;
    const previous=P.state,selection=document.getElementById('plus-study').value,het=document.getElementById('plus-het').value;
    let checks=0,passed=0;const failed=[],maxima={},axisCoverage=[];
    try {for(const c of corpus)for(const model of ['FE','DL']){
      const id=c.id+'::'+model,r=index.get(id);
      P.render(P.capture(c.te.map((v,i)=>`${v}, ${c.se[i]}, ${c.source_rows[i]}`).join('\n'),model,5000));
      compare(r,c.k,model,(quantity,app,ref,kind)=>{const d=AlmValidate.compare(app,ref,kind,1e-9);checks++;if(d.pass)passed++;else failed.push({id,quantity,app,ref,...d});if(failed.length>=1000)throw Error('Extras replay stopped after 1000 mismatches; first: '+JSON.stringify(failed[0]));const group=quantity.startsWith('study.')?quantity.split('.').at(-1):quantity.split('.')[0];maxima[group]=Math.max(maxima[group]||0,d.diff);});
      axisCoverage.push(...axisLabels.map(row=>({...row,id})));
      progress(id+': '+checks+' checks');await new Promise(resolve=>setTimeout(resolve,0));
    }}finally {if(previous){P.render(previous);document.getElementById('plus-study').value=selection;document.getElementById('plus-study').dispatchEvent(new Event('change'));document.getElementById('plus-het').value=het;document.getElementById('plus-het').dispatchEvent(new Event('change'));}else P.clear();document.getElementById('plus-status').textContent=status;}
    if(checks!==manifest.checks)throw Error('Extra check cardinality mismatch: '+checks);
    return {checks,passed,failed,maxima,axisCoverage,refusals:[],summaryLines:[...axisSummary(axisCoverage),'Every displayed table value and every extra point quantity; exact memberships and counts; relative tolerance 1e-9.',"Sampled summaries use the app's own draws, checked against archived R fits on the same memberships."]};
  }
  function currentState() {
    const a=P.capture();P.render(a);
    const lines=document.getElementById('src').value.trim().split(/\n/).map(l=>l.split(','));
    const v=values();adapter.live.compare.kind=Object.fromEntries(v.map(x=>[x.key,x.exact?'exact':'rel']));
    return {...a,te:lines.map(l=>Number(l[0])),se:lines.map(l=>Number(l[1])),values:v,axisCoverage:axisLabels,note:axisSummary(axisLabels).join(' ')+' '+"Overlapping subsets: descriptive differences only. Sampled results use the app's own draws. Paper metafor 5.2-1; live 4.8-0."};
  }
  function buildScript(s) {return `
selected<-${Number(document.getElementById('plus-study').value)};het<-'${document.getElementById('plus-het').value}'
yi<-c(${s.te.join(',')});vi<-c(${s.se.map(x=>x*x).join(',')});method<-'${s.model}'
members<-list(${s.points.map(p=>'c('+p.members.join(',')+')').join(',')})
base<-metafor::rma(yi,vi,method=method)
if(length(yi)<=15){sav<-metafor::gosh(base,progbar=FALSE);keys<-apply(sav$incl,1,function(x)paste(which(x),collapse=','));idx<-match(vapply(members,function(m)paste(sort(m),collapse=','),''),keys);stopifnot(!anyNA(idx),!anyDuplicated(idx),length(idx)==nrow(sav$res));res<-sav$res[idx,,drop=FALSE];incl<-sav$incl[idx,,drop=FALSE]
}else{res<-do.call(rbind,lapply(members,function(m){z<-metafor::rma(yi[m],vi[m],method=method);data.frame(estimate=as.numeric(coef(z)),I2=z$I2,QE=z$QE,H2=z$QE/(length(m)-1),tau2=z$tau2,tau=sqrt(z$tau2))}));incl<-t(vapply(members,function(m)seq_along(yi)%in%m,logical(length(yi))))}
out<-list(row_count=length(yi));for(i in seq_along(yi)){a<-incl[,i];stopifnot(any(a),any(!a));v<-list(with_n=sum(a),without_n=sum(!a));for(q in c('mean','median','i2')){x<-if(q=='i2')res$I2 else res$estimate;f<-if(q=='median')median else mean;v[[paste0('with_',q)]]<-f(x[a]);v[[paste0('without_',q)]]<-f(x[!a]);v[[paste0('diff_',q)]]<-f(x[a])-f(x[!a])};for(q in names(v))out[[paste0('study.',i,'.',q)]]<-v[[q]]}
for(i in seq_along(members)){out[[paste0('members.',i-1)]]<-paste(sort(members[[i]]),collapse=',');v<-list(mu=res$estimate[i],I2=res$I2[i],H2=res$H2[i],Q=res$QE[i]);if(method=='DL'){v$tau2<-res$tau2[i];v$tau<-res$tau[i]};for(q in names(v))out[[paste0(q,'.',i-1)]]<-v[[q]]}
xx<-res$estimate;yy<-res[[if(het=='Q')'QE' else het]];pos<-function(x,l,h,o,n){if(l==h)return(o+n/2);s<-max(abs(l),abs(h));o+n*((x/s-l/s)/(h/s-l/s))}
out$plot_count<-nrow(res);out$x_title<-'Pooled effect';out$y_title<-'${axisNames[document.getElementById('plus-het').value]}';out$xmin<-min(xx);out$xmax<-max(xx);out$ymin<-min(0,yy);out$ymax<-max(yy)
for(i in seq_along(members)){out[[paste0('plot_x.',i-1)]]<-pos(xx[i],min(xx),max(xx),60,520);out[[paste0('plot_y.',i-1)]]<-400-pos(yy[i],min(0,yy),max(yy),30,350);out[[paste0('included.',i-1)]]<-if(selected%in%members[[i]])'true' else 'false';out[[paste0('colour.',i-1)]]<-if(selected%in%members[[i]])'#0072b2' else '#d55e00'}
out$highlight_counts<-paste0('Includes study ',selected,': ',sum(incl[,selected]),' (blue); excludes study ',selected,': ',sum(!incl[,selected]),' (orange).')
emit<-function(q){x<-out[[q]];if(is.character(x))paste0('"',x,'"')else{stopifnot(is.numeric(x),length(x)==1,is.finite(x));sprintf('%.17g',x)}}
cat('ALMJSON:{',paste(paste0('"',names(out),'":',vapply(names(out),emit,'')),collapse=','),'}\\n',sep='')
`;}
  const adapter={app:'gosh-plus',paper:{checks:manifest.checks,repoUrl:'https://github.com/mahmood726-cyber/allmeta',runLabel:'Extras scope and reproduction',runUrl:'validate/plus/README.md'},live:{packages:['metafor'],paperVersions:{metafor:'5.2-1'},currentState,buildScript,appValues:s=>s.values,compare:{tolerance:{default:1e-9},kind:{}}},corpus:{files:manifest.files,mode:'quick',quickChecks:manifest.checks,run:replay}};
  Object.defineProperty(adapter,'axisLabels',{get:()=>axisLabels});adapter.compareDisplay=compare;window.AlmGoshPlusAdapter=adapter;window.AlmGoshPlusValidation=AlmValidate.mount(document.getElementById('alm-plus-validate'),adapter);
  for(const button of document.querySelectorAll('#alm-plus-validate button')){if(button.textContent==='Replay published corpus (stored references)')button.textContent='Re-run extras validation';if(button.textContent==='Validate this analysis in R')button.textContent='Validate the extras in R';}
})();
