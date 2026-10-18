importScripts('hybrid-core.js');
self.onmessage=({data})=>{try{const started=performance.now();const result=ScreenHybrid.train(data.records,data.labels,data.config);postMessage({id:data.id,result,elapsed:performance.now()-started});}catch(e){postMessage({id:data.id,error:e.message});}};
