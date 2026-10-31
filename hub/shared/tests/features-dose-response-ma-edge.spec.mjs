import { test, expect } from '@playwright/test';
import { studiesOf, runAll, compare, tolerance } from './_dr_parity_check.mjs';

// Mahmood's decisions (2026-10-31) for dose-response-ma: match dosresmeta, warn visibly, never refuse silently.
//  1. Negative doses: accepted (dosresmeta fits them) with a visible warning naming the rows.
//  2. Fractional cases / n: accepted (dosresmeta fits them) with a visible warning naming the rows; an incidence-rate (ir)
//     row may have a person-time n, so a fractional n alone is not flagged there.
//  3. A single study: dosresmeta fits it (dosresmeta() sets proc <- "1stage"; method <- "fixed" when length(unique(id)) == 1),
//     so the app fits it the same way with a small-k warning instead of refusing. With a covariate (meta-regression)
//     dosresmeta stops ("singular matrix 'a' in solve"), so the app refuses that one case with a message.
// Reference: R 4.6.0 (2026-04-24 ucrt), dosresmeta 2.2.0, mixmeta 1.2.2 on baseimage; script dose-response-ma-edge-refs.R
// (dosresmeta(), coef, vcov, Psi, logLik, qtest, waldtest, gof, predictions from basis(dose) - basis(xref), xref = lowest dose).
// Comparison and tolerances: _dr_parity_check.mjs (the dosresmeta parity spec's own compare() and tolerance()).
const R = {"neg-quadratic-gl-2stage-reml":{"name":"neg-quadratic-gl-2stage-reml","proc_used":"2stage","method_used":"reml","warnings":[],"k":6,"coef":[-0.000174435076938013,0.000751489279469154],"vcov":[0.000100009893815067,3.85222263549677e-06,3.85222263549677e-06,2.38640820369954e-07],"Psi":[0.000277204644961165,1.16628251422651e-05,1.16628251422651e-05,6.82967130170535e-07],"logLik":34.6967311302918,"qtest":{"Q":[35.1177664733617,23.5393068131424,17.4086345938543],"df":[10,4,4],"p":[0.000119216539212097,9.8783311628603e-05,0.00160963726231522]},"wald":[6.36950590846068,2,0.041388469384346],"waldNonlin":[2.36646914086862,1,0.123967157616498],"gof":{"D":40.9919742429244,"R2":0.123876566115274,"R2adj":0.0208032209523653,"resid":[-0.447319359524504,1.3913482303894,2.10120528205898,2.12090587410361,-1.06598314698667,-2.50449767460005,-1.2135071024056,-1.7716813274853,-0.585786698079746,1.22450449519145,-0.819465199182328,2.1934727043654,-0.412503129537576,-2.2886829937095,-1.09010327778544,1.6759572301643,-0.858669106997746,0.668837896282818,0.0836374069390814]},"pred":{"dose":[-15,0,10,30],"pred":[-0.132382799291792,-0.304084413326422,-0.230679836148887,0.367022885887676],"se":[0.0553826042822761,0.128650404652575,0.205296300083354,0.708728489200904]},"xref":-20},"neg-linear-gl-2stage-reml":{"name":"neg-linear-gl-2stage-reml","proc_used":"2stage","method_used":"reml","warnings":[],"k":6,"coef":[-0.00436541660858798],"vcov":[3.46830014165909e-05],"Psi":[0.000100570815323951],"logLik":14.0341503361853,"qtest":{"Q":[14.146338763905],"df":[5],"p":[0.0147060928183339]},"wald":[0.549458276048156,1,0.458539126743047],"waldNonlin":null,"gof":{"D":44.5265556037138,"R2":0.0483317889643116,"R2adj":-0.00453866720433771,"resid":[-0.821701599677436,0.857299527040374,2.04077745468559,2.62147842568961,-1.62934949907744,-2.49691258429777,0.00843005010651982,-1.81201268755097,-0.779385076392052,1.09203241788784,-0.850768535061417,1.98241076947369,-0.643560685882529,-2.69925514480316,-1.53638065889989,1.29412841258824,-1.25047178716802,0.317636703898014,-0.230160304216817]},"pred":{"dose":[-15,0,10,30],"pred":[-0.0218270830429399,-0.0873083321717597,-0.130962498257639,-0.218270830429399],"se":[0.0294461378692482,0.117784551476993,0.176676827215489,0.294461378692482]},"xref":-20},"neg-quadratic-gl-1stage-reml":{"name":"neg-quadratic-gl-1stage-reml","proc_used":"1stage","method_used":"reml","warnings":[],"k":6,"coef":[-0.00434472298400536,0.000496358176350069],"vcov":[4.740888137093e-05,5.33579154611763e-07,5.33579154611763e-07,3.31590939829104e-08],"Psi":[0.000138029822455157,1.87008011499924e-06,1.87008011499924e-06,2.53365975217132e-08],"logLik":-22.0254980704934,"qtest":null,"wald":[11.3471350247286,2,0.00343558688877188],"waldNonlin":[7.42998102893106,1,0.00641460180642783],"gof":{"D":40.9919742429244,"R2":0.123876566115274,"R2adj":0.0208032209523653,"resid":[-0.447319359524504,1.3913482303894,2.10120528205898,2.12090587410361,-1.06598314698667,-2.50449767460005,-1.2135071024056,-1.7716813274853,-0.585786698079746,1.22450449519145,-0.819465199182328,2.1934727043654,-0.412503129537576,-2.2886829937095,-1.09010327778544,1.6759572301643,-0.858669106997746,0.668837896282818,0.0836374069390814]},"pred":{"dose":[-15,0,10,30],"pred":[-0.108586295781289,-0.285437730220135,-0.279249142425182,0.0309429389747667],"se":[0.0355943221164457,0.125426237732978,0.189862810758946,0.391779191195297]},"xref":-20},"frac-linear-gl-2stage-reml":{"name":"frac-linear-gl-2stage-reml","proc_used":"2stage","method_used":"reml","warnings":[],"k":6,"coef":[-0.00436544247118078],"vcov":[3.4679119564215e-05],"Psi":[0.000100556164359636],"logLik":14.0343981840775,"qtest":{"Q":[14.1461114693685],"df":[5],"p":[0.0147074559094944]},"wald":[0.549526291574418,1,0.458511315743605],"waldNonlin":null,"gof":{"D":44.5257006030546,"R2":0.0483202952270795,"R2adj":-0.00455079948252735,"resid":[-0.82173271048512,0.857102382626205,2.04058018217826,2.62136478623456,-1.6294051188901,-2.49701880709179,0.0082976209937225,-1.81201553130759,-0.779401254760469,1.09201784150398,-0.850770732920159,1.98239375119983,-0.643583953774441,-2.69928705184393,-1.53633241764097,1.29414893643069,-1.25050239763992,0.317598321405511,-0.23021257590771]},"pred":{"dose":[5,20,40],"pred":[-0.0218272123559039,-0.0873088494236155,-0.174617698847231],"se":[0.0294444899617123,0.117777959846849,0.235555919693698]},"xref":0},"frac-quadratic-gl-2stage-reml":{"name":"frac-quadratic-gl-2stage-reml","proc_used":"2stage","method_used":"reml","warnings":[],"k":6,"coef":[-0.0302343758929865,0.000751500824604639],"vcov":[0.000173656405390401,-5.69343384316441e-06,-5.69343384316441e-06,2.38641588961113e-07],"Psi":[0.000436909749287281,-1.56556440205716e-05,-1.56556440205716e-05,6.82965497901788e-07],"logLik":34.6967925565695,"qtest":{"Q":[35.1185156011181,18.4930270265706,17.4095664004645],"df":[10,4,4],"p":[0.000119181422543302,0.000988248858748597,0.0016089647441947]},"wald":[6.36979936668598,2,0.0413823969364726],"waldNonlin":[2.36653423169036,1,0.123961987538453],"gof":{"D":40.9925971105612,"R2":0.123835847888315,"R2adj":0.0207577123457636,"resid":[-0.447428531030929,1.39104534744514,2.1011006149816,2.12105395586603,-1.06615877005176,-2.50463312147037,-1.21345220459438,-1.77169243416508,-0.585843268844095,1.22446126899839,-0.819473807648905,2.19341182868752,-0.412575746742036,-2.28879986977771,-1.09016352900108,1.67588821530694,-0.858780848829653,0.668723634690612,0.0835121546488869]},"pred":{"dose":[5,20,40],"pred":[-0.132384358849817,-0.304087188017875,-0.00697371635203869],"se":[0.0553823317229387,0.128647871724751,0.400016480210561]},"xref":0},"frac-linear-h-2stage-fixed":{"name":"frac-linear-h-2stage-fixed","proc_used":"2stage","method_used":"fixed","warnings":[],"k":6,"coef":[-0.00444815574816417],"vcov":[8.52816080376664e-06],"Psi":null,"logLik":14.3804710255738,"qtest":{"Q":[14.2666400864257],"df":[5],"p":[0.0140015162733791]},"wald":[2.32008870554915,1,0.127712742942694],"waldNonlin":null,"gof":{"D":44.4016419206385,"R2":0.04965759346784,"R2adj":-0.00313920689505798,"resid":[-0.818686067402917,0.859597524934812,2.07181095040974,2.62714213613414,-1.62395833913362,-2.48485656247121,0.0969865350716576,-1.81173704572378,-0.742377099631182,1.07822927443738,-0.850555499320307,2.02053272758422,-0.681316856592379,-2.69616243463589,-1.57973840389744,1.11110490417332,-1.2475047518247,0.323224451039116,-0.224959735489081]},"pred":{"dose":[5,20,40],"pred":[-0.0222407787408209,-0.0889631149632834,-0.177926229926567],"se":[0.0146015074596483,0.0584060298385933,0.116812059677187]},"xref":0},"one-linear-gl-2stage-reml":{"name":"one-linear-gl-2stage-reml","proc_used":"1stage","method_used":"fixed","warnings":[],"k":1,"coef":[0.010835062292506],"vcov":[2.58746036420058e-05],"Psi":null,"logLik":-0.563976185642606,"qtest":null,"wald":[4.5372124924803,1,0.0331655578211745],"waldNonlin":null,"gof":{"D":3.50742015760166,"R2":0.564004932212048,"R2adj":0.418673242949398,"resid":[-1.4386699279572,-0.78760001480252,0.522905135908846,0.737499445095731]},"pred":{"dose":[10,30,60],"pred":[0.10835062292506,0.32505186877518,0.65010373755036],"se":[0.0508670852732942,0.152601255819883,0.305202511639765]},"xref":0},"one-quadratic-gl-2stage-reml":{"name":"one-quadratic-gl-2stage-reml","proc_used":"1stage","method_used":"fixed","warnings":[],"k":1,"coef":[-0.0097769655377832,0.00040324137495015],"vcov":[0.000195681426371587,-3.32199904042298e-06,-3.32199904042298e-06,6.49896008133057e-08],"Psi":null,"logLik":0.687020931102237,"qtest":null,"wald":[7.03920672597,2,0.0296111777281157],"waldNonlin":[2.50199423348969,1,0.113702237514886],"gof":{"D":1.00542592411197,"R2":0.875019038426605,"R2adj":0.750038076853211,"resid":[-0.750719519081134,0.151146563773705,0.554944315658053,-0.333223124288782]},"pred":{"dose":[10,30,60],"pred":[-0.057445517882817,0.0696082713216389,0.865051017553548],"se":[0.116507684572503,0.222186660739038,0.33408797646043]},"xref":0},"one5-linear-h-1stage-ml":{"name":"one5-linear-h-1stage-ml","proc_used":"1stage","method_used":"fixed","warnings":[],"k":1,"coef":[-0.0122795021771482],"vcov":[6.86555770647158e-05],"Psi":null,"logLik":-3.04928048071375,"qtest":null,"wald":[2.1962698467519,1,0.138345156452231],"waldNonlin":null,"gof":{"D":10.1060931653727,"R2":0.178524226978782,"R2adj":-0.232213659531828,"resid":[-2.37034280024346,-1.06325052869416,1.83222992223636]},"pred":{"dose":[10,20],"pred":[-0.122795021771482,-0.245590043542963],"se":[0.0828586610226812,0.165717322045362]},"xref":0}};

