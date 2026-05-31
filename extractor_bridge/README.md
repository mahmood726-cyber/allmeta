# extractor_bridge — malaria/cardio extraction (opt-in, loosely coupled)

Bridges this project to the
[rct-extractor-v2](https://github.com/mahmood726-cyber/rct-extractor-v2)
cardiology/malaria extractor so malaria/cardio topics can be auto-populated from
trial PDFs/abstracts instead of hand entry. **Additive and non-invasive** — it
touches nothing else in this repo and is a no-op when the extractor isn't
present.

## How it works
The extractor turns trial text into a **meta-starter-kit config** (the shared
interchange JSON: `{title, effect_measure, trials:[{name, tE,tN,cE,cN | effect,
ci_low,ci_high}]}`). This project then consumes that config through its existing
pipeline. One JSON contract, loose coupling — no hard dependency either way.

- Cardiology / general text → precomputed effect estimates (`effect, ci_low, ci_high`)
- Malaria binary outcomes → raw 2×2 counts (`tE, tN, cE, cN`)
- Topic is **auto-detected**; the CLI engages only for `malaria,cardiology`.

## Use (CLI)
```bash
set RCT_EXTRACTOR_PATH=C:\Projects\rct-extractor-v2      # or export on bash/mac
python extractor_bridge/extract_meta.py records.json --out config.json
```
`records.json`:
```json
{ "title": "AL vs SP: day-28 ACPR", "effect_measure": "RR", "endpoint": "ACPR",
  "intervention": "artemether-lumefantrine", "comparator": "sulfadoxine-pyrimethamine",
  "records": [ {"name": "TrialA", "pmid": "111", "year": 2019, "text": "ACPR 121/125 (96.8%) in the AL group and 130/148 (87.8%) in the SP group"} ] }
```
The output `config.json` is ready for this project's pipeline (and for
meta-starter-kit's `build.py` directly).
