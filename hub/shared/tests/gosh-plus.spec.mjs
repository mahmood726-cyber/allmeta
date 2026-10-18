import {test,expect} from './validation-fixture.mjs';
import {readFileSync} from 'node:fs';
// Validate settled rendering, not the shared panel entrance animation's zero-opacity frame.
test.use({reducedMotion:'reduce'});
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{
    const style=document.createElement('style');
    style.textContent='main, .panel { animation: none !important; }';
    document.head.append(style);
  },{once:true}));
});
const root=new URL('../../../gosh/validate/',import.meta.url);
const corpus=JSON.parse(readFileSync(new URL('plus/corpus.json',root),'utf8'));
const refs=JSON.parse(readFileSync(new URL('plus/reference.json',root),'utf8'));
const manifest=JSON.parse(readFileSync(new URL('MANIFEST-plus.json',root),'utf8'));
const url=process.env.GOSH_PLUS_PAGE || '/gosh/index.html';
const fields=['with_n','without_n','with_mean','without_mean','diff_mean','with_median','without_median','diff_median','with_i2','without_i2','diff_i2'];
async function render(page,c=corpus[0],model='DL') {
  await page.evaluate(({c,model})=>AlmGoshPlus.render(AlmGoshPlus.capture(c.te.map((x,i)=>`${x}, ${c.se[i]}, ${c.source_rows[i]}`).join('\n'),model,5000)),{c,model});
}
async function failures(page,c=corpus[0],model='DL') {
  return page.evaluate(({r,k,model})=>{const failures=[];AlmGoshPlusAdapter.compareDisplay(r,k,model,(q,a,b,kind)=>{if(!AlmValidate.compare(a,b,kind,1e-9).pass)failures.push(q);});return failures;},{r:refs.find(r=>r.key===c.id+'::'+model),k:c.k,model});
}
for(const variation of ['zero-width stroke','unfilled tick','class colour','cursor','stroke-linecap','stroke-dasharray'])test('extras legal style '+variation,async({page})=>{
  await page.goto(url);await render(page);
  await page.locator('#plus-plot').evaluate((svg,v)=>{
    const c=svg.querySelector('circle');
    if(v==='cursor')c.style.cursor='crosshair';
    if(v==='stroke-linecap')c.style.strokeLinecap='round';
    if(v==='stroke-dasharray')c.style.strokeDasharray='2 2';
    if(v==='zero-width stroke'){c.style.stroke='red';c.style.strokeWidth='0';}
    if(v==='unfilled tick')svg.querySelector('path').style.fill='none';
    if(v==='class colour'){
      const css=document.createElement('style');css.textContent='.legal-colour {fill:rgb(0,114,178)}';document.head.append(css);
      svg.querySelector('[data-includes="true"]').classList.add('legal-colour');
    }
  },variation);expect(await failures(page)).toEqual([]);
});

test('extras clean reference resists a global stylesheet mutation',async({page})=>{
  await page.goto(url);await render(page);expect(await failures(page)).toEqual([]);
  await page.addStyleTag({content:'#plus-plot circle {filter:opacity(0) !important}'});
  await expect(failures(page)).rejects.toThrow('style contract');
});
test('extras clean reference follows responsive layout',async({page})=>{
  await page.goto(url);await render(page);
  await page.setViewportSize({width:1000,height:800});
  expect(await failures(page)).toEqual([]);
});

