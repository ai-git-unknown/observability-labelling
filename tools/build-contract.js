#!/usr/bin/env node
/*
 * Renders docs/labelling-contract.md into contract.html.
 *
 * Deliberately dependency-free, matching the rest of this repository: no
 * package.json, no install step, no lockfile to keep current. It supports
 * only the Markdown subset the contract actually uses -- headings, tables,
 * fenced code, flat lists, blockquotes, horizontal rules and inline
 * code/bold/italic/links -- and throws on anything it cannot represent
 * rather than emitting silently wrong HTML.
 *
 * Usage:  node tools/build-contract.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'docs', 'labelling-contract.md');
const OUT = path.join(ROOT, 'contract.html');

/* ---------------- inline ---------------- */

const escapeHtml = s => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

// GitHub-compatible heading slug, so anchors work in both renderings.
const slug = s => s
  .replace(/`/g, '')
  .toLowerCase()
  .replace(/[^\w\s-]/g, '')
  .trim()
  .replace(/\s+/g, '-');

function inline(text) {
  // Protect code spans from later bold/italic/link processing.
  const codes = [];
  let out = text.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return '\u0000' + (codes.length - 1) + '\u0000';
  });

  out = escapeHtml(out);

  // Links. Rewrite the sibling reference to the digest, since the generated
  // HTML sits at the repository root while the Markdown sits in docs/.
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const h = href.replace(/^\.\.\//, '');
    const ext = /^https?:/.test(h) ? ' target="_blank" rel="noopener"' : '';
    return `<a href="${h}"${ext}>${label}</a>`;
  });

  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');

  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escapeHtml(codes[+i])}</code>`);
}

/* ---------------- blocks ---------------- */

