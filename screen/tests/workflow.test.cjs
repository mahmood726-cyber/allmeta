// Synthetic records exercise state transitions; they are not research evidence.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const W = require('../workflow.js');
const rec = (id='a') => ({id, title:id, r1:{d:''}, r2:{d:''}});
const state = (mode='dual') => ({mode, active:'r1', stage:'ta', blind:true, records:[rec()], audit:[]});
test('dual decisions require both reviewers, with maybe remaining unresolved', () => {
  const s=state(), r=s.records[0]; r.r1.d='include';
  assert.equal(W.effective(r,s,'ta'), '');
  assert.equal(W.visible(r,s), 'include');
  r.r2.d='exclude'; assert.equal(W.effective(r,s,'ta'),'conflict');
  r.r2.d='include'; assert.equal(W.effective(r,s,'ta'),'include');
});
test('two stages preserve independent decisions and require retrieval and exclusion reasons', () => {
  const s=state('single'), r=s.records[0];
  assert.throws(()=>W.decide(s,r,'include','',{stage:'ft'}), /title\/abstract/);
  W.decide(s,r,'include',''); s.stage='ft';
  assert.throws(()=>W.decide(s,r,'include',''), /retrieved/);
  W.evidence(s,r,{retrieval:'retrieved',url:'https://example.org/open-paper',note:'Methods page 2'});
  assert.throws(()=>W.decide(s,r,'exclude',''), /reason/);
  W.decide(s,r,'exclude','Wrong population');
  assert.equal(r.r1.d,'include'); assert.equal(r.fullText.r1.d,'exclude');
  assert.equal(W.flow(s).excludedFull,1); assert.equal(W.flow(s).pendingFull,0);
});
test('adjudication requires rationale and is invalidated when a reviewer changes a decision', () => {
  const s=state(), r=s.records[0]; s.blind=false;
  W.decide(s,r,'include',''); W.decide(s,r,'exclude','Design',{reviewer:'r2'});
  assert.throws(()=>W.resolve(s,r,'include','','Lead'), /rationale/);
  W.resolve(s,r,'include','Protocol criterion 2','Lead');
  assert.equal(W.effective(r,s),'include');
  W.decide(s,r,'maybe',''); assert.equal(r.resolved,'');
  assert.equal(W.effective(r,s),'conflict');
  assert.equal(s.audit.at(-1).actor,'r1'); assert.equal(s.audit.at(-1).before.resolved,'include');
});
test('pending decisions never count as exclusions or final includes', () => {
  const s=state(); s.records.push(rec('b'));
  W.decide(s,s.records[0],'include',''); W.decide(s,s.records[1],'maybe','');
  const f=W.flow(s); assert.equal(f.pendingScreen,2); assert.equal(f.excludedScreen,0); assert.equal(f.included,0);
});
test('CSV handles quoted multiline fields and rejects malformed quoting', () => {
  assert.deepEqual(W.csvRows('id,title,abstract\r\na,"A, B","line 1\nline ""2"""\r\n'), [['id','title','abstract'],['a','A, B','line 1\nline "2"']]);
  assert.throws(()=>W.csvRows('id,title\na,"broken'), /quote/);
});
test('full-text evidence refuses unsafe URLs and preserves identifiers', () => {
  const s=state('single'),r=s.records[0];r.r1.d='include';
  assert.throws(()=>W.evidence(s,r,{url:'javascript:alert(1)'}), /https/);
  W.evidence(s,r,{url:'https://example.org/open',retrieval:'not-retrieved'});
  assert.equal(r.id,'a'); assert.equal(W.flow(s).notRetrieved,1);
});
test('retrieved reports partition into pending, excluded and included without double counting',()=>{
  const s=state('single');s.records=['include','exclude','maybe'].map((d,i)=>({id:'fixture-'+i,r1:{d:'include'},fullText:{r1:{d,reason:'__proto__'},r2:{d:''},retrieval:'retrieved'}}));
  const f=W.flow(s);assert.equal(f.assessed,3);assert.equal(f.included,1);assert.equal(f.excludedFull,1);assert.equal(f.pendingFull,1);assert.equal(f.reasons.__proto__,1);
});
test('undo is append-only and refuses to overwrite a newer peer decision',()=>{
  const s=state(),r=s.records[0];W.decide(s,r,'include','');W.decide(s,r,'exclude','',{reviewer:'r2'});
  assert.throws(()=>W.undo(s),/changed/);assert.equal(r.r1.d,'include');
  s.active='r2';W.undo(s);assert.equal(r.r2.d,'');assert.equal(s.audit.length,3);assert.equal(s.audit[2].action,'undo');
});