test('extras every quantity against pinned R corpus, offline',async({page,context})=>{
  test.setTimeout(300000);await page.goto(url);
  const before=await page.evaluate(()=>({snapshot:__almGoshValidationSnapshot(),href:location.href,storage:{...localStorage}}));
  await page.evaluate(()=>AlmGoshPlusValidation.prepare());await context.setOffline(true);
  const result=await page.evaluate(()=>AlmGoshPlusValidation.runCorpus());
  expect(result.axisCoverage).toHaveLength(refs.length*2);
  const checked=result.axisCoverage.filter(a=>a.checked).length;
  await expect(page.locator('#alm-plus-validate')).toContainText(`Axis labels: ${checked} checked; ${result.axisCoverage.length-checked} not checked.`);
  for(const a of result.axisCoverage)if(a.checked){expect(a.coverage).toBeGreaterThanOrEqual(.2);expect(a.residual).toBeLessThanOrEqual(1e-7);}else expect(a.message).toBe('axis labels: not checked (scale not determined by validated marks)');
  expect(result.checks).toBe(manifest.checks);expect(result.passed).toBe(result.checks);expect(result.failed).toEqual([]);
  expect(await page.evaluate(()=>({snapshot:__almGoshValidationSnapshot(),href:location.href,storage:{...localStorage}}))).toEqual(before);
  console.log('AXIS COVERAGE',JSON.stringify(result.axisCoverage));
  console.log('GOSH PLUS REPLAY',result.passed+'/'+result.checks);
});
test('extras selector, study counts, sorting, keyboard and isolated plot',async({page})=>{
  await page.goto(url);const original=await page.locator('#plot').innerHTML();await render(page);
  for(let i=1;i<=corpus[0].k;i++){
    await page.locator('#plus-study').selectOption(String(i));
    expect(await failures(page)).toEqual([]);
    const n=refs.find(r=>r.key===corpus[0].id+'::DL').rows[i-1].with_n;
    await expect(page.locator('#plus-plot circle[data-includes=true]')).toHaveCount(n);
  }
  for(const het of ['I2','H2','Q','tau2','tau']){await page.locator('#plus-het').selectOption(het);expect(await failures(page)).toEqual([]);}
  await page.getByRole('button',{name:'With: mean estimate',exact:true}).click();
  let order=await page.locator('[data-quantity=with_mean]').allTextContents();expect(order.map(Number)).toEqual(order.map(Number).sort((a,b)=>a-b));
  await page.getByRole('button',{name:'With: mean estimate',exact:true}).click();
  order=await page.locator('[data-quantity=with_mean]').allTextContents();expect(order.map(Number)).toEqual(order.map(Number).sort((a,b)=>b-a));
  await expect(page.locator('#plus-table thead th').nth(3)).toHaveAttribute('aria-sort','descending');
  const button=page.locator('#plus-table tbody tr[data-study="2"] button');await button.focus();await page.keyboard.press('Enter');
  await expect(page.locator('#plus-study')).toHaveValue('2');await expect(page.locator('#plus-table tbody tr[data-study="2"]')).toHaveAttribute('aria-selected','true');
  await page.locator('#plus-table tbody tr[data-study="3"] td').first().click();
  await expect(page.locator('#plus-study')).toHaveValue('3');
  await expect(page.getByLabel('Highlight study',{exact:true})).toBeVisible();await expect(page.getByLabel('Highlight plot heterogeneity')).toBeVisible();
  expect(await page.locator('#plot').innerHTML()).toBe(original);
  await render(page,corpus[0],'FE');expect(await page.locator('#plus-het option').evaluateAll(os=>os.map(o=>o.value))).toEqual(['I2','H2','Q']);expect(await failures(page,corpus[0],'FE')).toEqual([]);
});
for(const q of fields)test('extras displayed mutation fails only '+q,async({page})=>{
  await page.goto(url);await render(page);
  await page.locator(`#plus-table tr[data-study="1"] [data-quantity="${q}"]`).evaluate(td=>td.textContent=String(Number(td.textContent)+1));
  expect(await failures(page)).toEqual(['study.1.'+q]);
});
for(const [attr,quantity] of [['cx','plot_x.0'],['cy','plot_y.0'],['data-includes','included.0'],['fill','colour.0']])test('extras graphical mutation fails only '+quantity,async({page})=>{
  await page.goto(url);await render(page);
  await page.locator('#plus-plot circle').first().evaluate((c,attr)=>c.setAttribute(attr,attr==='data-includes'?'tampered':attr==='fill'?'#000000':String(Number(c.getAttribute(attr))+1)),attr);
  if(attr==='data-includes')expect(await failures(page)).toEqual([quantity]);else await expect(failures(page)).rejects.toThrow();
});
test('extras count mutation and evidence refusal',async({page})=>{
  await page.goto(url);await render(page);await page.locator('#plus-counts').evaluate(e=>e.textContent+='1');
  expect(await failures(page)).toEqual(['highlight_counts']);
  await render(page);await page.locator('#plus-table tbody').evaluate(body=>body.rows[1].replaceWith(body.rows[0].cloneNode(true)));
  await expect(failures(page)).rejects.toThrow('Extra quantity coverage mismatch');
  await render(page);await page.locator('#plus-table thead button').nth(3).evaluate(e=>e.textContent='Wrong quantity');
  await expect(failures(page)).rejects.toThrow('Invalid extra table headers');
  await render(page);await page.locator('#plus-table tbody th button').first().evaluate(e=>e.textContent='Wrong study');
  await expect(failures(page)).rejects.toThrow('Invalid extra study label');
  await page.route('**/validate/plus/corpus.json',r=>r.fulfill({contentType:'application/json',body:'[]'}));
  await expect(page.evaluate(()=>AlmGoshPlusValidation.runCorpus())).rejects.toThrow('SHA-256 mismatch');
});
test('extras reject invalid inputs and empty sampled groups',async({page})=>{
  await page.goto(url);
  for(const text of ['bad','1, 1\n2, 0\n3, 1',Array.from({length:101},()=>'.1,.2').join('\n')])await expect(page.evaluate(t=>AlmGoshPlus.capture(t),text)).rejects.toThrow('valid effect rows');
  const c=corpus.find(c=>c.k>15);await expect(page.evaluate(c=>AlmGoshPlus.capture(c.te.map((x,i)=>`${x}, ${c.se[i]}`).join('\n'),'DL',1),c)).rejects.toThrow('empty with/without');
});
for(const model of ['FE','DL'])test('extras live webR '+model+' @slow',async({page})=>{
  test.setTimeout(300000);await page.goto(url);
  const c=corpus[0];await page.locator('#src').fill(c.te.map((x,i)=>`${x}, ${c.se[i]}`).join('\n'));await page.locator('#model').selectOption(model);
  const r=await page.evaluate(()=>AlmGoshPlusValidation.runLive());expect(r.rows.filter(x=>!x.pass)).toEqual([]);expect(r.versions.metafor).toBe('4.8-0');
  console.log('GOSH PLUS LIVE',model,r.rows.length+'/'+r.rows.length);
});

