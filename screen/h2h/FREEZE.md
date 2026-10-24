# FREEZE: the Screen candidate for the held-out run

Frozen 2026-10-21, before any held-out run of either tool, under PROTOCOL.md (registered `24f04f3`, Amendment 1
`d069c77`). `FREEZE.json` holds the machine-checked part: `run_heldout.py` refuses a held-out Screen run whose
rank-core.js, config or runner arguments differ from it, and `analyze.py --screen-freeze-json FREEZE.json`
refuses any result whose ranker settings or embedding recipe differ from it.

## The candidate

**ELAS u4 port + SPECTER2, weight 0.5**: `rank-core.js` (TF-IDF 1-2 grams, sublinear, min_df 1, max_df 0.95;
squared-hinge linear SVM C = 0.11; balanced weighting ratio 9.8; Max query; refit after every record), with an
L2-normalised SPECTER2 embedding of each record appended to its TF-IDF row with weight 0.5
(`appendDense(X, E, 768, 0.5)`).

## How it was chosen (DEV only)

- About 37 configurations at 3 seeds on the 18 DEV reviews that have registered starting records, then 10 seeds for
  the leaders. DEV is where ASReview's u4 was tuned (in-sample for u4). No held-out review was run or embedded.
- The selection rule was written down **before** the deciding runs finished (lane STATUS, 2026-10-20, after the
  results review `reviews/R2_results.md`): freeze SPECTER2 own-export w0.5 if, on 18/18 DEV reviews at 10 seeds, the
  mean difference vs u4 is >= +0.02 and the worst review is >= -0.03; else PubMedBERT own-export w0.35 under the same
  conditions; else the plain u4 port.
- Result on our own export (the shipped weights): mean WSS@95 difference vs the u4 port **+0.0433** (SD 0.062,
  16 of 18 reviews higher, worst review -0.0026). PubMedBERT w0.35 also qualified (+0.0407, worst -0.022).
- This DEV gain is optimistic (selection among many configurations; u4 in-sample). The results review's estimate of
  the held-out difference is about +0.02 (plausible -0.005 to +0.04). It is not a prediction.
- Why an embedding candidate rather than the plain port: the plain port reproduces ASReview's order (22 of 24 DEV
  runs identical), so it would almost certainly pass H1 and almost certainly fail H2. The embedding candidate was
  chosen knowingly to give H2 a chance, at a small extra risk to H1.

## Pinned files (sha256)

| File | sha256 |
|---|---|
| `h2h/js/rank-core.js` | 15b243065a14ecc6ce11ff3cc128d6bfa70b648a25f95116047245314100f252 |
| `h2h/js/run_js.mjs` | 4cf8e9102ea45463ca8e4c820351f674c4fbae580205a0b9a05dce827dc51e1f |
| `h2h/run_heldout.py` | b252d2f1764e9bb94f137ffcce86f1c85fed66226a69002cf2c21eadab0587ce |
| `h2h/analyze.py` | b74174748a636f6c4152891fcf836d3e539dd66c89c6c4f824e043b6630c5d54 |
| `h2h/core.py` | ee1155f570c34244c5e29dae92852f0adc93db6f3a937db28d60a8e6123adb4c |
| `h2h/run_asreview_h2h.py` | 21531e223ed8a229cf3f3fbc575a3854413235c3fc10920e9b104f1990ac4d7c |
| `bench/extract.mjs` | e08c4b1ec8e42175d628144357840e518264a3f54a7cd4eae50ca9294bfe440c |
| `h2h/embed/embed.mjs` | 4a3b5bce7e9f37606dc9b223d44ff1c8b52b526c2debf91bfb9eb769a4c9f66f |
| `h2h/embed/embed_many.mjs` | ec52ae39d5023a7956400fd0f1d1a07959542bbbdcbacd5478be77d21c2d90a9 |
| `h2h/embed/convert_onnx.py` | 7bb90e0604894127083403c039d029ceeb5baa20717fa38a0578145699c2a232 |
| `h2h/embed/package-lock.json` | ce0573f986cf563dc57c9a703b7ed5437560c6cd77f9e547def1e1a504661d0e |
| `h2h/PROTOCOL.md` (with Amendment 1) | 9abceff7ec0e5db5e850ac22c69f94b268a07a0aa9f9a8cc64cdab0a28dd3866 |