const PAGE = '/dose-response-ma/index.html';
const EX = [
  [1, 0, 126, 414, 0, '', 'cc'], [1, 9.06, 61, 261, -0.223144, 0.223338, 'cc'], [1, 27, 69, 228, -0.0001, 0.233752, 'cc'],
  [1, 45, 22, 44, 0.530628, 0.376514, 'cc'], [1, 64.8, 19, 34, 0.875469, 0.444005, 'cc'],
  [2, 0, 77, 258, 0, '', 'cc'], [2, 16.05, 88, 413, -0.430783, 0.221305, 'cc'], [2, 46.425, 24, 202, -1.07881, 0.297565, 'cc'],
  [2, 77.16, 13, 64, -0.616186, 0.387079, 'cc'],
  [3, 0, 83, 208, 0, '', 'cc'], [3, 1.176, 46, 175, -0.579818, 0.317147, 'cc'], [3, 8.916, 17, 58, -0.562119, 0.418614, 'cc'],
  [3, 18.72, 4, 11, 0.615186, 0.909101, 'cc'],
  [4, 0, 83, 208, 0, '', 'cc'], [4, 0.955, 29, 117, -0.287682, 0.333234, 'cc'], [4, 7.43, 32, 81, 0.512824, 0.338373, 'cc'],
  [4, 15.6, 18, 39, -0.314711, 0.471345, 'cc'],
  [5, 0, 159, 480, 0, '', 'ci'], [5, 6, 229, 975, -0.415516, 0.144215, 'ci'], [5, 18, 38, 207, -0.634878, 0.238349, 'ci'],
  [5, 28.8, 39, 133, -0.083382, 0.273885, 'ci'],
  [6, 0, 302, 1269, 0, '', 'ci'], [6, 6.25, 129, 436, -0.223144, 0.156587, 'ci'], [6, 18.75, 19, 49, -0.01005, 0.351089, 'ci'],
  [6, 30, 15, 41, -0.261365, 0.416511, 'ci']];
