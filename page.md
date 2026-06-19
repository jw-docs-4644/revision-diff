<header>

# Compare Drafts and Revisions

</header>

<section class="intro">
<div class="intro-main">
<div class="intro-text">

Use this tool to quickly see what changed between a draft and its revision. Compare single files, or download submissions from two separate assignments in Canvas to compare changes for each students.

Changes are shown in a basic "diff" format. This shows which paragraphs have been added, removed, or edited. It also shows word-by-word changes within paragraphs.

</div>
<div class="privacy">
<details>
<summary><strong>Your files stay on your computer.</strong> <span class="read-more"></span></summary>

This tool runs in your browser. Submission files are read and compared on your own machine and are uploaded to a server. This tool uses no AI, no tracking, and no analytics. The page loads its code once, then works on the file add. It will even work offline.

</details>
</div>
</div>
<div class="intro-links">

#### Links

- [GitHub repository](https://github.com/jw-docs-4644/revision-diff)
- [Report an issue](https://sheetbend.app/contact)
- [Check out Sheetbend](https://sheetbend.app)

</div>
</section>

<section class="inputs">
  <div class="dropzone" id="draft-zone">
    <h2>Draft</h2>
    <label class="file-label">
      <input type="file" id="draft-input" accept=".docx,.pdf,.txt,.md,.zip" />
      <span>Choose or drop a document or a submissions ZIP</span>
    </label>
    <p class="filename" id="draft-name"></p>
  </div>
  <div class="dropzone" id="revision-zone">
    <h2>Revision</h2>
    <label class="file-label">
      <input type="file" id="revision-input" accept=".docx,.pdf,.txt,.md,.zip" />
      <span>Choose or drop a document or a submissions ZIP</span>
    </label>
    <p class="filename" id="revision-name"></p>
  </div>
  <div class="dropzone" id="match-summary" hidden></div>
</section>

<div class="error" id="error" hidden></div>

<div class="results">
<div class="results-head">
<div class="dropzone options" id="options-zone">
  <h2>Options</h2>
  <label><input type="checkbox" id="opt-sxs" /> Side-by-side</label>
  <label><input type="checkbox" id="opt-hide-unchanged" /> Hide unchanged</label>
  <label><input type="checkbox" id="opt-ignore-case" /> Ignore case &amp; spacing</label>
</div>
<div id="roster-area"></div>
<div class="stats" id="stats" hidden></div>
</div>
<section class="output" id="output"></section>
</div>
