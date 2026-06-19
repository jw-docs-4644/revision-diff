import { defineConfig } from 'vite';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { marked } from 'marked';

// Relative base so the built static site works from any host path
// (GitHub Pages subpath, a plain file server, etc.).

function markdownPage(mdFile = 'page.md') {
  const mdPath = resolve(mdFile);
  return {
    name: 'markdown-page',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const md = readFileSync(mdPath, 'utf-8');
        return html.replace('<!--CONTENT-->', marked.parse(md));
      },
    },
    handleHotUpdate({ file, server }) {
      if (file === mdPath) server.ws.send({ type: 'full-reload' });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [markdownPage()],
});