// Same edits as the R script (row numbers in the warnings count the header comment line as row 1).
const NEG = EX.map(r => [r[0], +(r[1] - 20).toFixed(6), ...r.slice(2)]);
const FRAC = EX.map(r => r.slice());
FRAC[0][2] = 126.5; FRAC[0][3] = 414.25; FRAC[2][2] = 69.5; FRAC[18][2] = 229.4; FRAC[18][3] = 975.6;
const ONE = EX.filter(r => r[0] === 1), ONE5 = EX.filter(r => r[0] === 5);
const text = rows => '# study, dose, cases, n, logRR, SE, type\n' + rows.map(r => r.join(', ')).join('\n');
const SHAPE = { linear: 'linear', quadratic: 'quadratic' }, METHOD = { reml: 'REML', ml: 'ML', fixed: 'FE' };

async function fit(page, rows, o) {
  await page.locator('#f-mod').setChecked(false);
  await page.locator('#f-shape').selectOption(SHAPE[o.model]);
  await page.locator('#f-cov').selectOption(o.covariance);
  await page.locator('#f-proc').selectOption(o.proc);
  await page.locator('#f-method').selectOption(METHOD[o.method]);
  await page.locator('#f-pdoses').fill(o.pdose.join(', '));
  await page.locator('#f-xref').fill('');
  await page.locator('#f-data').fill(text(rows));
  await page.locator('#btn-run').click();
  return page.evaluate(() => window._almLastDoseResponse());
}
function expectR(last, ref) {
  expect(last, ref.name).not.toBeNull();
  expect(last.k).toBe(ref.k);
  expect(last.approach).toBe(ref.proc_used);
  expect(last.method).toBe(METHOD[ref.method_used]);
  expect(last.referenceDose).toBe(ref.xref);
  expect(last.predictions.map(p => p.dose)).toEqual(ref.pred.dose);
  // Residuals are drawn, not tabulated: engineResid() checks them on the shipped engine.
  const app = { coef: last.beta, vcov: [].concat(...last.cov), Psi: last.Psi ? [].concat(...last.Psi) : null, logLik: last.logLik,
    qtest: last.qtest, wald: last.wald, waldNonlin: last.waldNonlinearity,
    gof: { D: last.gof.deviance, R2: last.gof.R2, R2adj: last.gof.R2adj, resid: [] },
    pred: last.predictions.map(p => ({ logRR: p.logRR, se: p.se })) };
  const m = compare(app, { ...ref, gof: { ...ref.gof, resid: [] } }), tol = tolerance({ proc: ref.proc_used, method: ref.method_used });
  for (const [k, v] of Object.entries(m)) expect(v, `${ref.name} ${k}`).toBeLessThanOrEqual(tol[k]);
}
async function engineResid(page, rows, ref, o) {
  const ds = { rows: rows.map(r => ({ id: String(r[0]), dose: r[1], cases: r[2], n: r[3], logrr: r[4], se: r[5] === '' ? null : r[5], type: r[6] })) };
  const [got] = await page.evaluate(runAll, [{ studies: studiesOf(ds), opts: { model: o.model, covariance: o.covariance, proc: o.proc, method: o.method, mod: false }, pred: null }]);
  expect(got.ok, got.error).toBe(true);
  const m = compare({ ...got, pred: null }, { ...ref, pred: null }), tol = tolerance({ proc: ref.proc_used, method: ref.method_used });
  for (const [k, v] of Object.entries(m)) expect(v, `${ref.name} engine ${k}`).toBeLessThanOrEqual(tol[k]);
}
const msgs = page => page.locator('#msgs');

