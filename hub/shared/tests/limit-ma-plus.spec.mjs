import {test,expect} from './validation-fixture.mjs';
import {writeFileSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const url='/limit-ma/index.html';
for(const mode of ['http','file'])test('limit-ma-plus clean reference style smoke '+mode,async({page})=>{
 await page.goto(mode==='file'?new URL('../../../limit-ma/index.html',import.meta.url).href:url);await page.evaluate(()=>AlmLimitPlusReady);
 if(mode==='file'){
  const manifest=JSON.parse(readFileSync(new URL('../../../limit-ma/validate/MANIFEST-plus.json',import.meta.url),'utf8'));
  await page.locator('#alm-plus-validate input[type=file]').setInputFiles(manifest.files.map(f=>fileURLToPath(new URL('../../../limit-ma/'+f.path,import.meta.url))));
 }
 await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished)));
 const failures=await page.evaluate(async()=>{
  const loaded=await AlmLimitPlusValidation.prepare(),c=loaded[AlmLimitPlusValidationAdapter.corpus.files[0].path][0];
  __almLimitValidationRun(c.te.map((x,i)=>x+','+c.se[i]).join('\n'),true);
  const limit=_almLastLimit(),r=AlmLimitPlus.compute(c,limit);AlmLimitPlusUI.render(r,c,limit);
  return AlmLimitPlusContract.geometry(r,c,limit);
 });expect(failures).toEqual([]);
});
test('limit-ma-plus all configurations and displayed quantities versus pinned R',async({page})=>{
 test.setTimeout(240000);await page.goto(url);await page.evaluate(()=>AlmLimitPlusReady);
 const before=await page.evaluate(()=>__almLimitValidationSnapshot());
 const r=await page.evaluate(()=>AlmLimitPlusValidation.runCorpus());
 writeFileSync(new URL('../../../limit-ma/validate/plus/evidence-replay.json',import.meta.url),JSON.stringify(r,null,2)+'\n');
 console.log('LIMIT PLUS',r.passed+'/'+r.checks,'failed',r.failed.length);
 expect(await page.evaluate(()=>__almLimitValidationSnapshot())).toEqual(before);
 expect(r.failed).toEqual([]);
});
test('limit-ma-plus every displayed quantity has a mutation detector',async({page})=>{
 await page.goto(url);await page.evaluate(()=>AlmLimitPlusReady);await page.locator('#plus-run').click();
 const result=await page.evaluate(async()=>{
  const loaded=await AlmLimitPlusValidation.prepare(),files=AlmLimitPlusValidationAdapter.corpus.files,corpus=loaded[files[0].path];
  const seen=new Set(),missedAll=[];
  for(const c of corpus){
   __almLimitValidationRun(c.te.map((x,i)=>x+','+c.se[i]).join('\n'),true);const lim=_almLastLimit(),r=AlmLimitPlus.compute(c,lim);AlmLimitPlusUI.render(r,c,lim);
   const expected=AlmLimitPlusContract.flatten(r);
   for(const node of document.querySelectorAll('#alm-plus [data-plus-number],#alm-plus [data-plus-category],#alm-plus [data-plus-refusal]')){
    const key=(node.dataset.plusNumber||node.dataset.plusCategory||node.dataset.plusRefusal+'.reason').replace(/\.\d+$/,'[]');if(seen.has(key))continue;seen.add(key);const text=node.textContent;node.textContent+='9';if(!AlmLimitPlusContract.displayed(expected).length)missedAll.push(key);node.textContent=text;
   }
  }
  const contract=AlmLimitPlusContract,expected=contract.flatten(AlmLimitPlusUI.snapshot().results),nodes=[...document.querySelectorAll('#alm-plus [data-plus-number],#alm-plus [data-plus-category],#alm-plus [data-plus-refusal]')];
  const missed=[];for(const node of nodes){const before=node.textContent;node.textContent+='9';if(!contract.displayed(expected).length)missed.push(node.outerHTML);node.textContent=before;}
  const removed=nodes.find(n=>n.dataset.plusNumber==='PET.slope'),parent=removed.parentNode,next=removed.nextSibling;removed.remove();const missing=contract.displayed(expected);parent.insertBefore(removed,next);
  return {nodes:seen.size,missed:missed.concat(missedAll),missing,clean:contract.displayed(expected),keys:[...seen]};
 });
 expect(result.nodes).toBeGreaterThan(60);expect(result.keys).toContain('selection.delta');expect(result.keys).toContain('trimfill.imputed[]');expect(result.missed).toEqual([]);expect(result.missing).toContain('PET.slope missing');expect(result.clean).toEqual([]);
 console.log('LIMIT PLUS MUTATIONS',result.nodes,'detected');
});
test('limit-ma-plus altered bytes and malformed references fail closed',async({page})=>{
 await page.goto(url);await page.evaluate(()=>AlmLimitPlusReady);
 await page.route('**/validate/plus/reference.json',r=>r.fulfill({contentType:'application/json',body:'[]'}));
 await expect(page.evaluate(()=>AlmLimitPlusValidation.runCorpus())).rejects.toThrow('SHA-256 mismatch');
 await page.unroute('**/validate/plus/reference.json');
 const errors=await page.evaluate(async()=>{
  const loaded=await AlmLimitPlusValidation.prepare(),files=AlmLimitPlusValidationAdapter.corpus.files,c=loaded[files[0].path],r=loaded[files[1].path];
  const mutations=[x=>x.pop(),x=>x[1].id=x[0].id,x=>delete x[0].methods.PET.values.p,x=>x[0].methods.PET.values.p=null,x=>x[0].methods.PET.values.p='1',x=>x[0].methods.PET.values.p=Infinity,x=>x[0].methods.conditional.branch='unknown'];
  return mutations.map(m=>{const copy=structuredClone(r);m(copy);try{AlmLimitPlusContract.validate(c,copy);return 'UNSAFE PASS';}catch(e){return e.message;}});
 });expect(errors).not.toContain('UNSAFE PASS');
});
test('limit-ma-plus exact refusals, alpha tie, keyboard and accessible controls',async({page})=>{
 await page.goto(url);await page.evaluate(()=>AlmLimitPlusReady);
 await page.locator('#plus-run').focus();await page.keyboard.press('Enter');await expect(page.locator('#plus-status')).toContainText('complete');
 await expect(page.locator('#alm-plus')).toContainText('Small-study tests have low power with few studies');
 const r=await page.evaluate(()=>{
  const c={te:[.1,.2,.3,.4],se:[.1,.12,.15,.18]},m=AlmLimitPlus.compute(c,null);
  return {egger:m.Egger,peters:m.Peters,empty:AlmLimitPlus.compute({te:[3,4,5],se:[.1,.2,.3]},null).selection,
   tie:AlmLimitPlus.conditional(m.PET,m.PEESE,m.PET.values.p),singular:AlmLimitPlus.reg([1,2,3],[.2,.2,.2],1)};
 });expect(r.egger).toEqual({status:'refused',reason:'k-below-10'});expect(r.peters.reason).toBe('binary-arm-counts-required');expect(r.empty.reason).toBe('empty-interval');expect(r.tie.reason).toBe('alpha-tie');expect(r.singular.reason).toBe('singular-design');
 for(const id of ['plus-limit-toggle','plus-fill-toggle','plus-reg-toggle','plus-contour-toggle']){
  const check=page.locator('#'+id);await check.focus();const before=await check.isChecked();await page.keyboard.press('Space');expect(await check.isChecked()).toBe(!before);await expect(check).toHaveAccessibleName(/.+/);
 }
 await expect(page.locator('#plus-forest')).toHaveAttribute('role','img');await expect(page.locator('#plus-funnel')).toHaveAttribute('role','img');
 await page.locator('#alm-plus').screenshot({path:'test-results/limit-ma-plus.png'});
 await page.locator('#src').fill('0.1,0.1\nbad,0.2\n0.3,0.3');await page.locator('#plus-run').click();await expect(page.locator('#plus-status')).toContainText('Refused');await expect(page.locator('#plus-body tr')).toHaveCount(0);
});
test('limit-ma-plus binary Peters inputs match R and reject mismatched counts',async({page})=>{
 await page.goto(url);await page.evaluate(()=>AlmLimitPlusReady);
 const cases=await page.evaluate(async()=>{const x=await AlmLimitPlusValidation.prepare(),f=AlmLimitPlusValidationAdapter.corpus.files;return x[f[0].path].map((c,i)=>({c,r:x[f[1].path][i]})).filter(x=>x.c.binary);});
 expect(cases.map(x=>x.c.binary.measure).sort()).toEqual(['OR','RR']);
 await page.locator('#alm-plus details summary').click();
 for(const {c,r} of cases){
  await page.locator('#src').fill(c.te.map((x,i)=>x+','+c.se[i]).join('\n'));
  await page.locator('#plus-binary-measure').selectOption(c.binary.measure);
  await page.locator('#plus-binary-counts').fill(c.binary.rows.map(x=>x.join(',')).join('\n'));
  await page.locator('#plus-run').click();await expect(page.locator('[data-plus-number="Peters.p"]')).toHaveText(r.methods.Peters.values.p.toPrecision(12));
  const bad=structuredClone(c.binary.rows);bad[0][1]++;
  await page.locator('#plus-binary-counts').fill(bad.map(x=>x.join(',')).join('\n'));await page.locator('#plus-run').click();
  await expect(page.locator('[data-plus-refusal="Peters"]')).toContainText('binary-effect-mismatch');
 }
});
test('limit-ma-plus changed refusal and conditional branch are failed comparisons',async({page})=>{
 test.setTimeout(240000);await page.goto(url);await page.evaluate(()=>AlmLimitPlusReady);
 const failures=await page.evaluate(async()=>{const x=structuredClone(await AlmLimitPlusValidation.prepare()),a=AlmLimitPlusValidationAdapter,r=x[a.corpus.files[1].path];r[0].methods.Peters.reason='changed';r[0].methods.conditional.branch=r[0].methods.conditional.branch==='PET'?'PEESE':'PET';return(await a.corpus.run(x,()=>{})).failed.map(x=>x.quantity);});
 expect(failures).toEqual(['conditional.branch','Peters.reason']);
});

