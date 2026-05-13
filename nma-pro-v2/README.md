# NMA Pro v8.1

Full-featured network meta-analysis platform. Frequentist (Rücker 2012 graph-Laplacian) and Bayesian MCMC analysis with P-scores, SUCRA, league tables, node-splitting, CINeMA, GRADE, publication bias, and meta-regression.

## Tests

```
cd nma-pro-v2
pytest tests/ -q
```

R-parity test (`tests/test_netmeta_compare.py`) validates random-effects NMA estimates (TE.random, seTE.random, P-scores) against `netmeta::netmeta` in R.

## Data format

Long format (pre-computed effects):
```
study,treat1,treat2,yi,sei
Trial1,A,B,-0.20,0.18
```

Binary arm format:
```
study,treatment1,events1,n1,treatment2,events2,n2
Trial1,Drug,15,100,Placebo,25,100
```
