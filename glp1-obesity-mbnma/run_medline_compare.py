"""REAL literature arm: an independent MEDLINE (PubMed) search vs the registry-native cohort.
Maps the 200 MEDLINE hits to NCTs via AACT study_references and asks: of our registry cohort,
how many would a real MEDLINE search actually find? The ones it misses = registry-native advantage.
PubMed abstracts only.
"""
import io, sys, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import pandas as pd
from aact_kit import load_table, location_from_path

ROOT = r'C:/Projects/glp1-doseresp-nma/glp1-obesity-mbnma'
LOC = location_from_path(r'C:/Users/mahmo/AACT/20260601_pipe-delimited-export.zip')

MEDLINE = set("""33567185 33755728 38078870 33667417 35658024 38912654 39536238 37952131 35441470 33625476 39555826 39476339 36216945 35015037 40353578 37366315 40934115 37385275 36322838 38819983 40960239 40421736 40544433 39996356 40961952 38740993 37385278 37622681 40550013 36857477 38587233 35131037 38330988 38599221 28266779 40544432 37840095 37351564 38796653 39455729 39222642 30473097 37369232 30122305 39089293 38330987 40279144 39181597 34798060 40203836 33269530 38858523 39566869 40183678 40900607 39217567 36121652 38640145 40031941 34370970 38092790 37364710 40609566 40713699 36655300 33894838 41138739 32441473 38819334 29246950 31539622 39217564 38907683 40758358 41284285 39556714 33184979 40537987 39084707 40961953 40069849 38447814 40506208 41335431 39948761 40162940 40825340 39217565 39497468 40555748 40365662 40774158 34127852 39858442 39848268 39551891 38913003 37196421 40321113 38907684 28941314 41328546 31897524 40481478 39800653 34608929 40701669 37932236 34514682 40956259 39511836 38996661 40539310 39082206 40677091 41264593 41275875 39226070 41135142 41109426 40341357 38698650 30993900 41540105 41187967 40694530 40189961 40832785 40490415 39609879 40550133 39789843 41218611 42070571 41045908 40903131 40858971 41187971 41433034 39824696 40717199 42009015 40916752 39217559 36511825 38913004 38739118 39821928 37605636 39121301 36905345 33462955 41212463 41216778 40649729 40437798 37311722 39797878 40629530 40251452 41017451 40267365 40903801 41290376 41811277 40083081 41885866 39756397 40767101 40329666 40556483 41391569 41875890 41296499 40452267 39840511 41183340 41198460 38803303 41865857 37700443 34217774 41290555 37158751 40886061 41429002 37696925 41833222 36876594 39171608 41928037 34881835 41513169 36004653 37055712 38091192 41187013 42082865 41597327 41876542""".split())

cand = pd.read_csv(f'{ROOT}/candidates.csv')
arms = pd.read_csv(f'{ROOT}/arms_full.csv')
cohort = set(cand.nct)
analysed = set(arms.nct)
GHOSTS = {'NCT04779697', 'NCT04969939', 'NCT05093205', 'NCT05144984', 'NCT05579249', 'NCT06041217'}

sr = load_table('study_references', location=LOC, columns=['nct_id', 'pmid', 'reference_type'])
sr = sr[sr.nct_id.isin(cohort) & sr.pmid.notna()].copy()
sr['pmid'] = sr['pmid'].astype('Int64').astype(str)
nct_pmids = sr.groupby('nct_id')['pmid'].apply(set).to_dict()

rows = []
for nct in sorted(cohort):
    pmids = nct_pmids.get(nct, set())
    found = bool(pmids & MEDLINE)
    rows.append({'nct': nct, 'in_analysis': nct in analysed, 'ghost': nct in GHOSTS,
                 'linked_pmids': len(pmids), 'medline_found': found})
df = pd.DataFrame(rows)

n = len(cohort)
found = df.medline_found.sum()
miss = df[~df.medline_found]
print(f'=== REAL MEDLINE search vs registry cohort ({n} trials) ===')
print(f'MEDLINE hits (RCT, post-2010, incretin+obesity+weight): 200 publications')
print(f'registry-cohort trials a real MEDLINE search FINDS (linked PMID in results): {found}/{n}')
print(f'registry-cohort trials MEDLINE MISSES: {n-found}/{n}  (the registry-native advantage)')
print(f'\n=== what MEDLINE misses (registry-only) ===')
print(f'  unpublished ghosts: {miss.ghost.sum()} (no publication to find)')
print(f'  published-but-not-found-by-search: {(~miss.ghost & (miss.linked_pmids>0)).sum()} '
      f'(linked paper exists but not under obesity+weight+RCT -- e.g. T2D papers indexed as diabetes)')
print(f'  no AACT publication link at all: {(~miss.ghost & (miss.linked_pmids==0)).sum()}')
miss_an = miss[miss.in_analysis]
print(f'\nOf the {df.in_analysis.sum()} trials IN our analysis, MEDLINE would miss {(~df[df.in_analysis].medline_found).sum()}:')
print(miss_an[['nct', 'ghost', 'linked_pmids']].to_string(index=False))

df.to_csv(f'{ROOT}/medline_compare.csv', index=False)
json.dump({'medline_hits': 200, 'cohort': n, 'medline_found': int(found),
           'registry_only': int(n - found), 'ghosts_unfindable': int(miss.ghost.sum()),
           'published_not_found': int((~miss.ghost & (miss.linked_pmids > 0)).sum())},
          open(f'{ROOT}/medline_compare.json', 'w'), indent=1)
print('\nwrote medline_compare.csv / .json')
