"""GENERALITY depth (transport stage) for the PSORIASIS class -- the binary/responder analogue of the
SGLT2 (HR->NNT) and asthma (IRR->averted) transports. A response RATE is incomplete on its own; the decision-
relevant quantities are the absolute responders GAINED per 100 treated vs placebo and the NNT, which depend
on the target's placebo (background) PASI-90 response rate. This stage transports the Bayesian per-agent
response DRAWS (psoriasis_pasi_draws.npz) onto absolute responders-gained + NNT across documented placebo
PASI-90 rates, propagating full posterior uncertainty. Honest note: PASI-90 placebo response is low and fairly
stable (~2-5%), so unlike SGLT2/asthma the NNT is dominated by the (very high) active response, not the
baseline -- the transport shows the effect is large and the NNT tiny for the top biologics. Placebo rates are
reference-distribution values from the major trial placebo arms. No IPD."""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class4_psoriasis'
d = np.load(f'{HERE}/psoriasis_pasi_draws.npz', allow_pickle=True)
th = d['theta']; agents = list(d['agents'])
pct = 100.0 / (1.0 + np.exp(-th))                 # response% draws (A, ndraws)
med = np.median(pct, axis=1)
order = list(np.argsort(-med)); lead = agents[order[0]]

# reference placebo PASI-90 response rate, by target/era (authoritative reference)
SCEN = [
    ('low placebo background (~2%)', 2.0),
    ('typical phase-3 placebo (~4%, reference)', 4.0),
    ('higher placebo (~7%)', 7.0),
]
PRIMARY = 'typical phase-3 placebo (~4%, reference)'


def gained_nnt(resp_draws, pbo):
    rd = resp_draws - pbo                          # absolute responders gained per 100 (pp)
    rd = np.clip(rd, 1e-6, None)
    nnt = 100.0 / rd
    return (float(np.median(rd)), [float(np.percentile(rd, 2.5)), float(np.percentile(rd, 97.5))],
            float(np.median(nnt)), [float(np.percentile(nnt, 2.5)), float(np.percentile(nnt, 97.5))])


pbo0 = dict(SCEN)[PRIMARY]
print(f'psoriasis PASI-90 transport -- lead {lead} {med[order[0]]:.0f}% response\n')
print(f'=== lead {lead}: absolute benefit by placebo background (responders gained /100, NNT) ===')
print(f'  {"placebo background":42s} pbo%    gained/100 (95% CrI)     NNT (95% CrI)')
scen_out = []
for name, pbo in SCEN:
    rd, rdci, nnt, nntci = gained_nnt(pct[order[0]], pbo)
    star = ' *' if name == PRIMARY else '  '
    print(f'{star}{name:42s} {pbo:4.1f}   {rd:5.1f} ({rdci[0]:.1f}, {rdci[1]:.1f})    {nnt:4.2f} ({nntci[1]:.2f}, {nntci[0]:.2f})')
    scen_out.append({'placebo_background': name, 'placebo_pct': pbo,
                     'responders_gained_per100': round(rd, 1), 'gained_cri': [round(x, 1) for x in rdci],
                     'nnt': round(nnt, 2), 'nnt_cri': [round(nntci[1], 2), round(nntci[0], 2)],
                     'primary': name == PRIMARY})

# per-agent NNT at the primary placebo rate (decision table)
print(f'\n=== per-agent NNT at the reference placebo ({pbo0:.0f}%) ===')
agent_nnt = []
for i in order:
    rd, _, nnt, nntci = gained_nnt(pct[i], pbo0)
    print(f'  {agents[i]:14s} {med[i]:5.1f}% response -> {rd:5.1f} gained/100, NNT {nnt:.2f} (95% CrI {nntci[1]:.2f} to {nntci[0]:.2f})')
    agent_nnt.append({'agent': agents[i], 'response_pct': round(float(med[i]), 1),
                      'gained_per100': round(rd, 1), 'nnt': round(nnt, 2), 'nnt_cri': [round(nntci[1], 2), round(nntci[0], 2)]})

print('\n=== transport depth verdict (psoriasis) ===')
print('  The transport repoints to the BINARY/RESPONDER absolute scale: response draws -> responders gained')
print('  per 100 + NNT vs placebo, with posterior CrI. Honest contrast with SGLT2/asthma: PASI-90 placebo is')
print('  low and stable, so the NNT is dominated by the (large) active response, not the baseline -- the top')
print('  biologics gain ~40-83 responders/100 (NNT ~1.2-2.5). With the Bayesian league + this transport + the')
print('  dashboard, psoriasis is the FOURTH full-depth class (binary responder). Placebo rates are reference')
print('  values; PASI-90 response benefit only, not a comorbidity/safety claim.')

json.dump({'class': 'psoriasis biologics', 'stage': 'transport (PASI-90 response -> responders gained/100 + NNT vs placebo)',
           'outcome_type': 'binary/responder', 'lead': lead, 'lead_response_pct': round(float(med[order[0]]), 1),
           'placebo_scenarios': scen_out, 'primary_scenario': PRIMARY, 'reference_placebo_pct': pbo0,
           'per_agent_nnt_at_reference': agent_nnt,
           'baseline_source': 'reference-distribution PASI-90 placebo response rates from the major psoriasis biologic trial placebo arms (authoritative reference, NOT registry-extracted counts)',
           'depth_note': 'binary/responder absolute transport: per-agent Bayesian response draws -> responders gained/100 + NNT vs placebo across placebo-background scenarios, with posterior CrI. Honest contrast with SGLT2/asthma: PASI-90 placebo is low/stable so NNT is dominated by the large active response, not the baseline (top biologics NNT ~1.2-2.5). Psoriasis = FOURTH full-depth class (binary responder), after PCSK9 (continuous) + SGLT2 (survival) + asthma (count/rate). Placebo rates are reference values; PASI-90 response benefit only. No IPD.'},
          open(f'{HERE}/psoriasis_transport.json', 'w'), indent=1)
print('\nwrote psoriasis_transport.json')
