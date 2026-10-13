// Minimal, dependency-free HTML tag scanner for <script> and <link> tags.
const TAG_RE = /<!--[\s\S]*?-->|<(script|link)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const ATTR_RE = /([^\s"'>\/=]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** Parse attributes of a tag body. Offsets are relative to the start of the tag text. */
export function parseAttrs(body, bodyOffset) {
  const attrs = [];
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(body))) {
    if (m[0] === '') { ATTR_RE.lastIndex++; continue; }
    const raw = m[3] ?? m[4] ?? m[5];
    attrs.push({ name: m[1].toLowerCase(), value: raw === undefined ? '' : decode(raw), start: bodyOffset + m.index, end: bodyOffset + m.index + m[0].length });
  }
  return attrs;
}

/** Find script/link tags (skipping comments and script bodies). */
export function findTags(html) {
  const tags = [];
  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(html))) {
    if (!m[1]) continue; // comment
    const name = m[1].toLowerCase();
    const body = m[2];
    const attrs = parseAttrs(body, 1 + m[1].length);
    const get = (n) => attrs.find((a) => a.name === n);
    tags.push({ name, start: m.index, end: m.index + m[0].length, text: m[0], attrs, get, selfClosing: /\/\s*$/.test(body) });
    if (name === 'script') {
      const close = html.toLowerCase().indexOf('</script', TAG_RE.lastIndex);
      if (close !== -1) TAG_RE.lastIndex = close;
    }
  }
  return tags;
}

export function lineOf(html, offset) {
  let line = 1;
  for (let i = 0; i < offset; i++) if (html.charCodeAt(i) === 10) line++;
  return line;
}

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** Return new tag text with attributes set (replacing existing ones in place, appending others). */
export function setAttrs(tag, values) {
  let text = tag.text;
  const edits = [];
  const append = [];
  for (const [name, value] of Object.entries(values)) {
    const a = tag.get(name);
    const str = `${name}="${esc(value)}"`;
    if (a) edits.push({ start: a.start, end: a.end, str });
    else append.push(str);
  }
  edits.sort((x, y) => y.start - x.start);
  for (const e of edits) text = text.slice(0, e.start) + e.str + text.slice(e.end);
  if (append.length) {
    const m = /\s*\/?>$/.exec(text);
    text = text.slice(0, m.index) + ' ' + append.join(' ') + text.slice(m.index);
  }
  return text;
}
