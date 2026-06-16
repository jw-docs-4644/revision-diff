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
    pages.push(content.items.map((it) => it.str).join(' '));
  }
  return pages.join('\n\n');
}
