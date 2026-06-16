import './style.css';
import { extractText } from './extract.js';
import { renderDiff, computeStats } from './diff.js';

const state = { draft: null, revision: null };
const els = {};

const $ = (id) => document.getElementById(id);

function init() {
  els.output = $('output');
  els.stats = $('stats');
  els.error = $('error');
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
  nameEl.textContent = file.name;
  showError('');
  try {
    state[key] = { name: file.name, text: await extractText(file) };
  } catch (err) {
    state[key] = null;
    showError(`Couldn't read ${file.name}: ${err.message}`);
    return;
  }
  if (state.draft && state.revision) compare();
}

function compare() {
  try {
    els.output.innerHTML = renderDiff(state.draft.text, state.revision.text);
    renderStats(computeStats(state.draft.text, state.revision.text));
  } catch (err) {
    showError(`Comparison failed: ${err.message}`);
  }
}

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
