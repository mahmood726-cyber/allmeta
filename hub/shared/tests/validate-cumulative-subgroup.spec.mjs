import {test,expect} from './validation-fixture.mjs';
import {readFileSync} from 'node:fs';
const root=new URL('../../../cumulative-subgroup/validate/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('MANIFEST.json',root),'utf8'));
const refs=JSON.parse(readFileSync(new URL('corpus/reference.json',root),'utf8'));
const url='/cumulative-subgroup/index.html';
// Expected failure counts are derived from the pinned reference, never from a run.
const ALL=refs.length,ACCEPTED=refs.filter(r=>r.status==='ok').length,REFUSED=ALL-ACCEPTED;
const CUM=refs.filter(r=>r.view==='cumulative').length,SUB=refs.filter(r=>r.view==='subgroup').length;
const PI_POOLS=refs.reduce((n,r)=>n+(r.view==='cumulative'?r.steps.filter(s=>s.k>=2).length:r.view==='subgroup'?r.groups.filter(g=>g.k>=2).length+2:0),0);
// The autosave banner dismisses itself after 30 s; hold only that timer so slow webR start-up cannot remove the evidence.
const holdBannerTimer=page=>page.addInitScript(()=>{const t=window.setTimeout;window.setTimeout=(f,ms,...a)=>ms===30000?0:t(f,ms,...a);});
async function open(page){await page.goto(url);await page.waitForFunction(()=>!!window.AlmCumSubValidation);}
// Wrap the page's observation hook so a mutation is applied after every page render.
async function afterRun(page,body,arg){await page.evaluate(([body,arg])=>{const original=__almCumSubValidationRun,fn=new Function('a','arg',body);window.__almCumSubValidationRun=(...args)=>{const a=original(...args);fn(a,arg);return a;};},[body,arg]);}
const replay=page=>page.evaluate(()=>AlmCumSubValidation.runCorpus());
const live=page=>page.evaluate(()=>AlmCumSubValidation.runLive());
const failedLabels=r=>r.rows.filter(x=>!x.pass).map(x=>x.label);

test('cumulative-subgroup declared replay passes and preserves input, storage and navigation',async({page})=>{
 test.setTimeout(240000);await open(page);
 expect(manifest.checks).toBe(609398);expect(manifest.configurations).toBe(1816);expect(ALL).toBe(manifest.configurations);expect(REFUSED).toBe(6);
 await page.locator('#f-title').fill('Pending title');await page.locator('#f-data').fill('A, 0.1, 0.1, 2001, G1\nB, 0.3, 0.2, 2002, G2\nC, 0.2, 0.15, 2003, G1');
 // Wait for the debounced autosave of THIS input (an entry written at load holds the default data).
 await page.waitForFunction(()=>(localStorage.getItem('alm-autosave:cumulative-subgroup')||'').includes('C, 0.2, 0.15, 2003, G1'));
 const snap=()=>({page:__almCumSubValidationSnapshot(),href:location.href,length:history.length,state:history.state,storage:{...localStorage},svg:document.getElementById('svg-host').innerHTML,disabled:[...document.querySelectorAll('input,select,textarea,button')].filter(x=>!x.closest('#alm-validate')).map(x=>[x.id||x.tagName,x.disabled,x.readOnly])});
 const before=await page.evaluate(snap),r=await replay(page);
 expect(r.checks).toBe(manifest.checks);expect(r.passed).toBe(r.checks);expect(r.failed).toEqual([]);expect(r.refusals).toHaveLength(6);
 expect(await page.evaluate(snap)).toEqual(before);
 await expect(page.locator('#alm-validate [role=status]')).toContainText(`${manifest.checks}/${manifest.checks} passed; 0 failed`);
 console.log('CUMSUB REPLAY',r.passed+'/'+r.checks);
});
test('cumulative-subgroup refuses changed corpus bytes',async({page})=>{
 await open(page);await page.route('**/cumulative-subgroup/validate/corpus/reference.json',r=>r.fulfill({contentType:'application/json',body:'[]'}));
 await expect(replay(page)).rejects.toThrow('SHA-256 mismatch');
});
test('cumulative-subgroup evidence safeguards fail closed',async({page})=>{
 test.setTimeout(180000);await open(page);
 const errors=await page.evaluate(async()=>{
  const a=AlmCumSubValidationAdapter,loaded=await AlmCumSubValidation.prepare(),cp=a.corpus.files[0].path,rp=a.corpus.files[1].path;
  const firstSub=x=>x[rp].findIndex(r=>r.view==='subgroup');
  const mutations=[x=>x[cp].pop(),x=>x[cp][1].key=x[cp][0].key,x=>x[rp][0].steps.pop(),x=>delete x[rp][0].steps[1].strict.mu,x=>x[rp][0].steps[1].strict.mu=null,
   x=>x[rp][0].steps[1].members=[0,1],x=>x[cp][0].se[0]=0,x=>x[rp][firstSub(x)].groups[0].k+=1,x=>x[rp][0].steps[1].conditional.tau2_app=NaN,x=>{const i=x[rp].findIndex(r=>r.status==='refused');x[rp][i].reason='other';}];
  const errors=[];for(const mutate of mutations){const x=structuredClone(loaded);mutate(x);try{await a.corpus.run(x,()=>{});errors.push('UNSAFE');}catch(e){errors.push(e.message);}}return errors;
 });
 expect(errors).toHaveLength(10);expect(errors).not.toContain('UNSAFE');
});

for(const view of ['cumulative','subgroup'])test(`cumulative-subgroup live built-in example (${view}) @slow`,async({page})=>{
 test.setTimeout(300000);await open(page);await page.locator('#f-view').selectOption(view);
 const before=await page.evaluate(()=>[location.href,history.length]);
 const r=await live(page);expect(r.rows.length).toBe(view==='cumulative'?151:58);expect(r.rows.filter(x=>!x.pass)).toEqual([]);expect(r.versions.metafor).toBe('4.8-0');
 expect(await page.evaluate(()=>[location.href,history.length])).toEqual(before);
 await expect(page.locator('#alm-validate')).toContainText('Validated version in the paper: metafor 5.2-1');
 console.log('CUMSUB LIVE',view,r.rows.length+'/'+r.rows.length);
});
test('cumulative-subgroup live: title, user axis limits, parser notes and ungrouped rows',async({page})=>{
 test.setTimeout(300000);await open(page);
 await page.locator('#f-view').selectOption('subgroup');await page.locator('#f-title').fill('Fixture & <title>');
 await page.locator('#f-data').fill('# fixture rows\n"Trial, A", -0.2, 0.1, 2001, "Low, risk"\nB, -0.3, 0.12, 2002, High\nC, x, 0.1, 2003, High\nD, -0.1, 0.09, 2004,\nE, -0.4, 0.2, 2005, High\nF, -0.25, 0.11, 2006, "Low, risk"');
 const max=page.locator('[data-axis=x][data-edge=max]');await max.fill('1.5');await max.dispatchEvent('change');
 await expect(page.locator('#warn-banner')).toContainText('non-numeric est or SE');
 const r=await live(page);expect(r.rows.filter(x=>!x.pass)).toEqual([]);
 expect(r.rows.find(x=>x.label==='group_count').app).toBe(3);
});

const replayMutations=[
 ['summary card value','if(a.summary){const v=[...document.querySelectorAll("#stats-wrap .v")].at(-1);v.textContent+="1";}','summary_cards',ACCEPTED],
 ['summary card label','if(a.summary){const k=document.querySelectorAll("#stats-wrap .k");k[1].textContent="Final  pooled";}','summary_cards',ACCEPTED],
 ['preview heading','document.getElementById("preview-heading").textContent+=" ";','heading',ALL],
 ['notes banner','document.getElementById("warn-banner").insertAdjacentHTML("beforeend","<ul><li>Results verified</li></ul>");','status_messages',ALL],
 ['axis error text','document.querySelector("#alm-axis-mount [data-error]").textContent="999";','status_messages',ALL],
 ['view option label','document.querySelector("#f-view option[value=subgroup]").textContent="Subgroup";','controls',ALL],
 ['axis default value','document.querySelector("[data-axis=x][data-edge=min]").value="1";','axis_controls',ALL],
 ['axis row label','document.querySelector(".alm-axis-row label").textContent="Effect";','axis_controls',ALL],
 ['page template text','const h=document.querySelector("header h1");h.textContent=h.textContent.replace("Meta-Analysis","Meta-analysis");','page_text',ALL],
 ['footer method text','const f=document.querySelector("footer .footer-note strong");f.textContent="fixed-effect";','page_text',ALL],
 ['parser warning record','a.parsed.warnings.push("Line 99: invented");','input',ALL],
 ['cumulative circle','const c=document.querySelector("#svg-host circle");if(c)c.setAttribute("cx",String(Number(c.getAttribute("cx"))+1));','plot_circle_x',CUM],
 ['subgroup marker','const m=document.querySelector("#svg-host rect[fill=\\"#2c5e8a\\"]");if(m)m.setAttribute("x",String(Number(m.getAttribute("x"))+1));','plot_marker_x',SUB],
 ['plot text','if(a.summary){const t=[...document.querySelectorAll("#svg-host text")].at(-1);t.textContent+="0";}','plot_text',ACCEPTED],
 ['tick geometry','if(a.summary){const l=[...document.querySelectorAll("#svg-host line")].at(-1);l.setAttribute("y1",String(Number(l.getAttribute("y1"))+1));}','plot_axis',ACCEPTED],
 ['refused-state plot','if(!a.summary)document.querySelector("#svg-host svg").insertAdjacentHTML("beforeend","<text>0.123</text>");','refusal_plot',REFUSED],
 ['refused-state note','if(!a.summary)document.querySelector("#warn-banner li").textContent="No group column detected.";','status_messages',REFUSED],
];
for(const [name,body,quantity,count] of replayMutations)test('cumulative-subgroup replay rejects altered '+name,async({page})=>{
 test.setTimeout(180000);await open(page);
 await page.evaluate(()=>{const s=document.querySelector('#f-view');window.__viewMarkup=s.innerHTML;});
 await afterRun(page,'const s=document.querySelector("#f-view"),v=s.value;s.innerHTML=window.__viewMarkup;s.value=v;'+body);
 const r=await replay(page);
 expect(count).toBeGreaterThan(0);expect(r.checks).toBe(manifest.checks);expect(r.failed).toHaveLength(count);expect(r.passed).toBe(manifest.checks-count);
 expect([...new Set(r.failed.map(x=>x.quantity))]).toEqual([quantity]);
});
for(const [name,body,quantity,count] of [
 ['export field list','window._almLastCumSub=(o=>()=>{const x=o();return x&&{...x,extra:1};})(window._almLastCumSub);','export_fields',ACCEPTED],
 ['export k','window._almLastCumSub=(o=>()=>{const x=o();return x&&{...x,k:x.k+1};})(window._almLastCumSub);','export_k',ACCEPTED],
 ['refused-state export','window._almLastCumSub=(o=>()=>{const x=o();return x===null?{k:0}:x;})(window._almLastCumSub);','refusal_export',REFUSED],
])test('cumulative-subgroup replay rejects altered '+name,async({page})=>{
 test.setTimeout(180000);await open(page);await page.evaluate(body=>new Function(body)(),body);
 const r=await replay(page);expect(r.failed).toHaveLength(count);expect([...new Set(r.failed.map(x=>x.quantity))]).toEqual([quantity]);
});
test('cumulative-subgroup replay rejects an engine prediction-interval shift exactly where it is computed and exported',async({page})=>{
 test.setTimeout(180000);await open(page);
 await page.evaluate(()=>{const o=AlmMaCore.predictionInterval;AlmMaCore.predictionInterval=x=>{const p=o(x);return {...p,hi:p.hi+1e-6*Math.max(1,Math.abs(p.hi))};};});
 const r=await replay(page);
 expect(r.failed).toHaveLength(PI_POOLS);
 expect([...new Set(r.failed.map(x=>x.quantity))].sort()).toEqual(['cum_piHi','export_overall_pi_hi','group_piHi','overall_piHi']);
});

for(const [name,setup,label] of [
 ['export k','window._almLastCumSub=(o=>()=>{const x=o();return x&&{...x,k:999};})(window._almLastCumSub);','export.k'],
 ['page text','document.querySelector("header h1").textContent="Cumulative meta-analysis";','display.page_text'],
])test('cumulative-subgroup live catches altered '+name,async({page})=>{
 test.setTimeout(300000);await open(page);await page.evaluate(b=>new Function(b)(),setup);
 const r=await live(page);expect(failedLabels(r)).toEqual([label]);
});
for(const [name,body,label] of [
 ['summary card','[...document.querySelectorAll("#stats-wrap .v")].at(-1).textContent+="1";','display.summary_cards'],
 ['plot coordinate','const c=document.querySelector("#svg-host circle");c.setAttribute("cy",String(Number(c.getAttribute("cy"))+1));','display.plot'],
 ['notes banner','document.getElementById("warn-banner").insertAdjacentHTML("beforeend","<ul><li>Results verified</li></ul>");','display.status_messages'],
 ['heading','document.getElementById("preview-heading").textContent="Subgroup analysis";','display.heading'],
])test('cumulative-subgroup live catches altered '+name,async({page})=>{
 test.setTimeout(300000);await open(page);await afterRun(page,body);
 const r=await live(page);expect(failedLabels(r)).toEqual([label]);
});
test('cumulative-subgroup live catches an engine prediction-interval shift',async({page})=>{
 test.setTimeout(300000);await open(page);
 await page.evaluate(()=>{const o=AlmMaCore.predictionInterval;AlmMaCore.predictionInterval=x=>{const p=o(x);return {...p,hi:p.hi+1e-6};};});
 const r=await live(page);expect(failedLabels(r)).toEqual(Array.from({length:8},(_,i)=>`step.${i+2}.piHi`));
});

test('cumulative-subgroup returning user: draft banner passes replay and live, altered banner fails',async({page})=>{
 test.setTimeout(400000);await open(page);
 await page.locator('#f-data').fill((await page.locator('#f-data').inputValue())+'\n');
 await page.waitForFunction(()=>!!localStorage.getItem('alm-autosave:cumulative-subgroup'));
 await holdBannerTimer(page);await page.reload();await page.waitForFunction(()=>!!window.AlmCumSubValidation);
 await page.waitForFunction(()=>[...document.body.children].some(e=>/^Draft from /.test(e.textContent)));
 const r=await replay(page);expect(r.checks).toBe(manifest.checks);expect(r.failed).toEqual([]);
 const l=await live(page);expect(l.rows.filter(x=>!x.pass)).toEqual([]);
 await page.evaluate(()=>{for(const e of [...document.body.children])if(/^Draft from /.test(e.textContent))e.remove();const b=document.createElement('div');b.setAttribute('role','status');b.setAttribute('aria-live','polite');b.innerHTML='<span>Draft from 999 min ago found. Restore? Results verified.</span><button type=button>Restore</button><button type=button>Discard</button>';document.body.append(b);});
 const bad=await replay(page);expect(bad.failed).toHaveLength(ALL);expect(bad.failed.every(x=>x.quantity==='page_text')).toBe(true);
 expect(failedLabels(await live(page))).toEqual(['display.page_text']);
});

for(const [name,csv,warning] of [
 ['quoted header','label,"estimate""",SE,year,group\nA,0.1,0.1,2001,G1\nB,0.2,0.2,2002,G2\nC,0.3,0.15,2003,G1\nD,0.4,0.3,2004,G2','Header "estimate"" mapped to "estimate"'],
 ['multiline bad row','label,estimate,SE,year,group\nA,0.1,0.1,2001,G1\nB,"x\ny",0.2,2002,G2\nC,0.3,0.15,2003,G1\nD,0.4,0.3,2004,G2\nE,0.2,0.25,2005,G2','not float: x\ny'],
 ['trailing-comma header','label,estimate,se,year,group,\nA,0.1,0.1,2001,G1,\nB,0.2,0.2,2002,G2,\nC,0.3,0.15,2003,G1,\nD,0.4,0.3,2004,G2,','Header "se" mapped to "SE" (Levenshtein 0)'],
])test('cumulative-subgroup CSV import with a '+name+' warning passes replay and live; an invented warning fails',async({page})=>{
 test.setTimeout(400000);await open(page);
 const mount=page.locator('#alm-csv-mount');
 await mount.locator('textarea').fill(csv);await mount.locator('[data-action=parse-paste]').click();
 expect(await mount.locator('[data-section=warnings]').textContent()).toContain(warning);
 for(const view of ['cumulative','subgroup']){await page.locator('#f-view').selectOption(view);const l=await live(page);expect(l.rows.length).toBeGreaterThan(0);expect(l.rows.filter(x=>!x.pass)).toEqual([]);}
 const r=await replay(page);expect(r.checks).toBe(manifest.checks);expect(r.failed).toEqual([]);
 await page.evaluate(()=>{const w=document.querySelector('#alm-csv-mount [data-section=warnings]');w.textContent+='\n• Results verified';});
 const bad=await replay(page);expect(bad.failed).toHaveLength(ALL);expect(bad.failed.every(x=>x.quantity==='page_text')).toBe(true);
 expect(failedLabels(await live(page))).toEqual(['display.page_text']);
});

for(const [name,set] of [
 ['reversed pair (widget error and page refusal)',async page=>{const min=page.locator('[data-axis=x][data-edge=min]'),max=page.locator('[data-axis=x][data-edge=max]');await max.fill('0.5');await max.dispatchEvent('change');await min.fill('0.8');await min.dispatchEvent('change');}],
 ['minimum above the automatic maximum (page refusal)',async page=>{const min=page.locator('[data-axis=x][data-edge=min]');await min.fill('5');await min.dispatchEvent('change');}],
])test('cumulative-subgroup axis-error state: live refuses, replay passes and restores it — '+name,async({page})=>{
 test.setTimeout(240000);await open(page);await set(page);
 await expect(page.locator('#svg-host svg[data-axis-refusal]')).toHaveCount(1);
 await expect(page.locator('#warn-banner')).toContainText('Widen or clear the axis limits');
 const before=await page.evaluate(()=>({axis:[...document.querySelectorAll('#alm-axis-mount input')].map(x=>[x.value,x.checked]),err:document.querySelector('#alm-axis-mount [data-error]').textContent,svg:document.getElementById('svg-host').innerHTML,banner:document.getElementById('warn-banner').innerHTML,href:location.href}));
 await expect(live(page)).rejects.toThrow(/Axis limits are invalid/);
 await expect(page.locator('#alm-validate [role=status]')).toContainText('Validation refused: Axis limits are invalid');
 const r=await replay(page);expect(r.checks).toBe(manifest.checks);expect(r.failed).toEqual([]);
 expect(await page.evaluate(()=>({axis:[...document.querySelectorAll('#alm-axis-mount input')].map(x=>[x.value,x.checked]),err:document.querySelector('#alm-axis-mount [data-error]').textContent,svg:document.getElementById('svg-host').innerHTML,banner:document.getElementById('warn-banner').innerHTML,href:location.href}))).toEqual(before);
});
test('cumulative-subgroup replay shows default axis controls and restores the user axis values',async({page})=>{
 test.setTimeout(240000);await open(page);
 const max=page.locator('[data-axis=x][data-edge=max]');await max.fill(' 2 ');await max.dispatchEvent('change');
 const user=await page.evaluate(()=>{const i=[...document.querySelectorAll('#alm-axis-mount input')];const o=__almCumSubValidationRun;window.__seen=[];window.__almCumSubValidationRun=(...a)=>{const r=o(...a);window.__seen.push(i.map(x=>[x.value,x.checked]));return r;};return i.map(x=>[x.value,x.checked]);});
 const r=await replay(page);expect(r.failed).toEqual([]);
 const seen=await page.evaluate(()=>window.__seen);expect(seen).toHaveLength(ALL);for(const s of seen)expect(s).toEqual([['',false],['',false],['on',false]]);
 expect(await page.evaluate(()=>[...document.querySelectorAll('#alm-axis-mount input')].map(x=>[x.value,x.checked]))).toEqual(user);
 const l=await live(page);expect(l.rows.filter(x=>!x.pass)).toEqual([]);
});
test('cumulative-subgroup live refuses fewer than two studies and a subgroup view without groups',async({page})=>{
 test.setTimeout(120000);await open(page);
 await page.locator('#f-data').fill('A, 0.1, 0.1');await expect(live(page)).rejects.toThrow(/need at least 2 valid studies/);
 await page.locator('#f-data').fill('A, 0.1, 0.1\nB, 0.2, 0.1');await page.locator('#f-view').selectOption('subgroup');
 await expect(live(page)).rejects.toThrow(/subgroup view needs a group column/);
});

// Review round 1: draft-banner age, analysis-control state, and group names whose UTF-16 and UTF-8 orders differ.
async function draftAged(page,hours){
 await open(page);await page.locator('#f-data').fill((await page.locator('#f-data').inputValue())+'\n');
 await page.waitForFunction(()=>!!localStorage.getItem('alm-autosave:cumulative-subgroup'));
 await page.evaluate(h=>{const k='alm-autosave:cumulative-subgroup',d=JSON.parse(localStorage.getItem(k));d.savedAt=new Date(Date.now()-h*3600e3).toISOString();localStorage.setItem(k,JSON.stringify(d));},hours);
 await holdBannerTimer(page);await page.reload();await page.waitForFunction(()=>!!window.AlmCumSubValidation);
 await page.waitForFunction(()=>[...document.body.children].some(e=>/^Draft from /.test(e.textContent)));
}
const bannerSpan=page=>page.evaluate(()=>[...document.body.children].find(e=>e.matches('div[role=status][aria-live=polite]')).firstElementChild.textContent);
test('cumulative-subgroup draft banner of a 3 h old draft passes replay and live, including after time passes',async({page})=>{
 test.setTimeout(400000);await draftAged(page,3);
 expect(await bannerSpan(page)).toBe('Draft from 3 h ago found. Restore?');
 await page.waitForTimeout(1500);
 const r=await replay(page);expect(r.checks).toBe(manifest.checks);expect(r.failed).toEqual([]);
 const l=await live(page);expect(l.rows.filter(x=>!x.pass)).toEqual([]);
});
for(const [name,text] of [['number','Draft from 4 h ago found. Restore?'],['unit','Draft from 3 min ago found. Restore?'],['large age','Draft from 999 h ago found. Restore?']])test('cumulative-subgroup draft banner with an altered age '+name+' fails replay and live',async({page})=>{
 test.setTimeout(400000);await draftAged(page,3);
 await page.evaluate(t=>{[...document.body.children].find(e=>e.matches('div[role=status][aria-live=polite]')).firstElementChild.textContent=t;},text);
 const bad=await replay(page);expect(bad.failed).toHaveLength(ALL);expect(bad.failed.every(x=>x.quantity==='page_text')).toBe(true);
 expect(failedLabels(await live(page))).toEqual(['display.page_text']);
});
test('cumulative-subgroup draft banner at 1 min: an altered number fails',async({page})=>{
 test.setTimeout(400000);await draftAged(page,0);
 expect(await bannerSpan(page)).toBe('Draft from 1 min ago found. Restore?');
 await page.evaluate(()=>{[...document.body.children].find(e=>e.matches('div[role=status][aria-live=polite]')).firstElementChild.textContent='Draft from 2 min ago found. Restore?';});
 expect(failedLabels(await live(page))).toEqual(['display.page_text']);
});

for(const [name,body] of [
 ['disabled view selector','document.getElementById("f-view").disabled=true;'],
 ['read-only data box','document.getElementById("f-data").readOnly=true;'],
 ['disabled title','document.getElementById("f-title").disabled=true;'],
 ['disabled axis maximum','document.querySelector("#alm-axis-mount [data-edge=max]").disabled=true;'],
 ['disabled data fieldset','document.querySelector("#f-data").closest("fieldset").disabled=true;'],
])test('cumulative-subgroup live catches a '+name,async({page})=>{
 test.setTimeout(300000);await open(page);await page.locator('#f-view').selectOption('subgroup');await afterRun(page,body);
 const r=await live(page);expect(failedLabels(r)).toEqual(['display.controls']);
});
test('cumulative-subgroup replay expects its own disabled controls: a control left enabled fails',async({page})=>{
 test.setTimeout(180000);await open(page);
 await afterRun(page,'document.getElementById("f-view").disabled=false;');
 const r=await replay(page);expect(r.failed).toHaveLength(ALL);expect(r.failed.every(x=>x.quantity==='controls')).toBe(true);
 expect(await page.evaluate(()=>document.getElementById('f-view').disabled)).toBe(false);
});

for(const [name,data,groups] of [
 ['astral and full-width group names (UTF-16 vs UTF-8 order)','A, 0.1, 0.1, 2001, \u{1F600}\nB, 0.5, 0.2, 2002, ｚ\nC, 0.2, 0.3, 2003, \u{1F600}\nD, -0.1, 0.2, 2004, ｚ',['\u{1F600}','ｚ']],
 ['mixed-case and accented group names','A, 0.1, 0.1, 2001, b\nB, 0.5, 0.2, 2002, B\nC, 0.2, 0.3, 2003, a\nD, -0.1, 0.2, 2004, é\nE, 0.3, 0.25, 2005, b\nF, 0.05, 0.15, 2006, B\nG, 0.4, 0.3, 2007, é',['B','a','b','é']],
])test('cumulative-subgroup live passes with '+name,async({page})=>{
 test.setTimeout(300000);await open(page);await page.locator('#f-view').selectOption('subgroup');await page.locator('#f-data').fill(data);
 expect(await page.evaluate(()=>window.__almCumSubValidationRun().sub.groups.map(g=>g.name))).toEqual(groups);
 const r=await live(page);expect(r.rows.filter(x=>!x.pass)).toEqual([]);
 for(const q of ['group_coverage','group_order'])expect(r.rows.find(x=>x.label===q).ref).toBe(true);
});
test('cumulative-subgroup live R order check rejects a page group order that breaks the page sort rule',async({page})=>{
 test.setTimeout(300000);await open(page);await page.locator('#f-view').selectOption('subgroup');
 await page.locator('#f-data').fill('A, 0.1, 0.1, 2001, \u{1F600}\nB, 0.5, 0.2, 2002, ｚ\nC, 0.2, 0.3, 2003, \u{1F600}\nD, -0.1, 0.2, 2004, ｚ');
 await afterRun(page,'if(a.sub){a.sub.groups.reverse();a.pools.splice(0,2,a.pools[1],a.pools[0]);}');
 const r=await live(page);expect(failedLabels(r)).toContain('group_order');
});

// Review round 2: the banner sentence is recorded exactly at insertion; boundary ages, adjacent numbers and unit flips.
// A banner is created by shared/autosave.js itself (AlmAutosave.install) with Date.now fixed at T and a draft saved ageMs before T.
async function bannerAt(page,ageMs){
 await holdBannerTimer(page);await open(page);
 return page.evaluate(async ageMs=>{
  const realNow=Date.now,t=realNow();Date.now=()=>t;
  localStorage.setItem('alm-autosave:cumulative-subgroup',JSON.stringify({version:1,savedAt:new Date(t-ageMs).toISOString(),values:{'f-data':document.getElementById('f-data').value}}));
  try{AlmAutosave.install({appKey:'cumulative-subgroup',selectors:['#f-data']});await Promise.resolve();}finally{Date.now=realNow;}
  return [...document.body.children].find(e=>e.matches('div[role=status][aria-live=polite]')).firstElementChild.textContent;
 },ageMs);
}
const setBanner=(page,text)=>page.evaluate(t=>{[...document.body.children].find(e=>e.matches('div[role=status][aria-live=polite]')).firstElementChild.textContent=t;},text);
// Review round 4: a replacement node must never establish a new trusted sentence.
for(const [name,ageMs,shown,replacement] of [
 ['2 -> 1 min',90500,'Draft from 2 min ago found. Restore?','Draft from 1 min ago found. Restore?'],
 ['1 -> 2 h',5364000,'Draft from 1 h ago found. Restore?','Draft from 2 h ago found. Restore?'],
 ['identical sentence',90500,'Draft from 2 min ago found. Restore?','Draft from 2 min ago found. Restore?'],
])test('cumulative-subgroup draft banner replacement '+name+' fails both tiers',async({page})=>{
 test.setTimeout(400000);expect(await bannerAt(page,ageMs)).toBe(shown);
 await page.evaluate(async text=>{
  const original=[...document.body.children].find(e=>e.matches('div[role=status][aria-live=polite]'));
  const clone=original.cloneNode(true);clone.firstElementChild.textContent=text;original.replaceWith(clone);
  await Promise.resolve();
 },replacement);
 const l=await live(page),r=await replay(page);
 expect.soft(failedLabels(l)).toEqual(['display.page_text']);
 expect.soft(r.failed).toHaveLength(ALL);
 expect.soft([...new Set(r.failed.map(x=>x.quantity))]).toEqual(['page_text']);
 expect(await bannerSpan(page)).toBe(replacement);
});
test('cumulative-subgroup draft banner removal without replacement passes both tiers',async({page})=>{
 test.setTimeout(400000);await bannerAt(page,90500);
 await page.evaluate(()=>[...document.body.children].find(e=>e.matches('div[role=status][aria-live=polite]')).remove());
 expect(failedLabels(await live(page))).toEqual([]);
 const r=await replay(page);expect(r.checks).toBe(manifest.checks);expect(r.failed).toEqual([]);
});
async function bothTiersFail(page){
 const bad=await replay(page);expect(bad.failed).toHaveLength(ALL);expect(bad.failed.every(x=>x.quantity==='page_text')).toBe(true);
 expect(failedLabels(await live(page))).toEqual(['display.page_text']);
}
for(const [name,ageMs,shown,altered] of [
 ['minute boundary 90.5 s: 2 -> 1 min',90500,'Draft from 2 min ago found. Restore?','Draft from 1 min ago found. Restore?'],
 ['minute boundary 89.5 s: 1 -> 2 min',89500,'Draft from 1 min ago found. Restore?','Draft from 2 min ago found. Restore?'],
 ['150.5 s: 3 -> 2 min',150500,'Draft from 3 min ago found. Restore?','Draft from 2 min ago found. Restore?'],
 ['hour boundary 59.5 min: 1 h -> 60 min',3570000,'Draft from 1 h ago found. Restore?','Draft from 60 min ago found. Restore?'],
 ['hour rounding 89.4 min: 1 -> 2 h',5364000,'Draft from 1 h ago found. Restore?','Draft from 2 h ago found. Restore?'],
 ['hour rounding boundary 89.5 min: 2 -> 1 h',5370000,'Draft from 2 h ago found. Restore?','Draft from 1 h ago found. Restore?'],
 ['unit flip 2 min -> 2 h',90500,'Draft from 2 min ago found. Restore?','Draft from 2 h ago found. Restore?'],
 ['unit flip 1 h -> 1 min',3600000,'Draft from 1 h ago found. Restore?','Draft from 1 min ago found. Restore?'],
])test('cumulative-subgroup draft banner '+name+' fails both tiers',async({page})=>{
 test.setTimeout(400000);expect(await bannerAt(page,ageMs)).toBe(shown);
 await setBanner(page,altered);await bothTiersFail(page);
});
test('cumulative-subgroup boundary banner passes both tiers and keeps passing after time crosses the next boundary',async({page})=>{
 test.setTimeout(400000);expect(await bannerAt(page,90500)).toBe('Draft from 2 min ago found. Restore?');
 const r=await replay(page);expect(r.failed).toEqual([]);expect(failedLabels(await live(page))).toEqual([]);
 // Advance the clock 60 s: recomputing would now give "3 min"; the banner autosave built still says 2 min and must still pass.
 await page.evaluate(()=>{const n=Date.now,o=n();Date.now=()=>n()+60000;window.__realNow=n;});
 const r2=await replay(page);expect(r2.failed).toEqual([]);expect(failedLabels(await live(page))).toEqual([]);
 expect(await page.evaluate(()=>[...document.body.children].find(e=>e.matches('div[role=status][aria-live=polite]')).firstElementChild.textContent)).toBe('Draft from 2 min ago found. Restore?');
});
test('cumulative-subgroup draft banner rewritten with its own sentence still fails (any later edit is evidence of change)',async({page})=>{
 test.setTimeout(400000);const shown=await bannerAt(page,90500);await setBanner(page,shown);await bothTiersFail(page);
});
for(const action of ['Restore','Discard'])test('cumulative-subgroup draft banner '+action+' removes it and both tiers pass',async({page})=>{
 test.setTimeout(400000);await bannerAt(page,90500);
 await page.evaluate(a=>{const b=[...document.body.children].find(e=>e.matches('div[role=status][aria-live=polite]'));[...b.querySelectorAll('button')].find(x=>x.textContent===a).click();},action);
 expect(await page.evaluate(()=>[...document.body.children].filter(e=>e.matches('div[role=status][aria-live=polite]')).length)).toBe(0);
 if(action==='Discard')expect(await page.evaluate(()=>localStorage.getItem('alm-autosave:cumulative-subgroup'))).toBeNull();
 const r=await replay(page);expect(r.failed).toEqual([]);expect(failedLabels(await live(page))).toEqual([]);
});
