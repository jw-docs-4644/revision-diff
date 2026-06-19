import './style.css';
import { extractText, extractTextFromFile } from './extract.js';
import { renderDiff, renderDiffSideBySide, computeStats } from './diff.js';
import { readZip } from './canvas.js';
import { matchSubmissions, pickPrimary } from './batch.js';

const state = { draft: null, revision: null };
const els = {};

// The diff currently on screen, kept so the view toggles can re-render it
// without re-reading the source files. null when the view isn't a two-sided diff.
let currentDiff = null;

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function init() {
  els.output = $('output');
  els.stats = $('stats');
  els.error = $('error');
  els.roster = $('roster-area');
  els.matchSummary = $('match-summary');
  els.optSxs = $('opt-sxs');
  els.optHideUnchanged = $('opt-hide-unchanged');
  els.optIgnoreCase = $('opt-ignore-case');
  bindInput('draft-input', 'draft-zone', 'draft-name', 'draft');
  bindInput('revision-input', 'revision-zone', 'revision-name', 'revision');
  // Side-by-side and ignore-case change the rendered diff, so re-paint.
  els.optSxs.addEventListener('change', paintDiff);
  els.optIgnoreCase.addEventListener('change', paintDiff);
  // Hide-unchanged is a pure CSS toggle on the already-rendered diff — live,
  // no recompute.
  els.optHideUnchanged.addEventListener('change', applyHideUnchanged);
  document.addEventListener('click', (e) => {
    document.querySelectorAll('details.incomplete-details[open]').forEach((d) => {
      if (!d.contains(e.target)) d.removeAttribute('open');
    });
  });
}

function applyHideUnchanged() {
  els.output.classList.toggle('hide-unchanged', els.optHideUnchanged.checked);
}

// Render currentDiff at the current view settings. Re-runnable on toggle; the
// head (filenames etc.) is preserved above the diff body.
function paintDiff() {
  if (!currentDiff) return;
  const { head, oldText, newText } = currentDiff;
  const opts = { ignoreCase: els.optIgnoreCase.checked };
  const body = els.optSxs.checked
    ? renderDiffSideBySide(oldText, newText, opts)
    : renderDiff(oldText, newText, opts);
  els.output.innerHTML = head + body;
  applyHideUnchanged();
  renderStats(computeStats(oldText, newText, opts));
}

// Make the given two-sided comparison the active diff and paint it.
function showComparison(head, oldText, newText) {
  currentDiff = { head, oldText, newText };
  paintDiff();
}

function bindInput(inputId, zoneId, nameId, key) {
  const input = $(inputId);
  const zone = $(zoneId);
  const nameEl = $(nameId);

  input.addEventListener('change', () => {
    if (input.files && input.files[0]) handleFile(input.files[0], key, nameEl);
  });

  ['dragover', 'dragenter'].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.add('drag');
    })
  );
  ['dragleave', 'drop'].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.remove('drag');
    })
  );
  zone.addEventListener('drop', (e) => {
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f, key, nameEl);
  });
}

async function handleFile(file, key, nameEl) {
  const isZip = /\.zip$/i.test(file.name);
  nameEl.textContent = file.name;
  showError('');
  try {
    if (isZip) {
      const entries = await readZip(file);
      if (!entries.length) {
        throw new Error('no Canvas-named submissions found in this ZIP');
      }
      state[key] = { type: 'zip', name: file.name, entries };
    } else {
      state[key] = { type: 'single', name: file.name, file };
    }
  } catch (err) {
    state[key] = null;
    showError(`Couldn't read ${file.name}: ${err.message}`);
    return;
  }
  maybeRun();
}

function resetOutputs() {
  els.stats.hidden = true;
  els.stats.innerHTML = '';
  els.roster.innerHTML = '';
  els.output.innerHTML = '';
  els.matchSummary.hidden = true;
  els.matchSummary.innerHTML = '';
  currentDiff = null;
}

function maybeRun() {
  if (!state.draft || !state.revision) return;
  resetOutputs();
  const a = state.draft.type;
  const b = state.revision.type;
  if (a === 'zip' && b === 'zip') return renderBatch();
  if (a === 'single' && b === 'single') return runSingle();
  return showError(
    'Upload two ZIP files (one per assignment) or two single documents — not a mix of the two.'
  );
}

// --- Single-file mode -------------------------------------------------------

async function runSingle() {
  try {
    const [d, r] = await Promise.all([
      extractTextFromFile(state.draft.file),
      extractTextFromFile(state.revision.file),
    ]);
    showComparison('', d, r);
  } catch (err) {
    showError(`Comparison failed: ${err.message}`);
  }
}

// --- Batch (ZIP) mode -------------------------------------------------------

