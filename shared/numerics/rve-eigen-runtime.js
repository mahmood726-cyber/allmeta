/* Build input for ../rve-eigen.js; run build-rve-eigen.cjs after editing.
 * R eigen dispatch and the existing webR reference BLAS/LAPACK binaries.
 * See RVE-EIGEN.md for provenance and the numerical contract.
 */
(function (global) {
  'use strict';
  var payloads = /* EMBED_LAPACK */ null;
  var backend;

  function makeBackend() {
    var memory = new WebAssembly.Memory({initial: 512});
    var stack = new WebAssembly.Global({value: 'i32', mutable: true}, 16 * 1024 * 1024);
    var table = new WebAssembly.Table({initial: 32, element: 'anyfunc'});
    var symbols = {
      // IPARMQ uses LOG(REAL(NH)) for NH >= 150 when tuning DGEEV's QR path.
      // Preserve the Fortran REAL (binary32) argument and result conversions.
      // https://www.netlib.org/lapack/explore-html/dd/da2/iparmq_8f_source.html
      logf: function (x) { return Math.fround(Math.log(Math.fround(x))); },
      // Fortran NINT / C lroundf rounds halfway cases away from zero.
      lroundf: function (x) {
        x = Math.fround(x);
        return x < 0 ? -Math.floor(-x + 0.5) : Math.floor(x + 0.5);
      },
      memcmp: function (a, b, n) {
        var u = new Uint8Array(memory.buffer);
        for (var i = 0; i < n; i++) if (u[a+i] !== u[b+i]) return u[a+i] - u[b+i];
        return 0;
      }
    };
    var got = {}, dataBase = 1024, tableBase = 1;
    payloads.forEach(function (encoded) {
      var bytes = Uint8Array.from(atob(encoded), function (x) { return x.charCodeAt(0); });
      var module = new WebAssembly.Module(bytes);
      var env = {memory: memory, __stack_pointer: stack, __indirect_function_table: table,
        __memory_base: dataBase, __table_base: tableBase};
      WebAssembly.Module.imports(module).forEach(function (imp) {
        if (imp.module === 'GOT.mem') {
          if (!got[imp.name]) got[imp.name] = new WebAssembly.Global({value: 'i32', mutable: true}, 0);
        } else if (imp.kind === 'function') {
          env[imp.name] = symbols[imp.name] || Math[imp.name] ||
            (imp.name === '__powidf2' ? Math.pow : imp.name === 'lround' ? Math.round :
              function () { throw new Error('RVE: unsupported LAPACK runtime call ' + imp.name); });
        }
      });
      var instance = new WebAssembly.Instance(module, {env: env, 'GOT.mem': got});
      Object.keys(instance.exports).forEach(function (key) {
        var value = instance.exports[key];
        if (!Object.prototype.hasOwnProperty.call(symbols, key))
          symbols[key] = value instanceof WebAssembly.Global ? dataBase + value.value : value;
      });
      // Both pinned side modules have data sections <16 KiB and table size 3.
      dataBase += 16384;
      tableBase += 3;
    });
    Object.keys(got).forEach(function (key) {
      // These C++ exception / diagnostic globals are never used by the real
      // eigensolvers. Their imported runtime functions above fail explicitly.
      if (typeof symbols[key] !== 'number') {
        if (!['_ZTVSt18bad_variant_access', '_ZTVSt9exception', 'stderr'].includes(key))
          throw new Error('RVE: missing LAPACK data symbol ' + key);
        symbols[key] = 0;
      }
      got[key].value = symbols[key];
    });
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
    return function (A, symmetric) {
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
    };
  }

  // The pinned Windows R sum() accumulates in a 64-significand-bit long double,
  // then converts to binary64. Here every summand is nonnegative. Keep its
  // significand/exponent exactly, rounding each addition to nearest, ties even.
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

  // all.equal.numeric excludes exactly equal entries before computing its
  // target scale and mean relative difference. It does not use a max norm.
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
    if (!backend) backend = makeBackend();
    return backend(A, isSymmetric(A));
  }
  eigen.isSymmetric = isSymmetric;
  if (typeof module !== 'undefined' && module.exports) module.exports = eigen;
  global.AlmRVEEigen = eigen;
})(typeof window !== 'undefined' ? window : globalThis);
