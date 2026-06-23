// Revision Diff — compare a draft and a revision in the browser.
// Copyright (C) 2026 Sheetbend, LLC
// Licensed under the GNU AGPL-3.0. See the LICENSE file for details.

// Parse Canvas "Download All Submissions" ZIPs.
//
// Canvas names each bulk-downloaded file:
//   studentslug[_LATE]_<userid>_<submissionid>_<originalfilename>.ext
// e.g.  olverafatima_177122_16200539_Assignment 3 draft.docx
//       giampietroelijahs_LATE_178647_16203579_ENG 301 Problem Statement.docx
//
// The numeric user id is the stable per-student key (the slug is
// lastname+firstname, handy for display). The original filename can itself
// contain underscores and spaces, so we anchor on the two consecutive
// numeric ids rather than splitting on "_".

import JSZip from 'jszip';

const NAME_RE = /^(.+?)(_LATE)?_(\d+)_(\d+)_(.+)$/;

export function parseFilename(name) {
  const m = name.match(NAME_RE);
  if (!m) return null;
  return {
    slug: m[1],
    late: Boolean(m[2]),
    userid: m[3],
    subid: m[4],
    original: m[5],
  };
}

// Read a Canvas submissions ZIP into a flat list of parsed entries.
// Skips directories, macOS resource forks, dotfiles, and anything whose name
// doesn't match the Canvas convention (so a stray syllabus.pdf won't match).
export async function readZip(file) {
  const zip = await JSZip.loadAsync(file);
  const entries = [];
  zip.forEach((path, entry) => {
    if (entry.dir) return;
    if (path.startsWith('__MACOSX')) return;
    const base = path.split('/').pop();
    if (!base || base.startsWith('.')) return;
    const parsed = parseFilename(base);
    if (!parsed) return;
    entries.push({ ...parsed, base, entry });
  });
  return entries;
}
