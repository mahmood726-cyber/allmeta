"""Independent input-derived weighted pooling and deterministic sampling oracle."""
import itertools
from functools import lru_cache
import math
import re
import xml.etree.ElementTree as ET


def expected(case):
    name, k = case['name'], case['k']
    refused = name.startswith(('row-', 'draw-', 'empty-'))
    values = fixture(k)
    fields = dict(count='—' if name.startswith('row-') else '0', median='—', i2='—',
                  note='', error='', src='\n'.join(f'{v:g}, {se:g}, Distinct_{i+11}' for i, (v,se) in enumerate(values)))
    fields['declarations'] = dict(
        viewbox=[0,0,600,420],
        defaults=['5000','1','1','100000'], initial_count='0',
        header_numbers=['2012','15'],
        footer_numbers=['2012','3','3','214','23','6.5','10.10.2','10.10.2','30','30','60','50','90','75','100','15','5,000','2','2','1','1,000,000','19','1,000,000'],
        # Documented app rule: enumerate through k=15, sample starting at 16.
        sample_threshold=[str(16-1)],
        sample_hint_numbers=['5,000','1','100,000','2'],
        enumeration_hint_numbers=['15','2','1','15','2012'],
        draw_accessible_numbers=['5,000'], axis_caption_numbers=['0','100'],
        initial_studies=['0.22','0.08','0.30','0.14','0.27','0.09','0.15','0.07','0.45','0.18','0.10','0.06','0.35','0.16','0.22','0.10','0.40','0.20'], axis_ranges=[0,100],
        csv_examples=['0.22','0.0064','0.08'])
    fields['geometry'] = []
    fields['plot_error'] = ''
    fields['plot_empty'] = refused or name.startswith('axis-')
    fields['draws'] = case['draws'] if case['draws'] not in ('NaN', 'Infinity') else ''
    if name.startswith('draw-'):
        fields['error'] = 'Enter a whole number of draws from 1 to 100,000.'
    if name == 'empty-sampled':
        fields['error'] = 'No sampled results. Adjust the draw count and try again.'
    summary_keys = ['k', 'n_subsets', 'median_est', 'median_i2', 'min_est', 'max_est', 'q25_est', 'q75_est', 'studies']
    if refused:
        fields.update({key: None for key in summary_keys})
        fields.update(x_ticks=[],y_ticks=[],axis_labels=[],circles=0)
        fields['exports']=export_expected(case,fields,None)
        return fields
    points=pool_points(k,case['model'],int(case['draws']) if k>15 else 0)
    mus=sorted(p[0] for p in points); i2=sorted(p[1] for p in points)
    def quantile(a,p):
        h=(len(a)-1)*p; lo=math.floor(h)
        return a[lo]+(h-lo)*(a[min(lo+1,len(a)-1)]-a[lo])
    med=quantile(mus,.5); hetero=quantile(i2,.5)
    fields.update(count=f'{len(points):,}',median=f'{med:.3f}',i2=f'{hetero:.1f}%',
                  k=k,n_subsets=len(points),median_est=med,median_i2=hetero,
                  min_est=mus[0],max_est=mus[-1],q25_est=quantile(mus,.25),q75_est=quantile(mus,.75),
                  studies=[dict(label=f'Distinct_{i+11}',te=v,se=se) for i,(v,se) in enumerate(values)])
    if name.startswith('axis-'):
        fields['plot_error']='Plot cannot be displayed: axis limits or coordinates are invalid or outside the plotting area. Widen or reset the limits. Computed results are retained.'
        fields.update(x_ticks=[],y_ticks=[],axis_labels=[],circles=0)
    else:
        omission=name=='omission'
        low=min(mus); high=max(mus); pad=(high-low)*.1
        xmin,xmax=case['axis'].get('x',[low-pad,high+pad])
        ymin,ymax=case['axis'].get('y',[0,100])
        fields.update(x_ticks=[f'{xmin+f*(xmax-xmin):.2f}' for f in [0,.5,1]],
                      y_ticks=[f'{ymin+f*(ymax-ymin):.0f}%' for f in [0,.25,.5,.75,1]],axis_labels=['Pooled effect','I²'],
                      circles=sum(xmin<=p[0]<=xmax and ymin<=p[1]<=ymax for p in points))
        fields['geometry'] = geometry(points, case['axis'])
        if omission:
            fields['note']=f"{len(points)-fields['circles']} subset points outside the current axis range are omitted."
    payload={key:fields[key] for key in summary_keys}
    payload.update(_schema='gosh-results-v1',model=case['model'],sampled=k>15)
    fields['exports']=export_expected(case, fields, payload)
    return fields


def export_expected(case, fields, payload):
    values=fixture(case['k'])
    studies=[dict(label=f'Distinct_{i+11}',est=v,se=se,moderator=None,group=None,year=None) for i,(v,se) in enumerate(values)]
    return dict(chart_matches_display=True,results=payload,receipt=None if payload is None else dict(studies=[],method='GOSH all-subsets meta-analysis stability',label='gosh-plot',results=payload),input_receipt=studies,bus=[dict(s,measure=None) for s in studies])


