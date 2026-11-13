#!/usr/bin/env node
// Seletores que o navegador consegue filtrar (1.74.1). Uma regra cuja ponta (o elemento que ela pinta) é um
// :is(...) não entra no filtro por classe/id/tag do Blink: é testada em cada elemento da página a cada recálculo de
// estilo. Duas trocas equivalentes, que não mudam o que casa nem a especificidade:
//  1. :is(.dlg-x, #_) (ancestral ou ponta) ganha :where(.dlg-x) na frente. :where não soma especificidade e
//     nenhum elemento tem id="_", então casa exatamente nos mesmos elementos.
//  2. Na ponta, :is(a, b, c) com argumentos simples (sem combinador, sem :is/:not/:has dentro) e todos com a
//     mesma especificidade vira uma lista de seletores. Mesma especificidade = mesma cascata.
// Uso: node scripts/css-bucket.cjs [--check] dist/dialogs.css dist/continuous.css ...
"use strict";
const fs = require("fs");

function splitTop(text, sep = ",") {
  const out = []; let depth = 0, quote = null, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === "\\") i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === sep && depth === 0) { out.push(text.slice(start, i)); start = i + 1; }
  }
  out.push(text.slice(start));
  return out;
}

// Especificidade de um compound simples (sem combinadores e sem pseudo-classes funcionais).
function compoundSpecificity(sel) {
  if (/[\s>+~]/.test(sel.trim()) || /:(is|where|not|has|nth-[a-z-]+|host|lang|dir)\(/i.test(sel)) return null;
  if (/:-|::-/.test(sel)) return null;
  const s = sel.replace(/\[[^\]]*\]/g, "");
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const attrs = (sel.match(/\[[^\]]*\]/g) || []).length;
  const classes = (s.match(/\.[\w-]+/g) || []).length;
  const pseudoEl = (s.match(/::[\w-]+/g) || []).length;
  const pseudoCl = (s.replace(/::[\w-]+/g, "").match(/:[\w-]+/g) || []).length;
  const type = /^[a-z][\w-]*|^\*/i.exec(s.trim());
  const types = type && type[0] !== "*" ? 1 : 0;
  return `${ids},${classes + attrs + pseudoCl},${types + pseudoEl}`;
}

// Ponta do seletor: tudo depois do último combinador de nível zero.
function lastCompoundIndex(sel) {
  let depth = 0, quote = null, idx = 0;
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (quote) { if (c === "\\") i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && (c === " " || c === ">" || c === "+" || c === "~")) idx = i + 1;
  }
  return idx;
}

function expandSubject(sel) {
  const at = lastCompoundIndex(sel);
  const head = sel.slice(0, at), subject = sel.slice(at);
  const m = /^:is\(/.exec(subject);
  if (!m) return null;
  let depth = 0, end = -1;
  for (let i = 3; i < subject.length; i++) { if (subject[i] === "(") depth++; else if (subject[i] === ")") { depth--; if (depth === 0) { end = i; break; } } }
  if (end < 0) return null;
  const args = splitTop(subject.slice(4, end)).map(a => a.trim());
  const tail = subject.slice(end + 1);
  // Só pseudo-elemento ou pseudo-classe simples depois do :is(...).
  if (tail && !/^(::?[\w-]+)+$/.test(tail)) return null;
  if (args.length < 2 || args.some(a => !a || a.startsWith(":") && !/^:[\w-]+$/.test(a))) return null;
  const specs = args.map(compoundSpecificity);
  if (specs.some(s => s === null) || new Set(specs).size !== 1) return null;
  // Um pseudo-elemento dentro do argumento não pode ganhar outro depois.
  if (tail.startsWith("::") && args.some(a => a.includes("::"))) return null;
  return args.map(a => head + a + tail);
}

function transformSelectorList(list) {
  const items = splitTop(list).map(s => s.trim()).filter(Boolean);
  const out = [];
  let changed = false;
  for (let sel of items) {
    const where = sel.replace(/(^|[^\w)])(:is\((\.dlg-[\w-]+), #_\))/g, (all, pre, isPart, cls) => `${pre}:where(${cls})${isPart}`);
    if (where !== sel) { changed = true; sel = where; }
    const expanded = expandSubject(sel);
    if (expanded) { changed = true; out.push(...expanded); } else out.push(sel);
  }
  return changed ? out.join(", ") : null;
}

function transformCss(css) {
  let out = "", i = 0, count = 0;
  // Percorre o texto achando prelúdios de regra "seletor {" fora de comentários/strings; @-regras são mantidas
  // (seus blocos internos são percorridos normalmente).
  const re = /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[{}]/g;
  let last = 0, preludeStart = 0, m;
  const stack = [];
  while ((m = re.exec(css))) {
    const tok = m[0];
    if (tok === "{") {
      const prelude = css.slice(preludeStart, m.index);
      const trimmed = prelude.trim();
      const inDeclBlock = stack.length && stack[stack.length - 1] === "rule";
      if (!inDeclBlock && trimmed && !trimmed.startsWith("@") && !/^(from|to|\d+%)/.test(trimmed)) {
        const next = transformSelectorList(trimmed);
        if (next) {
          const lead = prelude.slice(0, prelude.indexOf(trimmed)), trail = prelude.slice(prelude.indexOf(trimmed) + trimmed.length);
          out += css.slice(last, preludeStart) + lead + next + trail + "{";
          last = m.index + 1; count++;
        }
      }
      stack.push(trimmed.startsWith("@") ? "at" : "rule");
      preludeStart = m.index + 1;
    } else if (tok === "}") { stack.pop(); preludeStart = m.index + 1; }
    else if (tok.startsWith("/*") || tok.startsWith('"') || tok.startsWith("'")) { if (!stack.length || stack[stack.length - 1] !== "rule") { /* comentário entre regras: o prelúdio começa depois dele */ if (tok.startsWith("/*")) preludeStart = re.lastIndex; } }
    else if (tok === ";") preludeStart = m.index + 1;
  }
  out += css.slice(last);
  return {css: out, count};
}

module.exports = {splitTop, compoundSpecificity, expandSubject, transformSelectorList, transformCss};

if (require.main === module) {
  const check = process.argv.includes("--check");
  let pending = 0;
  for (const file of process.argv.slice(2).filter(a => !a.startsWith("--"))) {
    const css = fs.readFileSync(file, "utf8"), {css: next, count} = transformCss(css);
    if (check) { if (next !== css) { pending += count; console.log(`${file}: ${count} regras ainda podem ser filtradas`); } }
    else { if (next !== css) fs.writeFileSync(file, next); console.log(`${file}: ${count} regras`); }
  }
  if (check && pending) process.exit(1);
}
