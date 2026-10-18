"""Actual installed ASReview comparator and the shipped JS engine; no fitted proxies."""
from pathlib import Path
import argparse,copy,csv,hashlib,json,math,platform,subprocess,time
import numpy as np
import pandas as pd
import asreview
from asreview import ActiveLearningCycle,Simulate
from asreview.models.models import AI_MODEL_CONFIGURATIONS

ROOT=Path(__file__).resolve().parent
SEEDS=[101,202,303]
BATCH=10

def metrics(order,gold):
    total=sum(gold);cum=np.cumsum([gold[i] for i in order]);k=int(np.flatnonzero(cum>=math.ceil(.95*total))[0])+1;budget=math.ceil(.2*len(gold));found=int(cum[k-1]);at20=int(cum[budget-1])
    return {'N':len(gold),'eligible':total,'screened_at_95':k,'recall_at_95':found/total,'missed_at_95':total-found,'wss95':.95-k/len(gold),'workload_saved_at_95':1-k/len(gold),'recall_at_20pct':at20/total,'missed_at_20pct':total-at20}

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--output',type=Path,default=ROOT/'results');ap.add_argument('--seeds',type=int,nargs='+',default=SEEDS);args=ap.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    results=[];sources=json.loads((ROOT/'sources.json').read_text())
    for source in sources['datasets']:
        raw=(ROOT/source['file']).read_bytes();assert hashlib.sha256(raw).hexdigest()==source['sha256']
        rows=list(csv.DictReader(raw.decode('utf-8-sig').splitlines(keepends=True)));assert len(rows)==source['rows'];assert {'title','abstract','label_included'}<=rows[0].keys()
        assert all(r['label_included'].strip() in ('0','1') for r in rows)
        records=[{'id':str(i),'title':r['title'],'abstract':r['abstract']} for i,r in enumerate(rows)];gold=[int(r['label_included'].strip()) for r in rows];df=pd.DataFrame(records)
        for seed in args.seeds:
            rng=np.random.default_rng(seed);priors=list(map(int,rng.choice(np.flatnonzero(gold),2,replace=False)))+list(map(int,rng.choice(np.flatnonzero(np.array(gold)==0),2,replace=False)))
            name=source['dataset_id']+'-'+str(seed);inputfile=args.output/(name+'-input.json');inputfile.write_text(json.dumps({'records':records,'gold':gold,'priors':priors,'batch':BATCH}),encoding='utf-8')
            for engine in ['allmeta-lr','asreview-u4']:
                target=args.output/(name+'-'+engine+'.json')
                if engine=='allmeta-lr':
                    subprocess.run(['node',str(ROOT/'run_js.cjs'),str(inputfile),str(target)],check=True,timeout=1200);run=json.loads(target.read_text())
                else:
                    cfg=copy.deepcopy(next(m['value'] for m in AI_MODEL_CONFIGURATIONS if m['name']=='elas_u4'));cfg.n_query=BATCH;cfg.classifier_param['random_state']=seed;cycle=ActiveLearningCycle.from_meta(cfg)
                    started=time.perf_counter();sim=Simulate(df,np.array(gold),cycle,print_progress=False);sim.label(priors);sim.review();order=list(map(int,sim._results['record_id']));seen=set(order);order.extend(i for i in range(len(gold)) if i not in seen)
                    run={'engine':'ASReview '+asreview.__version__+' ELAS u4','config':cycle.to_meta().__dict__,'order':order,'seconds':time.perf_counter()-started}
                assert len(run['order'])==len(gold) and len(set(run['order']))==len(gold)
                run.update({'dataset':source['dataset_id'],'source_sha256':source['sha256'],'seed':seed,'priors':priors,'batch':BATCH,'metrics':metrics(run['order'],gold)})
                target.write_text(json.dumps(run,indent=2)+'\n',encoding='utf-8');results.append({k:run[k] for k in ['dataset','engine','seed','seconds','metrics']});print(json.dumps(results[-1]),flush=True)
            inputfile.unlink()  # generated intermediate, contains no additional evidence
    report={'python':platform.python_version(),'node':subprocess.check_output(['node','--version'],text=True).strip(),'asreview':asreview.__version__,'platform':platform.platform(),'protocol':'PROTOCOL.md','results':results,'rayyan':None,'human_usability':None,'human_screening_speed':None}
    (args.output/'summary.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
if __name__=='__main__':main()
