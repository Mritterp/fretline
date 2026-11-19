"use strict";
// LilyPond source without its % line comments and %{ %} block comments
function stripComments(t) {
  let out = "", i = 0;
  while (i < t.length) {
    if (t[i] === "%" && t[i + 1] === "{") { const e = t.indexOf("%}", i + 2); i = e < 0 ? t.length : e + 2; continue; }
    if (t[i] === "%") { while (i < t.length && t[i] !== "\n") i++; continue; }
    out += t[i++];
  }
  return out;
}
module.exports = { stripComments };
