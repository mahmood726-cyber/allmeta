// ?presets=1 opts the panel in to journal presets and colour modes; otherwise the default panel.
(function () {
  var presets = /[?&]presets=1\b/.test(location.search);
  var opts = {
    target: '#exports', basename: 'example',
    plots: [['chart', 'chart'], ['small', 'small'], ['tall', 'tall']].map(function (p) {
      return { id: p[0], name: p[1], getSvg: function () { return document.getElementById(p[0]); } };
    })
  };
  if (presets) opts.presets = true;
  window.alm.plotExport(opts);
})();