def observed(case):
    fields=case['fields']; out={k:fields[k] for k in ('plot_error','declarations','count','median','i2','note','error','src','draws')}
    # HTML number inputs sanitize non-finite/non-numeric input to the empty string.
    if out['draws'] in ('NaN','Infinity'): out['draws']=''
    out['plot_empty'] = not fields['svg'].strip()
    out['exports']={k:v for k,v in fields['exports'].items() if k!='chart'}
    # The registered SVG getter must expose precisely the displayed plot, including clearing.
    out['exports']['chart_matches_display']=fields['exports']['chart']==fields['svg']
    result=fields['result']
    for key in ('k','n_subsets','median_est','median_i2','min_est','max_est','q25_est','q75_est','studies'):
        out[key]=None if result is None else result[key]
    svg=ET.fromstring('<svg>'+fields['svg']+'</svg>')
    out['geometry'] = [(e.tag, {k: float(v) if k != 'transform' else [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?',v)] for k,v in e.attrib.items() if k in ('x','y','x1','x2','y1','y2','cx','cy','width','height','transform')}) for e in svg.iter() if e.tag in ('line','text','circle','rect')]
    out['geometry'] = out['geometry'][:21] + sorted(out['geometry'][21:], key=lambda p:(round(p[1]['cx'],9),round(p[1]['cy'],9)))
    texts=svg.findall('text')
    out.update(x_ticks=[t.text for t in texts if t.get('y')=='388'],
               y_ticks=[t.text for t in texts if t.get('x')=='52'],
               axis_labels=[t.text for t in texts if t.get('y')!='388' and t.get('x')!='52'],
               circles=len(svg.findall('circle')))
    return out


def matches(actual, wanted):
    if isinstance(wanted,float):
        return isinstance(actual,(float,int)) and math.isclose(actual,wanted,rel_tol=0,abs_tol=1e-12)
    if isinstance(wanted, (list,tuple)):
        return isinstance(actual,(list,tuple)) and len(actual)==len(wanted) and all(matches(a,b) for a,b in zip(actual,wanted))
    if isinstance(wanted,dict):
        return isinstance(actual,dict) and actual.keys()==wanted.keys() and all(matches(actual[k],v) for k,v in wanted.items())
    return actual == wanted


def geometry(points, requested):
    # Bounds from independent fixture effects, never from SVG or page points.
    low=min(p[0] for p in points); high=max(p[0] for p in points)
    pad=(high-low)*.1 if high>low else .1
    xmin,xmax=requested.get('x',[low-pad,high+pad])
    ymin,ymax=requested.get('y',[0,100])
    X=lambda v:60+520*(v-xmin)/(xmax-xmin)
    Y=lambda v:20+350*(ymax-v)/(ymax-ymin)
    result=[]
    def line(x1,y1,x2,y2): result.append(('line',dict(x1=x1,y1=y1,x2=x2,y2=y2)))
    def text(x,y,**attrs): result.append(('text',dict(x=x,y=y,**attrs)))
    line(60,20,60,370); line(60,370,580,370)
    for f in [0,.25,.5,.75,1]:
        y=Y(ymin+f*(ymax-ymin))
        line(60,y,580,y);text(52,y+4)
    for f in [0,.5,1]:
        x=X(xmin+f*(xmax-xmin))
        line(x,370,x,375);text(x,388)
    text(320,410);text(20,195,transform=[-90,20,195])
    result.append(('rect',dict(x=60,y=20,width=520,height=350)))
    for mu,i2 in points:
        if xmin<=mu<=xmax and ymin<=i2<=ymax:
            result.append(('circle',dict(cx=X(mu),cy=Y(i2))))
    return result[:21] + sorted(result[21:], key=lambda p:(round(p[1]['cx'],9),round(p[1]['cy'],9)))


def fixture(k):
    return [((13+137*i)/100, (231+70*i)/1000) for i in range(k)]


@lru_cache(None)
def pool_points(k, model, draws):
    rows=fixture(k)
    def pooled(indices):
        data=[rows[i] for i in indices]
        weights=[1/(se*se) for _,se in data]
        total=sum(weights)
        mean=sum(w*x for w,(x,_) in zip(weights,data))/total
        q=sum(w*(x-mean)*(x-mean) for w,(x,_) in zip(weights,data))
        df=len(data)-1
        i2=100*(q-df)/q if df>0 and q>df else 0
        if model=='DL' and df:
            tau=max(0,(q-df)/(total-sum(w*w for w in weights)/total))
            weights=[1/(se*se+tau) for _,se in data]
            mean=sum(w*x for w,(x,_) in zip(weights,data))/sum(weights)
        return mean,i2
    if k<=15:
        return [pooled(indices) for size in range(1,k+1) for indices in itertools.combinations(range(k),size)]
    # Documented fixed 32-bit seed and Fisher-Yates sampling contract.
    state=[0xdeadbeef,0x12345678,0xabcdef01,0x87654321]
    mask=2**32-1
    def rotate(x,n):
        x &= mask
        return ((x<<n)|(x>>(32-n)))&mask
    def uniform():
        result=(rotate(state[0]*5,7)*9)&mask
        shift=(state[1]<<9)&mask
        state[2]^=state[0];state[3]^=state[1];state[1]^=state[2];state[0]^=state[3]
        state[2]^=shift;state[3]=rotate(state[3],11)
        return result/2**32
    points=[]
    for _ in range(draws):
        size=2+int(uniform()*(k-1)); indices=list(range(k))
        for j in range(size):
            target=j+int(uniform()*(k-j))
            indices[j],indices[target]=indices[target],indices[j]
        points.append(pooled(indices[:size]))
    return points
