/* Bounded structural cues, never asserted clinical eligibility or automatic exclusions. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ScreenPico=api;})(globalThis,function(){
 const patterns={population:/\b(?:patients?|participants?|adults?|children|infants?)\b[^.;\n]{0,140}/gi,intervention:/\b(?:received|treated with|assigned to|allocated to)\b[^.;\n]{0,140}/gi,comparator:/\b(?:versus|compared (?:with|to)|placebo(?:-controlled)?)\b[^.;\n]{0,120}/gi,outcome:/\b(?:(?:primary|secondary) (?:outcomes?|endpoints?)|measured (?:by|using))\b[^.;\n]{0,160}/gi};
 return {extract(text){text=String(text);const evidence=[];for(const [field,pattern]of Object.entries(patterns)){pattern.lastIndex=0;let m;while((m=pattern.exec(text))!==null){evidence.push({field,start:m.index,end:m.index+m[0].length,text:m[0],kind:'structural cue'});if(evidence.length>=40)return evidence;}}return evidence.sort((a,b)=>a.start-b.start);}};
});
