const obj = { 
  f: function() { 
    const a = [1,2,3,4,5,6];
    const b = [1,2,3,4,5];
    const q = 0.3;
    const r = 0.5;
    return q * (((a[0]*r+a[1])*r+a[2])*r+1) / (((b[0]*r+b[1])*r+b[2])*r+1);
  } 
};