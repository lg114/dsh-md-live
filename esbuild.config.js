import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

async function build() {
  // Build as CJS first
  const result = await esbuild.build({
    entryPoints: ['src/client/index.tsx'],
    bundle: true,
    format: 'cjs',
    outfile: 'lib/client.tmp.cjs',
    platform: 'browser',
    target: ['es2020'],
    sourcemap: false,
    minify: false,
    external: [
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      '@deepseek-ai/cordis',
      'dsh-client-store',
      'dsh-client-ui-slots',
      'dsh-client-ui-primitives',
      'dsh-client-runtime',
    ],
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    loader: {
      '.tsx': 'tsx',
      '.ts': 'ts',
      '.css': 'css',
    },
  });

  // Read the CJS bundle
  const tmpPath = path.join(process.cwd(), 'lib/client.tmp.cjs');
  const bundleContent = fs.readFileSync(tmpPath, 'utf-8');

  // Wrap in DSH's module loader format
  const wrappedContent = `// DSH Client Module: dsh-md-live/client
window.__ModuleLoader__.load({
  id: 'dsh-md-live/client',
  factory: function(require) {
    var module = { exports: {} };
    var exports = module.exports;
    
    ${bundleContent}
    
    return module.exports;
  }
});
`;

  // Write the final wrapped bundle
  const finalPath = path.join(process.cwd(), 'lib/client.cjs');
  fs.writeFileSync(finalPath, wrappedContent, 'utf-8');

  // Clean up temp file
  fs.unlinkSync(tmpPath);

  console.log('✓ Client bundle built and wrapped: lib/client.cjs');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
