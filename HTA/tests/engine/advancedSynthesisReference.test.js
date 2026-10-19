'use strict';
const { MetaAnalysisMethods } = require('../../src/engine/metaMethods');
const { NetworkMetaAnalysis } = require('../../src/engine/nma');
const refs = require('../../validation/advanced_synthesis_fixtures.json');

// Expected numbers come from the retained independent SciPy/NumPy program.
// Fit agreement alone cannot certify unsupported models or clinical validity.
function checkPairwise(result, expected) {
    for (const key of ['effect', 'se', 'ci_lower', 'ci_upper', 'pValue']) expect(result.random[key]).toBeCloseTo(expected[key], 6);
    expect(result.heterogeneity.tauSquared).toBeCloseTo(expected.tauSquared, 6);
    expect(result.heterogeneity.Q).toBeCloseTo(expected.Q, 8);
    expect(result.heterogeneity.I2).toBeCloseTo(expected.I2, 6);
    result.weights.random.forEach((w, i) => expect(w).toBeCloseTo(expected.weights[i], 5));
    if (expected.prediction) {
        expect(result.heterogeneity.predictionInterval.lower).toBeCloseTo(expected.prediction[0], 5);
        expect(result.heterogeneity.predictionInterval.upper).toBeCloseTo(expected.prediction[1], 5);
    } else {
        // t_{k-1} prediction interval is not reported for k <= 2 (Cochrane Handbook v6.5).
        expect(result.heterogeneity.predictionInterval).toBeNull();
    }
}

describe('independent advanced synthesis references', () => {
    test.each(refs.pairwise)('$name $method $confidenceLevel', c => {
        const engine = new MetaAnalysisMethods({ method: c.method, alpha: 1-c.confidenceLevel, autoHKSJ: false, useHKSJ: false });
        checkPairwise(engine.calculatePooledEffect(c.data), c.expected);
    });
    test.each(refs.network)('fixed network $name', async c => {
        const engine = new NetworkMetaAnalysis({ method: 'frequentist', model: 'fixed', referenceArm: c.reference });
        engine.setData(c.data, c.outcomeType);
        const result = await engine.run();
        for (const expected of c.expected.effects) {
            const actual = result.effects.find(e => e.treatment === expected.treatment);
            for (const key of ['mean', 'se', 'ci_lower', 'ci_upper', 'pValue']) expect(actual[key]).toBeCloseTo(expected[key], 6);
        }
        expect(result.Q).toBeCloseTo(c.expected.Q, 8);
        expect(result.pValueQ).toBeCloseTo(c.expected.pValueQ, 6);
        engine.calculatePScores().forEach(s => expect(Math.abs(s.pScore-c.expected.scores.find(e => e.treatment === s.treatment).pScore)).toBeLessThan(1e-5));
        for (let i=0; i<c.expected.treatments.length; i++) for (let j=0; j<c.expected.treatments.length; j++) {
            if (i === j) continue;
            const actualI = result.leagueTable.treatments.indexOf(c.expected.treatments[i]);
            const actualJ = result.leagueTable.treatments.indexOf(c.expected.treatments[j]);
            const actual = result.leagueTable.table[actualI][actualJ], expected = c.expected.league[i][j];
            for (const key of ['effect','ci_lower','ci_upper']) expect(actual[key]).toBeCloseTo(expected[key],6);
        }
    });
    test.each(['REML','DL','PM'])('cumulative and leave-one-out %s preserve the model', method => {
        const data=refs.pairwise.find(c=>c.name==='heterogeneous').data.map(s=>({...s,label:s.study}));
        const engine=new MetaAnalysisMethods({method,autoHKSJ:false,useHKSJ:false});
        engine.cumulativeMetaAnalysis(data).results.forEach((r,i)=>{
            const e=refs.sensitivity[method].cumulative[i];
            for(const key of ['effect','se','ci_lower','ci_upper']) expect(r[key]).toBeCloseTo(e[key],6);
        });
        engine.leaveOneOut(data).results.forEach((r,i)=>{
            const e=refs.sensitivity[method].leaveOneOut[i];
            for(const key of ['effect','se','ci_lower','ci_upper']) expect(r[key]).toBeCloseTo(e[key],6);
        });
    });
    test('binary effects are treatment/reference and invariant to reversing input arms', async () => {
        const c=refs.network.find(c=>c.name==='binary-A');
        const reversed=c.data.flatMap((_,i)=>i%2 ? [] : [c.data[i+1],c.data[i]]);
        const engine=new NetworkMetaAnalysis({method:'frequentist',model:'fixed',referenceArm:'A'});
        engine.setData(reversed,'binary'); const r=await engine.run();
        c.expected.effects.forEach(e=>expect(r.effects.find(a=>a.treatment===e.treatment).mean).toBeCloseTo(e.mean,10));
        const direct=new NetworkMetaAnalysis({method:'frequentist',model:'fixed',referenceArm:'A'});
        direct.setData(c.data.slice(0,2),'binary');
        expect(direct.runFrequentistNMA().effects[0].mean).toBeCloseTo(Math.log((20/80)/(10/90)),12);
    });
});
