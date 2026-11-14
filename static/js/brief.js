// Brief tab: the one-page investment memo (GET /api/deck/{id}/brief), copy/download Markdown, print.
import { h, btn, toast, empty, fmtDate, verdictOf, trunc } from './util.js';
import { getBrief, getBriefMd } from './api.js';

const REC = {
  take_meeting: { label: 'Take the meeting', cls: 'rec-go' },
  dig_deeper: { label: 'Dig deeper', cls: 'rec-dig' },
  pass: { label: 'Pass', cls: 'rec-pass' },
};

export function createBrief(ws) {
  let a = null;
  let loading = false;
  let loadedFor = '';
  const doc = h('article', { class: 'memo', 'aria-live': 'polite' });
  const regenBtn = btn('Regenerate', { iconName: 'refresh', title: 'Write the memo again from the latest checks', onclick: () => load(true) });
  const copyBtn = btn('Copy as Markdown', { iconName: 'copy', onclick: () => copyMd() });
  const dlBtn = btn('Download .md', { iconName: 'download', onclick: () => downloadMd() });
  const printBtn = btn('Print / Save as PDF', { iconName: 'print', title: 'Print only the memo (Ctrl+P)', onclick: () => window.print() });
  const el = h('div', { class: 'brief' },
    h('div', { class: 'brief-bar no-print' },
      h('p', { class: 'muted', text: 'A one-page investment memo for your partners, built from the deck, the checks and the live pitch.' }),
      h('div', { class: 'row' }, regenBtn, copyBtn, dlBtn, printBtn)),
    doc);

  function skeleton() {
    doc.replaceChildren(h('div', { class: 'skel-wrap' },
      h('p', { class: 'muted small', text: 'Writing the memo from the claims, checks and transcript. This takes 5-15 seconds…' }),
      ...['w40', 'w90', 'w80', 'w95', 'w60', 'w85', 'w70'].map((w) => h('div', { class: `skel ${w}` }))));
  }

  function setBusy(b) {
    loading = b;
    for (const x of [regenBtn, copyBtn, dlBtn, printBtn]) x.disabled = b;
  }

  async function load(refresh = false) {
    if (loading) return;
    setBusy(true);
    skeleton();
    try {
      const b = await getBrief(ws.id, refresh);
      loadedFor = key();
      render(b);
    } catch (e) {
      doc.replaceChildren(empty(e.notAvailable ? 'The Brief is not available on the server yet.' : `Could not write the brief: ${e.message}`));
      if (!e.notAvailable) toast(`Brief failed: ${e.message}`);
      copyBtn.disabled = dlBtn.disabled = printBtn.disabled = true;
      regenBtn.disabled = false;
      loading = false;
      return;
    }
    setBusy(false);
  }

  const key = () => `${a?.status}:${(a?.claims || []).length}`;

  function claimLinks(ids) {
    const cs = (ids || []).map((id) => ws.claim(id)).filter(Boolean);
    if (!cs.length) return null;
    return h('span', { class: 'flag-claims no-print-links' }, cs.map((c) => h('button', {
      class: `cchip v-${verdictOf(c).key}`, type: 'button', title: c.text, onclick: () => ws.open(c.id),
      onmouseenter: () => ws.hover(c.id), onmouseleave: () => ws.hover(null),
    }, h('span', { class: 'dot' }), trunc(c.text, 40))));
  }

  function list(title, items, render = (x) => h('li', { text: x })) {
    if (!items?.length) return null;
    return h('section', { class: 'memo-sec' }, h('h2', { text: title }), h('ul', null, items.map(render)));
  }

  function render(b) {
    const rec = REC[b.recommendation] || REC.dig_deeper;
    doc.replaceChildren(...[
      h('header', { class: 'memo-head' },
        h('div', { class: 'memo-kicker muted small' },
          h('span', { text: 'Investment memo' }), h('span', { text: ' · ' }), h('span', { text: a?.title || a?.company || '' }),
          b.generated_at ? h('span', { class: 'mono', text: ` · ${fmtDate(b.generated_at)}` }) : null),
        h('span', { class: `rec ${rec.cls}`, text: rec.label }),
        h('h1', { class: 'memo-headline', text: b.headline || 'No headline' })),
      b.summary ? h('section', { class: 'memo-sec' }, h('h2', { text: 'Summary' }), h('p', { text: b.summary })) : null,
      list('Strengths', b.strengths),
      list('Red flags', b.red_flags, (f) => h('li', { class: 'redflag' }, h('span', { text: f.text }), claimLinks(f.claim_ids))),
      list('What changed during the pitch', b.live_notes),
      list('Questions for the next meeting', b.questions),
      list('Evidence to request', b.evidence_requests),
      h('footer', { class: 'memo-foot muted small', text: 'Unverified does not mean false: it means we could not find public evidence either way.' }),
    ].filter(Boolean)); // replaceChildren(null) would print the word "null" for an empty section
  }

  async function md() {
    return getBriefMd(ws.id);
  }
  async function copyMd() {
    try {
      const text = await md();
      await navigator.clipboard.writeText(text);
      toast('Copied the memo as Markdown.', 'info', 2500);
    } catch (e) { toast(e.notAvailable ? 'Markdown export is not available on the server yet.' : `Copy failed: ${e.message}`); }
  }
  async function downloadMd() {
    try {
      const text = await md();
      const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
      const name = `${(a?.title || a?.company || 'claimmap').replace(/[^\w.-]+/g, '_').slice(0, 60)}-brief.md`;
      const link = h('a', { href: url, download: name });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { toast(e.notAvailable ? 'Markdown export is not available on the server yet.' : `Download failed: ${e.message}`); }
  }

  return {
    el,
    update(analysis) {
      a = analysis;
      // Finalize invalidates the brief: reload once the analysis is done again.
      if (!el.hidden && loadedFor && a?.status === 'done' && key() !== loadedFor && !loading) load(false);
    },
    show() {
      if (!a || a.status === 'checking' || (a.status !== 'done' && a.status !== 'error')) {
        doc.replaceChildren(empty('The memo is written when the analysis is done. Waiting…'));
        loadedFor = 'pending';
        return;
      }
      if (!loadedFor || loadedFor === 'pending' || key() !== loadedFor) load(false);
    },
    exportMenu() { /* the export actions live in the Brief bar; make them obvious */ copyBtn.focus(); },
  };
}