for(const [i,quantity] of [[2,'xmin'],[3,'xmax'],[4,'ymin'],[5,'ymax']])test('extras axis mutation is refused '+quantity,async({page})=>{
  await page.goto(url);await render(page);expect(await failures(page)).toEqual([]);
  await page.locator('#plus-plot text').nth(i).evaluate(e=>e.textContent=String(Number(e.textContent)+1));
  // Changed glyph bounds can change computed perspective-origin before the
  // numerical callback runs. Both are valid refusals under the style contract.
  const result=await failures(page).then(values=>({values}),error=>({error:String(error)}));
  if(result.error)expect(result.error).toMatch(/Extra style contract|calibrated axis/);
  else expect(result.values).toEqual([quantity]);
});
test('extras live sampled DL uses the same memberships @slow',async({page})=>{
  test.setTimeout(300000);await page.goto(url);const c=corpus.find(c=>c.k>15);
  await page.locator('#src').fill(c.te.map((x,i)=>`${x}, ${c.se[i]}`).join('\n'));
  await page.locator('#model').selectOption('DL');await page.locator('#btn-run').click();await page.locator('#n-sample').fill('37');
  const r=await page.evaluate(()=>AlmGoshPlusValidation.runLive());expect(r.rows.filter(x=>!x.pass)).toEqual([]);expect(r.versions.metafor).toBe('4.8-0');
  console.log('GOSH PLUS LIVE SAMPLED DL',r.rows.length+'/'+r.rows.length);
});


