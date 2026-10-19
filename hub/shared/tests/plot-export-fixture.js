window.mountPlots = function (getReceiptInput) {
  window.alm.plotExport({
    target: '#exports', basename: 'example', getReceiptInput,
    plots: ['forest', 'funnel', 'sensitivity'].map(id => ({
      id, name: id, getSvg: () => document.querySelector('#chart')
    }))
  });
};
window.mountPlots();
window.alm.chartDownload({ target: '#legacy', basename: 'legacy', getSvg: () => document.querySelector('#chart') });
