import './style.css';
import { extractText, extractTextFromFile } from './extract.js';
import { renderDiff, computeStats } from './diff.js';
import { readZip } from './canvas.js';
import { matchSubmissions, pickPrimary } from './batch.js';

const state = { draft: null, revision: null };
const els = {};

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
  bindInput('draft-input', 'draft-zone', 'draft-name', 'draft');
  bindInput('revision-input', 'revision-zone', 'revision-name', 'revision');
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
    els.output.innerHTML = renderDiff(d, r);
    renderStats(computeStats(d, r));
  } catch (err) {
    showError(`Comparison failed: ${err.message}`);
  }
}

// --- Batch (ZIP) mode -------------------------------------------------------

function renderBatch() {
  const result = matchSubmissions(state.draft.entries, state.revision.entries);
  const { matched, missingDraft, missingRevision } = result;

  const parts = [];
  parts.push(
    `<div class="summary"><strong>${matched.length}</strong> matched · ` +
      `<strong>${missingDraft.length}</strong> missing a draft · ` +
      `<strong>${missingRevision.length}</strong> missing a revision</div>`
  );

  if (missingDraft.length || missingRevision.length) {
    parts.push('<div class="missing"><h3>⚠ Incomplete submissions</h3>');
    if (missingDraft.length) {
      parts.push('<p><strong>Submitted a revision but no draft:</strong></p><ul>');
      for (const s of missingDraft) parts.push(studentLine(s));
      parts.push('</ul>');
    }
    if (missingRevision.length) {
      parts.push('<p><strong>Submitted a draft but no revision:</strong></p><ul>');
      for (const s of missingRevision) parts.push(studentLine(s));
      parts.push('</ul>');
    }
    parts.push('</div>');
  }

  parts.push('<h3>Matched students</h3><ul class="roster-list">');
  matched.forEach((s, i) => {
    const multi =
      s.draft.length > 1 || s.revision.length > 1
        ? ' <span class="multi">multiple files</span>'
        : '';
    parts.push(
      `<li><button class="student" data-i="${i}">${escapeHtml(s.slug)} ` +
        `<span class="uid">(${s.userid})</span></button>${multi}</li>`
    );
  });
  parts.push('</ul>');

  els.roster.innerHTML = parts.join('');
  els.roster.querySelectorAll('button.student').forEach((btn) => {
    btn.addEventListener('click', () => showStudent(matched[+btn.dataset.i], btn));
  });
}

function studentLine(s) {
  return `<li>${escapeHtml(s.slug)} <span class="uid">(${s.userid})</span></li>`;
}

async function showStudent(student, btn) {
  els.roster
    .querySelectorAll('button.student')
    .forEach((b) => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  els.stats.hidden = true;
  els.output.innerHTML = '<p>Comparing…</p>';

  try {
    const draft = pickPrimary(student.draft);
    const revision = pickPrimary(student.revision);
    const [dt, rt] = await Promise.all([
      readEntry(draft.chosen),
      readEntry(revision.chosen),
    ]);

    const head =
      `<div class="diff-head"><h2>${escapeHtml(student.slug)} ` +
      `<span class="uid">(${student.userid})</span></h2>` +
      `<p><strong>Draft:</strong> ${escapeHtml(draft.chosen.original)}<br/>` +
      `<strong>Revision:</strong> ${escapeHtml(revision.chosen.original)}</p>` +
      altNote('draft', draft.alternates) +
      altNote('revision', revision.alternates) +
      '</div>';

    els.output.innerHTML = head + renderDiff(dt, rt);
    renderStats(computeStats(dt, rt));
  } catch (err) {
    els.output.innerHTML = `<p class="inline-error">Couldn't compare this student: ${escapeHtml(
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

init();