test('limit-ma-plus offline file picker replays its separate pins',async({page,context})=>{
 test.setTimeout(240000);await context.setOffline(true);await page.goto(new URL('../../../limit-ma/index.html',import.meta.url).href);await page.evaluate(()=>AlmLimitPlusReady);
 const manifest=JSON.parse(readFileSync(new URL('../../../limit-ma/validate/MANIFEST-plus.json',import.meta.url),'utf8'));
 await page.locator('#alm-plus-validate input[type=file]').setInputFiles(manifest.files.map(f=>fileURLToPath(new URL('../../../limit-ma/'+f.path,import.meta.url))));
 await page.getByRole('button',{name:'Re-run sensitivity validation',exact:true}).click();
 await expect(page.locator('#alm-plus-validate [role=status]')).toContainText(`${manifest.checks}/${manifest.checks} passed; 0 failed`,{timeout:180000});
});

test('limit-ma-plus categorical/refusal deletion, duplication and relocation fail closed',async({page})=>{
 await page.goto(url);await page.evaluate(()=>AlmLimitPlusReady);
 const result=await page.evaluate(async()=>{
  const loaded=await AlmLimitPlusValidation.prepare(),f=AlmLimitPlusValidationAdapter.corpus.files,seen=new Set(),missed=[];let checks=0;
  for(const c of loaded[f[0].path]){
   __almLimitValidationRun(c.te.map((x,i)=>x+','+c.se[i]).join('\n'),true);const limit=_almLastLimit(),r=AlmLimitPlus.compute(c,limit);AlmLimitPlusUI.render(r,c,limit);const expected=AlmLimitPlusContract.flatten(r);
   if(AlmLimitPlusContract.displayed(expected).length)missed.push('clean '+c.id);
   for(const n of document.querySelectorAll('#alm-plus [data-plus-category],#alm-plus [data-plus-refusal]')){
    const key=n.outerHTML+'@'+(n.closest('[data-plus-method]')?'table':'detail');if(seen.has(key))continue;seen.add(key);
    const parent=n.parentNode,next=n.nextSibling;
    n.remove();checks++;if(!AlmLimitPlusContract.displayed(expected).length)missed.push('deletion '+key);parent.insertBefore(n,next);
    const clone=n.cloneNode(true);parent.append(clone);checks++;if(!AlmLimitPlusContract.displayed(expected).length)missed.push('duplicate '+key);clone.remove();
    document.getElementById('plus-interpretation').append(n);checks++;if(!AlmLimitPlusContract.displayed(expected).length)missed.push('relocation '+key);parent.insertBefore(n,next);
   }
  }return {checks,missed};
 });expect(result.checks).toBeGreaterThan(20);expect(result.missed).toEqual([]);console.log('LABEL NEGATIVES',result.checks);
});