test.beforeEach(async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.locator('#coef-body tr')).toHaveCount(1);
  // The built-in example (non-negative doses, whole counts, six studies) shows none of these notices.
  await expect(msgs(page)).not.toContainText(/Negative dose|not whole numbers|Only 1 study/);
});

test('NEGATIVE DOSE: fitted as dosresmeta (quadratic and linear, two- and one-stage) with a warning naming the rows', async ({ page }) => {
  for (const [name, o] of [
    ['neg-quadratic-gl-2stage-reml', { model: 'quadratic', covariance: 'gl', proc: '2stage', method: 'reml' }],
    ['neg-linear-gl-2stage-reml', { model: 'linear', covariance: 'gl', proc: '2stage', method: 'reml' }],
    ['neg-quadratic-gl-1stage-reml', { model: 'quadratic', covariance: 'gl', proc: '1stage', method: 'reml' }]]) {
    const last = await fit(page, NEG, { ...o, pdose: R[name].pred.dose });
    expectR(last, R[name]);
    await engineResid(page, NEG, R[name], o);
    await expect(msgs(page).locator('.msg.warn')).toContainText(['Negative doses in 18 rows: row 2 (study 1), row 3 (study 1), row 7 (study 2)']);
    await expect(msgs(page)).toContainText('analysed as entered, as dosresmeta does');
  }
});