for(const mutation of ['translate','ancestor translate','zero radius','CSS radius','hidden','display','opacity','ancestor opacity','fill opacity','collapsed transform','viewport','duplicate subset','missing subset'])test('extras geometry rejects '+mutation,async({page})=>{
  await page.goto(url);await render(page);
  await page.locator('#plus-plot').evaluate((svg,m)=>{
    const c=svg.querySelector('circle');
    if(m==='translate')c.setAttribute('transform','translate(1000 1000)');
    if(m==='ancestor translate'){const g=document.createElementNS(svg.namespaceURI,'g');svg.append(g);g.append(...svg.querySelectorAll('circle'));g.setAttribute('transform','translate(1000 1000)');}
    if(m==='zero radius')c.setAttribute('r','0');
    if(m==='CSS radius')c.style.r='0px';
    if(m==='hidden')c.style.visibility='hidden';
    if(m==='display')c.style.display='none';
    if(m==='opacity')c.style.opacity='0';
    if(m==='ancestor opacity')svg.style.opacity='0';
    if(m==='fill opacity')c.style.fillOpacity='0';
    if(m==='collapsed transform')c.setAttribute('transform','scale(0)');
    if(m==='viewport')svg.setAttribute('viewBox','1000 1000 600 420');
    if(m==='duplicate subset')svg.querySelectorAll('circle')[1].replaceWith(c.cloneNode(true));
    if(m==='missing subset')c.remove();
  },mutation);
  await expect(failures(page)).rejects.toThrow();
});
test('extras style contract refuses compensated transforms',async({page})=>{
  await page.goto(url);await render(page);
  await page.locator('#plus-plot').evaluate(svg=>{
    const g=document.createElementNS(svg.namespaceURI,'g');svg.append(g);g.append(...svg.querySelectorAll('circle'));g.setAttribute('transform','translate(10 20)');
    for(const c of g.children){c.setAttribute('cx',Number(c.getAttribute('cx'))-10);c.setAttribute('cy',Number(c.getAttribute('cy'))-20);}
  });
  await expect(failures(page)).rejects.toThrow('style');
});
for(const q of ['study',...fields])test('extras sort contract '+q,async({page})=>{
  await page.goto(url);await render(page);
  for(let i=0;i<2;i++){
    await page.locator(`#plus-table [data-sort="${q}"]`).click();
    expect(await failures(page)).toEqual([]);
    await page.locator('#plus-table tbody').evaluate(b=>b.append(b.firstElementChild));
    await expect(failures(page)).rejects.toThrow('Invalid extra table order');
    await render(page);
  }
});
for(const mutation of ['missing','multiple','invalid','wrong key'])test('extras sort declaration rejects '+mutation,async({page})=>{
  await page.goto(url);await render(page);
  await page.locator('#plus-table thead').evaluate((head,m)=>{
    const h=head.querySelector('th');
    if(m==='missing')h.setAttribute('aria-sort','none');
    if(m==='multiple')head.querySelectorAll('th')[1].setAttribute('aria-sort','ascending');
    if(m==='invalid')h.setAttribute('aria-sort','sideways');
    if(m==='wrong key')h.querySelector('button').dataset.sort='wrong';
  },mutation);
  await expect(failures(page)).rejects.toThrow('Invalid extra sort declaration');
});
for(const i of [2,3,4,5])for(const blank of ['', '   '])test(`extras rejects empty numeric axis ${i} length ${blank.length}`,async({page})=>{
  await page.goto(url);await render(page);expect(await failures(page)).toEqual([]);
  await page.locator('#plus-plot text').nth(i).evaluate((e,t)=>e.textContent=t,blank);
  await expect(failures(page)).rejects.toThrow(/Missing extra axis value|Extra style contract/);
});
for(const model of ['FE','DL'])for(const id of ['plus-study','plus-het'])for(const mutation of ['rename','delete','duplicate','value','label'])test(`extras selector rejects ${model} ${id} ${mutation}`,async({page})=>{
  await page.goto(url);await render(page,corpus[0],model);
  await page.locator('#'+id).evaluate((select,m)=>{
    const o=select.options[select.options.length-1];
    if(m==='rename')o.textContent='Wrong label';
    if(m==='delete')o.remove();
    if(m==='duplicate')select.append(o.cloneNode(true));
    if(m==='value')o.value='wrong';
    if(m==='label')o.label='Wrong displayed label';
  },mutation);
  await expect(failures(page,corpus[0],model)).rejects.toThrow('Invalid extra selector');
});

