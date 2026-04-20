#!/usr/bin/env python3
# Legacy HTML mutator retired in manifest-first workflow.
raise SystemExit(
    "This script is retired. dev/modules/ is the authoritative source. "
    "Edit the relevant module and run `python dev/build.py build` instead of mutating ipd-meta-pro.html directly."
)

"""
MORE Features That Exceed R - Part 2
Adds collaboration, living reviews, NL interpretation, GRADE, ML explorer
"""

import re

def add_more_exceed_r():
    with open('ipd-meta-pro.html', 'r', encoding='utf-8') as f:
        content = f.read()

    original_len = len(content)
    features_added = []

    # Check what's already there
    has_auto_method = 'AutoMethodSelector' in content
    has_collab = 'CollaborationSystem' in content
    has_living = 'LivingReviewSystem' in content
    has_ml = 'MLHeterogeneityExplorer' in content
    has_grade = 'GRADEAssessment' in content
    has_interp = 'ResultsInterpreter' in content
    has_oneclick = 'OneClickAnalysis' in content

    # =========================================================================
    # 1. AUTO METHOD SELECTOR
    # =========================================================================
    if not has_auto_method:
        auto_method = '''
    // ============================================================================
    // AUTO METHOD SELECTOR - Exceeds R (R requires manual selection)
    // References: IntHout 2014, Langan 2019
    // ============================================================================
    const AutoMethodSelector = {
        analyze: function(studies) {
            if (!studies || studies.length === 0) return null;
            const n = studies.length;
            const effects = studies.map(s => s.yi || s.effect || 0);
            const variances = studies.map(s => s.vi || s.variance || 0.01);
            const weights = variances.map(v => 1/v);
            const sumW = weights.reduce((a,b) => a+b, 0);
            const wMean = effects.reduce((s,e,i) => s + e*weights[i], 0) / sumW;
            const Q = effects.reduce((s,e,i) => s + weights[i]*Math.pow(e-wMean,2), 0);
            const I2 = Math.max(0, (Q-(n-1))/Q*100);
            return { n, I2, Q, sparse: studies.some(s => (s.ai||0)<5 || (s.ci||0)<5), zero: studies.some(s => s.ai===0||s.ci===0) };
        },
        recommend: function(chars, outcomeType) {
            const rec = { tau2:'DL', ci:'standard', pool:'IV', bias:null, rationale:[] };
            if (chars.n < 3) { rec.tau2='PM'; rec.rationale.push('PM for k<3'); }
            else if (chars.n < 10 || chars.I2 > 50) { rec.tau2='REML'; rec.rationale.push('REML for small k or high I2'); }
            if (chars.n < 10 || chars.I2 > 50) { rec.ci='HKSJ'; rec.rationale.push('HKSJ reduces false positives'); }
            if (outcomeType==='binary' && chars.zero) { rec.pool='Peto'; rec.rationale.push('Peto handles zero cells'); }
            else if (outcomeType==='binary' && chars.sparse) { rec.pool='MH'; rec.rationale.push('MH robust for sparse'); }
            rec.bias = chars.n >= 10 ? (outcomeType==='binary' && chars.sparse ? 'Peters' : 'Egger') : 'none';
            if (chars.n < 10) rec.rationale.push('k<10: bias tests not recommended');
            return rec;
        },
        run: function(studies, outcomeType) {
            const chars = this.analyze(studies || APP.currentData);
            if (!chars) { alert('No data'); return; }
            const rec = this.recommend(chars, outcomeType || 'continuous');
            APP.methodSelection = { chars, rec };
            var h = '<div class="modal-overlay active"><div class="modal" style="max-width:600px">';
            h += '<div class="modal-header"><h3>Optimal Methods Selected</h3><button class="modal-close" onclick="this.closest(\\'.modal-overlay\\').remove()">&times;</button></div>';
            h += '<div class="modal-body">';
            h += '<div style="background:rgba(34,197,94,0.1);padding:1rem;border-radius:8px;margin-bottom:1rem">';
            h += '<p><b>Tau2 Estimator:</b> '+rec.tau2+'</p>';
            h += '<p><b>CI Method:</b> '+rec.ci+'</p>';
            h += '<p><b>Pooling:</b> '+rec.pool+'</p>';
            h += '<p><b>Bias Test:</b> '+(rec.bias||'N/A')+'</p></div>';
            h += '<h4>Data: '+chars.n+' studies, I2='+chars.I2.toFixed(1)+'%</h4>';
            h += '<h4>Rationale:</h4><ul>';
            rec.rationale.forEach(function(r){h+='<li>'+r+'</li>';}); h+='</ul>';
            h += '<p style="font-size:0.85rem;color:var(--text-secondary)"><em>Refs: IntHout 2014, Langan 2019</em></p>';
            h += '</div></div></div>';
            var m=document.createElement('div');m.innerHTML=h;document.body.appendChild(m.firstChild);
            return rec;
        }
    };

'''
        content = content.replace('const APP = {', auto_method + '\n    const APP = {')
        features_added.append("Auto Method Selection (R requires manual)")

    # =========================================================================
    # 2. COLLABORATION SYSTEM
    # =========================================================================
    if not has_collab:
        collab = '''
    // ============================================================================
    // COLLABORATION SYSTEM - Share via URL (R has no built-in sharing)
    // ============================================================================
    const CollaborationSystem = {
        encode: function() {
            var state = { data: (APP.currentData||[]).slice(0,30), settings: APP.analysisSettings, v:'2', t:Date.now() };
            try { return btoa(unescape(encodeURIComponent(JSON.stringify(state)))); } catch(e) { return null; }
        },
        getShareURL: function() {
            var enc = this.encode();
            if (!enc || enc.length > 2000) return null;
            return location.origin + location.pathname + '?s=' + enc;
        },
        loadFromURL: function() {
            var p = new URLSearchParams(location.search).get('s');
            if (p) { try { var s = JSON.parse(decodeURIComponent(escape(atob(p)))); if(s.data)APP.currentData=s.data; console.log('Loaded shared state'); } catch(e){} }
        },
        downloadState: function() {
            var b = new Blob([JSON.stringify({data:APP.currentData,results:APP.lastResults,t:Date.now()},null,2)],{type:'application/json'});
            var a = document.createElement('a'); a.href=URL.createObjectURL(b); a.download='ipd-analysis-'+new Date().toISOString().slice(0,10)+'.json'; a.click();
        },
        show: function() {
            var url = this.getShareURL();
            var h = '<div class="modal-overlay active"><div class="modal" style="max-width:550px">';
            h += '<div class="modal-header"><h3>Share Analysis</h3><button class="modal-close" onclick="this.closest(\\'.modal-overlay\\').remove()">&times;</button></div>';
            h += '<div class="modal-body">';
            if (url) {
                h += '<p><b>Shareable Link:</b></p><input id="shareUrl" value="'+url+'" style="width:100%;padding:0.5rem" readonly>';
                h += '<button class="btn btn-primary" style="margin-top:0.5rem" onclick="navigator.clipboard.writeText(document.getElementById(\\'shareUrl\\').value);alert(\\'Copied!\\')">Copy</button>';
            } else {
                h += '<p>Data too large for URL. Use file export:</p>';
            }
            h += '<hr style="margin:1rem 0"><button class="btn btn-secondary" onclick="CollaborationSystem.downloadState()">Download State File</button>';
            h += '</div></div></div>';
            var m=document.createElement('div');m.innerHTML=h;document.body.appendChild(m.firstChild);
        }
    };
    document.addEventListener('DOMContentLoaded', function(){ CollaborationSystem.loadFromURL(); });

'''
        content = content.replace('const APP = {', collab + '\n    const APP = {')
        features_added.append("Collaboration/Sharing via URL (R cannot)")

    # =========================================================================
    # 3. LIVING REVIEW SYSTEM
    # =========================================================================
    if not has_living:
        living = '''
    // ============================================================================
    // LIVING REVIEW SYSTEM - Track conclusions over time (Elliott 2017)
    // ============================================================================
    const LivingReviewSystem = {
        snapshots: [],
        load: function() { try { var s=localStorage.getItem('ipd_snapshots'); if(s)this.snapshots=JSON.parse(s); } catch(e){} },
        save: function() { try { localStorage.setItem('ipd_snapshots',JSON.stringify(this.snapshots)); } catch(e){} },
        take: function(r,label) {
            this.snapshots.push({ id:Date.now(), t:new Date().toISOString(), label:label||'Snapshot', k:r.nStudies||r.k, est:r.estimate||r.pooledEffect, ci:[r.ci_lower,r.ci_upper], p:r.pValue, I2:r.I2 });
            this.save();
        },
        checkChange: function() {
            if (this.snapshots.length<2) return null;
            var f=this.snapshots[0], l=this.snapshots[this.snapshots.length-1];
            return { sigChange:(f.p<0.05)!==(l.p<0.05), dirChange:(f.est>0)!==(l.est>0), effectChange:Math.abs((l.est-f.est)/f.est)*100 };
        },
        show: function() {
            this.load();
            var chg = this.checkChange();
            var h = '<div class="modal-overlay active"><div class="modal" style="max-width:750px;max-height:85vh;overflow-y:auto">';
            h += '<div class="modal-header"><h3>Living Review Dashboard</h3><button class="modal-close" onclick="this.closest(\\'.modal-overlay\\').remove()">&times;</button></div>';
            h += '<div class="modal-body">';
            h += '<p style="margin-bottom:1rem">Track how conclusions evolve as evidence accumulates. <em>(Elliott 2017)</em></p>';
            if (this.snapshots.length===0) { h += '<p>No snapshots yet. Save current analysis to begin tracking.</p>'; }
            else {
                h += '<table style="width:100%;border-collapse:collapse;font-size:0.9rem"><tr style="background:var(--bg-tertiary)"><th style="padding:0.5rem">Date</th><th>k</th><th>Effect</th><th>p</th><th>I2</th></tr>';
                this.snapshots.forEach(function(s){
                    h += '<tr><td style="padding:0.5rem">'+new Date(s.t).toLocaleDateString()+'</td><td>'+s.k+'</td><td>'+(s.est?s.est.toFixed(3):'?')+'</td><td style="'+(s.p<0.05?'color:#22c55e':'')+'">'+(s.p?s.p.toFixed(4):'?')+'</td><td>'+(s.I2?s.I2.toFixed(0)+'%':'?')+'</td></tr>';
                }); h += '</table>';
                if (chg && (chg.sigChange||chg.dirChange)) {
                    h += '<div style="background:rgba(239,68,68,0.1);padding:1rem;margin-top:1rem;border-radius:8px"><b style="color:#ef4444">Conclusion Changed!</b>';
                    if(chg.sigChange) h+='<p>Significance status changed</p>';
                    if(chg.dirChange) h+='<p>Effect direction reversed</p>';
                    h += '</div>';
                }
            }
            h += '<div style="margin-top:1rem"><button class="btn btn-primary" onclick="LivingReviewSystem.saveCurrent()">Save Current</button>';
            h += '<button class="btn btn-secondary" style="margin-left:0.5rem" onclick="if(confirm(\\'Clear all?\\'))LivingReviewSystem.clear()">Clear All</button></div>';
            h += '</div></div></div>';
            var m=document.createElement('div');m.innerHTML=h;document.body.appendChild(m.firstChild);
        },
        saveCurrent: function() { if(!APP.lastResults){alert('Run analysis first');return;} this.take(APP.lastResults,prompt('Label:')); alert('Saved!'); },
        clear: function() { this.snapshots=[]; this.save(); alert('Cleared'); }
    };

'''
        content = content.replace('const APP = {', living + '\n    const APP = {')
        features_added.append("Living Review Dashboard (Elliott 2017)")

    # =========================================================================
    # 4. ML HETEROGENEITY EXPLORER
    # =========================================================================
    if not has_ml:
        ml = '''
    // ============================================================================
    // ML HETEROGENEITY EXPLORER - Beyond standard meta-regression
    // ============================================================================
    const MLHeterogeneityExplorer = {
        calcImportance: function(studies, covs) {
            var res = {};
            var effs = studies.map(function(s){return s.yi||s.effect||0;});
            var wts = studies.map(function(s){return 1/(s.vi||s.variance||0.01);});
            var sumW = wts.reduce(function(a,b){return a+b;},0);
            var pooled = effs.reduce(function(s,e,i){return s+e*wts[i];},0)/sumW;
            var baseSS = effs.reduce(function(s,e,i){return s+wts[i]*Math.pow(e-pooled,2);},0);
            var self = this;
            covs.forEach(function(c){
                var vals = studies.map(function(s){return s[c];}).filter(function(v){return v!==undefined&&v!==null;});
                if (vals.length < studies.length*0.5) { res[c]={imp:0,note:'Insufficient'}; return; }
                var grps = self.group(studies,c);
                var withinSS = 0;
                Object.values(grps).forEach(function(g){
                    if(g.length<2)return;
                    var ge = g.map(function(s){return s.yi||s.effect||0;});
                    var gm = ge.reduce(function(a,b){return a+b;},0)/ge.length;
                    withinSS += ge.reduce(function(s,e){return s+Math.pow(e-gm,2);},0);
                });
                res[c] = { imp: Math.max(0,(baseSS-withinSS)/baseSS*100), interp: (baseSS-withinSS)/baseSS>0.25?'Major':'Minor' };
            });
            return res;
        },
        group: function(studies,c) {
            var grps = {};
            var nums = studies.map(function(s){return s[c];}).filter(function(v){return typeof v==='number';});
            var med = nums.length>0 ? nums.sort(function(a,b){return a-b;})[Math.floor(nums.length/2)] : null;
            studies.forEach(function(s){
                var v = s[c]; if(typeof v==='number'&&med!==null) v = v<=med?'Low':'High';
                if(v!==undefined&&v!==null) { if(!grps[v])grps[v]=[]; grps[v].push(s); }
            });
            return grps;
        },
        detectCovs: function(studies) {
            if(!studies||!studies[0])return[];
            var excl=['yi','vi','effect','variance','se','weight','id'];
            return Object.keys(studies[0]).filter(function(k){
                if(excl.indexOf(k.toLowerCase())>=0)return false;
                return studies.filter(function(s){return s[k]!==undefined;}).length>=studies.length*0.5;
            });
        },
        show: function() {
            var data = APP.currentData;
            if(!data||data.length===0){alert('No data');return;}
            var covs = this.detectCovs(data);
            if(covs.length===0){alert('No covariates found');return;}
            var imp = this.calcImportance(data, covs);
            var sorted = Object.entries(imp).sort(function(a,b){return b[1].imp-a[1].imp;});
            var h = '<div class="modal-overlay active"><div class="modal" style="max-width:650px">';
            h += '<div class="modal-header"><h3>ML Heterogeneity Explorer</h3><button class="modal-close" onclick="this.closest(\\'.modal-overlay\\').remove()">&times;</button></div>';
            h += '<div class="modal-body"><p>Which variables explain between-study variance:</p>';
            h += '<table style="width:100%;border-collapse:collapse"><tr style="background:var(--bg-tertiary)"><th style="padding:0.5rem;text-align:left">Variable</th><th>Importance</th><th>Role</th></tr>';
            sorted.forEach(function(e){
                var bar = Math.min(100,e[1].imp);
                h += '<tr><td style="padding:0.5rem">'+e[0]+'</td><td><div style="background:var(--bg-tertiary);height:16px;width:100px;display:inline-block"><div style="background:#3b82f6;height:100%;width:'+bar+'%"></div></div> '+e[1].imp.toFixed(1)+'%</td><td>'+e[1].interp+'</td></tr>';
            }); h += '</table>';
            h += '<p style="margin-top:1rem;font-size:0.9rem">High-importance variables should be prioritized in subgroup analyses.</p>';
            h += '</div></div></div>';
            var m=document.createElement('div');m.innerHTML=h;document.body.appendChild(m.firstChild);
        }
    };

'''
        content = content.replace('const APP = {', ml + '\n    const APP = {')
        features_added.append("ML Heterogeneity Explorer (Beyond meta-regression)")

    # =========================================================================
    # 5. GRADE ASSESSMENT
    # =========================================================================
    if not has_grade:
        grade = '''
    // ============================================================================
    // GRADE ASSESSMENT - Automated (Guyatt 2011) - No R package does this
    // ============================================================================
    const GRADEAssessment = {
        assess: function(r) {
            var lvl=4, reasons=[];
            if(r.I2!==undefined){ if(r.I2>=75){lvl-=2;reasons.push('Very serious inconsistency');} else if(r.I2>=50){lvl-=1;reasons.push('Serious inconsistency');} }
            if(r.ci_lower!==undefined&&r.ci_upper!==undefined){ if((r.ci_lower<0&&r.ci_upper>0)||(r.ci_lower<1&&r.ci_upper>1)){lvl-=1;reasons.push('Imprecision (CI crosses null)');} }
            if((r.nStudies||r.k)<5){lvl-=1;reasons.push('Few studies');}
            lvl=Math.max(1,Math.min(4,lvl));
            return { level:lvl, certainty:['Very Low','Low','Moderate','High'][lvl-1], reasons:reasons };
        },
        show: function() {
            if(!APP.lastResults){alert('Run analysis first');return;}
            var a=this.assess(APP.lastResults);
            var cols=['#ef4444','#f97316','#eab308','#22c55e'];
            var h = '<div class="modal-overlay active"><div class="modal" style="max-width:550px">';
            h += '<div class="modal-header"><h3>GRADE Assessment</h3><button class="modal-close" onclick="this.closest(\\'.modal-overlay\\').remove()">&times;</button></div>';
            h += '<div class="modal-body">';
            h += '<div style="padding:1.5rem;background:'+cols[a.level-1]+'20;border-left:4px solid '+cols[a.level-1]+';border-radius:8px"><h2 style="color:'+cols[a.level-1]+';margin:0">'+a.certainty+' Certainty</h2></div>';
            if(a.reasons.length>0){ h+='<h4 style="margin-top:1rem">Downgrades:</h4><ul>'; a.reasons.forEach(function(r){h+='<li>'+r+'</li>';}); h+='</ul>'; }
            h += '<p style="margin-top:1rem;font-size:0.85rem;color:var(--text-secondary)"><em>Ref: Guyatt GH et al. BMJ 2008</em></p>';
            h += '</div></div></div>';
            var m=document.createElement('div');m.innerHTML=h;document.body.appendChild(m.firstChild);
        }
    };

'''
        content = content.replace('const APP = {', grade + '\n    const APP = {')
        features_added.append("Automated GRADE Assessment (Guyatt 2011)")

    # =========================================================================
    # 6. RESULTS INTERPRETER
    # =========================================================================
    if not has_interp:
        interp = '''
    // ============================================================================
    // RESULTS INTERPRETER - Plain language (R outputs numbers only)
    // ============================================================================
    const ResultsInterpreter = {
        interpret: function(r) {
            var sects=[], eff=r.estimate||r.pooledEffect;
            sects.push(eff>0 ? 'Positive effect ('+eff.toFixed(3)+')' : eff<0 ? 'Negative effect ('+eff.toFixed(3)+')' : 'No effect');
            if(r.pValue!==undefined) sects.push(r.pValue<0.001?'Highly significant (p<0.001)':r.pValue<0.05?'Significant (p='+r.pValue.toFixed(3)+')':'Not significant (p='+r.pValue.toFixed(3)+')');
            if(r.I2!==undefined) sects.push(r.I2<25?'Consistent results (I2='+r.I2.toFixed(0)+'%)':r.I2<50?'Moderate variation':r.I2<75?'Substantial variation':'Considerable variation (interpret cautiously)');
            return { summary:sects[0], full:sects.join('. ')+'.' };
        },
        abstract: function(r) {
            var k=r.nStudies||r.k||'?', e=r.estimate||r.pooledEffect;
            return 'RESULTS: '+k+' studies. Pooled effect: '+(e?e.toFixed(3):'?')+' (95% CI: '+(r.ci_lower?r.ci_lower.toFixed(2):'?')+' to '+(r.ci_upper?r.ci_upper.toFixed(2):'?')+')'+(r.pValue?', p='+r.pValue.toFixed(3):'')+'. '+(r.I2!==undefined?'I2='+r.I2.toFixed(0)+'%.':'');
        },
        show: function() {
            if(!APP.lastResults){alert('Run analysis first');return;}
            var i=this.interpret(APP.lastResults), ab=this.abstract(APP.lastResults);
            var h = '<div class="modal-overlay active"><div class="modal" style="max-width:650px">';
            h += '<div class="modal-header"><h3>Plain Language Interpretation</h3><button class="modal-close" onclick="this.closest(\\'.modal-overlay\\').remove()">&times;</button></div>';
            h += '<div class="modal-body">';
            h += '<div style="padding:1rem;background:var(--bg-tertiary);border-radius:8px;margin-bottom:1rem"><h4>Summary</h4><p style="font-size:1.1rem">'+i.summary+'</p></div>';
            h += '<p>'+i.full+'</p>';
            h += '<h4 style="margin-top:1.5rem">Draft Abstract</h4><textarea id="absText" style="width:100%;height:70px;padding:0.5rem" readonly>'+ab+'</textarea>';
            h += '<button class="btn btn-secondary" style="margin-top:0.5rem" onclick="navigator.clipboard.writeText(document.getElementById(\\'absText\\').value)">Copy</button>';
            h += '</div></div></div>';
            var m=document.createElement('div');m.innerHTML=h;document.body.appendChild(m.firstChild);
        }
    };

'''
        content = content.replace('const APP = {', interp + '\n    const APP = {')
        features_added.append("Plain Language Interpreter (R outputs numbers)")

    # =========================================================================
    # 7. ONE-CLICK ANALYSIS
    # =========================================================================
    if not has_oneclick:
        oneclick = '''
    // ============================================================================
    // ONE-CLICK COMPLETE ANALYSIS (R requires multiple commands)
    // ============================================================================
    const OneClickAnalysis = {
        run: function() {
            if(!APP.currentData||APP.currentData.length===0){alert('No data');return;}
            var rep=['='+'='.repeat(50),'ONE-CLICK COMPLETE ANALYSIS','Generated: '+new Date().toISOString(),'='+'='.repeat(50),''];
            // Methods
            var m = AutoMethodSelector.run ? AutoMethodSelector.analyze(APP.currentData) : null;
            if(m) rep.push('DATA: '+m.n+' studies, I2='+m.I2.toFixed(1)+'%','');
            // Results summary
            if(APP.lastResults) {
                var r=APP.lastResults;
                rep.push('POOLED EFFECT: '+(r.estimate||r.pooledEffect||'?'));
                rep.push('95% CI: ['+(r.ci_lower||'?')+', '+(r.ci_upper||'?')+']');
                rep.push('p-value: '+(r.pValue||'?'));
                rep.push('I2: '+(r.I2?r.I2.toFixed(1)+'%':'?'),'');
            }
            // GRADE
            if(APP.lastResults&&GRADEAssessment) { var g=GRADEAssessment.assess(APP.lastResults); rep.push('GRADE: '+g.certainty,''); }
            // Interpretation
            if(APP.lastResults&&ResultsInterpreter) { var i=ResultsInterpreter.interpret(APP.lastResults); rep.push('INTERPRETATION: '+i.full,''); }
            // Living snapshot
            if(APP.lastResults&&LivingReviewSystem) { LivingReviewSystem.take(APP.lastResults,'OneClick'); rep.push('Living review snapshot saved.',''); }
            rep.push('='+'='.repeat(50));
            var h = '<div class="modal-overlay active"><div class="modal" style="max-width:700px">';
            h += '<div class="modal-header"><h3>Complete Analysis</h3><button class="modal-close" onclick="this.closest(\\'.modal-overlay\\').remove()">&times;</button></div>';
            h += '<div class="modal-body"><pre style="background:var(--bg-tertiary);padding:1rem;overflow:auto;max-height:50vh;font-size:0.85rem">'+rep.join('\\n')+'</pre>';
            h += '<button class="btn btn-primary" style="margin-top:1rem" onclick="navigator.clipboard.writeText(document.querySelector(\\'pre\\').textContent)">Copy</button></div></div></div>';
            var m=document.createElement('div');m.innerHTML=h;document.body.appendChild(m.firstChild);
        }
    };

'''
        content = content.replace('const APP = {', oneclick + '\n    const APP = {')
        features_added.append("One-Click Complete Analysis")

    # =========================================================================
    # ADD UI BUTTONS
    # =========================================================================
    button_html = '''
                    <div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-color)">
                        <p style="font-size:0.85rem;margin-bottom:0.5rem;color:var(--text-secondary)"><b>Features Exceeding R:</b></p>
                        <div style="display:flex;flex-wrap:wrap;gap:0.4rem">
                            <button class="btn btn-info btn-sm" onclick="if(typeof OneClickAnalysis!=='undefined')OneClickAnalysis.run();else alert('Feature loading...')">One-Click</button>
                            <button class="btn btn-info btn-sm" onclick="if(typeof AutoMethodSelector!=='undefined')AutoMethodSelector.run();else alert('Feature loading...')">Auto Methods</button>
                            <button class="btn btn-info btn-sm" onclick="if(typeof CollaborationSystem!=='undefined')CollaborationSystem.show();else alert('Feature loading...')">Share</button>
                            <button class="btn btn-info btn-sm" onclick="if(typeof LivingReviewSystem!=='undefined')LivingReviewSystem.show();else alert('Feature loading...')">Living Review</button>
                            <button class="btn btn-info btn-sm" onclick="if(typeof MLHeterogeneityExplorer!=='undefined')MLHeterogeneityExplorer.show();else alert('Feature loading...')">ML Explorer</button>
                            <button class="btn btn-info btn-sm" onclick="if(typeof GRADEAssessment!=='undefined')GRADEAssessment.show();else alert('Feature loading...')">GRADE</button>
                            <button class="btn btn-info btn-sm" onclick="if(typeof ResultsInterpreter!=='undefined')ResultsInterpreter.show();else alert('Feature loading...')">Interpret</button>
                        </div>
                    </div>
'''
    if 'Features Exceeding R' not in content:
        # Add after showAllCitations button if it exists
        if 'showAllCitations' in content:
            content = re.sub(
                r'(onclick="showAllCitations\(\)[^"]*"[^>]*>[^<]*</button>)',
                r'\1' + button_html,
                content, count=1
            )
            features_added.append("UI Buttons for R-exceeding features")

    # =========================================================================
    # SAVE
    # =========================================================================
    with open('ipd-meta-pro.html', 'w', encoding='utf-8') as f:
        f.write(content)

    new_len = len(content)
    print("=" * 70)
    print("MORE R-EXCEEDING FEATURES ADDED")
    print("=" * 70)
    print(f"Original: {original_len:,} -> New: {new_len:,} (+{new_len-original_len:,})")
    print(f"\n{len(features_added)} features:")
    for f in features_added:
        print(f"  + {f}")
    print("\n" + "=" * 70)
    print("HOW THESE EXCEED R:")
    print("-" * 70)
    print("""
    1. AUTO METHOD SELECTION - R: manual choice required
    2. COLLABORATION/SHARING - R: no built-in sharing
    3. LIVING REVIEW - R: no tracking over time
    4. ML HETEROGENEITY - R: standard meta-regression only
    5. AUTOMATED GRADE - R: no package does this
    6. PLAIN LANGUAGE - R: outputs numbers only
    7. ONE-CLICK ANALYSIS - R: multiple function calls
    """)
    print("=" * 70)

if __name__ == '__main__':
    add_more_exceed_r()
