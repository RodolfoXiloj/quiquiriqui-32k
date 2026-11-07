// Dev-only: the Spanish page is built from the same code as the English one, by translating the
// on-screen strings after minification (src/lang/es.json). `literalsOf(code)` lists the string
// literals of JS `code` (single and double quotes, and the fixed parts of template literals),
// skipping comments; `translate(code, dict)` replaces each literal (or fixed part) that equals a
// key of `dict`, whole, by its value, and reports how often each key was used. Nothing else in
// the code is touched, so ids, key codes and colors stay as they are. Never shipped.

/** Every string literal and template part of `code`, in order: { text, kind: 'string' | 'part' }. */
export function literalsOf(code) {
  const out = [];
  walk(code, (text, kind) => {
    out.push({ text, kind });
    return text;
  });
  return out;
}

/** `code` with every literal that is a key of `dict` replaced by its value, and how often each key was used. */
export function translate(code, dict) {
  const counts = Object.fromEntries(Object.keys(dict).map((key) => [key, 0]));
  const translated = walk(code, (text) => {
    if (!Object.hasOwn(dict, text)) return text;
    counts[text]++;
    return dict[text];
  });
  return { code: translated, counts };
}

/** Rebuilds `code`, passing each literal's text through `visit(text, kind)`. */
function walk(code, visit) {
  const n = code.length;
  let out = '';
  let i = 0;
  while (i < n) {
    const c = code[i];
    if (c === '/' && (code[i + 1] === '/' || code[i + 1] === '*')) {
      // A comment: copied as it is
      const close = code[i + 1] === '/' ? code.indexOf('\n', i) : code.indexOf('*/', i + 2) + 2;
      const end = close < i + 2 ? n : close;
      out += code.slice(i, end);
      i = end;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n && code[j] !== c) j += code[j] === '\\' ? 2 : 1;
      out += c + visit(code.slice(i + 1, j), 'string') + c;
      i = j + 1;
    } else if (c === '`') {
      // A template: its fixed parts are visited, its ${...} expressions copied
      out += c;
      i++;
      let part = '';
      while (i < n && code[i] !== '`') {
        if (code[i] === '\\') {
          part += code.slice(i, i + 2);
          i += 2;
        } else if (code[i] === '$' && code[i + 1] === '{') {
          out += visit(part, 'part');
          part = '';
          let depth = 0;
          let j = i + 1; // at the opening brace
          do {
            if (code[j] === '{') depth++;
            else if (code[j] === '}') depth--;
            j++;
          } while (j < n && depth > 0);
          out += code.slice(i, j);
          i = j;
        } else part += code[i++];
      }
      out += visit(part, 'part') + c;
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}