test('limit-ma-plus inverse plot geometry and mutations across all toggle combinations',async({page})=>{
 test.setTimeout(1500000);await page.goto(url);await page.evaluate(()=>AlmLimitPlusReady);
 const result=await page.evaluate(async()=>{
  const loaded=await AlmLimitPlusValidation.prepare(),f=AlmLimitPlusValidationAdapter.corpus.files,corpus=loaded[f[0].path],missed=[],seen=new Set();let clean=0,negative=0;
  for(const c of corpus){
   __almLimitValidationRun(c.te.map((x,i)=>x+','+c.se[i]).join('\n'),true);const limit=_almLastLimit(),r=AlmLimitPlus.compute(c,limit);
   for(let mask=0;mask<16;mask++){
    ['limit','fill','reg','contour'].forEach((id,i)=>document.getElementById('plus-'+id+'-toggle').checked=!!(mask&(1<<i)));
    AlmLimitPlusUI.render(r,c,limit);const check=()=>AlmLimitPlusContract.geometry(r,c,limit);
    const errors=check();clean++;if(errors.length)missed.push('clean '+c.id+' '+mask+' '+errors.join(','));
    for(const selector of ['#plus-forest circle','#plus-forest line','#plus-funnel circle','#plus-funnel polyline']){
     const all=[...document.querySelectorAll(selector)];
     let sample=all.map((node,i)=>[i,node]);
     if(selector==='#plus-funnel circle'){
      sample=[['study first',all[0]],['study last',all[c.k-1]]];let offset=c.k;
      if((mask&1)&&limit&&r.limit.status==='ok'){sample.push(['shrunken first',all[offset]],['shrunken last',all[offset+c.k-1]]);offset+=c.k;}
      if((mask&2)&&r.trimfill.status==='ok'&&r.trimfill.values.k0)sample.push(['imputed first',all[offset]],['imputed last',all[all.length-1]]);
     }
     for(const [i,node] of sample){
      // Exercise each positional role and layer combination once; clean geometry
      // is checked for every configuration and all 16 combinations.
      const key=mask+selector+i;if(seen.has(key))continue;seen.add(key);
      const attrs=node.tagName==='circle'?['cx','cy']:node.tagName==='line'?['x1','x2','y1','y2']:['points'];
      for(const attr of attrs){const old=node.getAttribute(attr);
       for(const value of [null,attr==='points'?'0,0 700,350':String(Number(old)+100)]){
        if(value===null)node.removeAttribute(attr);else node.setAttribute(attr,value);negative++;if(!check().length)missed.push('coordinate '+key+' '+attr);node.setAttribute(attr,old);
       }
      }
      const parent=node.parentNode,next=node.nextSibling;node.remove();negative++;if(!check().length)missed.push('node deletion '+key);parent.insertBefore(node,next);
     }
    }
   }
  }
  return {clean,negative,missed};
 });expect(result.clean).toBe(169*16);expect(result.negative).toBeGreaterThan(100);expect(result.missed).toEqual([]);console.log('PLOT GEOMETRY',JSON.stringify(result));
});

