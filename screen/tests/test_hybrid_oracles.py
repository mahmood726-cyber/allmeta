"""Independent SciPy/sklearn numerical witnesses, in the benchmark environment."""
import json
import subprocess
from pathlib import Path
import numpy as np
from scipy.stats import hypergeom
from sklearn.linear_model import LogisticRegression

ROOT = Path(__file__).resolve().parents[2]

def node(code):
    return json.loads(subprocess.check_output(['node', '-e', code], cwd=ROOT, text=True))

def test_hypergeom_against_scipy():
    cases = [(N,n,x) for N,n in [(12,5),(100,20),(1000,100),(100000,500)] for x in [0,1,3]]
    actual = node("const H=require('./screen/hybrid-core.js'); console.log(JSON.stringify("+json.dumps(cases)+".map(([N,n,x])=>H.upperEligible(N,n,x,.025))))")
    for (N,n,x),upper in zip(cases,actual):
        assert hypergeom.cdf(x,N,upper,n) >= .025 - 1e-8
        if upper < N-n+x:
            assert hypergeom.cdf(x,N,upper+1,n) < .025 + 1e-8

def test_fixed_sample_coverage_exhaustively():
    bounds=node("const H=require('./screen/hybrid-core.js');console.log(JSON.stringify(Array.from({length:7},(_,x)=>H.upperEligible(20,6,x,.05))))")
    for M in range(21):
        failure=sum(hypergeom.pmf(x,20,M,6) for x,u in enumerate(bounds) if M>u)
        assert failure <= .05 + 1e-12

def test_lr_matches_sklearn_objective():
    data=node("const H=require('./screen/hybrid-core.js');const r=[{id:'a',title:'heart cardiac trial'},{id:'b',title:'heart treatment'},{id:'c',title:'mouse protein'},{id:'d',title:'molecular mouse'}];const d=H.prepare(r,{epochs:500});const m=H.fit(d,{a:1,b:1,c:0,d:0});console.log(JSON.stringify({X:d.X,p:m.scores,n:d.terms.length}))")
    X=np.zeros((4,data['n']))
    for i,row in enumerate(data['X']):
        for j,v in row:X[i,j]=v
    # JS objective: mean weighted log loss + .01/2 * ||w||^2.
    model=LogisticRegression(C=1/(4*.01),solver='lbfgs',tol=1e-12,max_iter=1000).fit(X,[1,1,0,0])
    assert np.max(np.abs(model.predict_proba(X)[:,1]-list(data['p'].values()))) < 1e-4
