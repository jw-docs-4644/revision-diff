// Revision Diff — compare a draft and a revision in the browser.
// Copyright (C) 2026 Sheetbend, LLC
// Licensed under the GNU AGPL-3.0. See the LICENSE file for details.

// Line up draft and revision submissions by student, and surface anyone
// who's missing one side.

function indexByUser(entries) {
  const map = new Map();
  for (const e of entries) {
    if (!map.has(e.userid)) map.set(e.userid, []);
    map.get(e.userid).push(e);
  }
  return map;
}

export function matchSubmissions(draftEntries, revisionEntries) {
  const draftMap = indexByUser(draftEntries);
  const revMap = indexByUser(revisionEntries);
  const users = new Set([...draftMap.keys(), ...revMap.keys()]);

  const matched = [];
  const missingDraft = []; // submitted a revision but no draft
  const missingRevision = []; // submitted a draft but no revision

  for (const userid of users) {
    const draft = draftMap.get(userid);
    const revision = revMap.get(userid);
    const slug = (draft && draft[0].slug) || (revision && revision[0].slug) || userid;
    if (draft && revision) matched.push({ userid, slug, draft, revision });
    else if (!draft) missingDraft.push({ userid, slug, revision });
    else missingRevision.push({ userid, slug, draft });
  }

  const bySlug = (a, b) => a.slug.localeCompare(b.slug);
  matched.sort(bySlug);
  missingDraft.sort(bySlug);
  missingRevision.sort(bySlug);
  return { matched, missingDraft, missingRevision };
}

// When a student uploaded more than one file on a side, diff the primary one
// (prefer a supported document type, then the most recent submission) and
// report the rest so the instructor knows they weren't compared.
//
// "Most recent" = highest Canvas submission id. Canvas assigns these in
// increasing order, so the largest id is the latest-submitted file.
const SUPPORTED = /\.(docx|pdf|txt|md)$/i;

export function pickPrimary(files) {
  const supported = files.filter((f) => SUPPORTED.test(f.original));
  const pool = (supported.length ? supported : files)
    .slice()
    .sort((a, b) => Number(b.subid) - Number(a.subid));
  return { chosen: pool[0], alternates: pool.slice(1) };
}