for(const mutation of ['cx','cy','clip point','clip parent','mask','slice','dx','dy','tspan','font zero','label hidden','label clip','fill style','fill class','base colour','stroke','css transform','css translate','css rotate','css scale','svg node','svg parent','root collapse','tick move','tick hidden'])test('extras screen contract '+mutation,async({page})=>{
  await page.goto(url);await render(page);expect(await failures(page)).toEqual([]);
  await page.locator('#plus-plot').evaluate((svg,m)=>{
    const c=svg.querySelector('circle'),label=svg.querySelectorAll('text')[4];
    if(m==='cx')c.style.cx='300px';if(m==='cy')c.style.cy='200px';
    if(m==='clip point')c.style.clipPath='circle(0px)';
    if(m==='clip parent'||m==='svg parent'){const g=document.createElementNS(svg.namespaceURI,'g');svg.append(g);g.append(...svg.querySelectorAll('circle'));if(m==='clip parent')g.style.clipPath='circle(0px)';else g.setAttribute('transform','translate(50 0)');}
    if(m==='mask')c.style.maskImage='linear-gradient(transparent,transparent)';
    if(m==='slice'){svg.style.width='600px';svg.style.height='100px';svg.style.overflow='hidden';svg.setAttribute('preserveAspectRatio','xMidYMid slice');}
    if(m==='dx'||m==='dy')label.setAttribute(m,'1000');
    if(m==='tspan'){const t=document.createElementNS(svg.namespaceURI,'tspan');t.textContent=label.textContent;t.setAttribute('dx','1000');label.replaceChildren(t);}
    if(m==='font zero')label.style.fontSize='0px';if(m==='label hidden')label.style.visibility='hidden';if(m==='label clip')label.style.clipPath='circle(0px)';
    if(m==='fill style')c.style.fill='red';
    if(m==='fill class'){const s=document.createElement('style');s.textContent='.wrong-point {fill:red !important}';document.head.append(s);c.classList.add('wrong-point');}
    if(m==='base colour')svg.querySelector('[data-includes="false"]').style.fill='blue';if(m==='stroke')c.style.stroke='red';
    if(m==='css transform')c.style.transform='translateX(100px)';if(m==='css translate')c.style.translate='100px 0';if(m==='css rotate')c.style.rotate='30deg';if(m==='css scale')c.style.scale='0';
    if(m==='svg node')c.setAttribute('transform','rotate(30)');if(m==='root collapse')svg.setAttribute('transform','scale(0)');
    if(m==='tick move')svg.querySelector('path').setAttribute('transform','translate(10 0)');if(m==='tick hidden')svg.querySelector('path').style.opacity='0';
  },mutation);
  await expect(failures(page)).rejects.toThrow();
});

for(const mutation of ['ancestor display','ancestor visibility','overflow ancestor','root CSS scale','root SVG scale','point paint none','label CSS transform','label CSS translate','label CSS rotate','label CSS scale','label opacity','label display','parent mask','SVG clip URL','tick stroke none','hidden tspan','transparent tick'])test('extras paint ancestors '+mutation,async({page})=>{
  await page.goto(url);await render(page);expect(await failures(page)).toEqual([]);
  await page.locator('#plus-plot').evaluate((svg,m)=>{
    const c=svg.querySelector('circle'),t=svg.querySelectorAll('text')[4];
    if(m==='ancestor display')svg.parentElement.style.display='none';
    if(m==='ancestor visibility')svg.parentElement.style.visibility='hidden';
    if(m==='overflow ancestor'){const p=svg.parentElement;p.style.height='100px';p.style.overflow='hidden';}
    if(m==='root CSS scale')svg.style.scale='0';if(m==='root SVG scale')svg.setAttribute('transform','scale(0)');
    if(m==='point paint none'){c.style.fill='none';c.style.stroke='none';}
    if(m==='label CSS transform')t.style.transform='translateX(100px)';if(m==='label CSS translate')t.style.translate='100px 0';if(m==='label CSS rotate')t.style.rotate='30deg';if(m==='label CSS scale')t.style.scale='0';
    if(m==='label opacity')t.style.opacity='0';if(m==='label display')t.style.display='none';
    if(m==='parent mask')svg.style.maskImage='linear-gradient(transparent,transparent)';
    if(m==='SVG clip URL'){const ns=svg.namespaceURI,clip=document.createElementNS(ns,'clipPath'),r=document.createElementNS(ns,'rect');clip.id='empty-clip';r.setAttribute('width','0');r.setAttribute('height','0');clip.append(r);svg.append(clip);c.setAttribute('clip-path','url(#empty-clip)');}
    if(m==='tick stroke none')svg.querySelector('path').style.stroke='none';
    if(m==='transparent tick')svg.querySelector('path').style.stroke='transparent';
    if(m==='hidden tspan'){const span=document.createElementNS(svg.namespaceURI,'tspan');span.textContent=t.textContent;span.style.visibility='hidden';t.replaceChildren(span);}
  },mutation);await expect(failures(page)).rejects.toThrow();
});
test('extras equivalent computed colours remain valid',async({page})=>{
  await page.goto(url);await render(page);
  await page.locator('#plus-plot').evaluate(svg=>{for(const c of svg.querySelectorAll('circle')){c.setAttribute('fill',c.dataset.includes==='true'?'rgb(0, 114, 178)':'rgb(213, 94, 0)');}});
  expect(await failures(page)).toEqual([]);
});

