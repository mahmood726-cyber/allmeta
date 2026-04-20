const obj = {
  normQuantile: function(p) {
    const a = [1, 2, 3, 4, 5, 6];
    const b = [1, 2, 3, 4, 5];
    const q = p - 0.5;
    const r = 0.5;
    return q * (((((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*r+1) / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1));
  }
};

