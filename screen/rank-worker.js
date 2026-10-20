/* Load the benchmark's exact bytes. Do not inline or replace this core. */
importScripts('h2h/js/rank-core.js');
importScripts('rank-config.js');
self.onmessage = ({data}) => {
  try {
    const started = performance.now(), R = ScreenRank, cfg = ScreenRankConfig;
    if (cfg.engine !== 'u4') throw Error('Unsupported frozen ranking engine.');
    const records = data.records, labels = data.labels, ids = [], y = [];
    records.forEach((r, i) => {
      if (Object.prototype.hasOwnProperty.call(labels, r.id)) {
        const label = labels[r.id];
        if (label !== 0 && label !== 1) throw Error('Labels must be 0 or 1.');
        ids.push(i); y.push(label);
      }
    });
    if (y.filter(v => v === 1).length < 2 || y.filter(v => v === 0).length < 2)
      throw Error('Label at least two relevant and two irrelevant records.');
    let X = R.tfidf(records.map(r => (r.title || '') + ' ' + (r.abstract || '')), R.ELAS_U4);
    let semantic = null;
    if (cfg.embModel !== null && data.embedding) {
      const e = data.embedding;
      if (e.model !== cfg.embModel) throw Error('Embedding model differs from rank-config.js.');
      if (!Number.isInteger(e.dim) || e.dim < 1 || e.values.length !== records.length * e.dim ||
          !Array.from(e.values).every(Number.isFinite) || !Number.isFinite(cfg.embW))
        throw Error('Invalid or incomplete embedding matrix.');
      X = R.appendDense(X, e.values, e.dim, cfg.embW);
      semantic = {model: e.model, dim: e.dim, weight: cfg.embW};
    }
    const model = R.trainSVM(X, ids, y, R.balancedWeights(y, R.ELAS_U4.ratio), R.ELAS_U4.C, {seed: 1});
    const labelled = new Set(ids);
    const ranked = records.map((r, index) => ({id: r.id, index}))
      .filter(r => !labelled.has(r.index) && records[r.index].undecided !== false)
      .map(r => ({...r, score: R.score(X, model, r.index)}))
      .sort((a, b) => b.score - a.score || a.index - b.index);
    postMessage({id: data.id, result: {ranked, config: cfg, semantic, labels: ids.length},
      elapsed: performance.now() - started});
  } catch (e) { postMessage({id: data.id, error: e.message}); }
};
