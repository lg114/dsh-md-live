import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

// The Client module id MUST equal the package name: the Host serves this bundle
// as the package's client half, and the browser resolves `dsh-md-live` / `dsh-md-live/client`
// to whatever factory was registered under this id.
const PACKAGE_NAME = 'dsh-md-live';

async function build() {
  const cssPath = path.join(process.cwd(), 'src/client/styles/panel.css');
  const cssContent = fs.readFileSync(cssPath, 'utf-8');

  // 1) Compile the TSX entry to a self-contained CJS module body.
  //    `react` stays external: it comes from the browser's shared module table.
  const result = await esbuild.build({
    entryPoints: ['src/client/index.tsx'],
    bundle: true,
    format: 'cjs',
    outfile: 'lib/client.cjs',
    platform: 'browser',
    target: ['es2020'],
    sourcemap: false,
    minify: false,
    write: false,
    external: [
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-client-store',
      '@deepseek-ai/dsh-client-ui-slots',
      '@deepseek-ai/dsh-client-ui-primitives',
      '@deepseek-ai/dsh-client-ui-dockkit',
    ],
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    loader: {
      '.tsx': 'tsx',
      '.ts': 'ts',
    },
  });

  const body = result.outputFiles[0].text;

  // 2) Wrap it in the DSH Client module format:
  //    executing the script only REGISTERS a lazy factory; the factory body
  //    (module side effects, CSS injection included) runs at materialization,
  //    when the loader calls factory(require) and supplies `require`.
  //    Without this wrapper the bundle's `require("react")` runs at script
  //    evaluation against no `require` at all -> "require is not defined".
  const wrapped = `// DSH Client Module: ${PACKAGE_NAME}
window.__ModuleLoader__.load({
	id: ${JSON.stringify(PACKAGE_NAME)},
	factory: (require) => {
		"use strict";
		var module = { exports: {} };
		var exports = module.exports;

${body}

		// Styles live inside the factory so they are injected at materialization,
		// not at script execution.
		if (typeof document !== 'undefined') {
			var style = document.createElement('style');
			style.setAttribute('data-dsh-plugin', ${JSON.stringify(PACKAGE_NAME)});
			style.textContent = ${JSON.stringify(cssContent)};
			document.head.appendChild(style);
		}

		return module.exports;
	}
});
`;

  fs.writeFileSync(path.join(process.cwd(), 'lib/client.cjs'), wrapped, 'utf-8');
  console.log(`✓ Client bundle built: lib/client.cjs (module id: ${PACKAGE_NAME})`);
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
