const fs = require('fs');
const dir = __dirname;
const body = fs.readFileSync(dir + '/fretline_body.html'); // Buffer, byte-exact
const vex = fs.readFileSync(dir + '/vexflow.js'); // Buffer, byte-exact
const marker = Buffer.from('/*__VEXFLOW_BUNDLE__*/');
const idx = body.indexOf(marker);
if (idx === -1) throw new Error('marker not found');
const out = Buffer.concat([
  body.subarray(0, idx),
  vex,
  body.subarray(idx + marker.length),
]);
fs.writeFileSync(dir + '/fretline.html', out);
console.log('wrote', out.length, 'bytes');
