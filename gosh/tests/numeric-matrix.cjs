// Shared state driver: no expected values are read from the page.
function numericMatrix(api) {
 const out=[];
 function capture(model,name,k,draws,axis={},fault=false) {
  if(api.select && !api.select(name))return;
  api.axis({}); api.model(model); api.draws(draws); api.empty(fault);
  const values=Array.from({length:k},(_,i)=>({yi:(13+137*i)/100,sei:(231+70*i)/1000,study:"Distinct_"+(i+11)}));
  api.load(values); api.axis(axis);
  out.push({model,name,k,draws,axis,fields:api.read()}); api.empty(false);
 }
 for(const model of ['FE','DL']) {
  capture(model,'enumerated',3,'5000');
  capture(model,'sampled',16,'37');
  capture(model,'sampled-default',16,'5000');
  for(const k of [0,2,101]) {
   capture(model,'row-'+k, k,'5000');
   capture(model,'recover-row-'+k,3,'5000');
  }
  for(const [name,value] of Object.entries({negative:'-1000',zero:'0',fraction:'2.5',blank:'',over:'100001',nan:'NaN',infinite:'Infinity'})) {
   capture(model,'draw-'+name,16,value);
   capture(model,'recover-draw-'+name,16,'37');
  }
  for(const [name,axis] of Object.entries({'reversed-x':{x:[4,0]},'equal-y':{y:[50,50]},'nan-x':{x:[NaN,4]},'infinite-y':{y:[0,Infinity]}})) {
   capture(model,'axis-'+name,3,'5000',axis);
   capture(model,'recover-axis-'+name,3,'5000');
  }
  capture(model,'explicit-bounds',3,'5000',{x:[-2,6],y:[-20,120]});
  capture(model,'omission',3,'5000',{x:[1,3],y:[0,100]});
  capture(model,'recover-omission',3,'5000');
  // Defensive branch unreachable with validated normal inputs: explicit producer fault.
  capture(model,'empty-enumerated',3,'5000',{},true);
  capture(model,'recover-empty-enumerated',3,'5000');
  capture(model,'empty-sampled',16,'37',{},true);
  capture(model,'recover-empty-sampled',16,'37');
 }
 return out;
}
if(typeof module!=='undefined')module.exports=numericMatrix;

// Static numeric declarations are also part of the displayed-number contract.
function numericDeclarations(html) {
 const decode=s=>s.replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/<[^>]*>/g,' ');
 const numbers=s=>(decode(s).match(/[0-9]+(?:[,.][0-9]+)*/g)||[]);
 const input=html.match(/<input id="n-sample"[^>]*>/)[0];
 return {
  viewbox:html.match(/id="plot" viewBox="([^"]+)"/)[1].split(" ").map(Number),
  defaults:['value','step','min','max'].map(k=>input.match(new RegExp('\\b'+k+'="([^"]+)"'))[1]),
  initial_count:html.match(/id="m-n">([^<]*)/)[1],
  header_numbers:numbers(html.match(/<header>([\s\S]*?)<\/header>/)[1]),
  footer_numbers:numbers(html.match(/<footer>([\s\S]*?)<\/footer>/)[1]),
  sample_threshold:numbers(html.match(/<label id="sample-label"[\s\S]*?<span>([\s\S]*?)<\/span>/)[1]),
  sample_hint_numbers:numbers(html.match(/<label id="sample-label"[\s\S]*?<span class="hint">([\s\S]*?)<\/span>/)[1]),
  enumeration_hint_numbers:numbers(html.match(/<span class="hint">(k [\s\S]*?)<\/span>/)[1]),
  draw_accessible_numbers:numbers(input.match(/aria-label="([^"]*)"/)[1]),
  axis_caption_numbers:numbers(html.match(/label: 'Y axis ([^']+)'/)[1]),
  initial_studies:numbers(html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/)[1]),
  axis_ranges:html.match(/label: 'Y axis [^']*', range: \[([^\]]*)\]/)[1].split(',').map(s=>Number(s.trim())),
  csv_examples:[...html.matchAll(/type: 'float',\s+example: '([^']+)'/g)].map(m=>m[1])
 };
}
if(typeof module!=='undefined')module.exports.declarations=numericDeclarations;
