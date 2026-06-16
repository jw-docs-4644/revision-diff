// Pull plain text out of an uploaded file, entirely in the browser.
// Replaces the Python tool's pandoc subprocess + Canvas downloads.

import mammoth from 'mammoth/mammoth.browser';

export async function extractText(file) {
  const name = (file.name || '').toLowerCase();

  if (name.endsWith('.docx')) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }

  if (name.endsWith('.pdf')) {
    return extractPdf(file);
  }

  if (name.endsWith('.txt') || name.endsWith('.md')) {
    return file.text();
  }

  // Best-effort: treat anything else as plain text.
  return file.text();
}

// PDF text extraction via pdf.js. Dynamically imported so the worker setup
// and the (large) library stay out of the initial bundle.
async function extractPdf(file) {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url'))
    .default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const arrayBuffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: arrayBuffer }).promise;

  const pages = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => it.str).join(' '));
  }
  return pages.join('\n\n');
}