test('limit-ma-plus corpus gate rejects deleted labels and corrupted plots',async({page})=>{
 test.setTimeout(240000);await page.goto(url);await page.evaluate(()=>AlmLimitPlusReady);
 const result=await page.evaluate(async()=>{
  for(const id of ['limit','fill','reg','contour'])document.getElementById('plus-'+id+'-toggle').checked=true;
  const original=AlmLimitPlusUI.render;let calls=0;
  AlmLimitPlusUI.render=(...args)=>{original(...args);const mode=calls++%3;
   if(mode===0)document.querySelectorAll('#alm-plus [data-plus-category],#alm-plus [data-plus-refusal]').forEach(n=>n.remove());
   if(mode===1)document.querySelectorAll('#plus-forest circle').forEach(n=>n.setAttribute('cx','0'));
   if(mode===2)document.querySelectorAll('#plus-funnel polyline').forEach(n=>n.setAttribute('points','0,0 700,350'));
  };
  try{return await AlmLimitPlusValidation.runCorpus();}finally{AlmLimitPlusUI.render=original;}
 });expect(result.checks).toBe(16097);expect(result.failed).toHaveLength(169);expect(result.failed.every(x=>x.quantity==='render')).toBe(true);
 console.log('CORRUPTED RENDER REPLAY',result.failed.length,'of 169 configurations rejected');
});