function renderBatch() {
  const result = matchSubmissions(state.draft.entries, state.revision.entries);
  const { matched, missingDraft, missingRevision } = result;
  const totalIncomplete = missingDraft.length + missingRevision.length;

  const parts = [];

  let incompleteHtml = '';
  if (totalIncomplete > 0) {
    let panel = '<div class="incomplete-panel">';
    if (missingDraft.length) {
      panel += `<p><strong>Revision submitted, no draft:</strong></p><ul>`;
      for (const s of missingDraft) panel += studentLine(s);
      panel += '</ul>';
    }
    if (missingRevision.length) {
      panel += `<p><strong>Draft submitted, no revision:</strong></p><ul>`;
      for (const s of missingRevision) panel += studentLine(s);
      panel += '</ul>';
    }
    panel += '</div>';
    incompleteHtml =
      ` · <details class="incomplete-details">` +
      `<summary><strong>${totalIncomplete}</strong> incomplete</summary>` +
      panel +
      `</details>`;
  }

  els.matchSummary.hidden = false;
  els.matchSummary.innerHTML =
    `<h2>Results</h2>` +
    `<p><strong>${matched.length}</strong> matched${incompleteHtml}</p>`;

  // One roster of everyone, sorted by name: matched students plus those who
  // submitted only one side. Each carries a status so showStudent knows what
  // to render.
  const students = [
    ...matched.map((s) => ({ ...s, status: 'both' })),
    ...missingDraft.map((s) => ({ ...s, status: 'revision-only' })),
    ...missingRevision.map((s) => ({ ...s, status: 'draft-only' })),
  ].sort((a, b) => a.slug.localeCompare(b.slug));

  parts.push('<div class="student-nav">');
  parts.push('<button class="nav-btn" id="prev-student" disabled>&#8592;</button>');
  parts.push('<select id="student-select"><option value="" disabled selected>— select a student —</option>');
  students.forEach((s, i) => {
    let tag = '';
    if (s.status === 'revision-only') tag = ' — revision only';
    else if (s.status === 'draft-only') tag = ' — no revision';
    else if (s.draft.length > 1 || s.revision.length > 1) tag = ' *';
    parts.push(`<option value="${i}">${escapeHtml(s.slug)} (${s.userid})${tag}</option>`);
  });
  parts.push('</select>');
  parts.push('<button class="nav-btn" id="next-student">&#8594;</button>');
  parts.push('</div>');

  els.roster.innerHTML = parts.join('');

  const select = document.getElementById('student-select');
  const prevBtn = document.getElementById('prev-student');
  const nextBtn = document.getElementById('next-student');

  function currentIndex() {
    return select.value === '' ? -1 : parseInt(select.value, 10);
  }

  function goTo(i) {
    select.value = String(i);
    prevBtn.disabled = i <= 0;
    nextBtn.disabled = i >= students.length - 1;
    showStudent(students[i]);
  }

  select.addEventListener('change', () => goTo(currentIndex()));

  prevBtn.addEventListener('click', () => {
    const i = currentIndex();
    if (i > 0) goTo(i - 1);
  });

  nextBtn.addEventListener('click', () => {
    const i = currentIndex();
    if (i < students.length - 1) goTo(i + 1);
    else if (i === -1) goTo(0);
  });
}

function studentLine(s) {
  return `<li>${escapeHtml(s.slug)} <span class="uid">(${s.userid})</span></li>`;
}

function studentHead(student, lines = '') {
  return (
    `<div class="diff-head"><h2>${escapeHtml(student.slug)} ` +
    `<span class="uid">(${student.userid})</span></h2>` +
    lines +
    '</div>'
  );
}

// Render a single document's text as plain paragraphs (no diff). Used to show
// the lone submission of a student who only turned in one side.
function renderPlain(text) {
  const paras = String(text)
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  const blocks = paras.length ? paras : [String(text).trim()];
  return blocks.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n');
}

async function showStudent(student) {
  els.stats.hidden = true;
  currentDiff = null;
  els.output.innerHTML = '<p>Loading…</p>';

  try {
    if (student.status === 'draft-only') {
      // Submitted a draft but never a revision — nothing to show.
      els.output.innerHTML = studentHead(
        student,
        '<p class="notice">⚠ No revision submitted — only a draft was turned in.</p>'
      );
      return;
    }

    if (student.status === 'revision-only') {
      // No draft to diff against; just show the revision they turned in.
      const revision = pickPrimary(student.revision);
      const rt = await readEntry(revision.chosen);
      els.output.innerHTML =
        studentHead(
          student,
          '<p class="notice">⚠ No draft submitted — showing the revision only, with nothing to compare against.</p>' +
            `<p><strong>Revision:</strong> ${escapeHtml(revision.chosen.original)}</p>` +
            altNote('revision', revision.alternates)
        ) + renderPlain(rt);
      return;
    }

    const draft = pickPrimary(student.draft);
    const revision = pickPrimary(student.revision);
    const [dt, rt] = await Promise.all([
      readEntry(draft.chosen),
      readEntry(revision.chosen),
    ]);

    const head = studentHead(
      student,
      `<p><strong>Draft:</strong> ${escapeHtml(draft.chosen.original)}<br/>` +
        `<strong>Revision:</strong> ${escapeHtml(revision.chosen.original)}</p>` +
        altNote('draft', draft.alternates) +
        altNote('revision', revision.alternates)
    );

    showComparison(head, dt, rt);
  } catch (err) {
    els.output.innerHTML = `<p class="inline-error">Couldn't load this student: ${escapeHtml(
      err.message
    )}</p>`;
  }
}

function altNote(side, alternates) {
  if (!alternates || !alternates.length) return '';
  const names = alternates.map((a) => escapeHtml(a.original)).join(', ');
  return `<p class="alt">⚠ Multiple ${side} files submitted — compared the most recent. Not compared: ${names}</p>`;
}

async function readEntry(fileObj) {
  const arrayBuffer = await fileObj.entry.async('arraybuffer');
  return extractText(arrayBuffer, fileObj.original);
}

// --- Shared -----------------------------------------------------------------

function renderStats(s) {
  els.stats.hidden = false;
  els.stats.innerHTML =
    `<strong>+${s.added}</strong> words added · ` +
    `<strong>−${s.removed}</strong> removed · ` +
    `<strong>${s.changedBlocks}</strong> paragraph(s) changed`;
}

function showError(msg) {
  if (!msg) {
    els.error.hidden = true;
    els.error.textContent = '';
    return;
  }
  els.error.hidden = false;
  els.error.textContent = msg;
}

// Open all intro-column links in a new tab so they don't navigate the iframe.
document.querySelectorAll('.intro-links a').forEach((a) => {
  a.target = '_blank';
  a.rel = 'noopener';
});

init();
