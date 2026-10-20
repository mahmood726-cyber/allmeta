(function(root){
 'use strict';
 function flatten(x,p='',out={}) {
  if(Array.isArray(x)){out[p+'.length']=x.length;x.forEach((v,i)=>flatten(v,p+'.'+i,out));}
  else if(x&&typeof x==='object')for(const [k,v] of Object.entries(x))flatten(v,p?p+'.'+k:k,out);
  else out[p]=x;
  return out;
 }
 function rule(key,value){
  if(typeof value!=='number'||/\.(length|k|p|df)$/.test(key))return {kind:'exact',tol:0};
  if(/pval(?:\.|$)/.test(key))return {kind:'abs',tol:1e-9};
  if(/^plot\.(x|held)\./.test(key))return {kind:'rel',tol:1e-9};
  return {kind:'rel',tol:1e-6};
 }
 function compare(a,b,key){const {kind,tol}=rule(key,b),diff=kind==='exact'?(a===b?0:Infinity):(typeof a==='number'&&Number.isFinite(a)&&Number.isFinite(b)?Math.abs(a-b)/(kind==='rel'?Math.max(1,Math.abs(b)):1):Infinity);return {pass:diff<=tol,diff,tol,kind};}
 function audit(a,b){const af=flatten(a),bf=flatten(b),rows=[];rows.push({key:'schema',app:Object.keys(af).sort().join('|'),ref:Object.keys(bf).sort().join('|'),...compare(Object.keys(af).sort().join('|'),Object.keys(bf).sort().join('|'),'schema')});for(const [key,v]of Object.entries(bf))rows.push({key,app:af[key],ref:v,...compare(af[key],v,key)});return rows;}
 function plotValues(svg,r,c,transform=(_n,x,y)=>({x,y})){
  const failures=[];if(r.status!=='ok')return failures;
  if(!svg)return ['missing plot'];
  const dots=[...svg.querySelectorAll('[data-role="bubble"]')];
  if(dots.length!==c.yi.length)return ['bubble cardinality'];
  const attr=(n,k)=>{const v=n?.getAttribute(k);return v===null||v===undefined||v.trim()===''?NaN:Number(v);};
  const point=n=>transform(n,attr(n,'cx'),attr(n,'cy'));
  const calibration={};
  for(const axis of ['x','y']){
   const values=axis==='x'?c.mods.map(r=>r[0]):c.yi;
   const lo=values.indexOf(Math.min(...values)),hi=values.indexOf(Math.max(...values)),a=point(dots[lo])[axis],b=point(dots[hi])[axis];
   if(values[lo]!==values[hi]&&Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(b-a)>.02)calibration[axis]=position=>values[lo]+(position-a)/(b-a)*(values[hi]-values[lo]);
  }
  const check=(p,x,y,role,tol)=>{for(const [axis,expected]of [['x',x],['y',y]])if(calibration[axis]){const value=calibration[axis](p[axis]);if(!Number.isFinite(value)||Math.abs(value-expected)>tol*Math.max(1,Math.abs(expected)))failures.push(role+' '+axis+' value');}};
  dots.forEach((n,i)=>check(point(n),c.mods[i][0],c.yi[i],'bubble '+i,1e-9));
  for(const role of ['fit','band']){
   const n=svg.querySelector(`[data-role="${role}"]`),pairs=n?.getAttribute('points')?.trim().split(/\s+/).map(p=>p.split(',').map(Number))||[];
   const xs=role==='fit'?r.plot.x:[...r.plot.x,...r.plot.x.slice().reverse()],ys=role==='fit'?r.plot.pred:[...r.plot.ciHi,...r.plot.ciLo.slice().reverse()];
   if(pairs.length!==xs.length){failures.push(role+' vertex cardinality');continue;}
   pairs.forEach((p,i)=>{if(p.length!==2)failures.push(role+' coordinate arity');else check(transform(n,p[0],p[1]),xs[i],ys[i],role+' '+i,1e-6);});
  }
  const radii=dots.map(n=>attr(n,'r')),maxRadius=Math.max(...radii),maxWeight=Math.max(...r.plot.weights);
  radii.forEach((v,i)=>{if(!(v>0)||Math.abs((v/maxRadius)**2-r.plot.weights[i]/maxWeight)>1e-9)failures.push('bubble weight '+i);});
  return [...new Set(failures)];
 }
 root.AlmMetaPlusContract=Object.freeze({flatten,rule,compare,audit,plotValues});
})(typeof window==='undefined'?globalThis:window);