test('FRACTIONAL COUNTS: fitted as dosresmeta with a warning naming the rows; a person-time n in an ir row is not flagged', async ({ page }) => {
  for (const [name, o] of [
    ['frac-linear-gl-2stage-reml', { model: 'linear', covariance: 'gl', proc: '2stage', method: 'reml' }],
    ['frac-quadratic-gl-2stage-reml', { model: 'quadratic', covariance: 'gl', proc: '2stage', method: 'reml' }],
    ['frac-linear-h-2stage-fixed', { model: 'linear', covariance: 'h', proc: '2stage', method: 'fixed' }]]) {
    const last = await fit(page, FRAC, { ...o, pdose: R[name].pred.dose });
    expectR(last, R[name]);
    await engineResid(page, FRAC, R[name], o);
    await expect(msgs(page).locator('.msg.warn')).toContainText(['Counts that are not whole numbers in 3 rows: row 2 (study 1: cases 126.5, n 414.25), row 4 (study 1: cases 69.5), row 20 (study 5: cases 229.4, n 975.6)']);
    await expect(msgs(page)).toContainText('analysed as entered, as dosresmeta does');
  }
  // Study 6 as incidence-rate data with a person-time n of 1269.5: not flagged (its cases are whole numbers).
  const ir = EX.map(r => r[0] === 6 ? [...r.slice(0, 6), 'ir'] : r.slice());
  ir[21][3] = 1269.5;
  await fit(page, ir, { model: 'linear', covariance: 'gl', proc: '2stage', method: 'reml', pdose: [10] });
  expect(await page.evaluate(() => window._almLastDoseResponse().k)).toBe(6);
  await expect(msgs(page)).not.toContainText('not whole numbers');
  // A fractional case count in an ir row is flagged.
  ir[22][2] = 129.5;
  await fit(page, ir, { model: 'linear', covariance: 'gl', proc: '2stage', method: 'reml', pdose: [10] });
  await expect(msgs(page)).toContainText('Counts that are not whole numbers in 1 row: row 24 (study 6: cases 129.5)');
});

