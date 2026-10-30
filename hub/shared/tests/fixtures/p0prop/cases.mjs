// Synthetic parser edge cases, not research observations. Valid controls reuse
// the existing prop-tiny and heterogeneous FE regression inputs.
export const valid = '12,150,Study A\n8,90,Study B\n20,220,Study C\n5,60,Study D\n15,180,Study E';
export const badRows = [
  ['missing field', '12', 'Study 2', /fields/],
  ['extra field', '12,150,Bad study,extra', 'Bad study', /fields/],
  ['nonnumeric events', 'oops,150,Bad study', 'Bad study', /events.*number/],
  ['nonnumeric total', '12,oops,Bad study', 'Bad study', /total.*number/],
  ['partial events', '12oops,150,Bad study', 'Bad study', /events.*number/],
  ['partial total', '12,150oops,Bad study', 'Bad study', /total.*number/],
  ['events above total', '151,150,Bad study', 'Bad study', /events.*exceed/],
  ['negative events', '-1,150,Bad study', 'Bad study', /events.*negative/],
  ['negative total', '12,-150,Bad study', 'Bad study', /total.*positive/],
  ['zero total', '0,0,Bad study', 'Bad study', /total.*positive/],
  ['empty events', ',150,Bad study', 'Bad study', /events.*empty/],
  ['empty total', '12,,Bad study', 'Bad study', /total.*empty/],
  ['empty row', '', 'Study 2', /empty/],
  ['fractional events', '12.5,150,Bad study', 'Bad study', /events.*whole/],
  ['fractional total', '12,150.5,Bad study', 'Bad study', /total.*whole/],
  ['rounded fraction', '12.0000000000000001,150,Bad study', 'Bad study', /events.*whole/],
  ['infinite count', 'Infinity,150,Bad study', 'Bad study', /events.*number/],
  ['hexadecimal count', '0xC,150,Bad study', 'Bad study', /events.*number/],
  ['unsafe count', '12,9007199254740993,Bad study', 'Bad study', /total.*safe/],
  ['unterminated quote', '12,150,"Bad study', 'Bad study', /quote/],
];
export const withBadRow = row => `12,150,Study A\n${row}\n8,90,Study C`;
export const validFixtures = [
  {id:'prop-tiny', text:valid},
  {id:'heterogeneous', text:'12,150,A\n8,40,B\n30,200,C\n3,100,D\n25,120,E'},
  {id:'boundaries', text:'0,10,Zero\n10,10,All\n4,20,Interior'},
];