test('limit-ma-plus rejects SVG transforms and forest label mutations',async({page})=>{
 test.setTimeout(240000);await page.goto(url);await page.evaluate(()=>AlmLimitPlusReady);
 const result=await page.evaluate(async()=>{
  const loaded=await AlmLimitPlusValidation.prepare(),f=AlmLimitPlusValidationAdapter.corpus.files;
  const missed=[],counts={clean:0,transform:0,label:0};
  for(const id of ['limit','fill','reg','contour'])document.getElementById('plus-'+id+'-toggle').checked=true;
  for(const c of loaded[f[0].path]){
   __almLimitValidationRun(c.te.map((x,i)=>x+','+c.se[i]).join('\n'),true);
   const limit=_almLastLimit(),r=AlmLimitPlus.compute(c,limit);AlmLimitPlusUI.render(r,c,limit);
   const check=()=>AlmLimitPlusContract.geometry(r,c,limit);
   const reject=kind=>{counts[kind]++;if(!check().length)missed.push(c.id+' '+kind);};
   counts.clean++;if(check().length)missed.push(c.id+' clean');
   for(const selector of ['#plus-forest circle','#plus-forest line','#plus-forest text','#plus-funnel circle','#plus-funnel polyline']){
    const node=document.querySelector(selector);if(!node)continue;
    for(const transform of ['translate(100 0)','scale(2)']){
     node.setAttribute('transform',transform);reject('transform');node.removeAttribute('transform');
     const parent=node.parentNode,next=node.nextSibling,g=document.createElementNS('http://www.w3.org/2000/svg','g');
     parent.insertBefore(g,node);g.append(node);g.setAttribute('transform',transform);reject('transform');
     parent.insertBefore(node,next);g.remove();
    }
   }
   for(const svg of document.querySelectorAll('#plus-forest,#plus-funnel')){
    svg.setAttribute('transform','translate(100 0)');reject('transform');svg.removeAttribute('transform');
    svg.style.transform='scale(2)';reject('transform');svg.style.removeProperty('transform');
   }
   const labels=[...document.querySelectorAll('#plus-forest text:not([data-plus-tick-label])')];
   for(const node of labels){
    const parent=node.parentNode,next=node.nextSibling,text=node.textContent;
    node.remove();reject('label');parent.insertBefore(node,next);
    node.textContent='Wrong method';reject('label');node.textContent=text;
    const clone=node.cloneNode(true);parent.append(clone);reject('label');clone.remove();
    for(const attr of ['x','y']){const old=node.getAttribute(attr);node.setAttribute(attr,String(+old+30));reject('label');node.setAttribute(attr,old);}
   }
   if(labels.length>1){
    const texts=labels.map(n=>n.textContent);labels.forEach((n,i)=>n.textContent=texts[(i+1)%texts.length]);reject('label');labels.forEach((n,i)=>n.textContent=texts[i]);
    const rows=labels.map(n=>n.getAttribute('y'));labels.forEach((n,i)=>n.setAttribute('y',rows[(i+1)%rows.length]));reject('label');labels.forEach((n,i)=>n.setAttribute('y',rows[i]));
   }
   counts.clean++;if(check().length)missed.push(c.id+' restored');
  }return {counts,missed};
 });
 expect(result.counts.clean).toBe(338);expect(result.counts.transform).toBeGreaterThan(3000);expect(result.counts.label).toBeGreaterThan(4000);expect(result.missed).toEqual([]);
 console.log('FIX2 MUTATIONS',JSON.stringify(result));
});