test('SINGLE STUDY: fitted as dosresmeta (one-stage fixed effect) with a small-k warning; meta-regression refused', async ({ page }) => {
  for (const [name, rows, o] of [
    ['one-linear-gl-2stage-reml', ONE, { model: 'linear', covariance: 'gl', proc: '2stage', method: 'reml' }],
    ['one-quadratic-gl-2stage-reml', ONE, { model: 'quadratic', covariance: 'gl', proc: '2stage', method: 'reml' }],
    ['one5-linear-h-1stage-ml', ONE5, { model: 'linear', covariance: 'h', proc: '1stage', method: 'ml' }]]) {
    const last = await fit(page, rows, { ...o, pdose: R[name].pred.dose });
    expectR(last, R[name]);
    await engineResid(page, rows, R[name], o);
    await expect(msgs(page)).toContainText('Only 1 study: fitted as dosresmeta fits a single study (one-stage, fixed effect)');
    await expect(msgs(page)).toContainText('interpret with caution');
    await expect(page.locator('#headline')).toContainText('k = 1 study,');
    await expect(page.locator('#headline')).toContainText('one-stage, fixed effect');
  }
  // DerSimonian–Laird pools two-stage slopes; a single study is still fitted as dosresmeta does.
  const reml = await fit(page, ONE, { model: 'linear', covariance: 'gl', proc: '2stage', method: 'reml', pdose: R['one-linear-gl-2stage-reml'].pred.dose });
  await page.locator('#f-method').selectOption('DL');
  await page.locator('#btn-run').click();
  expect(await page.evaluate(() => window._almLastDoseResponse().beta)).toEqual(reml.beta);
  // Meta-regression with one study: dosresmeta stops (singular matrix), so the app refuses with a message.
  await page.locator('#f-method').selectOption('REML');
  await page.locator('#f-data').fill(text(ONE).split('\n').map(l => l.startsWith('#') ? l : l + ', 3').join('\n'));
  await page.locator('#f-mod').check();
  await page.locator('#btn-run').click();
  await expect(msgs(page)).toContainText('Meta-regression needs at least 2 studies');
  expect(await page.evaluate(() => window._almLastDoseResponse())).toBeNull();
});

test('SINGLE STUDY: entry apply, restored analysis file and report text', async ({ page }) => {
  await page.locator('#f-pdoses').fill(R['one-linear-gl-2stage-reml'].pred.dose.join(', '));
  const applied = await page.evaluate(rows => AlmDoseFeatures.entry.apply(rows.map(r => ({ study: String(r[0]), dose: r[1], cases: r[2], n: r[3],
    yi: r[4], sei: r[5] === '' ? 0 : r[5], type: r[6] }))), ONE);
  expect(applied).toEqual({ ok: true, n: 5 });
  expectR(await page.evaluate(() => window._almLastDoseResponse()), R['one-linear-gl-2stage-reml']);
  await expect(msgs(page)).toContainText('Only 1 study');
  const out = await page.evaluate(() => {
    const spec = AlmDoseFeatures.text, r = spec.results(), ctx = { app: 'dose-response-ma', build: AlmBuildInfo, entryLog: [], verify: null };
    const o = AlmText.render(spec.templates, r, ctx);
    return { ok: AlmText.audit(o, r, { ctx, dom: spec.dom() }).ok, plain: o.plain.text, results: o.results.text, flags: o.flags.map(f => f.text) };
  });
  expect(out.ok).toBe(true);
  expect(out.plain).toContain('a single study');
  expect(out.results).toContain('Only 1 study');
  expect(out.flags.join(' ')).toContain('Single study');

  await page.locator('#f-data').fill(text(EX));
  await page.locator('#btn-run').click();
  const state = await page.evaluate(() => AlmDoseFeatures.share.get());
  await page.evaluate(s => AlmDoseFeatures.share.set(s), { ...state, 'f-data': text(ONE5), 'f-pdoses': '10, 20', 'f-cov': 'h', 'f-proc': '1stage', 'f-method': 'ML', 'f-mod': false });
  expectR(await page.evaluate(() => window._almLastDoseResponse()), R['one5-linear-h-1stage-ml']);
  await expect(msgs(page)).toContainText('Only 1 study');
});

test('NOTES: negative-dose and fractional-count warnings reach the report text', async ({ page }) => {
  const rows = FRAC.map(r => r.slice()); rows[1][1] = -9.06;
  await fit(page, rows, { model: 'linear', covariance: 'gl', proc: '2stage', method: 'reml', pdose: [10] });
  const out = await page.evaluate(() => {
    const spec = AlmDoseFeatures.text, r = spec.results(), ctx = { app: 'dose-response-ma', build: AlmBuildInfo, entryLog: [], verify: null };
    const o = AlmText.render(spec.templates, r, ctx);
    return { ok: AlmText.audit(o, r, { ctx, dom: spec.dom() }).ok, results: o.results.text, flags: o.flags.map(f => f.text) };
  });
  expect(out.ok).toBe(true);
  expect(out.results).toContain('Negative doses in 1 row: row 3 (study 1)');
  expect(out.results).toContain('Counts that are not whole numbers in 3 rows');
  expect(out.flags.join(' ')).toContain('Some doses are negative');
  expect(out.flags.join(' ')).toContain('Some case or total counts are not whole numbers');
});