for(const [target,property,value] of [
  ['circle','filter','blur(2px)'],['circle','filter','opacity(0)'],
  ['circle','filter','drop-shadow(100px 0 red)'],['circle','filter','hue-rotate(180deg)'],
  ['svg','filter','opacity(0)'],['text','filter','blur(2px)'],
  ['path','stroke-dasharray','0 1000'],['path','stroke-dashoffset','10px'],
  ['circle','mix-blend-mode','multiply'],['circle','paint-order','stroke fill'],
  ['path','marker-start','url(#bad)'],['path','marker-mid','url(#bad)'],['path','marker-end','url(#bad)'],
  ['text','letter-spacing','2px'],['text','font-weight','900'],['text','dominant-baseline','hanging']
])test(`extras full style rejects ${target} ${property} ${value}`,async({page})=>{
  await page.goto(url);await render(page);expect(await failures(page)).toEqual([]);
  await page.locator('#plus-plot').evaluate((svg,[target,p,v])=>{
    (target==='svg'?svg:svg.querySelector(target)).style.setProperty(p,v);
  },[target,property,value]);
  await expect(failures(page)).rejects.toThrow('style contract');
});


for(const model of ['FE','DL'])for(const axis of ['x','y'])
for(const mutation of ['one label','swap labels','shift labels','scale'])test(`extras independent axis ${model} ${axis} ${mutation}`,async({page})=>{
 let intercepted=false;
 await page.route('**/gosh/plus.js',async route=>{
  let body=(await(await route.fetch()).text()).replace(/\r\n/g,'\n');
  if(mutation==='scale'){
   const before='return offset+size*((v/s-lo/s)/(hi/s-lo/s));';expect(body).toContain(before);
   body=body.replace(before,`return offset+(offset===${axis==='x'?60:30}?5:0)+size*((v/s-lo/s)/(hi/s-lo/s));`);
  }else{
   const hook='\n  }\n  function draw() {';expect(body).toContain(hook);
   const edit=mutation==='one label'?"ns[0].textContent=String(v[0]+step);":mutation==='swap labels'?"ns[0].textContent=old[1];ns[1].textContent=old[0];":"ns.forEach((n,i)=>n.textContent=String(v[i]+step));";
   body=body.replace(hook,`\n{const ns=[...svg.querySelectorAll('text')].slice(${axis==='x'?'2,4':'4,6'}),old=ns.map(n=>n.textContent),v=old.map(Number),step=v[1]-v[0];${edit}}`+hook);
  }
  intercepted=true;await route.fulfill({contentType:'application/javascript',body});
 });
 await page.goto(url);await render(page,corpus[0],model);await page.locator('#plus-het').selectOption('Q');
 await expect(failures(page,corpus[0],model)).rejects.toThrow(/calibrated axis/);
 expect(intercepted).toBe(true);
});
for(const model of ['FE','DL'])for(const [before,after] of [["Q:'Q'","Q:'R'"],["'With: count'","'Wrong count'"],["'with_n','without_n'","'without_n','with_n'"]])test('extras independent source semantics '+model+' '+before,async({page})=>{
 await page.route('**/gosh/plus.js',async route=>{const body=await(await route.fetch()).text();expect(body).toContain(before);await route.fulfill({contentType:'application/javascript',body:body.replace(before,after)});});
 await page.goto(url);await render(page,corpus[0],model);await page.locator('#plus-het').selectOption('Q');
 await expect(failures(page,corpus[0],model)).rejects.toThrow(/selector|table headers|sort declaration/);
});

