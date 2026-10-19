// nma-inconsistency scripted task walkthrough (usability evidence for paper 16):
// fresh load -> one-click real example -> paste own data -> change model -> read core output -> export.
// Every user action is counted; displayed results are compared with the pinned native-R plus reference.
// Set P16_SHOTS=<dir> to save a screenshot per step and the Figure 2 element captures.
import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const root=new URL('../../../',import.meta.url),app='/nma-inconsistency/index.html';
const plus=JSON.parse(readFileSync(new URL('nma-inconsistency/validate/plus/reference.json',root),'utf8'));
const corpus=JSON.parse(readFileSync(new URL('nma-inconsistency/validate/plus/corpus.json',root),'utf8'));
const shots=process.env.P16_SHOTS||'';if(shots)mkdirSync(shots,{recursive:true});
const quote=v=>'"'+String(v).replace(/"/g,'""')+'"';
const OWN='netmeta::smokingcessation::cessation::OR::two-arm-only::';
const ownText=corpus.find(c=>c.key===OWN+'FE').rows.map(r=>[r.A,r.B,r.te,r.se,r.study].map(quote).join(',')).join('\n');
const idle=page=>page.evaluate(()=>AlmIncoPlus.whenIdle());
const refSummary=(page,key,model)=>page.evaluate(([x,model])=>AlmIncoPlusCore.looSummary(AlmIncoPlusAdapter.refLoo({model,rows:[]},x)),[plus.cases.find(c=>c.key===key),model]);
test.use({viewport:{width:1280,height:900},deviceScaleFactor:2});

test('task walkthrough: example, own data, model change, core output, export (clicks counted)',async({page})=>{
 test.setTimeout(240000);const log=[];let clicks=0,typed=0,selects=0;
 const step=async(name,extra)=>{log.push({step:name,clicks,typed,selects,...extra});if(shots)await page.screenshot({path:join(shots,`walk-${log.length}-${name}.png`),fullPage:true});};
 await page.goto(app);
 await expect(page.locator('#ns-body tr')).not.toHaveCount(0);await expect(page.locator('#dbt')).toContainText('Design-by-treatment Q =');
 await idle(page);await step('fresh-load',{splits:await page.locator('#ns-body tr').count()});
 await page.getByRole('button',{name:/Baker 2009/}).click();clicks++;await idle(page);
 await expect(page.locator('#plus-loo-body tr')).toHaveCount(29);
 await expect(page.locator('#plus-loo-summary')).toHaveText(await refSummary(page,'netmeta::Baker2009::exac::OR::two-arm-only::FE','FE'));
 await step('real-example',{looRows:29});
 await page.fill('#src',ownText);typed++;
 await expect.poll(()=>page.evaluate(()=>(_almLastInco().trts||[]).join(','))).toBe('A,B,C,D');await idle(page);
 await expect(page.locator('#plus-loo-summary')).toHaveText(await refSummary(page,OWN+'FE','FE'));
 await step('own-data-pasted',{rows:ownText.split('\n').length});
 await page.selectOption('#f-model','PM');selects++;await idle(page);
 expect(await page.evaluate(()=>_almLastInco().model)).toBe('PM');
 await expect(page.locator('#dbt')).toContainText('Model: PM');
 await expect(page.locator('#plus-loo-summary')).toHaveText(await refSummary(page,OWN+'PM','PM'));
 const core={dbt:(await page.locator('#dbt').innerText()).trim(),splits:await page.locator('#ns-body tr').count(),loo:(await page.locator('#plus-loo-summary').innerText()).trim()};
 await step('model-changed-core-output',core);
 const [md]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Methods+Results (.md)'}).click()]);clicks++;
 const mdText=readFileSync(await md.path(),'utf8');expect(mdText).toContain('Results. The global design-by-treatment test gave Q = ');
 const [rs]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download R script (self-verifying)'}).click()]);clicks++;
 expect(rs.suggestedFilename()).toBe('nma-inconsistency-PM.R');expect(readFileSync(await rs.path(),'utf8')).toContain('allmeta check: %d/%d quantities match');
 await step('exported',{files:[md.suggestedFilename(),rs.suggestedFilename()]});
 const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
 const violations=axe.violations.map(v=>v.id+': '+v.nodes.length);
 const result={walkthrough:log,clicksToCoreOutput:{freshLoad:0,realExample:1,ownData:'paste only (0 clicks; re-runs after 500 ms)',modelChange:'1 selection'},totalClicks:clicks,typed,selects,axeFullPage:{rules:'wcag2a,wcag2aa,wcag21a,wcag21aa',violations,passes:axe.passes.length}};
 console.log('WALKTHROUGH '+JSON.stringify(result));if(shots)writeFileSync(join(shots,'walkthrough-result.json'),JSON.stringify(result,null,1));
 expect(violations).toEqual([]);
});

test('figure 2 capture: plus panel on the Baker 2009 two-arm example (fixed effect)',async({page})=>{
 test.skip(!shots,'set P16_SHOTS to capture');test.setTimeout(120000);
 await page.goto(app);await page.addStyleTag({content:'#hub-back{display:none!important}'});
 await page.getByRole('button',{name:/Baker 2009/}).click();await idle(page);
 const key='netmeta::Baker2009::exac::OR::two-arm-only::FE';
 await expect(page.locator('#plus-loo-summary')).toHaveText(await refSummary(page,key,'FE'));
 await page.locator('#plus-loo-body button.plus-row').first().click();
 const out={key,texts:{}};
 for(const [name,sel] of [['A_interpret','#plus-interpret-list'],['B_graph','#plus-graph'],['C_loo_summary','#plus-loo-summary'],['C_dq','#plus-dq'],['D_loo_table','#plus-loo-table'],['E_compare','#plus-cmp'],['F_methods','#plus-methods-text']]){
  const el=page.locator(sel);await el.scrollIntoViewIfNeeded();await el.screenshot({path:join(shots,`fig2_${name}.png`)});
  out.texts[name]=(await el.evaluate(e=>e instanceof HTMLElement?e.innerText:e.textContent)).trim();
 }
 out.cmpSummary=(await page.locator('#plus-cmp-summary').innerText()).trim();
 out.engine=await page.evaluate(()=>({model:_almLastInco().model,dbt:_almLastInco().dbt,splits:_almLastInco().nodeSplit.map(s=>[s.comparison,s.p])}));
 out.browser=page.context().browser().version();writeFileSync(join(shots,'fig2-capture.json'),JSON.stringify(out,null,1));
 console.log('FIG2 captured '+Object.keys(out.texts).length+' panels in '+out.browser);
});
