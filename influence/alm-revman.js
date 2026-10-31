(function(global){
  'use strict';
  const A=global.AlmRevman||(typeof require==='function'?require('../shared/alm-revman.js'):null);
  const api=A.genericAdapter({joinLabel:true,defaultLabel:'Study '});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(global.AlmFeatures&&typeof document!=='undefined')A.install('influence',api);
})(typeof window!=='undefined'?window:globalThis);
