"""Explicit network component selection: no silent removal or invented links."""
from pathlib import Path
p=Path('IPD-Meta-Pro/src/diagnostic-plots.js');t=p.read_text()
a=t.index('  function networkInput() {');b=t.index('  async function runtime()',a)
n=t[a:b]
assert n.count('    const rows=[];')==1
n=n.replace('    const rows=[];','    let rows=[];',1)
n=n.replace('    const trts=[...new Set(rows.flatMap(r=>[r.treatment1,r.treatment2]))];','    let trts=[...new Set(rows.flatMap(r=>[r.treatment1,r.treatment2]))];',1)
old="""    const seen=new Set([trts[0]]),stack=[trts[0]];while(stack.length){for(const t of neighbours.get(stack.pop()))if(!seen.has(t)){seen.add(t);stack.push(t);}}
    if(seen.size!==trts.length)throw new Error('The network is disconnected. Analyse a connected component before generating Net Heat.');"""
new="""    const allTreatments=trts.slice(), allRows=rows.length, unseen=new Set(trts), components=[];
    while(unseen.size){const first=unseen.values().next().value,seen=new Set([first]),stack=[first];unseen.delete(first);while(stack.length){for(const treatment of neighbours.get(stack.pop()))if(!seen.has(treatment)){seen.add(treatment);unseen.delete(treatment);stack.push(treatment);}}components.push([...seen].sort());}
    components.sort((a,b)=>b.length-a.length||a.join('|').localeCompare(b.join('|')));
    const select=document.getElementById('ipdNetHeatComponent');
    const signature=JSON.stringify(components);
    if(select&&select.dataset.components!==signature){
      const previous=select.value;select.replaceChildren();
      if(components.length>1){const empty=document.createElement('option');empty.value='';empty.textContent='Choose a connected component';select.appendChild(empty);}
      for(const component of components){const option=document.createElement('option');option.value=JSON.stringify(component);option.textContent=component.join(', ');select.appendChild(option);}
      if([...select.options].some(o=>o.value===previous))select.value=previous;
      select.dataset.components=signature;
    }
    if(select)select.parentElement.hidden=components.length<2;
    if(components.length>1){
      const chosen=components.find(component=>JSON.stringify(component)===select?.value);
      if(!chosen)throw new Error('The network has '+components.length+' disconnected components. Choose one above; treatments from different components cannot be combined in a Net Heat plot.');
      const allowed=new Set(chosen);rows=rows.filter(r=>allowed.has(r.treatment1)&&allowed.has(r.treatment2));trts=chosen;
    }
    const componentNote=components.length>1 ? 'Selected component: '+trts.join(', ')+'. '+(allRows-rows.length)+' contrasts from other components excluded by your selection.' : 'Complete connected network.';
    if(trts.length<3)throw new Error('The selected component needs at least three treatments for Net Heat.');"""
assert n.count(old)==1;n=n.replace(old,new,1)
old="return {rows,measure:cfg.outcomeType==='continuous'?'MD':'OR',model:'common',key:JSON.stringify({rows,measure:cfg.outcomeType})};"
assert n.count(old)==1;n=n.replace(old,"return {rows,measure:cfg.outcomeType==='continuous'?'MD':'OR',model:'common',componentNote,key:JSON.stringify({rows,measure:cfg.outcomeType})};",1)
t=t[:a]+n+t[b:]
old="status('netHeatPlot',text+'\\nGrey squares: design contributions; colours: changes in inconsistency after detaching designs. This R diagnostic does not replace the app’s fitted results.');"
assert t.count(old)==1
t=t.replace(old,"status('netHeatPlot',text+'\\n'+input.componentNote+'\\nGrey squares: design contributions; colours: changes in inconsistency after detaching designs. This R diagnostic does not replace the app’s fitted results.');",1)
old="unavailable('netHeatPlot','Generate a common-effect Net Heat plot from the current '+input.measure+' contrasts using netmeta in browser-side R. The first run downloads the R package.');"
assert t.count(old)==1
t=t.replace(old,"unavailable('netHeatPlot',input.componentNote+' Generate a common-effect Net Heat plot from the current '+input.measure+' contrasts using netmeta in browser-side R. The first run downloads the R package.');",1)
old="  const net=document.getElementById('netHeatPlot');"
assert t.count(old)==1
t=t.replace(old,old+"""
  if(net){const label=document.createElement('label');label.hidden=true;label.style.cssText='display:block;margin-bottom:.75rem';label.textContent='Connected component for Net Heat';const select=document.createElement('select');select.id='ipdNetHeatComponent';select.className='form-select';select.setAttribute('aria-label','Connected component for Net Heat');label.appendChild(select);net.parentElement.insertBefore(label,net);}
""",1)
p.write_text(t)
# Preserve the disconnected demo: explicitly choose its valid component in the test.
p=Path('tests/playwright/remaining-plots.spec.mjs');t=p.read_text()
old="""      await page.locator('.nav-tab[data-panel=\"consistency\"]').click();
      const input = await page.evaluate(() => IPDPlotCompletion.networkInput());"""
new="""      await page.locator('.nav-tab[data-panel=\"consistency\"]').click();
      await expect(page.locator('#netHeatPlotStatus')).toContainText('disconnected components');
      const component=await page.locator('#ipdNetHeatComponent').evaluate(el=>[...el.options].find(o=>o.text.includes('Placebo')).value);
      await page.locator('#ipdNetHeatComponent').selectOption(component);
      const input = await page.evaluate(() => IPDPlotCompletion.networkInput());
      expect(input.componentNote).toContain('excluded by your selection');"""
assert t.count(old)==1;t=t.replace(old,new,1);p.write_text(t)
print('Disconnected input requires an explicit component choice; no inferred or fabricated comparison links.')