// Constant mu needs 12-digit rounding; Q is constant zero, while H2 also covers singleton subsets.
for(const mutation of ['wrong','swapped','shifted'])test(`extras tiny checked Q labels ${mutation}`,async({page})=>{
 await page.route('**/gosh/plus.js',async route=>{
  const body=(await(await route.fetch()).text()).replace(/\r\n/g,'\n'),hook='\n  }\n  function draw() {';
  expect(body).toContain(hook);
  const edit=mutation==='wrong'?"ns[0].textContent=String(v[1]);":mutation==='swapped'?"ns[0].textContent=old[1];ns[1].textContent=old[0];":"ns.forEach((n,i)=>n.textContent=String(v[i]+v[1]));";
  await route.fulfill({contentType:'application/javascript',body:body.replace(hook,`\n{const ns=[...svg.querySelectorAll('text')].slice(4,6),old=ns.map(n=>n.textContent),v=old.map(Number);${edit}}`+hook)});
 });
 await page.goto(url);
 const result=await page.evaluate(()=>{
  const input='1,1\n1.0000000000001,1\n1.0000000000002,1';
  document.getElementById('src').value=input;document.getElementById('model').value='FE';
  AlmGoshPlus.render(AlmGoshPlus.capture(input,'FE',5000));
  document.getElementById('plus-het').value='Q';document.getElementById('plus-het').dispatchEvent(new Event('change'));
  try{AlmGoshPlusAdapter.live.currentState();return {error:null};}
  catch(e){return {error:e.message,axes:AlmGoshPlusAdapter.axisLabels};}
 });
 expect(result.error).toMatch(/extra y calibrated axis/);
 expect(result.axes.find(a=>a.axis==='extra y').checked).toBe(true);
});

for(const input of [Array(3).fill('0.3333333333333333,1').join('\n'),'1,1\n1.0000000000001,1\n1.0000000000002,1'])
for(const het of ['Q','H2'])for(const axis of ['clean','x','y'])test(`extras constant calibration ${input.split("\n")[0]} ${het} ${axis}`,async({page})=>{
 if(axis!=='clean')await page.route('**/gosh/plus.js',async route=>{
  const body=(await(await route.fetch()).text()).replace(/\r\n/g,'\n'),hook='\n  }\n  function draw() {';
  expect(body).toContain(hook);
  await route.fulfill({contentType:'application/javascript',body:body.replace(hook,`\nsvg.querySelectorAll('text')[${axis==='x'?2:4}].textContent='0.125';`+hook)});
 });
 await page.goto(url);
 const check=()=>page.evaluate(({het,input})=>{
  document.getElementById('src').value=input;document.getElementById('model').value='FE';
  AlmGoshPlus.render(AlmGoshPlus.capture(input,'FE',5000));
  document.getElementById('plus-het').value=het;document.getElementById('plus-het').dispatchEvent(new Event('change'));
  try{AlmGoshPlusAdapter.live.currentState();return {error:null,axes:AlmGoshPlusAdapter.axisLabels};}
  catch(e){return {error:e.message,axes:AlmGoshPlusAdapter.axisLabels};}
 },{het,input});
 const result=await check();
 if(axis==='clean')expect(result.error).toBeNull();
 else if(result.axes.find(r=>r.axis==='extra '+axis)?.checked)expect(result.error).toMatch(/calibrated axis/);
 else {expect(result.error).toBeNull();expect(result.axes.find(r=>r.axis==='extra '+axis)?.message).toContain('not checked');}
});
