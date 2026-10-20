import {test,expect} from '@playwright/test';
const sha='2b1dc054c82e7ad6cf20456b11bee978416468c1af399383dbbd66b307d5748a';
test('opt-in verifies the real pack, offline inference completes and next refit switches to hybrid',async({page,context})=>{
 test.setTimeout(600000);
 await page.goto('/screen/index.html');
 await page.waitForFunction(()=>!!window.ScreenSpecter);
 const before=await page.evaluate(async()=>await caches.keys());
 expect(before).not.toContain('screen-optional-specter2-v1');
 await page.locator('#fr-demo').click();
 for(const key of ['i','e','e','i'])await page.keyboard.press(key);
 await page.locator('#ux-start-ai').click();
 await page.waitForFunction(()=>ScreenBridge.state().rank.run?.variant==='u4');
 const decisions=await page.evaluate(()=>ScreenBridge.state().records.map(r=>[r.id,r.r1.d]));
 const installed=await page.evaluate(async()=>{
  await ScreenOffline.register();
  const p=await import('./specter2-pack.js');await p.installPack();
  const response=await(await caches.open(p.MODEL_CACHE)).match(p.modelURL);
  const data=await response.arrayBuffer();
  return {bytes:data.byteLength,sha:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('')};
 });
 expect(installed).toEqual({bytes:110115365,sha});
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 // Inference uses only the optional pack and shell caches, including runtime files.
 await context.setOffline(true);
 await page.locator('#specter2-enable').click();
 await page.waitForFunction(()=>!!window.ScreenSpecter.embedding(),null,{timeout:540000});
 expect(await page.evaluate(()=>ScreenBridge.state().rank.run.variant)).toBe('u4');
 await page.evaluate(()=>ScreenRankUI.start());
 await page.waitForFunction(()=>ScreenBridge.state().rank.run?.variant==='u4+specter2');
 const result=await page.evaluate(()=>({run:ScreenBridge.state().rank.run,decisions:ScreenBridge.state().records.map(r=>[r.id,r.r1.d]),embedding:ScreenSpecter.embedding()}));
 expect(result.run.semantic).toMatchObject({model:'specter2',dim:768,weight:.5,packSha:sha});
 expect(result.decisions).toEqual(decisions);
 expect(result.embedding.dim).toBe(768);
});
test('a tampered cached part fails closed and removes the assembled model',async({page})=>{
 test.setTimeout(180000);
 await page.goto('/screen/index.html');
 const outcome=await page.evaluate(async()=>{
  const p=await import('./specter2-pack.js');await p.installPack();
  const cache=await caches.open(p.PACK_CACHE);
  const url=new URL('vendor/semantic/models/specter2/model_quantized.onnx.part01',location.href).href;
  const bytes=new Uint8Array(await(await cache.match(url)).arrayBuffer());bytes[0]^=1;
  await cache.put(url,new Response(bytes));
  let error='';try{await p.installPack();}catch(e){error=e.message;}
  return {error,assembled:!!await(await caches.open(p.MODEL_CACHE)).match(p.modelURL)};
 });
 expect(outcome.error).toContain('SPECTER2 hash mismatch');
 expect(outcome.assembled).toBe(false);
});
