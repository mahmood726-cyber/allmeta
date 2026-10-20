// The model digest is pinned independently of the downloaded manifest.
export const MODEL_SHA = '2b1dc054c82e7ad6cf20456b11bee978416468c1af399383dbbd66b307d5748a';
export const REVISION = '3447645e1def9117997203454fa4495937bfbd83';
export const PACK_CACHE = 'screen-optional-specter2-v1';
export const MODEL_CACHE = 'transformers-cache';
const base = new URL('./vendor/semantic/models/specter2/', import.meta.url);
export const modelURL = new URL('onnx/model_quantized.onnx', base).href;
const sha = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b=>b.toString(16).padStart(2,'0')).join('');
async function verify(bytes, spec, name) {
  if (bytes.byteLength !== spec.bytes || await sha(bytes) !== spec.sha256)
    throw Error('SPECTER2 hash mismatch: '+name+'. Model disabled; reconnect and retry.');
}
export async function installPack(progress = ()=>{}) {
  const pack = await caches.open(PACK_CACHE), models = await caches.open(MODEL_CACHE);
  async function get(url) {
    const response = await pack.match(url) || await fetch(url);
    if (!response.ok) throw Error('SPECTER2 download failed: '+url);
    return response;
  }
  try {
    const manifestURL = new URL('parts.json',base).href;
    const manifestResponse = await get(manifestURL), manifest = await manifestResponse.clone().json();
    if (manifest.file !== 'model_quantized.onnx' || manifest.bytes !== 110115365 ||
        manifest.sha256 !== MODEL_SHA || !Array.isArray(manifest.parts) || manifest.parts.length !== 2)
      throw Error('SPECTER2 hash mismatch: invalid pinned manifest.');
    const joined = new Uint8Array(manifest.bytes);
    let offset = 0;
    for (const [i, part] of manifest.parts.entries()) {
      if (part.name !== 'model_quantized.onnx.part'+String(i).padStart(2,'0') ||
          !Number.isInteger(part.bytes) || part.bytes <= 0 || part.bytes >= 95000000 ||
          offset + part.bytes > joined.length) throw Error('Invalid SPECTER2 part manifest.');
      const url = new URL(part.name,base).href, response = await get(url);
      const bytes = await response.clone().arrayBuffer();
      await verify(bytes,part,part.name);
      joined.set(new Uint8Array(bytes),offset); offset += bytes.byteLength;
      await pack.put(url,response);
      progress(offset,manifest.bytes);
    }
    await verify(joined,manifest,manifest.file);
    if (offset !== joined.length) throw Error('Incomplete SPECTER2 pack.');
    await models.put(modelURL,new Response(joined,{headers:{'Content-Type':'application/octet-stream'}}));
    // Tokenizer/config/runtime are optional too; cache them only during opt-in.
    for (const name of ['config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json','vocab.txt','export_provenance.json','LICENSE']) {
      const url = new URL(name,base).href; await pack.put(url,await get(url));
    }
    for (const name of ['transformers.min.js','ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm']) {
      const url = new URL('./vendor/semantic/'+name,import.meta.url).href;
      await pack.put(url,await get(url));
    }
    await pack.put(manifestURL,manifestResponse);
    return {sha256:MODEL_SHA,revision:REVISION};
  } catch (error) {
    await models.delete(modelURL);
    await caches.delete(PACK_CACHE);
    throw error;
  }
}
