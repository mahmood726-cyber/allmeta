import fs from 'node:fs';
export function args(argv=process.argv.slice(2)){
 const out={};
 for(let i=0;i<argv.length;i++){if(argv[i].startsWith('--'))out[argv[i].slice(2)]=argv[++i];else if(!out.csv)out.csv=argv[i];else throw Error('Unexpected argument: '+argv[i]);}
 return out;
}
export function records(file){
 if(!file||file==='synthetic')return Array.from({length:50},(_,i)=>({id:String(i),title:'Synthetic trial '+i,abstract:i%3?'Control laboratory animal experiment.':'Clinical treatment benefit in patients.',label:i%3?0:1}));
 const text=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'');
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(field);field='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);if(row.some(Boolean))rows.push(row);row=[];field='';}
  else field+=c;
 }
 if(quoted)throw Error('Unclosed CSV quote');
 if(field||row.length){row.push(field);rows.push(row);}
 const header=rows.shift().map(x=>x.trim().toLowerCase());
 if(!header.includes('title')||!header.includes('abstract'))throw Error('CSV needs title and abstract columns');
 return rows.map((cells,i)=>{const r=Object.fromEntries(header.map((h,j)=>[h,cells[j]||'']));return {...r,id:r.id||String(i)};});
}
export function floats(file,count){
 const bytes=fs.readFileSync(file);
 if(bytes.length%4||bytes.length<count*768*4)throw Error('Embedding file must contain row-major little-endian float32, 768 values per record');
 const result=new Float32Array(count*768);
 for(let i=0;i<result.length;i++){result[i]=bytes.readFloatLE(i*4);if(!Number.isFinite(result[i]))throw Error('Nonfinite embedding');}
 return result;
}
