"""GENERALITY depth (transport stage) for the RA class -- the ORDINAL analogue of the SGLT2 (HR->NNT),
asthma (IRR->averted), and psoriasis (response->NNT) transports, on the clinically standard ACR50 threshold.
A latent ordinal efficacy is not a decision quantity; the decision-relevant numbers are the ACR50 responders
GAINED per 100 treated vs placebo and the NNT, which depend on the target's placebo (background) ACR50 rate.
This stage transports the per-agent predicted-ACR50 DRAWS (from ra_acr_draws.npz: invlogit(theta - tau_50))
onto absolute responders-gained + NNT across documented placebo ACR50 rates, propagating full posterior
uncertainty. Honest note: RA placebo ACR50 is meaningfully non-trivial (~5-15%, higher with background MTX),
so -- unlike psoriasis -- the baseline DOES move the NNT here, the ordinal analogue of the SGLT2/asthma
baseline-risk story. Placebo rates are reference-distribution values from the major RA-trial placebo arms.
No IPD."""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import numpy as np

HERE = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma/class6_ra'
LEVELS = [20, 50, 70]; li = {lv: i for i, lv in enumerate(LEVELS)}
d = np.load(f'{HERE}/ra_acr_draws.npz', allow_pickle=True)
th = d['theta']; ta = d['tau']; agents = list(d['agents'])
acr50 = 100.0 / (1.0 + np.exp(-(th - ta[li[50]])))            # predicted ACR50% draws (A, ndraws)
med = np.median(acr50, axis=1)
order = list(np.argsort(-med)); lead = agents[order[0]]

# reference placebo ACR50 response rate, by background therapy (authoritative reference)
SCEN = [
    ('low placebo ACR50 (~5%, monotherapy)', 5.0),
    ('typical placebo ACR50 (~10%, +MTX, reference)', 10.0),
    ('higher placebo ACR50 (~15%)', 15.0),
]
PRIMARY = 'typical placebo ACR50 (~10%, +MTX, reference)'


def gained_nnt(resp_draws, pbo):
    rd = np.clip(resp_draws - pbo, 1e-6, None)                # ACR50 responders gained per 100 (pp)
    nnt = 100.0 / rd
    return (float(np.median(rd)), [float(np.percentile(rd, 2.5)), float(np.percentile(rd, 97.5))],
            float(np.median(nnt)), [float(np.percentile(nnt, 2.5)), float(np.percentile(nnt, 97.5))])


pbo0 = dict(SCEN)[PRIMARY]
print(f'RA ACR50 transport -- lead {lead} {med[order[0]]:.0f}% ACR50\n')
print(f'=== lead {lead}: absolute ACR50 benefit by placebo background (responders gained /100, NNT) ===')
print(f'  {"placebo background":48s} pbo%    gained/100 (95% CrI)     NNT (95% CrI)')
scen_out = []
for name, pbo in SCEN:
    rd, rdci, nnt, nntci = gained_nnt(acr50[order[0]], pbo)
    star = ' *' if name == PRIMARY else '  '
    print(f'{star}{name:48s} {pbo:4.1f}   {rd:5.1f} ({rdci[0]:.1f}, {rdci[1]:.1f})    {nnt:4.2f} ({nntci[0]:.2f}, {nntci[1]:.2f})')
    scen_out.append({'placebo_background': name, 'placebo_pct': pbo,
                     'responders_gained_per100': round(rd, 1), 'gained_cri': [round(x, 1) for x in rdci],
                     'nnt': round(nnt, 2), 'nnt_cri': [round(nntci[0], 2), round(nntci[1], 2)],
                     'primary': name == PRIMARY})

print(f'\n=== per-agent ACR50 NNT at the reference placebo ({pbo0:.0f}%) ===')
agent_nnt = []
for i in order:
    rd, _, nnt, nntci = gained_nnt(acr50[i], pbo0)
    print(f'  {agents[i]:14s} {med[i]:5.1f}% ACR50 -> {rd:5.1f} gained/100, NNT {nnt:.2f} (95% CrI {nntci[0]:.2f} to {nntci[1]:.2f})')
    agent_nnt.append({'agent': agents[i], 'acr50_pct': round(float(med[i]), 1),
                      'gained_per100': round(rd, 1), 'nnt': round(nnt, 2), 'nnt_cri': [round(nntci[0], 2), round(nntci[1], 2)]})

print('\n=== transport depth verdict (RA) ===')
print('  The transport repoints the ORDINAL ladder onto the ACR50 absolute scale: predicted-ACR50 draws ->')
print('  responders gained/100 + NNT vs placebo, with posterior CrI. Unlike psoriasis, RA placebo ACR50 is')
print('  non-trivial and background-MTX-dependent, so the baseline moves the NNT -- the ordinal echo of the')
print('  SGLT2/asthma baseline-risk story. With the proportional-odds league + this transport + the dashboard,')
print('  RA is the FIFTH full-depth class (ordinal). Placebo rates are reference values; ACR50 response only.')

json.dump({'class': 'rheumatoid-arthritis biologics/JAK',
           'stage': 'transport (predicted ACR50 -> responders gained/100 + NNT vs placebo)',
           'outcome_type': 'ordinal/ordered-categorical', 'threshold': 'ACR50', 'lead': lead,
           'lead_acr50_pct': round(float(med[order[0]]), 1),
           'placebo_scenarios': scen_out, 'primary_scenario': PRIMARY, 'reference_placebo_pct': pbo0,
           'per_agent_nnt_at_reference': agent_nnt,
           'baseline_source': 'reference-distribution ACR50 placebo response rates from the major RA-biologic/JAK trial placebo arms (authoritative reference, NOT registry-extracted counts)',
           'depth_note': 'ordinal absolute transport: per-agent predicted-ACR50 Bayesian draws -> responders gained/100 + NNT vs placebo across placebo-background (MTX-dependent) scenarios, with posterior CrI. RA placebo ACR50 is non-trivial so the baseline moves the NNT (the ordinal echo of the SGLT2/asthma baseline-risk story), unlike psoriasis. RA = FIFTH full-depth class (ordinal), after PCSK9 (continuous) + SGLT2 (survival) + asthma (count/rate) + psoriasis (binary). Placebo rates are reference values; ACR50 response benefit only. No IPD.'},
          open(f'{HERE}/ra_transport.json', 'w'), indent=1)
print('\nwrote ra_transport.json')
