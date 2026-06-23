// Revision Diff — compare a draft and a revision in the browser.
// Copyright (C) 2026 Sheetbend, LLC
// Licensed under the GNU AGPL-3.0. See the LICENSE file for details.

// Diff core, ported from compare_draft_final.py (word_diff / md_diff).
// Like the Python tool it's a two-level diff: align paragraphs first, then
// word-diff within the blocks that actually changed. No AI — pure text.
//
// Unlike the Python version (which relied on pandoc giving both sides the same
// paragraph structure), we align paragraphs by *similarity* rather than exact
// equality. Two extractors — e.g. a PDF draft vs. a DOCX revision — almost
// never split paragraphs identically, so exact-match alignment collapses the
// whole document into one deleted + one added block. Fuzzy alignment matches
// "the same paragraph, lightly edited" even when the text isn't identical.

import { diffWords } from 'diff';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Split extracted text into paragraph blocks. Prefer blank-line separation;
// fall back to single newlines when extraction didn't preserve blank lines.
function splitParas(text) {
  const normalized = String(text).replace(/\r\n?/g, '\n');
  let paras = normalized
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (paras.length <= 1) {
    paras = normalized
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return paras;
}

// Similarity of two paragraphs: Sørensen–Dice coefficient over their word
// multisets, in [0, 1]. 1 = identical wording, 0 = no shared words. Robust to
// reordering and to the kind of small wording changes a revision introduces.
function paragraphSimilarity(a, b) {
  const aw = (a.toLowerCase().match(/\S+/g)) || [];
  const bw = (b.toLowerCase().match(/\S+/g)) || [];
  if (!aw.length || !bw.length) return 0;
  const counts = new Map();
  for (const w of bw) counts.set(w, (counts.get(w) || 0) + 1);
  let shared = 0;
  for (const w of aw) {
    const c = counts.get(w) || 0;
    if (c > 0) {
      shared += 1;
      counts.set(w, c - 1);
    }
  }
  return (2 * shared) / (aw.length + bw.length);
}

// Two paragraphs below this similarity are treated as unrelated (a delete +
// an insert) rather than a single edited paragraph. Tuned so a substantially
// rewritten-but-same-topic paragraph still pairs, while unrelated paragraphs
// don't get force-matched into word soup.
const PARA_MATCH_THRESHOLD = 0.35;

// Align two paragraph lists into an ordered op list using Needleman–Wunsch,
// maximizing the total similarity of matched pairs. Returns ops of:
//   { type: 'pair', old, new }  — matched paragraphs, to be word-diffed
//   { type: 'del', old }        — paragraph only in the draft
//   { type: 'ins', new }        — paragraph only in the revision
function alignParagraphs(oldParas, newParas) {
  const n = oldParas.length;
  const m = newParas.length;

  const sim = oldParas.map((op) => newParas.map((np) => paragraphSimilarity(op, np)));

  // dp[i][j] = best total match-similarity aligning oldParas[i..] / newParas[j..].
  // Boundary rows/cols default to 0 (only deletes or inserts remain).
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const match =
        sim[i][j] >= PARA_MATCH_THRESHOLD ? sim[i][j] + dp[i + 1][j + 1] : -Infinity;
      dp[i][j] = Math.max(match, dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const match =
      sim[i][j] >= PARA_MATCH_THRESHOLD ? sim[i][j] + dp[i + 1][j + 1] : -Infinity;
    if (match >= dp[i + 1][j] && match >= dp[i][j + 1]) {
      ops.push({ type: 'pair', old: oldParas[i], new: newParas[j] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', old: oldParas[i] });
      i += 1;
    } else {
      ops.push({ type: 'ins', new: newParas[j] });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ type: 'del', old: oldParas[i] });
    i += 1;
  }
  while (j < m) {
    ops.push({ type: 'ins', new: newParas[j] });
    j += 1;
  }
  return ops;
}

// jsdiff word-diff options. `ignoreCase` folds case so capitalization-only
// edits aren't flagged; jsdiff's word tokenizer already absorbs most spacing
// differences, so this covers the "ignore case & spacing" control.
function diffOpts(opts) {
  return opts.ignoreCase ? { ignoreCase: true } : undefined;
}

// Word-level diff of two paragraphs -> inline HTML with <span class="add|del">.
function wordDiffHtml(oldText, newText, opts = {}) {
  const parts = diffWords(oldText || '', newText || '', diffOpts(opts));
  let out = '';
  for (const p of parts) {
    const text = escapeHtml(p.value);
    if (p.added) out += `<span class="add">${text}</span>`;
    else if (p.removed) out += `<span class="del">${text}</span>`;
    else out += text;
  }
  return out;
}

// Word-level diff split across two columns: the old side keeps removed +
// unchanged words, the new side keeps added + unchanged. `changed` is false
// when the paragraphs are word-for-word identical.
function wordDiffSides(oldText, newText, opts = {}) {
  const parts = diffWords(oldText || '', newText || '', diffOpts(opts));
  let oldHtml = '';
  let newHtml = '';
  let changed = false;
  for (const p of parts) {
    const text = escapeHtml(p.value);
    if (p.added) {
      newHtml += `<span class="add">${text}</span>`;
      changed = true;
    } else if (p.removed) {
      oldHtml += `<span class="del">${text}</span>`;
      changed = true;
    } else {
      oldHtml += text;
      newHtml += text;
    }
  }
  return { oldHtml, newHtml, changed };
}

// Full document diff -> inline HTML of <p> blocks. Matched paragraphs are
// word-diffed (identical ones come through clean and get the `unchanged`
// class so the UI can hide them); unmatched paragraphs show wholly del/ins.
export function renderDiff(oldText, newText, opts = {}) {
  const ops = alignParagraphs(splitParas(oldText), splitParas(newText));
  const blocks = [];
  for (const op of ops) {
    if (op.type === 'pair') {
      const inner = wordDiffHtml(op.old, op.new, opts);
      const cls = inner.includes('<span') ? '' : ' class="unchanged"';
      blocks.push(`<p${cls}>${inner}</p>`);
    } else if (op.type === 'del') {
      blocks.push(`<p><span class="del">${escapeHtml(op.old)}</span></p>`);
    } else {
      blocks.push(`<p><span class="add">${escapeHtml(op.new)}</span></p>`);
    }
  }
  return blocks.join('\n');
}

// Same diff, laid out as two aligned columns (old | new). Each op is a row;
// unchanged rows get the `unchanged` class so they can be hidden too.
export function renderDiffSideBySide(oldText, newText, opts = {}) {
  const ops = alignParagraphs(splitParas(oldText), splitParas(newText));
  const rows = [];
  for (const op of ops) {
    let oldHtml = '';
    let newHtml = '';
    let unchanged = false;
    if (op.type === 'pair') {
      const sides = wordDiffSides(op.old, op.new, opts);
      oldHtml = sides.oldHtml;
      newHtml = sides.newHtml;
      unchanged = !sides.changed;
    } else if (op.type === 'del') {
      oldHtml = `<span class="del">${escapeHtml(op.old)}</span>`;
    } else {
      newHtml = `<span class="add">${escapeHtml(op.new)}</span>`;
    }
    const cls = unchanged ? 'sxs-row unchanged' : 'sxs-row';
    rows.push(
      `<div class="${cls}"><div class="sxs-cell sxs-old">${oldHtml}</div>` +
        `<div class="sxs-cell sxs-new">${newHtml}</div></div>`
    );
  }
  return `<div class="sxs">${rows.join('\n')}</div>`;
}

// "Did they really revise?" at a glance: words added/removed and how many
// paragraph blocks changed. Pure counting, no AI.
export function computeStats(oldText, newText, opts = {}) {
  // Word counts come from a single whole-document word diff, which is
  // independent of paragraph alignment and so robust to extraction quirks.
  const parts = diffWords(oldText || '', newText || '', diffOpts(opts));
  let added = 0;
  let removed = 0;
  for (const p of parts) {
    const count = p.value.trim() ? p.value.trim().split(/\s+/).length : 0;
    if (p.added) added += count;
    else if (p.removed) removed += count;
  }

  // Changed-block count uses the same alignment renderDiff displays: an edited
  // paragraph counts once, a deleted or inserted one counts once. A paired
  // paragraph counts as changed only if a word diff (under the same options)
  // finds a difference, so e.g. a case-only edit doesn't count when
  // ignore-case is on — matching what's rendered.
  const ops = alignParagraphs(splitParas(oldText), splitParas(newText));
  let changedBlocks = 0;
  for (const op of ops) {
    if (op.type === 'del' || op.type === 'ins') changedBlocks += 1;
    else if (op.old !== op.new && wordDiffSides(op.old, op.new, opts).changed) {
      changedBlocks += 1;
    }
  }

  return { added, removed, changedBlocks };
}
