'use strict';
const fs = require('fs');
const path = require('path');
const { HTAAdvancedSynthesis } = require('../../src/ui/advancedSynthesis');
const { MetaAnalysisMethods } = require('../../src/engine/metaMethods');
const { NetworkMetaAnalysis } = require('../../src/engine/nma');
const refs = require('../../validation/advanced_synthesis_fixtures.json');

describe('advanced synthesis input and saved-fit contracts', () => {
    let ui, app;
    beforeEach(() => {
        // The real markup catches nonexistent ID/selector assumptions.
        const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
        const dom=new DOMParser().parseFromString(html,'text/html');
        document.body.replaceChildren(...['section-meta-methods','section-nma','section-pub-bias'].map(id=>dom.getElementById(id)));
        global.MetaAnalysisMethods=MetaAnalysisMethods;
        global.NetworkMetaAnalysis=NetworkMetaAnalysis;
        global.Chart={getChart:()=>null};
        require('../../src/ui/synthesisPlots');
        app={showToast:jest.fn(),showLoading:jest.fn(),hideLoading:jest.fn()};
        ui=new HTAAdvancedSynthesis(app);
    });
    afterEach(() => { delete global.MetaAnalysisMethods; delete global.NetworkMetaAnalysis; });
    const pairwise=refs.pairwise.find(c=>c.name==='heterogeneous').data;
    function put(kind,data) { document.getElementById(`${kind}-data-input`).value=JSON.stringify(data); }
    test('parses quoted commas, quotes, newlines, BOM and zero effects', () => {
        const rows=HTAAdvancedSynthesis.parse('\uFEFFstudy,effect,se\r\n"A, ""quoted""\ntrial",0,.2');
        expect(rows).toEqual([{study:'A, "quoted"\ntrial',effect:'0',se:'.2'}]);
        put('ma',rows);expect(ui.pairwiseData()[0].effect).toBe(0);
    });
    test.each(['study,effect,se\nS1,0', 'study,effect,effect\nS1,0,.2','study,effect,se\n"S1,0,.2','{"rows":[]}','[null]'])('rejects malformed or ambiguous records: %s', text => {
        expect(()=>HTAAdvancedSynthesis.parse(text)).toThrow();
    });
    test('JSON aliases yield canonical estimates without exponentiation', () => {
        put('ma',{studies:[{study:'S1',yi:0,sei:.2},{study:'S2',yi:-.8,sei:.1}]});
        document.getElementById('ma-effect-measure').value='OR';
        expect(ui.pairwiseData()[1].effect).toBe(-.8);
        expect(ui.settingsMA().analysisScale).toBe('log(OR)');
    });
    test.each([null,'',true,'Infinity',Infinity,NaN])('rejects missing/non-finite SE: %s', se => {
        put('ma',[{study:'S1',effect:.1,se}]);expect(()=>ui.pairwiseData()).toThrow();
    });
    test('does not silently drop duplicate studies or invalid rows', () => {
        put('ma',[{study:'S1',effect:.1,se:.2},{study:'S1',effect:.3,se:.2}]);expect(()=>ui.pairwiseData()).toThrow(/duplicate/);
        put('ma',[{study:'S1',effect:.1,se:.2},{study:'S2',effect:null,se:.2}]);expect(()=>ui.pairwiseData()).toThrow(/finite/);
    });
    test('real settings reach the engine and saved results', async () => {
        put('ma',pairwise);
        document.getElementById('ma-tau-method').value='PM';document.getElementById('ma-ci-level').value='.99';
        // HTML stores 0.99 rather than .99.
        document.getElementById('ma-ci-level').value='0.99';
        document.getElementById('ma-pred-int').value='false';
        await ui.runMA();
        expect(ui.fits.ma.settings.method).toBe('PM');expect(ui.fits.ma.settings.confidenceLevel).toBe(.99);
        expect(ui.fits.ma.results.heterogeneity.predictionInterval).toBeNull();
        expect(document.getElementById('ma-model-description').textContent).toContain('99% normal-approximation');
        expect(ui.fits.ma.cumulative.results.at(-1).effect).toBe(ui.fits.ma.results.random.effect);
        expect(ui.fits.ma.results.warnings.every(w=>!w.message.includes('Set useHKSJ'))).toBe(true);
    });
    test('a requested prediction interval with k = 2 is reported as not estimable, not as not requested', async () => {
        put('ma',refs.pairwise.find(c=>c.name==='two-study').data);
        document.getElementById('ma-pred-int').value='true';
        await ui.runMA();
        expect(ui.fits.ma.results.heterogeneity.predictionInterval).toBeNull();
        expect(document.getElementById('ma-pred-interval').textContent).toBe('Not estimable with fewer than 3 studies');
    });
    test.each([['ma-hksj','true'],['ma-small-study','knha'],['ma-tau-method','EB'],['ma-pub-bias','peters']])('rejects unsupported forced setting %s=%s', async (id,value) => {
        put('ma',pairwise);document.getElementById(id).value=value;await ui.runMA();
        expect(ui.fits.ma).toBeNull();expect(app.showToast).toHaveBeenCalledWith(expect.any(String),'error');
    });
    test('invalid reanalysis clears fitted tables/exports and previous plots', async () => {
        put('ma',pairwise);await ui.runMA();expect(ui.fits.ma).not.toBeNull();
        put('ma',[{study:'Bad',effect:.2,se:0}]);await ui.runMA();expect(ui.fits.ma).toBeNull();
        expect(document.getElementById('ma-results').style.display).toBe('none');
        expect(document.getElementById('btn-export-ma-fit').disabled).toBe(true);
    });
    test('renders imported study names as text, never HTML', async () => {
        put('ma',pairwise.map((s,i)=>({...s,study:i===0?'<img src=x onerror=alert(1)>':s.study})));
        await ui.runMA();
        expect(document.getElementById('ma-study-body').textContent).toContain('<img');
        expect(document.getElementById('ma-study-body').querySelector('img')).toBeNull();
    });
    test('fixed NMA saves the verified model and excludes unvalidated diagnostics', async () => {
        put('nma',refs.network[0].data);ui.refreshTreatments();document.getElementById('nma-reference').value='A';
        await ui.runNMA();expect(ui.fits.nma).not.toBeNull();expect(ui.fits.nma.results.model).toBe('fixed');
        expect(ui.fits.nma.results).not.toHaveProperty('sucra');expect(ui.fits.nma.results).not.toHaveProperty('consistency');
        expect(ui.fits.nma.settings.contrastDirection).toContain('treatment');
    });
    test.each([['nma-model','random'],['nma-method','bayesian'],['nma-outcome','survival']])('rejects unsupported network setting %s=%s', async (id,value) => {
        put('nma',refs.network[0].data);document.getElementById(id).value=value;await ui.runNMA();expect(ui.fits.nma).toBeNull();
    });
    test('network reference must occur in the data', async () => {
        put('nma',refs.network[0].data);const select=document.getElementById('nma-reference');select.appendChild(new Option('Missing','Missing'));select.value='Missing';
        await ui.runNMA();expect(ui.fits.nma).toBeNull();expect(document.getElementById('nma-analysis-message').textContent).toContain('not present');
    });
    test('file parser does not invent a default continuous sample size', () => {
        document.getElementById('nma-outcome').value='continuous';put('nma',refs.network.find(c=>c.outcomeType==='continuous').data.map((s,i)=>i===0?{...s,n:undefined}:s));
        expect(()=>ui.networkData()).toThrow(/n must be a finite/);
    });
    test('malformed or failed imports cannot retain prior input/fit', async () => {
        put('ma',pairwise);await ui.runMA();
        const input={files:[{text:async()=>'{invalid'}],value:'old'};await ui.importFile('ma',input);
        expect(ui.fits.ma).toBeNull();expect(document.getElementById('ma-data-input').value).toBe('');expect(input.value).toBe('');
    });
    test('a delayed import cannot overwrite a more recent manual edit', async () => {
        let finish;
        const pending=new Promise(resolve=>{finish=resolve;});
        const input={files:[{text:()=>pending}],value:'pending'};
        const importing=ui.importFile('ma',input);
        const area=document.getElementById('ma-data-input');area.value='study,effect,se\nNew,0,.2';area.dispatchEvent(new Event('input'));
        finish(JSON.stringify(pairwise));await importing;
        expect(area.value).toContain('New');expect(ui.fits.ma).toBeNull();
    });
    test('a delayed NMA fit cannot replace results after input changes', async () => {
        let finish;
        const pending=new Promise(resolve=>{finish=resolve;});
        const run=jest.spyOn(NetworkMetaAnalysis.prototype,'run').mockImplementation(()=>pending);
        put('nma',refs.network[0].data);
        const fitting=ui.runNMA();ui.clear('nma');finish({});await fitting;
        expect(ui.fits.nma).toBeNull();expect(document.getElementById('nma-results').style.display).toBe('none');run.mockRestore();
    });
});
