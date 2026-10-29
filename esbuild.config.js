import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

// The Client module id MUST equal the package name: the Host serves this bundle
// as the package's client half, and the browser resolves `dsh-md-live` / `dsh-md-live/client`
// to whatever factory was registered under this id.
const PACKAGE_NAME = 'dsh-md-live';

// Modules the DSH browser shell supplies. Every one of these is resolved from
// the shared module table at runtime, not bundled into the plugin.
const PLATFORM_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
];

/**
 * Wrap an esbuild CJS output in the DSH Client module format.
 *
 * Executing the script only REGISTERS a lazy factory; the factory body runs at
 * materialization, when the loader calls factory(require) and supplies the
 * shared `require`. Without this wrapper the bundle's `require("react")` runs
 * at script evaluation against no `require` at all -> "require is not defined".
 *
 * Chunks carry a `chunk` field so the loader files them under the parent
 * module id; the entry has no chunk field.
 *
 * The entry bundle ships its CSS as a sibling file (lib/client.css). The
 * wrapper captures `document.currentScript` at load time so the factory can
 * derive the CSS URL and inject a <link> tag — keeping the CSS out of the JS
 * bundle for independent caching and a smaller payload.
 */
function wrapModule(body, chunk, injectCssLink) {
  const chunkField = chunk ? `\n\tchunk: ${JSON.stringify(chunk)},` : '';
  const cssSetup = injectCssLink
    ? `var __cssBase = (typeof document !== 'undefined' && document.currentScript)
\t\t? document.currentScript.src : '';`
    : '';
  const cssInjection = injectCssLink
    ? `\n\t\tif (typeof document !== 'undefined' && __cssBase) {
\t\t\tvar link = document.createElement('link');
\t\t\tlink.rel = 'stylesheet';
\t\t\tlink.href = new URL('./client.css', __cssBase).href;
\t\t\tlink.setAttribute('data-dsh-plugin', ${JSON.stringify(PACKAGE_NAME)});
\t\t\tdocument.head.appendChild(link);
\t\t}`
    : '';
  const label = chunk ? `${PACKAGE_NAME}.${chunk}` : PACKAGE_NAME;

  return `// DSH Client Module: ${label}
${cssSetup ? `${cssSetup}\n` : ''}window.__ModuleLoader__.load({
\tid: ${JSON.stringify(PACKAGE_NAME)},${chunkField}
\tfactory: (require) => {
\t\t"use strict";
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;

${body}
${cssInjection}
\t\treturn module.exports;
\t}
});
`;
}

async function build() {
  const shared = {
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: ['es2020'],
    sourcemap: false,
    minify: true,
    legalComments: 'eof',
    write: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.tsx': 'tsx', '.ts': 'ts' },
  };

  // Minify panel.css into a standalone file so the entry bundle loads it via
  // a <link> tag instead of carrying it as an inline string.
  const cssRaw = fs.readFileSync(
    path.join(process.cwd(), 'src/client/styles/panel.css'),
    'utf-8',
  );
  const cssMinified = await esbuild.transform(cssRaw, {
    loader: 'css',
    minify: true,
  });
  fs.writeFileSync(
    path.join(process.cwd(), 'lib/client.css'),
    cssMinified.code,
    'utf-8',
  );

  // 1) Entry: the main tab, React components, marked, DOMPurify, hljs core.
  //    KaTeX and hljs language definitions are NOT here — they live in chunks.
  const entryResult = await esbuild.build({
    ...shared,
    entryPoints: ['src/client/index.tsx'],
    outfile: 'lib/client.cjs',
    external: PLATFORM_EXTERNALS,
  });

  const entryBody = entryResult.outputFiles[0].text;
  fs.writeFileSync(
    path.join(process.cwd(), 'lib/client.cjs'),
    wrapModule(entryBody, null, true),
    'utf-8',
  );

  // 2) KaTeX chunk: loaded on demand when the document carries math.
  const katexResult = await esbuild.build({
    ...shared,
    entryPoints: ['src/client/chunks/katex.ts'],
    outfile: 'lib/client.katex.js',
    external: PLATFORM_EXTERNALS,
  });

  const katexBody = katexResult.outputFiles[0].text;
  fs.writeFileSync(
    path.join(process.cwd(), 'lib/client.katex.js'),
    wrapModule(katexBody, 'katex', null),
    'utf-8',
  );

  // 3) highlight.js languages chunk: loaded on demand when the document
  //    carries code blocks. The hljs core stays in the entry bundle.
  const hljsResult = await esbuild.build({
    ...shared,
    entryPoints: ['src/client/chunks/hljs-languages.ts'],
    outfile: 'lib/client.hljs-languages.js',
    external: PLATFORM_EXTERNALS,
  });

  const hljsBody = hljsResult.outputFiles[0].text;
  fs.writeFileSync(
    path.join(process.cwd(), 'lib/client.hljs-languages.js'),
    wrapModule(hljsBody, 'hljs-languages', null),
    'utf-8',
  );

  const entrySize = fs.statSync(path.join(process.cwd(), 'lib/client.cjs')).size;
  const cssSize = fs.statSync(path.join(process.cwd(), 'lib/client.css')).size;
  const katexSize = fs.statSync(path.join(process.cwd(), 'lib/client.katex.js')).size;
  const hljsSize = fs.statSync(path.join(process.cwd(), 'lib/client.hljs-languages.js')).size;
  const fmt = (n) => n > 1024 ? `${(n / 1024).toFixed(0)} KB` : `${n} B`;

  console.log(`✓ Client bundles built:`);
  console.log(`  lib/client.cjs            ${fmt(entrySize)} (entry)`);
  console.log(`  lib/client.css            ${fmt(cssSize)} (styles)`);
  console.log(`  lib/client.katex.js       ${fmt(katexSize)} (chunk: math)`);
  console.log(`  lib/client.hljs-languages.js ${fmt(hljsSize)} (chunk: highlighting)`);
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