test('limit-ma-plus effective screen geometry rejects offset mechanisms',async({page})=>{
 test.setTimeout(240000);await page.goto(url);await page.evaluate(()=>AlmLimitPlusReady);
 const result=await page.evaluate(async()=>{
  const loaded=await AlmLimitPlusValidation.prepare(),files=AlmLimitPlusValidationAdapter.corpus.files;
  const counts={},missed=[];let clean=0;
  for(const id of ['limit','fill','reg','contour'])document.getElementById('plus-'+id+'-toggle').checked=true;
  for(const c of loaded[files[0].path]){
   __almLimitValidationRun(c.te.map((x,i)=>x+','+c.se[i]).join('\n'),true);
   const limit=_almLastLimit(),r=AlmLimitPlus.compute(c,limit);AlmLimitPlusUI.render(r,c,limit);
   const check=()=>AlmLimitPlusContract.geometry(r,c,limit);
   const reject=kind=>{counts[kind]=(counts[kind]||0)+1;if(!check().length)missed.push(c.id+' '+kind);};
   clean++;if(check().length)missed.push(c.id+' clean '+check().join(','));
   for(const selector of ['#plus-forest circle','#plus-forest line','#plus-forest text:not([data-plus-tick-label])','#plus-funnel circle','#plus-funnel polyline']){
    const node=document.querySelector(selector);if(!node)continue;
    for(const [property,value] of [['translate','100px 30px'],['rotate','25deg'],['scale','1.4'],['transform','translate(100px,30px)']]){
     node.style.setProperty(property,value);reject('CSS '+property);node.style.removeProperty(property);
     const parent=node.parentNode,next=node.nextSibling,g=document.createElementNS(node.namespaceURI,'g');parent.insertBefore(g,node);g.append(node);
     g.style.setProperty(property,value);reject('parent CSS '+property);parent.insertBefore(node,next);g.remove();
    }
   }
   for(const node of document.querySelectorAll('#plus-forest text:not([data-plus-tick-label])')){
    for(const attr of ['dx','dy']){node.setAttribute(attr,'30');reject('text '+attr);node.removeAttribute(attr);}
    const text=node.textContent;node.textContent='';const span=document.createElementNS(node.namespaceURI,'tspan');span.textContent=text;span.setAttribute('dy','30');node.append(span);reject('text tspan');node.textContent=text;
   }
   clean++;if(check().length)missed.push(c.id+' restored');
  }return {clean,counts,missed};
 });
 expect(result.clean).toBe(338);expect(result.missed).toEqual([]);
 console.log('FIX3 SCREEN MUTATIONS',JSON.stringify(result));
});


