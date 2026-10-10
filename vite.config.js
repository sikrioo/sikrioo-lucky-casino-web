import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// <!-- @include path --> in index.html is replaced by that file (paths are relative to the project root)
function htmlIncludes() {
  const re = /<!--\s*@include\s+(\S+)\s*-->/g;
  const expand = (html, depth = 0) => html.replace(re, (_, p) => {
    if (depth > 5) throw new Error('include nesting too deep: ' + p);
    return expand(readFileSync(resolve(__dirname, p), 'utf8'), depth + 1).replace(/\n$/, '');
  });
  return {
    name: 'html-includes',
    transformIndexHtml: { order: 'pre', handler: html => expand(html) },
    handleHotUpdate({ file, server }) { if (file.endsWith('.html')) server.ws.send({ type: 'full-reload' }); }
  };
}

export default defineConfig({
  plugins: [htmlIncludes(), viteSingleFile()],
  build: { target: 'es2020', outDir: 'dist', assetsInlineLimit: 100000000, cssCodeSplit: false }
});
