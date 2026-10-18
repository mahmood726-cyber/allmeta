import {test,expect} from './validation-fixture.mjs';
import {readFileSync} from 'node:fs';
import {contracts,summarize} from '../../../scripts/replay_baseline.mjs';

// Host must first capture main; absence is an error, never a skipped proof.
const baseline=JSON.parse(readFileSync(new URL('../../../audit/replay-baseline.json',import.meta.url),'utf8'));
for(const [app] of contracts)test('add-on outside main preserves offline replay: '+app,async({page,context})=>{
  test.setTimeout(app === 'screen' ? 1800000 : 600000);
  await page.addInitScript(()=>{
    let value;Object.defineProperty(window,'AlmValidate',{configurable:true,get:()=>value,set:v=>{
      value=v;const mount=v.mount;v.mount=(...args)=>(window.__widget=mount(...args));
    }});
  });
  await page.goto('/'+app+'/index.html');await page.waitForFunction(()=>!!window.__widget);
  await page.evaluate(async()=>{if(window.ScreenValidationAdapter)await ScreenValidationAdapter.ready;await __widget.prepare();});
  await page.addScriptTag({url:'/hub/shared/addons-host.js'});
  await expect(page.locator('body > main')).toHaveCount(1);
  {
    await page.evaluate(()=>{
      window.__addon=alm.addons.register({app:'fixture',lifecycle:()=>{},describe:()=>({}),displayed:()=>({}),sensitivity:null,rExport:{live:{}}});
      window.__calls=0;
      window.__panel=__addon.panel('test','Test add-on',el=>{__calls++;const i=document.createElement('input');i.id='alm-addon-fixture-input';i.value='unrelated';el.append(i);});
      __panel.open();
    });
    await expect(page.locator('body > main + aside[data-alm-addon]')).toHaveCount(1);
  }
  await context.setOffline(true);
  const result=await page.evaluate(async()=>{
    const pending=__widget.runCorpus();
    if(!AlmValidate.isRunning())throw Error('Running state missing');
    if(window.__addon&&__addon.run(()=>{throw Error('Must suspend');}))throw Error('Not suspended');
    const result=await pending;
    if(AlmValidate.isRunning())throw Error('Running state leaked');
    return result;
  });
  expect(summarize(result)).toEqual(baseline.apps[app]);
});

test('real DOM add-on input and button do not invalidate pending R; analysis edit does',async({page})=>{
  await page.goto('/influence/index.html');
  await page.addScriptTag({url:'/hub/shared/addons-host.js'});
  const outcome=await page.evaluate(async()=>{
    const host=alm.addons.register({app:'fixture',lifecycle:()=>{},describe:()=>({}),displayed:()=>({}),sensitivity:null,rExport:{live:{}}});
    host.panel('test','Fixture',el=>{el.innerHTML='<input id="alm-addon-fixture-input"><button type="button">Fixture action</button>';}).open();
    const mount=document.createElement('div');document.body.append(mount);
    let release;window.AlmWebR={runR:()=>new Promise(r=>{release=r;})};
    const widget=AlmValidate.mount(mount,{paper:{},corpus:{files:[]},live:{currentState:()=>({}),appValues:()=>[{key:'x',value:1}],compare:{tolerance:{default:0}},buildScript:()=>'',packages:[]}});
    const run=async(analysis)=>{
      release=null;const p=widget.runLive();while(!release)await Promise.resolve();
      const i=document.getElementById(analysis?'src':'alm-addon-fixture-input');i.value+='x';i.dispatchEvent(new Event('input',{bubbles:true}));
      document.querySelector('#alm-addons button').click();
      release({ok:true,stdout:'ALMJSON:{"x":1}',versions:{}});return p;
    };
    return {addon:await run(false),analysis:await run(true)};
  });
  expect(outcome.addon.rows[0].pass).toBe(true);expect(outcome.analysis.stale).toBe(true);
});