test('limit-ma-plus paint and clipping mutations fail closed',async({page})=>{
 test.setTimeout(900000);await page.goto(url);await page.evaluate(()=>AlmLimitPlusReady);
 // Wait for the real entrance animations; reduced-motion CSS introduces tiny transitions
 // that cannot advance inside this synchronous mutation loop.
 await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished)));
 const result=await page.evaluate(async()=>{
  const loaded=await AlmLimitPlusValidation.prepare(),files=AlmLimitPlusValidationAdapter.corpus.files;
  const counts={},missed=[];let clean=0;
  for(const id of ['limit','fill','reg','contour'])document.getElementById('plus-'+id+'-toggle').checked=true;
  for(const c of loaded[files[0].path]){
   __almLimitValidationRun(c.te.map((x,i)=>x+','+c.se[i]).join('\n'),true);
   const limit=_almLastLimit(),r=AlmLimitPlus.compute(c,limit);AlmLimitPlusUI.render(r,c,limit);
   const check=()=>AlmLimitPlusContract.geometry(r,c,limit);
   const reject=kind=>{counts[kind]=(counts[kind]||0)+1;if(!check().length)missed.push(c.id+' '+kind);};
   clean++;if(check().length)missed.push(c.id+' clean '+check().join(','));
   // Sample every primitive/label role; clean contracts still inspect every mark.
   for(const selector of ['#plus-forest circle','#plus-forest line','#plus-forest text','#plus-forest path',
     '#plus-forest [data-plus-tick-label]','#plus-funnel circle','#plus-funnel line','#plus-funnel polyline','#plus-funnel text','#plus-funnel path']){
    const node=document.querySelector(selector);if(!node)continue;
    const stroke=['line','polyline','path'].includes(node.localName),paint=stroke?'stroke':'fill';
    const mutations=[['opacity','0'],['visibility','hidden'],['clip-path','inset(100%)'],['mask-image','linear-gradient(transparent,transparent)'],
     [paint,'none'],[paint,'transparent'],[paint,'rgba(0,0,0,0)'],[paint+'-opacity','0']];
    if(stroke)mutations.push(['stroke-width','0']);
    if(node.localName==='circle')mutations.push(['r','0']);
    if(node.localName==='text')mutations.push(['font-size','0']);
    for(const [property,value] of mutations){node.style.setProperty(property,value);reject(selector+' '+property+' '+value);node.style.removeProperty(property);}
    const parent=node.parentNode,next=node.nextSibling,g=document.createElementNS(node.namespaceURI,'g');parent.insertBefore(g,node);g.append(node);
    for(const [property,value] of [['opacity','0'],['display','none'],['visibility','hidden'],['clip-path','inset(100%)'],['mask-image','linear-gradient(transparent,transparent)']]){
     g.style.setProperty(property,value);reject(selector+' parent '+property);g.style.removeProperty(property);
    }
    parent.insertBefore(node,next);g.remove();
   }
   for(const svg of document.querySelectorAll('#plus-forest,#plus-funnel')){
    const old=svg.getAttribute('viewBox');svg.setAttribute('viewBox','0 0 70 35');reject(svg.id+' viewBox');svg.setAttribute('viewBox',old);
   }
   for(const node of document.querySelectorAll('#plus-forest text:not([data-plus-tick-label])')){
    node.style.fontSize='100px';reject('label row font-size 100px');node.style.removeProperty('font-size');
   }
   // The panel has a forwards-filled entrance animation; important makes the mutation effective.
   const host=document.getElementById('alm-plus');host.style.setProperty('opacity','0','important');
   if(getComputedStyle(host).opacity!=='0')throw Error('HTML opacity mutation did not take effect');
   reject('HTML ancestor opacity');host.style.removeProperty('opacity');
   clean++;if(check().length)missed.push(c.id+' restored');
  }return {clean,counts,missed};
 });
 expect(result.clean).toBe(338);expect(result.missed).toEqual([]);
 console.log('FIX4 PAINT MUTATIONS',JSON.stringify(result));
});


