const obj = { 
  f: function() { 
    const a = [1,2,3,4,5,6];
    const b = [1,2,3,4,5];
    const r = 0.5;
    return ((a[0]*r+a[1])*r+a[2]) / ((b[0]*r+b[1])*r+b[2]); 
  } 
};