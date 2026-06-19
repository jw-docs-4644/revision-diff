// Pull plain text out of a document, entirely in the browser.
// Replaces the Python tool's pandoc subprocess + Canvas downloads.
// Works from either a File (single-file mode) or an ArrayBuffer (ZIP mode).

import mammoth from 'mammoth/mammoth.browser';

export async function extractTextFromFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  return extractText(arrayBuffer, file.name);
}

export async function extractText(arrayBuffer, name) {
  const n = (name || '').toLowerCase();

  if (n.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  if (n.endsWith('.pdf')) {
    return extractPdf(arrayBuffer);
  }

  // .txt, .md, or anything else: treat as plain text.
  return new TextDecoder().decode(arrayBuffer);
}

// PDF text extraction via pdf.js. Dynamically imported so the worker setup
// and the (large) library stay out of the initial bundle.
//
// Uses Y-coordinates to detect paragraph breaks: a vertical gap larger than
// 1.5× the median line spacing is treated as a paragraph boundary. This
// preserves paragraph structure that the naive "join everything with spaces"
// approach loses.
async function extractPdf(arrayBuffer) {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url'))
    .default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pages = [];

  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items.filter((it) => 'str' in it && it.str.trim());
    if (!items.length) continue;

    // Group items by rounded Y position (same visual line), keeping full
    // item objects so we can measure horizontal extents.
    const linesByY = new Map();
    for (const item of items) {
      const y = Math.round(item.transform[5]);
      if (!linesByY.has(y)) linesByY.set(y, []);
      linesByY.get(y).push(item);
    }

    // Sort lines top-to-bottom (PDF y=0 is at the bottom, so descending).
    const lines = [...linesByY.keys()]
      .sort((a, b) => b - a)
      .map((y) => {
        const its = linesByY.get(y).sort((a, b) => a.transform[4] - b.transform[4]);
        const last = its[its.length - 1];
        // Horizontal span: right edge of last item minus left edge of first.
        const lineWidth = last.transform[4] + (last.width || 0) - its[0].transform[4];
        return { y, text: its.map((it) => it.str).join('').trim(), lineWidth };
      })
      .filter((l) => l.text);

    if (!lines.length) continue;

    // Median vertical gap = typical line spacing.
    const yGaps = [];
    for (let j = 1; j < lines.length; j += 1) yGaps.push(lines[j - 1].y - lines[j].y);
    yGaps.sort((a, b) => a - b);
    const medianGap = yGaps[Math.floor(yGaps.length / 2)] || 12;

    // 90th-percentile line width = a "full" line reaching the right margin.
    const widths = lines.map((l) => l.lineWidth).sort((a, b) => a - b);
    const fullWidth = widths[Math.floor(widths.length * 0.9)] || 0;

    // Paragraph break when:
    //   • vertical gap > 1.5× median (documents with blank lines between paras), OR
    //   • previous line was short (< 75% of full width) — the last line of a
    //     paragraph almost never reaches the right margin, even in double-spaced
    //     essays where the vertical gap alone can't distinguish paras from lines.
    let pageText = lines[0].text;
    for (let j = 1; j < lines.length; j += 1) {
      const prev = lines[j - 1];
      const gap = prev.y - lines[j].y;
      const isParaBreak =
        gap > medianGap * 1.5 || (fullWidth > 0 && prev.lineWidth < fullWidth * 0.75);
      pageText += isParaBreak ? '\n\n' : ' ';
      pageText += lines[j].text;
    }
    pages.push(pageText);
  }

  return pages.join('\n\n');
}
