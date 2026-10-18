// Deliberately small DOM test double; real browser contracts live in addons-wave0.spec.mjs.
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
export function setup() {
  class Element {
    constructor(tag) {this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this.style={};this.events={};this.value='';this.checked=false;this.id='';this.textContent='';}
    append(...nodes) {for(const n of nodes)if(typeof n!=='string'){n.parentElement=this;this.children.push(n);}}
    replaceChildren(...nodes) {this.children=[];this.append(...nodes);}
    setAttribute(k,v) {this.attrs[k]=v;}
    hasAttribute(k) {return Object.hasOwn(this.attrs,k);}
    contains(n) {return n===this||this.children.some(c=>c.contains(n));}
    closest(selector) {if(selector==='[data-alm-addon]'&&this.hasAttribute('data-alm-addon'))return this;if(selector==='button,input[type=submit]'&&this.tagName==='BUTTON')return this;return this.parentElement?.closest(selector)||null;}
    after(n) {n.parentElement=this.parentElement;const a=this.parentElement.children;a.splice(a.indexOf(this)+1,0,n);}
    addEventListener(t,f) {(this.events[t]??=[]).push(f);}
    removeEventListener(t,f) {this.events[t]=(this.events[t]||[]).filter(x=>x!==f);}
    dispatch(t,target=this) {const e={target,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};for(const f of this.events[t]||[])f(e);return e;}
  }
  const document=new Element('document');document.body=new Element('body');document.head=new Element('head');
  const main=new Element('main');document.body.append(main);
  const all=(n)=>[n,...n.children.flatMap(all)];
  document.createElement=t=>new Element(t);
  document.querySelector=s=>s==='body > main'?main:null;
  document.querySelectorAll=()=>all(document.body).filter(n=>['INPUT','SELECT','TEXTAREA'].includes(n.tagName));
  document.getElementById=id=>all(document.body).find(n=>n.id===id)||null;
  const ticks=[];const window={};
  const context={window,document,location:{protocol:'http:'},structuredClone,TextEncoder,TextDecoder,URL,
    performance:{now:()=>0},setInterval:fn=>{ticks.push(fn);return fn;},clearInterval:()=>{},
    MutationObserver:class {observe(){} disconnect(){}},console};
  function load(path){runInNewContext(readFileSync(new URL('../../'+path,import.meta.url),'utf8'),context);}
  load('shared/alm-validate.js');load('hub/shared/addons-host.js');
  const input=new Element('input');input.id='analysis';main.append(input);
  const host=new Element('div');main.append(host);
  return {window,document,main,input,host,tick:()=>ticks.forEach(fn=>fn()),Element};
}
export const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
