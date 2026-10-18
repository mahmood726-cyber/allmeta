const fs=require('fs'),vm=require('vm');const html=fs.readFileSync(process.argv[2],'utf8');
const output=[];
for(const mode of ['restore','url'])for(const model of ['FE','DL']){
 const nodes={};for(const m of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g))nodes[m[1]]={value:m[0].match(/\bvalue="([^"]*)"/)?.[1]||'',textContent:'',innerHTML:'',style:{},addEventListener(){}};
 nodes.src.value='0, 1, S0\n2, 1, S1\n4, 1, S2';nodes.model.value=model==='FE'?'DL':'FE';
 const snap={src:'0, 1, S0\n2, 1, S1\n4, 1, S2',model};const noop=()=>{};let restore;
 const window={alm:{analysisLifecycle:run=>run,csvUpload:noop,plotExport:noop,axisControls:noop,resultsExport:noop,resetUndo:o=>restore=o.restore,tooltips:noop,urlState:Object.assign(noop,{read:()=>mode==='url'?snap:null,write:noop})}};
 const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
 vm.runInNewContext(script,{window,document:{getElementById:id=>nodes[id]}});
 if(mode==='restore'){nodes.src.value='9, 1, wrong';restore(snap);}
 output.push({mode,wantedModel:model,model:nodes.model.value,src:nodes.src.value,count:nodes['m-n'].textContent});
}
console.log(JSON.stringify(output));
