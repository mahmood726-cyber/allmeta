import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const folder = new URL('./addons-a2-fixtures/', import.meta.url);
const fixture = name => fileURLToPath(new URL(name,folder));
const source = readFileSync(new URL('../xlsx-import.js',import.meta.url),'utf8');
// A2_MUTANT=contracts introduces one deliberate implementation fault per test.
// Normal runs always load the on-disk production scripts.
function mutate(title, importer, upload) {
  if (title.startsWith('precision:') || title.startsWith('opt-in upload'))
    importer=importer.replace('return String(Number(value));','return String(Number(Number(value).toPrecision(12)));');
  else if (title.startsWith('warnings:'))
    importer=importer.replace('warnings:warnings.concat([...warning])','warnings:[]');
  else if (title.startsWith('select sheet'))
    importer=importer.replace("typeof opts.sheet === 'string' ? names.indexOf(opts.sheet) : opts.sheet",'0');
  else if (title.startsWith('shared rich'))
    importer=importer.replace("n => !n.parentElement || n.parentElement.localName !== 'rPh'",'n => true');
  else if (title === 'refusal: sparse-limit')
    importer=importer.replace("refuse('worksheet exceeds cell limits');","return {csv:'', sheet:'Precision', sheets:[], warnings:[]};");
  else if (title.startsWith('refusal:') || title.startsWith('refused UI'))
    importer=importer.replace("throw new Error('XLSX: ' + message);",'return;');
  else if (title.startsWith('local JSZip'))
    importer=importer.replace('async function fallback() {',"async function fallback() { throw Error('disabled fallback');");
  else if (title.startsWith('missing reader'))
    upload=upload.replace("throw new Error('Load xlsx-import.js before importing XLSX')","throw new Error('missing guard')");
  else if (title.startsWith('paste invalidates'))
    upload=upload.replaceAll('ticket === generation','true');
  else throw Error('No negative control for '+title);
  return {importer,upload};
}
test.beforeEach(async ({page}, info) => {
  await page.goto('/hub/shared/tests/addons-a2-fixtures/');
  await page.setContent('<div id="upload"></div><div id="legacy"></div>');
  if (process.env.A2_MUTANT === 'contracts') {
    const scripts=mutate(info.title,source,readFileSync(new URL('../csv-upload.js',import.meta.url),'utf8'));
    // Serve mutations at real local URLs so fallback location remains realistic.
    await page.route('**/hub/shared/xlsx-import.js',r=>r.fulfill({contentType:'application/javascript',body:scripts.importer}));
    await page.route('**/hub/shared/csv-upload.js',r=>r.fulfill({contentType:'application/javascript',body:scripts.upload}));
  }
  await page.addScriptTag({url:'/hub/shared/xlsx-import.js'});
  await page.addScriptTag({url:'/hub/shared/csv-upload.js'});
});
async function convert(page, name, options) {
  return page.evaluate(async ({bytes,name,options}) => {
    try { return await alm.xlsxImport.toCSV(new File([new Uint8Array(bytes)],name),options); }
    catch(error) { return {error:error.message}; }
  }, {bytes:[...readFileSync(fixture(name))],name,options});
}
async function mount(page, xlsx=true) {
  await page.evaluate(xlsx => {
    window.received=[];
    alm.csvUpload({target:'#upload',xlsx,columns:[{name:'study'},{name:'effect',type:'float'},{name:'se',type:'float'}],onParse:r=>received.push(r)});
  },xlsx);
}
test('precision: identical double bytes through the shared CSV parse path', async ({page}) => {
  const result=await convert(page,'precision.xlsx');
  expect(result.error).toBeUndefined(); expect(result.warnings).toEqual([]);
  const comparison=await page.evaluate(({xlsx,csv}) => {
    const cols=[{name:'study'},{name:'effect',type:'float'},{name:'se',type:'float'}];
    const bits=n=>{const a=new ArrayBuffer(8);new DataView(a).setFloat64(0,n);return [...new Uint8Array(a)];};
    const parse=text=>alm.csvUpload.parse(text,cols).rows.map(r=>[r.study,bits(r.effect),bits(r.se)]);
    return {xlsx:parse(xlsx),csv:parse(csv)};
  },{xlsx:result.csv,csv:readFileSync(fixture('precision.csv'),'utf8')});
  expect(comparison.xlsx).toEqual(comparison.csv);
  expect(comparison.xlsx).toHaveLength(6);
});
test('warnings: formulas, date, percent, merge and sparse layout', async ({page}) => {
  const r=await convert(page,'warnings.xlsx');
  expect(r.error).toBeUndefined();
  expect(r.warnings).toHaveLength(6);
  for(const text of ['Multiple sheets','without a cached','cached values','Percentage','Date/time','Merged']) expect(r.warnings.join('\n')).toContain(text);
  const rows=await page.evaluate(csv=>alm.csvUpload.parse(csv).rows,r.csv);
  expect(rows[0]).toEqual({study:'Comma, quote " and\nnewline',value:'0.125',extra:''});
  expect(rows[1]).toEqual({study:'Date fixture',value:'43832',extra:'4'});
  expect(rows[3]).toEqual({study:'',value:'',extra:''});
  expect(rows[4]).toEqual({study:'',value:'',extra:'1'});
});
test('select sheet by name and zero-based index', async ({page}) => {
  const a=await convert(page,'warnings.xlsx',{sheet:'Other'}), b=await convert(page,'warnings.xlsx',{sheet:1});
  expect(a).toEqual(b); expect(a.csv).toBe('alternative,42'); expect(a.sheet).toBe('Other'); expect(a.warnings).toEqual([]);
  expect((await convert(page,'warnings.xlsx',{sheet:'absent'})).error).toContain('sheet not found');
});
test('shared rich strings omit phonetic runs', async ({page}) => {
  const r=await convert(page,'shared.xlsx'); expect(r.error).toBeUndefined(); expect(r.csv).toContain('Rich text,'); expect(r.csv).not.toContain('ignored');
});
for(const [name,message] of [
  ['doctype','DOCTYPE'],['malformed','malformed XML'],['numeric','invalid numeric'],['error-cell','error cell'],
  ['sparse-limit','cell limits'],['duplicate-cell','duplicate cell'],['style-index','style index'],['bad-shared','shared string'],
  ['missing-part','missing XML'],['external','external'],['traversal','unsafe'],['crc','CRC'],['truncated','invalid ZIP'],['expanded-limit','oversized']
]) test('refusal: '+name,async({page})=>{expect((await convert(page,name+'.xlsx')).error).toContain(message);});
test('local JSZip fallback matches native decompression',async({page})=>{
  const native=await convert(page,'precision.xlsx');
  await page.evaluate(()=>{window.DecompressionStream=undefined;});
  const local=await convert(page,'precision.xlsx');
  expect(local).toEqual(native);
  expect(await page.evaluate(()=>typeof JSZip)).toBe('function');
  await page.context().setOffline(true);
  expect(await convert(page,'warnings.xlsx')).not.toHaveProperty('error');
});
test('opt-in upload emits identical rows and warnings; legacy CSV stays available',async({page})=>{
  await mount(page);
  await page.locator('#upload-file').setInputFiles(fixture('precision.xlsx'));
  await expect.poll(()=>page.evaluate(()=>received.length)).toBe(1);
  const first=await page.evaluate(()=>received[0]);
  await page.locator('#upload-file').setInputFiles(fixture('precision.csv'));
  await expect.poll(()=>page.evaluate(()=>received.length)).toBe(2);
  expect(await page.evaluate(()=>received[1])).toEqual(first);
  await page.locator('#upload-file').setInputFiles(fixture('warnings.xlsx'));
  await expect(page.locator('#upload-warnings')).toContainText('Merged cells');
  await page.evaluate(()=>alm.csvUpload({target:'#legacy',onParse:r=>window.legacyResult=r}));
  await expect(page.locator('#legacy input')).toHaveAttribute('accept','.csv,text/csv');
  await page.locator('#legacy textarea').fill('study,effect\nA,0.1');
  await page.locator('#legacy [data-action="parse-paste"]').click();
  expect(await page.evaluate(()=>legacyResult.rows)).toEqual([{study:'A',effect:'0.1'}]);
});
test('refused UI import does not call onParse or overwrite last accepted rows',async({page})=>{
  await mount(page);
  await page.locator('#upload-file').setInputFiles(fixture('precision.csv'));
  await expect.poll(()=>page.evaluate(()=>received.length)).toBe(1);
  await page.locator('#upload-file').setInputFiles(fixture('numeric.xlsx'));
  await expect(page.locator('#upload-warnings')).toContainText('Import refused');
  expect(await page.evaluate(()=>received.length)).toBe(1);
  await page.locator('#upload-file').setInputFiles({name:'legacy.xls',mimeType:'application/vnd.ms-excel',buffer:Buffer.from('old')});
  await expect(page.locator('#upload-warnings')).toContainText('.xls is not supported');
  expect(await page.evaluate(()=>received.length)).toBe(1);
});
test('missing reader and unstable control ids fail closed',async({page})=>{
  await mount(page); await page.evaluate(()=>delete alm.xlsxImport);
  await page.locator('#upload-file').setInputFiles(fixture('precision.xlsx'));
  await expect(page.locator('#upload-warnings')).toContainText('Load xlsx-import.js');
  expect(await page.evaluate(()=>received.length)).toBe(0);
  expect(await page.evaluate(()=>{try{alm.csvUpload({target:document.createElement('div'),xlsx:true});return '';}catch(e){return e.message;}})).toContain('stable target id');
});
test('paste invalidates an earlier pending XLSX read',async({page})=>{
  await mount(page);
  await page.evaluate(()=>{alm.xlsxImport.toCSV=()=>new Promise(resolve=>window.releaseXlsx=resolve);});
  await page.locator('#upload-file').setInputFiles(fixture('precision.xlsx'));
  await page.locator('#upload-paste').fill('study,effect,se\nLatest,0.2,0.1');
  await page.locator('#upload-parse').click();
  await page.evaluate(async()=>{releaseXlsx({csv:'study,effect,se\nStale,0.3,0.1',warnings:[]});await new Promise(r=>setTimeout(r,0));});
  expect(await page.evaluate(()=>received.map(r=>r.rows[0].study))).toEqual(['Latest']);
});