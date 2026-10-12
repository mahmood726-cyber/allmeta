"""Guarded follow-up based on actual browser failure after loading a new example."""
from pathlib import Path
p=Path('IPD-Meta-Pro/src/diagnostic-plots.js')
t=p.read_text()
old="""    const cfg=networkOutcomeConfig();
    if(cfg.outcomeType==='survival')throw new Error('Net Heat needs compatible study contrasts. This adapter supports continuous mean differences or binary log odds ratios, not conversion of censored survival data to binary outcomes.');
    const trtVar=networkResolveTreatmentVar(),studyVar=APP.config.studyVar||'study_id';"""
new="""    // Loading a dataset updates the input controls before a fitted APP.config
    // exists. Resolve the current controls, without rewriting saved settings.
    const cfg={
      outcomeType:document.getElementById('outcomeType')?.value || APP.config.outcomeType,
      outcomeVar:document.getElementById('varEvent')?.value || APP.config.eventVar || APP.config.outcomeVar
    };
    if(cfg.outcomeType==='survival')throw new Error('Net Heat needs compatible study contrasts. This adapter supports continuous mean differences or binary log odds ratios, not conversion of censored survival data to binary outcomes.');
    if(!['continuous','binary'].includes(cfg.outcomeType)||!cfg.outcomeVar)throw new Error('Select a continuous or binary outcome and its variable in Data & Setup.');
    if(APP.data.some(row=>row[cfg.outcomeVar]===null||row[cfg.outcomeVar]===undefined||String(row[cfg.outcomeVar]).trim()===''||!finite(Number(row[cfg.outcomeVar]))||(cfg.outcomeType==='binary'&&![0,1].includes(Number(row[cfg.outcomeVar])))))throw new Error('The selected outcome contains missing or invalid values. Binary outcomes must be coded 0 or 1; missing outcomes are not treated as non-events.');
    let trtVar=document.getElementById('varTreatment')?.value || APP.config.treatmentVar || 'treatment_name';
    const distinct=key=>new Set(APP.data.map(row=>row[key]).filter(v=>v!==undefined&&v!==null)).size;
    if(distinct(trtVar)<3&&distinct('treatment_name')>=3)trtVar='treatment_name';
    const studyVar=document.getElementById('varStudy')?.value || APP.config.studyVar || 'study_id';"""
assert t.count(old)==1
t=t.replace(old,new,1)
p.write_text(t)
print('Net Heat uses current input controls and validates actual outcomes, with no configuration mutation.')
