/* Build input for ../rve-eigen.js; run build-rve-eigen.cjs after editing.
 * R eigen dispatch and the existing webR reference BLAS/LAPACK binaries.
 * See RVE-EIGEN.md for provenance and the numerical contract, and
 * LICENSES-rve-eigen.md for the licences of the embedded binaries.
 */
(function (global) {
  'use strict';
  var payloads = /* EMBED_LAPACK */ null;
  // Per side module: data slot and table slots. build-rve-eigen.cjs asserts
  // that each payload's dylink.0 memory and table sizes fit these slots.
  var DATA_SLOT = 16384, TABLE_SLOT = 3, DATA_ALIGN_LOG2 = 4;
  var UNAVAILABLE = 'RVE: CR2 requires WebAssembly (blocked or unavailable)';
  var LOADING = 'RVE: CR2 eigen backend is still loading; retry when AlmRVEEigen.ready resolves';
  var backend = null, failure = null, loading = false;

  // C lround/lroundf: round half away from zero. x - trunc(x) is exact.
  function roundHalfAway(x) {
    var r = Math.trunc(x);
    return Math.abs(x - r) >= 0.5 ? r + Math.sign(x) : r;
  }
  // compiler-rt __powidf2: repeated squaring in binary64, reciprocal last.
  function powidf2(a, b) {
    var recip = b < 0, r = 1;
    for (;;) {
      if (b & 1) r *= a;
      b = (b / 2) | 0;
      if (b === 0) break;
      a *= a;
    }
    return recip ? 1 / r : r;
  }
  function refused(name) {
    return function () { throw new Error('RVE: unsupported LAPACK runtime call ' + name); };
  }
  // C/Fortran runtime calls of the eigensolver paths. Every other function
  // import must be an export of an earlier side module (BLAS for LAPACK).
  var RUNTIME = {
    pow: Math.pow, cos: Math.cos, sin: Math.sin, atan2: Math.atan2,
    log: Math.log, log10: Math.log10,
    // IPARMQ uses LOG(REAL(NH)) for NH >= 150 when tuning DGEEV's QR path.
    // Preserve the Fortran REAL (binary32) argument and result conversions.
    // https://www.netlib.org/lapack/explore-html/dd/da2/iparmq_8f_source.html
    logf: function (x) { return Math.fround(Math.log(Math.fround(x))); },
    // Fortran NINT / C lroundf rounds halfway cases away from zero.
    lroundf: function (x) { return roundHalfAway(Math.fround(x)); },
    lround: roundHalfAway,
    __powidf2: powidf2
  };
  // Present in the pinned imports but outside the real eigensolver paths
  // (error reporting, complex arithmetic, C++/Fortran runtime set-up).
  var REFUSED = ['xerbla_', 'cabs', 'csqrt', '__divdc3', '__muldc3', '_ZNSt9exceptionD2Ev',
    '__cxa_atexit', 'pthread_mutex_init', 'pthread_mutex_destroy', 'vfprintf', 'abort'];
  // Data symbols with no definition. They are bound to a guard block of 0xFF
  // bytes: loaded pointers and table indices trap, and writes are detected.
  var GUARDED = ['_ZTVSt18bad_variant_access', '_ZTVSt9exception', 'stderr'];
  var GUARD_BYTES = 64;

  function readLEB(bytes, at) {
    var value = 0, shift = 0, b;
    do { b = bytes[at.i++]; value += (b & 127) * Math.pow(2, shift); shift += 7; } while (b & 128);
    return value;
  }
  // dylink.0 WASM_DYLINK_MEM_INFO (subsection 1): memory size/alignment and
  // table size/alignment of a position-independent side module.
  function dylinkMemInfo(module) {
    var sections = WebAssembly.Module.customSections(module, 'dylink.0');
    if (sections.length !== 1) throw new Error('RVE: LAPACK side module lacks dylink.0');
    var bytes = new Uint8Array(sections[0]), at = {i: 0};
    while (at.i < bytes.length) {
      var type = bytes[at.i++], size = readLEB(bytes, at), end = at.i + size;
      if (type === 1) {
        var info = {memorySize: readLEB(bytes, at), memoryAlign: readLEB(bytes, at),
          tableSize: readLEB(bytes, at), tableAlign: readLEB(bytes, at)};
        if (info.memorySize > DATA_SLOT || info.memoryAlign > DATA_ALIGN_LOG2 ||
            info.tableSize > TABLE_SLOT || info.tableAlign > 0)
          throw new Error('RVE: LAPACK side module exceeds its loader slot');
        return info;
      }
      at.i = end;
    }
    throw new Error('RVE: LAPACK side module lacks dylink.0 memory info');
  }

  function decode(encoded) {
    return Uint8Array.from(atob(encoded), function (x) { return x.charCodeAt(0); });
  }

  // Links the side modules in order. imports() is called before each
  // instantiation and record() after it, so sync and async loading share it.
  function createLinker() {
    var memory = new WebAssembly.Memory({initial: 512});
    var stack = new WebAssembly.Global({value: 'i32', mutable: true}, 16 * 1024 * 1024);
    var table = new WebAssembly.Table({initial: 32, element: 'anyfunc'});
    var exported = Object.create(null), got = {}, dataBase = 1024, tableBase = 1;
    var guard = 512;
    new Uint8Array(memory.buffer, guard, GUARD_BYTES).fill(255);
    var runtime = Object.assign({
      memcmp: function (a, b, n) {
        var u = new Uint8Array(memory.buffer);
        for (var i = 0; i < n; i++) if (u[a+i] !== u[b+i]) return u[a+i] - u[b+i];
        return 0;
      }
    }, RUNTIME);
    return {
      imports: function (module) {
        dylinkMemInfo(module);
        var env = {memory: memory, __stack_pointer: stack, __indirect_function_table: table,
          __memory_base: dataBase, __table_base: tableBase};
        WebAssembly.Module.imports(module).forEach(function (imp) {
          if (imp.module === 'GOT.mem') {
            if (!got[imp.name]) got[imp.name] = new WebAssembly.Global({value: 'i32', mutable: true}, 0);
          } else if (imp.module !== 'env') {
            throw new Error('RVE: unknown LAPACK import ' + imp.module + '.' + imp.name);
          } else if (imp.kind === 'function') {
            if (Object.prototype.hasOwnProperty.call(runtime, imp.name)) env[imp.name] = runtime[imp.name];
            else if (typeof exported[imp.name] === 'function') env[imp.name] = exported[imp.name];
            else if (REFUSED.indexOf(imp.name) >= 0) env[imp.name] = refused(imp.name);
            else throw new Error('RVE: unknown LAPACK import ' + imp.name);
          } else if (!Object.prototype.hasOwnProperty.call(env, imp.name)) {
            throw new Error('RVE: unknown LAPACK import ' + imp.name);
          }
        });
        return {env: env, 'GOT.mem': got};
      },
      record: function (instance) {
        Object.keys(instance.exports).forEach(function (key) {
          var value = instance.exports[key];
          if (!(key in exported))
            exported[key] = value instanceof WebAssembly.Global ? dataBase + value.value : value;
        });
        dataBase += DATA_SLOT;
        tableBase += TABLE_SLOT;
      },
      // __wasm_call_ctors is deliberately not run: DSYEVR/DGEEV do not need
      // it, and the runtime calls a constructor could make are refused.
      finish: function () {
        Object.keys(got).forEach(function (key) {
          if (typeof exported[key] !== 'number') {
            if (GUARDED.indexOf(key) < 0) throw new Error('RVE: missing LAPACK data symbol ' + key);
            exported[key] = guard;
          }
          got[key].value = exported[key];
        });
        return makeSolver(memory, stack, exported, guard);
      }
    };
  }

  function makeSolver(memory, stack, symbols, guard) {
    var stackTop = stack.value;
    var start = 20 * 1024 * 1024, cursor = start;
    function alloc(n) {
      var p = cursor;
      cursor = Math.ceil((cursor + n) / 8) * 8;
      if (!Number.isSafeInteger(cursor) || cursor >= 0x80000000)
        throw new Error('RVE: LAPACK workspace is too large');
      if (cursor > memory.buffer.byteLength)
        memory.grow(Math.ceil((cursor - memory.buffer.byteLength) / 65536));
      return p;
    }
    function i32(x) { var p = alloc(4); new Int32Array(memory.buffer, p, 1)[0] = x; return p; }
    function f64(x) { var p = alloc(8); new Float64Array(memory.buffer, p, 1)[0] = x; return p; }
    function str(x) { var p = alloc(8); new Uint8Array(memory.buffer)[p] = x.charCodeAt(0); return p; }
    function check(info) {
      var code = new Int32Array(memory.buffer, info, 1)[0];
      if (code) throw new Error('RVE: LAPACK eigen failed (info=' + code + ')');
    }
    function solve(A, symmetric) {
      cursor = start;
      var n = A.length, np = i32(n), ap = alloc(n * n * 8);
      var data = new Float64Array(memory.buffer, ap, n * n);
      for (var j = 0; j < n; j++) for (var i = 0; i < n; i++) data[i + n*j] = A[i][j];
      var w = alloc(n * 8), z = alloc(n * n * 8), info = i32(0);
      var workq = alloc(8), args, nw;
      if (symmetric) {
        var support = alloc(2 * n * 4), iworkq = alloc(4);
        args = [str('V'), str('A'), str('L'), np, ap, np, f64(0), f64(0),
          i32(0), i32(0), f64(0), i32(0), w, z, np, support];
        symbols.dsyevr_.apply(null, args.concat([workq, i32(-1), iworkq, i32(-1), info, 1, 1, 1]));
        check(info);
        nw = new Float64Array(memory.buffer, workq, 1)[0];
        var ni = new Int32Array(memory.buffer, iworkq, 1)[0];
        symbols.dsyevr_.apply(null, args.concat([alloc(nw * 8), i32(nw), alloc(ni * 4), i32(ni), info, 1, 1, 1]));
      } else {
        var wi = alloc(n * 8);
        args = [str('N'), str('V'), np, ap, np, w, wi, alloc(8), np, z, np];
        symbols.dgeev_.apply(null, args.concat([workq, i32(-1), info, 1, 1]));
        check(info);
        nw = new Float64Array(memory.buffer, workq, 1)[0];
        symbols.dgeev_.apply(null, args.concat([alloc(nw * 8), i32(nw), info, 1, 1]));
        check(info);
        var imaginary = new Float64Array(memory.buffer, wi, n);
        var real = new Float64Array(memory.buffer, w, n);
        // R La_rg's conversion to complex storage, followed by robu's < cutoff.
        for (var c = 0; c < n; c++)
          if (Math.abs(imaginary[c]) > 10 * Number.EPSILON * Math.abs(real[c]))
            throw new Error('invalid comparison with complex values');
      }
      check(info);
      var values = Array.from(new Float64Array(memory.buffer, w, n));
      var order = Array.from({length: n}, function (_, i) { return i; });
      if (symmetric) order.reverse();
      else order.sort(function (i, j) { return Math.abs(values[j]) - Math.abs(values[i]); });
      var vectors = new Float64Array(memory.buffer, z, n*n);
      return {values: order.map(function (i) { return values[i]; }),
        vectors: Array.from({length: n}, function (_, i) {
          return order.map(function (j) { return vectors[i + n*j]; });
        })};
    }
    return function (A, symmetric) {
      try {
        return solve(A, symmetric);
      } finally {
        // A throwing import leaves the shadow stack pointer mid-frame.
        stack.value = stackTop;
        var g = new Uint8Array(memory.buffer, guard, GUARD_BYTES);
        for (var i = 0; i < GUARD_BYTES; i++) if (g[i] !== 255) {
          g.fill(255);
          throw new Error('RVE: LAPACK wrote to an unsupported runtime symbol');
        }
      }
    };
  }

  function unavailable(e) {
    if (e && /^RVE:/.test(e.message)) return e;
    var error = new Error(UNAVAILABLE);
    error.cause = e;
    return error;
  }
  // Node and other non-browser hosts compile synchronously on first use.
  function loadSync() {
    if (backend || failure) return;
    try {
      if (typeof WebAssembly !== 'object') throw new ReferenceError('WebAssembly is not defined');
      var linker = createLinker();
      payloads.forEach(function (encoded) {
        var module = new WebAssembly.Module(decode(encoded));
        linker.record(new WebAssembly.Instance(module, linker.imports(module)));
      });
      backend = linker.finish();
    } catch (e) {
      failure = unavailable(e);
    }
  }
  // Browsers compile and instantiate asynchronously at page load, so no
  // main-thread synchronous compile limit or CSP sync path is involved.
  function loadAsync() {
    loading = true;
    var chain;
    try {
      if (typeof WebAssembly !== 'object') throw new ReferenceError('WebAssembly is not defined');
      var linker = createLinker();
      chain = payloads.reduce(function (previous, encoded) {
        return previous.then(function () { return WebAssembly.compile(decode(encoded)); })
          .then(function (module) {
            return WebAssembly.instantiate(module, linker.imports(module));
          }).then(linker.record);
      }, Promise.resolve()).then(function () { backend = linker.finish(); });
    } catch (e) {
      chain = Promise.reject(e);
    }
    return chain.then(function () { loading = false; }, function (e) {
      loading = false;
      failure = unavailable(e);
      throw failure;
    });
  }

  // all.equal.numeric excludes exactly equal entries before computing its
  // target scale and mean relative difference. It does not use a max norm.
  // Its sums use the pinned Windows R long-double sum() (64 significand bits).
  var bits = new DataView(new ArrayBuffer(8));
  function roundShift(n, shift) {
    if (shift <= 0) return n << BigInt(-shift);
    var k = BigInt(shift), q = n >> k, remainder = n - (q << k);
    var half = 1n << (k - 1n);
    return q + (remainder > half || (remainder === half && (q & 1n)) ? 1n : 0n);
  }
  function rPositiveSum(xs) {
    var total = 0n, exponent = 0;
    for (var x of xs) {
      if (!Number.isFinite(x)) return x;
      if (x === 0) continue;
      bits.setFloat64(0, x, false);
      var raw = bits.getBigUint64(0, false), field = Number((raw >> 52n) & 2047n);
      var mantissa = raw & ((1n << 52n) - 1n);
      var e = field ? field - 1075 : -1074;
      if (field) mantissa |= 1n << 52n;
      if (!total) { total = mantissa; exponent = e; }
      else {
        var common = Math.min(exponent, e);
        total = (total << BigInt(exponent - common)) + (mantissa << BigInt(e - common));
        exponent = common;
      }
      var excess = total.toString(2).length - 64;
      if (excess > 0) { total = roundShift(total, excess); exponent += excess; }
      if (total >= (1n << 64n)) { total >>= 1n; exponent++; }
    }
    if (exponent < -1074) {
      total = roundShift(total, -1074 - exponent);
      exponent = -1074;
    }
    return Number(total) * Math.pow(2, exponent);
  }
  function allEqual(a, b, tolerance) {
    var pairs = a.map(function (v, i) { return [v, b[i]]; })
      .filter(function (p) { return p[0] !== p[1]; });
    var n = pairs.length;
    if (!n) return true;
    var scale = rPositiveSum(pairs.map(function (p) { return Math.abs(p[0]) / n; }));
    if (!Number.isFinite(scale) || !(scale > tolerance)) scale = 1;
    return rPositiveSum(pairs.map(function (p) {
      return Math.abs(p[0] - p[1]) / (n * scale);
    })) <= tolerance;
  }
  function isSymmetric(A) {
    var n = A.length, tolerance = 100 * Number.EPSILON;
    if (n > 1) {
      var edge = Array.from(new Set([0, 1, n - 2, n - 1]));
      for (var i of edge)
        if (!allEqual(A[i], A.map(function (r) { return r[i]; }), 8 * tolerance)) return false;
    }
    return allEqual(A[0].flatMap(function (_, i) {
      return A.map(function (r) { return r[i]; });
    }), A.flat(), tolerance);
  }
  function eigen(A) {
    var n = A.length;
    if (!n || A.some(function (r) { return r.length !== n; })) throw new Error('RVE: invalid eigen matrix');
    if (A.some(function (r) { return !r.every(Number.isFinite); }))
      throw new Error("infinite or missing values in 'x'");
    if (n === 1) return {values: [A[0][0]], vectors: [[1]]};
    if (!backend && !failure && !loading) loadSync();
    if (failure) throw failure;
    if (!backend) throw new Error(LOADING);
    return backend(A, isSymmetric(A));
  }
  eigen.isSymmetric = isSymmetric;
  // 'loading' only while the browser's asynchronous compile is pending.
  eigen.status = function () {
    return backend ? 'ready' : failure ? 'failed' : loading ? 'loading' : 'idle';
  };
  eigen._runtime = {lround: RUNTIME.lround, lroundf: RUNTIME.lroundf, __powidf2: powidf2,
    dylinkMemInfo: dylinkMemInfo, createLinker: createLinker};
  var isNode = typeof process === 'object' && process !== null && !!process.versions &&
    typeof process.versions.node === 'string';
  if (isNode) {
    eigen.ready = Promise.resolve().then(function () { loadSync(); if (failure) throw failure; });
  } else {
    eigen.ready = loadAsync();
  }
  // Callers that never fit CR2 must not see an unhandled rejection.
  eigen.ready.catch(function () {});
  if (typeof module !== 'undefined' && module.exports) module.exports = eigen;
  global.AlmRVEEigen = eigen;
})(typeof window !== 'undefined' ? window : globalThis);