## Embedding model

- Source: `allenai/specter2_base` (Apache-2.0), revision `3447645e1def9117997203454fa4495937bfbd83`, base encoder,
  no adapter. Exported by us (`h2h/embed/convert_onnx.py`: optimum 2.1.0 / optimum-onnx 0.1.0,
  `--task feature-extraction --opset 14`, torch 2.14.1+cpu; onnxruntime 1.31.0 `quantize_dynamic` QInt8,
  per_channel False, reduce_range False). The third-party ONNX repositories tried during DEV declare no licence and
  are not used.

| Model file | sha256 |
|---|---|
| `onnx/model_quantized.onnx` (110,115,365 bytes) | 2b1dc054c82e7ad6cf20456b11bee978416468c1af399383dbbd66b307d5748a |
| `config.json` | adf9c6d581779a663b417eb96c170fad386ae0b458779fc60bed0778cde13c28 |
| `tokenizer.json` | fcd3fffca5d8fcc0d5863406f5f491293c1e4658ed503f424a30324b70533c0d |
| `tokenizer_config.json` | 12f6e662380b1c3a0c0a9b5005a2669f9c8247a1991a033e610d7a7b88f90fea |
| `special_tokens_map.json` | 5aa43c2f985a25296d5a5ce621c2f77376ca8091a47993c492fd5460b895b140 |
| `vocab.txt` | f0a650346e51ede8996710f79ba65d83fdb8da05b159f17037b74ba4e3a36c6f |
| `export_provenance.json` | 436426fca2e9989ba273011666fc9a048bd9c866829f57f4a828c2917b787c68 |

- Recipe: text `title + ". " + abstract` (no prefix), truncated at 256 tokens by setting
  `tokenizer.model_max_length = 256` (SPECTER2 ships 1e30), CLS pooling, L2 normalisation, q8, CPU, batches of 32
  consecutive records in CSV order. Runtime: Transformers.js 3.8.1, onnxruntime-node 1.21.0, Node v24.15.0, Windows x64
  (`h2h/embed/package-lock.json`).
- Held-out embeddings are computed once, with exactly this pipeline (`embed_many.mjs`, `--dtype q8 --device cpu
  --prefix "" --pooling cls --max-tokens 256 --batch 32`), into `C:/h2h/emb/specter2-own-heldout`, before the Screen
  held-out run; their sha256s are archived with the results. They use no labels.

## The browser app

Screen at allmeta commit `f57f6023d9425abf427a26cb345b672d21fce05c` (branch `feat/screen-rankcore-browser`) loads the
same `rank-core.js` bytes through `screen/rank-worker.js`; `screen/rank-config.js` =
`{engine:'u4', embModel:'specter2', embW:0.5, pooling:'cls', maxTokens:256, prefix:''}`. Its model pack holds the files
above (the ONNX as two sha-verified parts); GitHub serves them with these hashes (checked 2026-10-20).

Measured parity (DEV Donners_2021 and Smid_2019; host-run tools in `screen/tests/`):
- Embeddings from the pack, through Transformers.js in **Node**, equal the benchmark vectors bit for bit over whole
  batches (max abs difference 0). q8 dynamic quantisation makes a vector depend on the padding of its batch: a
  partial batch differed (min cosine 0.995). The app therefore matches the benchmark exactly only when it embeds the
  same 32-record batches; otherwise vectors differ at about that level.
- A full screening session with the app's refit logic (refit from scratch after each decision) gives the same order as
  `rank-core.js`'s warm-started `simulate` (no divergence), with and without the embedding block.
- **Not measured:** the browser's own runtime (onnxruntime-web, WASM or WebGPU) against Node. The held-out numbers
  are those of the Node pipeline above.

## Known differences from a real user's session (disclosed, not tested)

The benchmark simulates a reviewer who labels every record in ranked order from the shared 2+2 start and refits
after every record. In the app, ranking with SPECTER2 starts only after all records are embedded (the plain u4 port
ranks until then), and a user may label out of order. Neither affects the held-out comparison, which runs the
ranker, not the UI.