test('limit-ma-plus reference style contract rejects paint effects and accepts equivalent CSS',async({page})=>{
 test.setTimeout(900000);await page.goto(url);await page.evaluate(()=>AlmLimitPlusReady);
 await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished)));
 const result=await page.evaluate(async()=>{
  const loaded=await AlmLimitPlusValidation.prepare(),files=AlmLimitPlusValidationAdapter.corpus.files;
  const missed=[],clean=[];let negatives=0,positives=0;
  for(const [i,c] of loaded[files[0].path].entries()){
   __almLimitValidationRun(c.te.map((x,j)=>x+','+c.se[j]).join('\n'),true);
   const limit=_almLastLimit(),r=AlmLimitPlus.compute(c,limit);AlmLimitPlusUI.render(r,c,limit);
   const check=()=>AlmLimitPlusContract.geometry(r,c,limit);
   if(check().length)clean.push([c.id,check()]);
   for(const selector of ['#plus-forest circle','#plus-forest line','#plus-forest path','#plus-forest text',
     '#plus-funnel circle','#plus-funnel polyline','#plus-funnel text','#plus-funnel']){
    const n=document.querySelector(selector);if(!n)continue;
    const mutations=[['filter','opacity(0)'],['stroke-dasharray','0 100000']];
    if(i===0)mutations.push(['filter','blur(20px)'],['filter','drop-shadow(10000px 0 red)'],
     ['stroke-dashoffset','1000'],['mix-blend-mode','difference'],['paint-order','stroke fill'],
     ['marker-start','url(#paint-marker)'],['marker-mid','url(#paint-marker)'],['marker-end','url(#paint-marker)']);
    for(const [property,value] of mutations){
     // Stroke parameters are immaterial on reference roles without strokes.
     if(property.startsWith('stroke-')&&getComputedStyle(n).stroke==='none')continue;
     n.style.setProperty(property,value);negatives++;
     if(!check().length)missed.push(c.id+' '+selector+' '+property);
     n.style.removeProperty(property);
    }
    // Move explicit presentation attributes to a stylesheet, preserving computed paint.
    const css=document.createElement('style'),attrs=['fill','stroke','stroke-width','fill-opacity'].filter(a=>n.hasAttribute(a));
    const saved=attrs.map(a=>[a,n.getAttribute(a)]);n.classList.add('equivalent-paint');
    css.textContent='.equivalent-paint {'+saved.map(([a,v])=>a+':'+v).join(';')+'}';document.head.append(css);
    saved.forEach(([a])=>n.removeAttribute(a));positives++;
    if(check().length)clean.push([c.id,selector,check()]);
    saved.forEach(([a,v])=>n.setAttribute(a,v));css.remove();n.classList.remove('equivalent-paint');
   }
   // Unused channels must not trigger primitive-type-based false failures.
   const circle=document.querySelector('#plus-funnel circle'),curve=document.querySelector('#plus-funnel polyline');
   circle.style.stroke='red';circle.style.strokeOpacity='0';circle.style.strokeWidth='0';
   const line=document.querySelector('#plus-forest line');line.style.fill='none';
   if(curve)curve.style.fillOpacity='0';positives++;
   if(check().length)clean.push([c.id,'unused channel',check()]);
   circle.removeAttribute('style');line.removeAttribute('style');if(curve)curve.removeAttribute('style');
  }
  return {negatives,positives,missed,clean};
 });
 expect(result.missed).toEqual([]);expect(result.clean).toEqual([]);
 console.log('FIX5 STYLE CONTRACT',JSON.stringify(result));
});
