const fs = require('fs');
const dir = __dirname;
const vex = fs.readFileSync(dir + '/vexflow.js'); // Buffer, byte-exact
const marker = Buffer.from('/*__VEXFLOW_BUNDLE__*/');
// each editable *_body.html is spliced with the VexFlow bundle into its built page
for (const [src, dest] of [['fretline_body.html', 'fretline.html'], ['ear_training_body.html', 'ear_training.html']]) {
  const body = fs.readFileSync(dir + '/' + src); // Buffer, byte-exact
  const idx = body.indexOf(marker);
  if (idx === -1) throw new Error('marker not found in ' + src);
  const out = Buffer.concat([body.subarray(0, idx), vex, body.subarray(idx + marker.length)]);
  fs.writeFileSync(dir + '/' + dest, out);
  console.log('wrote', dest, out.length, 'bytes');
}
