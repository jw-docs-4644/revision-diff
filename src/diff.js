// Diff core, ported from compare_draft_final.py (word_diff / md_diff).
// Python used difflib.SequenceMatcher; here we use jsdiff, which gives the
// same two-level result: align paragraphs first, then word-diff within the
// blocks that actually changed. No AI — this is pure text comparison.

import { diffArrays, diffWords } from 'diff';

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

// Word-level diff of two paragraphs -> HTML with <span class="add|del">.
function wordDiffHtml(oldText, newText) {
  const parts = diffWords(oldText || '', newText || '');
  let out = '';
  for (const p of parts) {
    const text = escapeHtml(p.value);
    if (p.added) out += `<span class="add">${text}</span>`;
    else if (p.removed) out += `<span class="del">${text}</span>`;
    else out += text;
  }
  return out;
}

// Full document diff -> HTML string of <p> blocks. Unchanged paragraphs pass
// through untouched; changed regions are paired old/new and word-diffed.
export function renderDiff(oldText, newText) {
  const oldParas = splitParas(oldText);
  const newParas = splitParas(newText);
  const chunks = diffArrays(oldParas, newParas);

  const blocks = [];
  let i = 0;
  while (i < chunks.length) {
    const c = chunks[i];

    if (!c.added && !c.removed) {
      for (const para of c.value) blocks.push(`<p>${escapeHtml(para)}</p>`);
      i += 1;
    } else if (c.removed) {
      // A removed chunk immediately followed by an added chunk is a
      // replacement — pair the paragraphs and word-diff each pair.
      const removed = c.value;
      let added = [];
      if (i + 1 < chunks.length && chunks[i + 1].added) {
        added = chunks[i + 1].value;
        i += 2;
      } else {
        i += 1;
      }
      const n = Math.max(removed.length, added.length);
      for (let k = 0; k < n; k += 1) {
        blocks.push(`<p>${wordDiffHtml(removed[k] || '', added[k] || '')}</p>`);
      }
    } else {
      // Pure insertion.
      for (const para of c.value) {
        blocks.push(`<p><span class="add">${escapeHtml(para)}</span></p>`);
      }
      i += 1;
    }
  }
  return blocks.join('\n');
}

// "Did they really revise?" at a glance: words added/removed and how many
// paragraph blocks changed. Pure counting, no AI.
export function computeStats(oldText, newText) {
  const parts = diffWords(oldText || '', newText || '');
  let added = 0;
  let removed = 0;
  for (const p of parts) {
    const count = p.value.trim() ? p.value.trim().split(/\s+/).length : 0;
    if (p.added) added += count;
    else if (p.removed) removed += count;
  }

  // Count changed paragraphs the same way renderDiff pairs them: an edited
  // paragraph (1 old -> 1 new) counts once, not twice.
  const chunks = diffArrays(splitParas(oldText), splitParas(newText));
  let changedBlocks = 0;
  let i = 0;
  while (i < chunks.length) {
    const c = chunks[i];
    if (!c.added && !c.removed) {
      i += 1;
    } else if (c.removed) {
      const removed = c.value;
      let addedParas = [];
      if (i + 1 < chunks.length && chunks[i + 1].added) {
        addedParas = chunks[i + 1].value;
        i += 2;
      } else {
        i += 1;
      }
      changedBlocks += Math.max(removed.length, addedParas.length);
    } else {
      changedBlocks += c.value.length;
      i += 1;
    }
  }

  return { added, removed, changedBlocks };
}
