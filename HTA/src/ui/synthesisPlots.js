/* HTA beginner synthesis views. Native SVGs use fitted values, never demo data.
 * The main HTA decision-model views and their engines are not replaced here.
 */
(function (root) {
    'use strict';
    const NS = 'http://www.w3.org/2000/svg';
    const Z = 1.959963984540054;
    const copy = value => JSON.parse(JSON.stringify(value));
    const finite = Number.isFinite;
    const fmt = x => finite(x) ? x.toFixed(4) : 'Unavailable';
    const label = (s, i) => String(s.study || s.label || `Study ${i + 1}`);
    function element(tag, text, parent) {
        const el = document.createElement(tag);
        if (text != null) el.textContent = text;
        if (parent) parent.appendChild(el);
        return el;
    }
    function mark(parent, tag, attributes, text) {
        const el = document.createElementNS(NS, tag);
        for (const [key, value] of Object.entries(attributes)) {
            if (typeof value === 'number' && !finite(value)) throw new Error('Non-finite plot coordinate');
            el.setAttribute(key, String(value));
        }
        if (text != null) el.textContent = text;
        parent.appendChild(el);
        return el;
    }
    function button(parent, text, action) {
        const b = element('button', text, parent); b.type = 'button'; b.className = 'btn btn-secondary';
        b.addEventListener('click', action); return b;
    }
    function saveSVG(svg) {
        const xml = new XMLSerializer().serializeToString(svg);
        const url = URL.createObjectURL(new Blob([xml], {type: 'image/svg+xml;charset=utf-8'}));
        const a = element('a'); a.href = url; a.download = svg.id + '.svg';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    function figure(parent, id, title, height = 350) {
        const section = element('section', null, parent); section.style.margin = '20px 0';
        element('h3', title, section);
        const scroll = element('div', null, section); scroll.style.overflowX = 'auto';
        const width = Math.max(240, Math.min(720, scroll.clientWidth || 720));
        const svg = mark(scroll, 'svg', {id, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': title});
        svg.style.cssText = 'display:block;width:100%;height:auto;background:white;color:#172033';
        mark(svg, 'title', {}, title);
        mark(svg, 'rect', {x:0, y:0, width, height, fill:'white'});
        button(section, 'Download ' + title + ' SVG', () => saveSVG(svg));
        return svg;
    }
    function extent(values) {
        if (!values.length || !values.every(finite)) throw new Error('Plot requires finite values');
        const lo = Math.min(0, ...values), hi = Math.max(0, ...values), pad = Math.max((hi-lo)*.09, .05);
        return [lo-pad, hi+pad];
    }
    function axis(svg, domain, y, description) {
        const width=svg.viewBox.baseVal.width;
        const left=width<500?112:210, right=width-20, span=right-left;
        const x=value=>left+(value-domain[0])/(domain[1]-domain[0])*span;
        mark(svg,'line',{x1:left,x2:right,y1:y,y2:y,stroke:'#475569'});
        for(let i=0;i<=4;i++) {
            const v=domain[0]+i*(domain[1]-domain[0])/4;
            mark(svg,'text',{x:x(v),y:y+18,'text-anchor':'middle',fill:'#172033','font-size':width<500?10:11},v.toFixed(2));
        }
        mark(svg,'text',{x:left+span/2,y:y+38,'text-anchor':'middle',fill:'#172033','font-size':width<500?10:12},width<500?'Effect (input scale)':description);
        x.left=left; return x;
    }
    function forest(parent, id, title, rows, pooled = null) {
        const items = pooled ? [...rows, pooled] : rows;
        if (!items.length) { element('p', 'No estimable contrasts are available.', parent); return; }
        const svg = figure(parent,id,title,80+items.length*31);
        const domain = extent(items.flatMap(r=>[r.lo,r.hi]));
        const x = axis(svg,domain,25+items.length*31,'Effect on the input analysis scale; 95% intervals');
        mark(svg,'line',{x1:x(0),x2:x(0),y1:8,y2:20+items.length*31,stroke:'#94a3b8','stroke-dasharray':'4 3'});
        items.forEach((r,i)=>{
            const y=21+i*31;
            const g=mark(svg,'g',{'data-study':r.name,'data-effect':r.effect,'data-lower':r.lo,'data-upper':r.hi,'data-weight':r.weight || 0});
            mark(g,'text',{x:8,y:y+4,fill:'#172033','font-size':12},r.name.slice(0,svg.viewBox.baseVal.width<500?15:27));
            mark(g,'title',{},`${r.name}: ${fmt(r.effect)} [${fmt(r.lo)}, ${fmt(r.hi)}]`);
            mark(g,'line',{x1:x(r.lo),x2:x(r.hi),y1:y,y2:y,stroke:'#172033','stroke-width':1.5});
            if(r===pooled) mark(g,'polygon',{points:`${x(r.lo)},${y} ${x(r.effect)},${y-7} ${x(r.hi)},${y} ${x(r.effect)},${y+7}`,fill:'#176b87'});
            else {const size=Math.max(5,Math.sqrt(r.weight || 10)*1.6);mark(g,'rect',{x:x(r.effect)-size/2,y:y-size/2,width:size,height:size,fill:'#176b87'});}
        });
        svg.__plotData=copy(items); return svg;
    }
    function funnel(parent,id,title,observed,center,imputed=[]) {
        if(!observed.length || !finite(center)) throw new Error('Funnel plot requires a fitted center and observed studies');
        const rows=[...observed.map(r=>({...r,imputed:false})),...imputed.map(r=>({...r,imputed:true}))];
        const maxSE=Math.max(...rows.map(r=>r.se))*1.08;
        const domain=extent([...rows.map(r=>r.effect),center-Z*maxSE,center+Z*maxSE]);
        const svg=figure(parent,id,title,355),x=axis(svg,domain,292,'Effect on the input analysis scale');
        const y=se=>30+250*se/maxSE;
        mark(svg,'path',{d:`M ${x(center-Z*maxSE)} ${y(maxSE)} L ${x(center)} ${y(0)} L ${x(center+Z*maxSE)} ${y(maxSE)}`,fill:'none',stroke:'#64748b','stroke-dasharray':'4 3'});
        mark(svg,'line',{x1:x(center),x2:x(center),y1:y(0),y2:y(maxSE),stroke:'#94a3b8'});
        mark(svg,'text',{x:20,y:25,fill:'#172033','font-size':12},'Standard error (0 at top)');
        for(let i=0;i<=4;i++) mark(svg,'text',{x:x.left-10,y:y(maxSE*i/4)+4,'text-anchor':'end',fill:'#172033','font-size':11},(maxSE*i/4).toFixed(2));
        rows.forEach((r,i)=>{
            const c=mark(svg,'circle',{cx:x(r.effect),cy:y(r.se),r:5,fill:r.imputed?'white':'#176b87',stroke:'#176b87','stroke-width':2,'data-effect':r.effect,'data-se':r.se,'data-imputed':r.imputed});
            mark(c,'title',{},r.name || `Study ${i+1}`);
        });
        svg.__plotData={rows:copy(rows),center}; return svg;
    }
    function modal(id,title,subtitle) {
        document.getElementById(id)?.remove();
        const overlay=element('div'); overlay.id=id;overlay.className='welcome-modal-overlay active';
        overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
        const box=element('div',null,overlay);box.className='welcome-modal';box.style.maxWidth='980px';
        const header=element('div',null,box);header.className='welcome-header';
        const heading=element('h2',title,header);heading.id=id+'-title';overlay.setAttribute('aria-labelledby',heading.id);
        element('p',subtitle,header);const body=element('div',null,box);body.className='welcome-body';body.style.maxHeight='70vh';
        const footer=element('div',null,box);footer.className='welcome-footer';
        button(footer,'Close',()=>overlay.remove());document.body.appendChild(overlay);
        return {body,footer,overlay};
    }
    function table(parent,head,rows,id) {
        const scroll=element('div',null,parent);scroll.style.overflowX='auto';
        const t=element('table',null,scroll);t.className='data-table';if(id)t.id=id;
        const tr=element('tr',null,element('thead',null,t));head.forEach(h=>element('th',h,tr));
        const body=element('tbody',null,t);rows.forEach(row=>{const r=element('tr',null,body);row.forEach(v=>element('td',String(v),r));});return t;
    }
    function pairwise(owner,dataset,result) {
        const {body,footer}=modal('results-modal','Analysis results',`${dataset.name} — ${dataset.studies.length} studies`);
        element('p',`Random effects (${result.method}); normal-approximation 95% intervals. Effect ${fmt(result.random.effect)} [${fmt(result.random.ci_lower)}, ${fmt(result.random.ci_upper)}]. I² ${result.heterogeneity.I2.toFixed(1)}%. Effects remain on the supplied scale; an odds ratio is not a risk ratio.`,body);
        const rows=dataset.studies.map((s,i)=>({name:label(s,i),effect:s.effect,lo:s.effect-Z*s.se,hi:s.effect+Z*s.se,weight:result.weights.random[i]}));
        table(body,['Study','Effect','SE','Random-effects weight (%)'],dataset.studies.map((s,i)=>[label(s,i),fmt(s.effect),fmt(s.se),result.weights.random[i].toFixed(2)]),'hta-study-results');
        forest(body,'hta-beginner-forest','Forest plot',rows,{name:'Pooled random effects',effect:result.random.effect,lo:result.random.ci_lower,hi:result.random.ci_upper});
        const ma=new MetaAnalysisMethods({method:result.method,autoHKSJ:false,useHKSJ:false});
        const dated=dataset.studies.every(s=>finite(s.year) && s.year>0);
        const cumulative=ma.cumulativeMetaAnalysis(dataset.studies.map((s,i)=>({...s,label:label(s,i),year:dated?s.year:i+1})),'year');
        element('p',dated?'Cumulative fits are ordered by year; ties retain input order.':'Year is missing: cumulative fits use input order, not a historical time sequence.',body);
        forest(body,'hta-beginner-cumulative','Cumulative meta-analysis',cumulative.results.map(r=>({name:`${r.nStudies}: ${r.lastStudy}`,effect:r.effect,lo:r.ci_lower,hi:r.ci_upper})));
        funnel(body,'hta-beginner-funnel','Funnel plot',dataset.studies.map((s,i)=>({name:label(s,i),effect:s.effect,se:s.se})),result.random.effect);
        element('p','Funnel asymmetry is not specific to publication bias. A symmetric-looking plot or non-significant test does not establish its absence.',body);
        button(footer,'Export results CSV',()=>owner.exportToCSV());
        button(footer,'Check publication bias',()=>owner.runPublicationBias());
    }
    function bias(owner,dataset) {
        const {body}=modal('bias-modal','Publication-bias diagnostics',dataset.name);
        const studies=dataset.studies;
        if(studies.length<3){element('p','At least three studies are required by these diagnostic routines. With very few studies, asymmetry tests are not reliable.',body);return;}
        const ma=new MetaAnalysisMethods(),egger=ma.eggerTest(studies),begg=ma.beggTest(studies),tf=ma.trimAndFill(studies);
        element('p',`Egger p=${fmt(egger.pValue)}; Begg p=${fmt(begg.pValue)}. These are small-study-effect diagnostics, not proof for or against publication bias.`,body);
        if(tf.error || !tf.adjusted){element('p',tf.error || 'Trim-and-fill could not be estimated.',body);return;}
        element('p',`Trim-and-fill uses its existing fixed-effect adjustment: observed ${fmt(tf.original.effect)}, adjusted ${fmt(tf.adjusted.effect)}; ${tf.nMissing} imputed studies. Open points are imputed. This is distinct from the random-effects primary fit.`,body);
        const observed=studies.map((s,i)=>({name:label(s,i),effect:s.effect,se:s.se}));
        funnel(body,'hta-bias-observed','Observed-study funnel',observed,tf.original.effect);
        funnel(body,'hta-bias-trimfill','Trim-and-fill funnel',observed,tf.adjusted.effect,tf.imputedStudies || []);
    }
    function nma(owner,dataset,engine) {
        const {body}=modal('hta-nma-results','Network synthesis plots',dataset.name),r=engine.results;
        element('p',`Frequentist fixed-effect network. Reference: ${r.reference}. Plots use the engine's fitted contrast orientation; verify outcome/treatment direction before interpretation. P-scores are summary scores, not probabilities of each rank.`,body);
        const svg=figure(body,'hta-beginner-network','Observed treatment network',360),nodes=engine.network.nodes;
        const positions=new Map(nodes.map((n,i)=>[n.id,{x:svg.viewBox.baseVal.width/2+svg.viewBox.baseVal.width*.23*Math.cos(i*2*Math.PI/nodes.length),y:175+120*Math.sin(i*2*Math.PI/nodes.length)}]));
        for(const edge of engine.network.edges){const a=positions.get(edge.treatment1),b=positions.get(edge.treatment2);mark(svg,'line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#64748b','stroke-width':Math.max(1,Math.sqrt(edge.nStudies)*3),'data-first':edge.treatment1,'data-second':edge.treatment2,'data-studies':edge.nStudies});}
        for(const node of nodes){const p=positions.get(node.id);mark(svg,'circle',{cx:p.x,cy:p.y,r:12,fill:'#176b87','data-treatment':node.id});mark(svg,'text',{x:p.x,y:p.y+30,'text-anchor':'middle',fill:'#172033','font-size':12},node.id);}
        forest(body,'hta-beginner-nma-forest','Network fitted contrasts',r.effects.map(e=>({name:e.treatment,effect:e.mean,lo:e.ci_lower,hi:e.ci_upper})));
        const scores=engine.calculatePScores();
        const rank=figure(body,'hta-beginner-pscore','Frequentist P-scores',80+scores.length*30);
        const rankWidth=rank.viewBox.baseVal.width, rankLeft=rankWidth<500?120:230, rankSpan=rankWidth-rankLeft-55;
        scores.forEach((s,i)=>{
            mark(rank,'text',{x:10,y:28+i*30,fill:'#172033','font-size':12},s.treatment.slice(0,rankWidth<500?15:40));
            mark(rank,'rect',{x:rankLeft,y:14+i*30,width:s.pScore/100*rankSpan,height:17,fill:'#176b87','data-treatment':s.treatment,'data-pscore':s.pScore});
            mark(rank,'text',{x:rankWidth-45,y:28+i*30,fill:'#172033','font-size':11},s.pScore.toFixed(1));
        });
        const f=engine.generateFunnelPlot();
        funnel(body,'hta-beginner-nma-funnel','Comparison-adjusted funnel',f.data.map(d=>({name:d.study,effect:d.adjustedEffect,se:d.se})),0);
        table(body,['Treatment','Fitted effect','95% lower','95% upper'],r.effects.map(e=>[e.treatment,fmt(e.mean),fmt(e.ci_lower),fmt(e.ci_upper)]));
    }
    function error(message) {const {body}=modal('hta-synthesis-error','Analysis could not be displayed','No substitute or previous-data plot is shown.');element('p',String(message),body);}
    root.HTASynthesisPlots={pairwise,bias,nma,error,saveSVG};
})(window);
