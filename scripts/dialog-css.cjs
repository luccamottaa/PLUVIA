// Classifica regras de CSS como "só de janela" (1.72.2). Usado por tests/dialog-css.test.cjs para manter
// dist/dialogs.css só com regras de janela, e as folhas da Home sem regras que deviam estar lá.
// Regra só de janela: TODO seletor da lista tem o sujeito dentro de uma janela (classe dlg-*, #algumaDialog, o
// elemento dialog, .dialog-*, .city-dialog). :not(...) e :has(...) não contam (body:not(:has(dialog[open])) .x e
// body:has(dialog[open]) .topbar estilizam a Home). Em :is()/:where(), todos os itens precisam ser de janela (#_ é
// enchimento de especificidade e não conta).
'use strict';

const DIALOG = /\.dlg-[\w-]+|#\w+Dialog\b|(^|[\s>~+(,])dialog\b|\.dialog-[\w-]+|\.city-dialog\b/;

function skipString(t, i) { const q = t[i]; i++; while (i < t.length && t[i] !== q) { if (t[i] === '\\') i++; i++; } return i + 1; }
function skipComment(t, i) { const e = t.indexOf('*/', i + 2); if (e < 0) throw new Error('comentário sem fim'); return e + 2; }
function scan(t, i, stop) {
  let depth = 0, paren = 0;
  for (; i < t.length;) {
    const c = t[i];
    if (c === '"' || c === "'") { i = skipString(t, i); continue; }
    if (c === '/' && t[i + 1] === '*') { i = skipComment(t, i); continue; }
    if (stop === 'prelude') { if (c === '(') paren++; else if (c === ')') paren--; else if (!paren && (c === '{' || c === ';')) return i; }
    else if (c === '{') depth++;
    else if (c === '}' && !--depth) return i + 1;
    i++;
  }
  return t.length;
}
// Lista plana das regras de estilo, com os @media/@supports/@container abertos. @keyframes etc. ficam de fora.
function styleRules(text) {
  const out = [];
  for (let i = 0; i < text.length;) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (i >= text.length) break;
    if (text[i] === '/' && text[i + 1] === '*') { i = skipComment(text, i); continue; }
    const p = scan(text, i, 'prelude');
    if (text[p] !== '{') { i = p + 1; continue; }
    const end = scan(text, p, 'block'), prelude = text.slice(i, p);
    if (prelude[0] === '@') { if (/^@(media|supports|container)\b/.test(prelude)) out.push(...styleRules(text.slice(p + 1, end - 1))); }
    else out.push(prelude.replace(/\/\*[\s\S]*?\*\//g, '').trim());
    i = end;
  }
  return out;
}
function topLevel(sel) {
  const out = []; let depth = 0, cur = '';
  for (const ch of sel) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && !depth) { out.push(cur); cur = ''; } else cur += ch; }
  out.push(cur); return out.map(s => s.trim()).filter(Boolean);
}
function stripNotHas(sel) {
  let s = sel, prev;
  do { prev = s; s = s.replace(/:(?:not|has)\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*\)/g, ''); } while (s !== prev);
  return s;
}
function scoped(sel) {
  const s = stripNotHas(sel), groups = [];
  let outside = '';
  for (let i = 0; i < s.length;) {
    const m = /^:(?:is|where)\(/.exec(s.slice(i));
    if (!m) { outside += s[i++]; continue; }
    let depth = 1, j = i + m[0].length; const start = j;
    while (j < s.length && depth) { if (s[j] === '(') depth++; else if (s[j] === ')') depth--; j++; }
    groups.push(s.slice(start, j - 1)); outside += ' '; i = j;
  }
  if (DIALOG.test(outside)) return true;
  return groups.some(g => { const items = topLevel(g).filter(x => x !== '#_'); return items.length > 0 && items.every(scoped); });
}
const dialogOnly = selector => topLevel(selector).every(scoped);

module.exports = { styleRules, dialogOnly };