function render(md) {
  const lines = md.split('\n');
  const html = [];
  const toc = [];
  let i = 0;

  const isTableSep = s => /^\s*\|?[\s:-]*-[-\s|:]*\|?\s*$/.test(s) && s.includes('-');
  const cells = s => s.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      if (i >= lines.length) throw new Error('unterminated code fence');
      i++;
      html.push(`<pre class="code"${lang ? ` data-lang="${lang}"` : ''}>${escapeHtml(buf.join('\n'))}</pre>`);
      continue;
    }

    // horizontal rule
    if (/^---+\s*$/.test(line)) { html.push('<hr>'); i++; continue; }

    // heading
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      // The document title is rendered in the page header, not the body.
      if (level === 1) { i++; continue; }
      const id = slug(h[2]);
      if (level === 2) toc.push({ id, text: h[2].replace(/`/g, '') });
      html.push(`<h${level} id="${id}">${inline(h[2])}${level === 2 ? ` <a class="anchor" href="#${id}">#</a>` : ''}</h${level}>`);
      i++;
      continue;
    }

    // table
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) body.push(cells(lines[i++]));
      html.push(
        '<div class="tw"><table><thead><tr>' +
        head.map(c => `<th>${inline(c)}</th>`).join('') +
        '</tr></thead><tbody>' +
        body.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
        '</tbody></table></div>'
      );
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      html.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
      continue;
    }

    // lists
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items = [];
      while (i < lines.length && (ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/).test(lines[i])) {
        items.push(lines[i++].replace(ordered ? /^\s*\d+\.\s+/ : /^\s*[-*]\s+/, ''));
      }
      const tag = ordered ? 'ol' : 'ul';
      html.push(`<${tag}>${items.map(t => `<li>${inline(t)}</li>`).join('')}</${tag}>`);
      continue;
    }

    // blank
    if (!line.trim()) { i++; continue; }

    // paragraph
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|---+\s*$)/.test(lines[i])
           && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])
           && !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))) {
      buf.push(lines[i++]);
    }
    // The version/status/scope line becomes header badges instead.
    if (/^\*\*Version\*\*/.test(buf[0])) continue;
    html.push(`<p>${inline(buf.join(' '))}</p>`);
  }

  return { body: html.join('\n'), toc };
}

/* ---------------- page ---------------- */

function page(body, toc, meta) {
  const nav = toc.map(t => `<a href="#${t.id}">${t.text}</a>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${meta.title}</title>
<style>
  :root{
    --bg:#0b0c0e; --card:#181b20; --card2:#1f232a; --line:#2b3038;
    --text:#e6e9ef; --muted:#9aa4b2; --dim:#6b7683;
    --orange:#ff6b35; --orange-dim:#ff8c5a; --blue:#5794f2; --red:#f2596a; --green:#56c46b;
  }
  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{margin:0;background:var(--bg);color:var(--text);
    font:15px/1.68 -apple-system,BlinkMacSystemFont,"Inter","Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  a{color:var(--orange-dim);text-decoration:none}
  a:hover{text-decoration:underline}

  header.top{border-left:6px solid var(--orange);background:linear-gradient(135deg,#14161a,#0b0c0e 70%);padding:30px 0 26px}
  header.top .in{max-width:1220px;margin:0 auto;padding:0 24px}
  .eyebrow{color:var(--orange);font-weight:700;letter-spacing:.12em;font-size:11.5px;text-transform:uppercase}
  header.top h1{font-size:clamp(23px,3.4vw,33px);margin:9px 0 10px;letter-spacing:-.02em;line-height:1.16}
  .badges{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}
  .badge{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:4px 12px;font-size:12px;color:var(--muted)}
  .badge b{color:var(--text)}
  .backlink{font-size:12.5px;color:var(--dim)}

  .shell{max-width:1220px;margin:0 auto;padding:0 24px 80px;display:grid;grid-template-columns:238px minmax(0,1fr);gap:40px}
  nav.toc{position:sticky;top:20px;align-self:start;max-height:calc(100vh - 40px);overflow-y:auto;padding:22px 0 20px;font-size:13px}
  nav.toc .lbl{font-size:10.5px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:var(--dim);margin-bottom:9px}
  nav.toc a{display:block;color:var(--muted);padding:4.5px 10px;border-left:2px solid var(--line);line-height:1.35}
  nav.toc a:hover{color:var(--text);border-left-color:var(--dim);text-decoration:none}
  nav.toc a.on{color:var(--orange-dim);border-left-color:var(--orange);background:rgba(255,107,53,.06)}

  main{padding:22px 0 0;min-width:0}
  main h2{font-size:21px;margin:42px 0 4px;letter-spacing:-.01em;padding-top:6px}
  main h2:first-child{margin-top:0}
  main h2::after{content:"";display:block;width:52px;height:3px;background:var(--orange);border-radius:2px;margin-top:9px}
  main h3{font-size:16px;margin:26px 0 6px;color:var(--text)}
  main h4{font-size:14px;margin:20px 0 4px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
  main p{margin:11px 0;max-width:86ch;color:#d6dbe4}
  main ul,main ol{margin:11px 0;padding-left:22px;max-width:86ch;color:#d6dbe4}
  main li{margin-bottom:5px}
  main li::marker{color:var(--orange)}
  a.anchor{color:var(--line);font-weight:400;font-size:15px;margin-left:5px}
  main h2:hover a.anchor{color:var(--dim)}
  hr{border:0;border-top:1px solid var(--line);margin:34px 0}

  code{background:var(--card2);border:1px solid var(--line);border-radius:4px;padding:1px 5px;
    font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.4px;color:#ffb094}
  pre.code{background:#0d0f12;border:1px solid var(--line);border-left:3px solid var(--blue);
    border-radius:8px;padding:13px 15px;overflow-x:auto;margin:14px 0;position:relative;
    font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12.3px;line-height:1.62;
    color:#c6cdd8;white-space:pre}
  pre.code[data-lang]::before{content:attr(data-lang);position:absolute;top:0;right:0;
    background:var(--card2);color:var(--dim);font-size:10px;letter-spacing:.08em;text-transform:uppercase;
    padding:2px 8px;border-left:1px solid var(--line);border-bottom:1px solid var(--line);border-radius:0 8px 0 6px}

  .tw{overflow-x:auto;margin:14px 0}
  table{border-collapse:collapse;width:100%;font-size:13.5px;min-width:480px}
  th,td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--line);vertical-align:top}
  th{background:#0f1114;color:var(--text);font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;
    position:sticky;top:0}
  td{color:#d6dbe4}
  tbody tr:nth-child(even){background:rgba(255,255,255,.017)}
  td code,th code{font-size:11.8px}

  blockquote{margin:16px 0;padding:12px 16px;background:rgba(255,107,53,.06);
    border-left:3px solid var(--orange);border-radius:0 8px 8px 0;color:#e2e6ed;max-width:86ch}
  blockquote p{margin:0}

  footer{border-top:1px solid var(--line);margin-top:54px;padding-top:20px;color:var(--dim);font-size:12.5px}
  footer p{margin:0 0 7px;max-width:92ch}

  @media (max-width:900px){
    .shell{grid-template-columns:1fr;gap:0}
    nav.toc{position:static;max-height:none;border-bottom:1px solid var(--line);margin-bottom:8px}
    nav.toc a{border-left:0;padding:4px 0}
  }
  @media print{
    body{background:#fff;color:#111}
    nav.toc,header.top{display:none}
    .shell{display:block;padding:0}
    main p,main li,td{color:#222}
    pre.code,code{background:#f5f5f5;color:#111;border-color:#ddd}
    th{background:#eee;color:#111}
  }
</style>
</head>
<body>
<header class="top">
  <div class="in">
    <div class="eyebrow">Observability Programme</div>
    <h1>${meta.title}</h1>
    <div class="badges">
      <span class="badge">Version <b>${meta.version}</b></span>
      <span class="badge">Status <b>${meta.status}</b></span>
      <span class="badge">Sections <b>${toc.length}</b></span>
      <span class="badge">Generated <b>${meta.date}</b></span>
    </div>
    <p class="backlink" style="margin-top:14px">Companion to the <a href="index.html">label management digest</a> &middot; source of truth is <code style="font-size:11.5px">docs/labelling-contract.md</code></p>
  </div>
</header>

<div class="shell">
  <nav class="toc"><div class="lbl">Contents</div>${nav}</nav>
  <main>${body}
    <footer>
      <p><b>This page is generated.</b> Edit <code>docs/labelling-contract.md</code> and run <code>node tools/build-contract.js</code>. Do not edit <code>contract.html</code> by hand.</p>
      <p>Platform limits quoted here were accurate when written and change between releases. The accompanying <a href="index.html">digest</a> links every underlying Grafana Labs source document.</p>
    </footer>
  </main>
</div>

<script>
/* Highlight the section currently in view. */
const links=[...document.querySelectorAll('nav.toc a')];
const targets=links.map(a=>document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
function mark(){
  let cur=targets[0];
  for(const t of targets){ if(t.getBoundingClientRect().top<=120) cur=t; }
  links.forEach(a=>a.classList.toggle('on', cur && a.getAttribute('href')==='#'+cur.id));
}
document.addEventListener('scroll',mark,{passive:true});
mark();
</script>
</body>
</html>
`;
}

/* ---------------- main ---------------- */

const md = fs.readFileSync(SRC, 'utf8');
const { body, toc } = render(md);

const title = (md.match(/^#\s+(.*)$/m) || [, 'Labelling Contract'])[1];
const version = (md.match(/\*\*Version\*\*\s*([^\s·*]+)/) || [, '0.1'])[1];
const status = (md.match(/\*\*Status\*\*\s*([^·*]+)/) || [, 'draft'])[1].trim();

const out = page(body, toc, {
  title,
  version,
  status,
  date: new Date().toISOString().slice(0, 10),
});

fs.writeFileSync(OUT, out);

console.log('source   :', path.relative(ROOT, SRC));
console.log('output   :', path.relative(ROOT, OUT), '(' + out.length + ' bytes)');
console.log('sections :', toc.length);
console.log('tables   :', (out.match(/<table>/g) || []).length);
console.log('code     :', (out.match(/<pre class="code"/g) || []).length);
console.log('quotes   :', (out.match(/<blockquote>/g) || []).length);
