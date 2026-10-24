/* Screen workflow v2. Local, unsigned history; no authentication or recall guarantee. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScreenWorkflow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var VERSION = 2;
  function copy(x) { return JSON.parse(JSON.stringify(x)); }
  function decision(d) { return ['include', 'exclude', 'maybe'].indexOf(d) >= 0 ? d : ''; }
  function slot(s) { return {d: decision(s && s.d), reason: String(s && s.reason || ''), at: String(s && s.at || '')}; }
  function stageData(r, stage) {
    if (stage !== 'ft') return r;
    if (!r.fullText) r.fullText = {r1: slot(), r2: slot(), resolved: '', retrieval: 'pending', url: '', note: ''};
    return r.fullText;
  }
  function normalize(r, raw) {
    raw = raw || r;
    r.r1 = slot(raw.r1); r.r2 = slot(raw.r2);
    r.resolution = raw.resolution ? copy(raw.resolution) : null;
    var f = raw.fullText || {};
    r.fullText = {r1: slot(f.r1), r2: slot(f.r2), resolved: decision(f.resolved),
      resolution: f.resolution ? copy(f.resolution) : null,
      retrieval: ['pending','retrieved','not-retrieved'].includes(f.retrieval) ? f.retrieval : 'pending',
      url: safeUrl(f.url || ''), note: String(f.note || '')};
    return r;
  }
  function effective(r, s, stage) {
    stage = stage || s.stage || 'ta';
    if (r.dup) return 'duplicate';
    if (stage === 'ft' && effective(r, s, 'ta') !== 'include') return '';
    var d = stageData(r, stage), a = (d.r1 || {}).d, b = (d.r2 || {}).d;
    if (stage === 'ft' && d.retrieval !== 'retrieved') return '';
    if (s.mode !== 'dual') return decision(a);
    if (d.resolved) return decision(d.resolved);
    if (!a || !b) return '';
    return a === b ? decision(a) : 'conflict';
  }
  function visible(r,s) {
    if (r.dup) return 'duplicate';
    if (s.mode === 'dual' && s.blind) return decision((stageData(r,s.stage)[s.active || 'r1'] || {}).d);
    return effective(r,s);
  }
  function eligible(r,s) { return !r.dup && (s.stage !== 'ft' || effective(r,s,'ta') === 'include'); }
  function snapshot(r,stage) {
    var d=stageData(r,stage);
    return {r1:slot(d.r1),r2:slot(d.r2),resolved:d.resolved || '',resolution:d.resolution || null};
  }
  function audit(s, action, r, stage, before, after, actor) {
    if (!Array.isArray(s.audit)) s.audit=[];
    var event={seq:s.audit.length + 1,at:new Date().toISOString(),action:action,recordId:r ? r.id : null,
      stage:stage || s.stage || 'ta',actor:actor || s.active || 'r1',before:copy(before),after:copy(after)};
    s.audit.push(event); s.workflowVersion=VERSION; return event;
  }
  function decide(s,r,d,reason,opts) {
    opts=opts || {}; var stage=opts.stage || s.stage || 'ta', who=opts.reviewer || (s.mode==='dual' ? s.active : 'r1') || 'r1';
    if (!['r1','r2'].includes(who) || (d && !decision(d))) throw Error('Invalid reviewer or decision.');
    if (stage==='ft' && effective(r,s,'ta')!=='include') throw Error('Complete title/abstract consensus before full-text screening.');
    var data=stageData(r,stage);
    if (stage==='ft' && d && data.retrieval!=='retrieved') throw Error('Mark the open full text as retrieved before deciding.');
    reason=String(reason || '').trim();
    if (stage==='ft' && d==='exclude' && !reason) throw Error('Choose an exclusion reason for the full-text decision.');
    var before=snapshot(r,stage);
    if(opts.at && !Number.isFinite(Date.parse(opts.at))) throw Error('Invalid reviewer decision timestamp.');
    data[who]={d:d,reason:d==='exclude' ? reason : '',at:opts.imported ? String(opts.at || '') : new Date().toISOString()};
    data.resolved=''; data.resolution=null;
    var event=audit(s,'decision',r,stage,before,snapshot(r,stage),who);
    if(opts.imported) event.source='reviewer-file (identity not authenticated)';
  }
  function resolve(s,r,d,rationale,actor) {
    if (s.blind) throw Error('Turn off blind mode to adjudicate.');
    if (!['include','exclude'].includes(d)) throw Error('Choose include or exclude.');
    if (!String(rationale || '').trim() || !String(actor || '').trim()) throw Error('Enter an adjudicator name and a rationale.');
    if (effective(r,s)!=='conflict') throw Error('Only unresolved disagreements can be adjudicated.');
    var stage=s.stage || 'ta', data=stageData(r,stage), before=snapshot(r,stage);
    data.resolved=d; data.resolution={d:d,reason:rationale.trim(),actor:actor.trim(),at:new Date().toISOString()};
    audit(s,'adjudication',r,stage,before,snapshot(r,stage),actor.trim());
  }
  function safeUrl(value) {
    var u=String(value || '').trim(); if (!u) return '';
    if (!/^https?:\/\//i.test(u)) throw Error('Full-text links must use http or https.');
    var parsed=new URL(u); if (parsed.username || parsed.password) throw Error('Full-text links must not contain credentials.');
    return u;
  }
  function evidence(s,r,fields) {
    if (effective(r,s,'ta')!=='include') throw Error('Complete title/abstract consensus first.');
    var f=stageData(r,'ft'), before={retrieval:f.retrieval,url:f.url,note:f.note};
    var next={retrieval:fields.retrieval || f.retrieval,url:safeUrl(fields.url === undefined ? f.url : fields.url),note:String(fields.note === undefined ? f.note : fields.note)};
    if (!['pending','retrieved','not-retrieved'].includes(next.retrieval)) throw Error('Invalid retrieval status.');
    if (next.retrieval!=='retrieved' && (f.r1.d || f.r2.d || f.resolved)) throw Error('Clear full-text decisions before changing retrieval status.');
    Object.assign(f,next); audit(s,'evidence',r,'ft',before,next);
  }
  function undo(s) {
    var events=s.audit || [], who=s.mode==='dual' ? s.active : 'r1';
    for(var i=events.length-1;i>=0;i--) {
      var e=events[i];
      if(e.action!=='decision' || e.actor!==who || e.stage!==(s.stage || 'ta')) continue;
      if(events.some(function(x){return x.action==='undo' && x.after.undoneSeq===e.seq;})) continue;
      var r=s.records.find(function(x){return x.id===e.recordId;});
      if(!r || JSON.stringify(snapshot(r,e.stage))!==JSON.stringify(e.after)) throw Error('This decision has changed since it was recorded; review it directly.');
      Object.assign(stageData(r,e.stage),copy(e.before));
      audit(s,'undo',r,e.stage,e.after,{undoneSeq:e.seq,state:e.before},who); return r;
    }
    throw Error('No unchanged decision by this reviewer is available to undo.');
  }
  function flow(s) {
    var c={identified:s.records.length,duplicates:0,screened:0,excludedScreen:0,pendingScreen:0,sought:0,notRetrieved:0,assessed:0,pendingFull:0,excludedFull:0,included:0,reasons:Object.create(null)};
    s.records.forEach(function(r){
      if(r.dup){c.duplicates++;return;}
      var ta=effective(r,s,'ta');
      if(ta!=='include' && ta!=='exclude'){c.pendingScreen++;return;}
      c.screened++;
      if(ta==='exclude'){c.excludedScreen++;return;}
      c.sought++; var f=stageData(r,'ft');
      if(f.retrieval==='not-retrieved'){c.notRetrieved++;return;}
      if(f.retrieval!=='retrieved'){c.pendingFull++;return;}
      c.assessed++; var d=effective(r,s,'ft');
      if(d==='include') c.included++;
      else if(d==='exclude'){
        c.excludedFull++;
        var reason=f.resolution ? f.resolution.reason : (f.r1.reason || f.r2.reason || 'Reason missing');
        // A single primary reason per report avoids double-counting two reviewers.
        c.reasons[reason]=(c.reasons[reason] || 0)+1;
      } else c.pendingFull++;
    }); return c;
  }
  function csvDelimiter(text) {
    // Count separators outside quoted cells in the first logical row only.
    var counts={',':0,';':0}, quoted=false;
    for(var i=0;i<text.length;i++){
      var ch=text[i];
      if(ch==='"'){if(quoted && text[i+1]==='"')i++;else quoted=!quoted;}
      else if(!quoted){if(ch==='\r'||ch==='\n')break;if(ch in counts)counts[ch]++;}
    }
    return counts[';']>counts[','] ? ';' : ',';
  }
  function csvRows(text) {
    var rows=[], row=[], cell='', quoted=false, closed=false;
    text=String(text).replace(/^\uFEFF/,'');
    var delimiter=csvDelimiter(text);
    for(var i=0;i<text.length;i++) {
      var ch=text[i];
      if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=ch;continue;}
      if(closed && ![delimiter,'\r','\n'].includes(ch)) throw Error('Unexpected text after closing quote.');
      if(ch==='"'){if(cell)throw Error('Unexpected quote in CSV field.');quoted=true;}
      else if(ch===delimiter){row.push(cell);cell='';closed=false;}
      else if(ch==='\r'||ch==='\n'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell='';closed=false;}
      else cell+=ch;
    }
    if(quoted)throw Error('Unclosed quote in CSV file.');
    row.push(cell);if(row.some(Boolean))rows.push(row);return rows;
  }
  return {VERSION:VERSION,stageData:stageData,normalize:normalize,effective:effective,visible:visible,eligible:eligible,
    snapshot:snapshot,audit:audit,decide:decide,resolve:resolve,evidence:evidence,undo:undo,flow:flow,csvRows:csvRows,safeUrl:safeUrl};
});
