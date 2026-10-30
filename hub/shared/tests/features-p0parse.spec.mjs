import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const dir=new URL('./fixtures/p0parse/',import.meta.url);
const out=new URL('./rchecks-out/p0parse/',import.meta.url);
const cases=JSON.parse(fs.readFileSync(new URL('cases.json',dir)));
const columns=[{name:'study'},{name:'yi',type:'float'},{name:'se',type:'float'}];
const csvCell=v=>'"'+String(v??'').replaceAll('"','""')+'"';
for(const c of cases) test(c.id+' page parser and visible diagnostics',async({page})=>{
 // Remove prior-run evidence even if navigation or an assertion fails.
 for(const name of [c.id+'.csv',c.id+'-refused.csv']) fs.rmSync(new URL(name,out),{force:true});
 await page.goto('/hub/shared/tests/fixtures/p0parse/parser.html');
 expect(await page.evaluate(()=>typeof window.alm?.csvUpload)).toBe('function');
 await page.evaluate(columns=>window.alm.csvUpload({target:'#mount',columns,onParse:r=>window.result=r}),c.columns||columns);
 await page.locator('textarea').fill(fs.readFileSync(new URL(c.id+'.csv',dir),'utf8'));
 await page.locator('[data-action="parse-paste"]').click();
 const result=await page.evaluate(()=>window.result);
 expect(result.rows).toEqual(c.rows);
 if(c.warningsExact) expect(result.warnings).toEqual(c.warningsExact);
 if(c.warning) {
  await expect(page.locator('[data-section="warnings"]')).toContainText(c.warning);
  await expect(page.locator('[data-section="warnings"]')).toContainText('1,234');
 }
 const refused=result.warnings.filter(w=>/^row \d+.*refused/.test(w)).map(w=>Number(w.match(/^row (\d+)/)[1]));
 expect(refused).toEqual(c.refused);
 for(const row of c.refused) await expect(page.locator('[data-section="warnings"]')).toContainText('row '+row+':');
 fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(new URL(c.id+'.csv',out),'study,yi,se,sei,vi,year,or,lower,upper,e1,n1,e2,n2,TP,FN,FP,TN\n'+result.rows.map(r=>["study","yi","se","sei","vi","year","or","lower","upper","e1","n1","e2","n2","TP","FN","FP","TN"].map(k=>csvCell(r[k])).join(',')).join('\n')+'\n');
 fs.writeFileSync(new URL(c.id+'-refused.csv',out),'row\n'+refused.join('\n')+'\n');
});
