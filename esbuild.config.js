import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

async function build() {
  // Build the client bundle as IIFE
  const result = await esbuild.build({
    entryPoints: ['src/client/index.tsx'],
    bundle: true,
    format: 'iife',
    globalName: '__DshMdLiveClient__',
    outfile: 'lib/client.tmp.js',
    platform: 'browser',
    target: ['es2020'],
    sourcemap: false,
    minify: false,
    external: [
      'react',
      'react/jsx-runtime',
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

  // Read the built file
  const tmpPath = path.join(process.cwd(), 'lib/client.tmp.js');
  const bundleContent = fs.readFileSync(tmpPath, 'utf-8');

  // Wrap in DSH's lazy module loader format
  const wrappedContent = `
// DSH Client Module: dsh-md-live/client
// Auto-generated wrapper for DeepSeek Harness plugin system
(function() {
  if (typeof window !== 'undefined' && window.__ModuleLoader__) {
    window.__ModuleLoader__.load({
      id: 'dsh-md-live/client',
      factory: function(require, exports, module) {
        // External modules provided by DSH runtime
        const __dsh_externals__ = {
          'react': require('react'),
          'react/jsx-runtime': require('react/jsx-runtime'),
          'react-dom/client': require('react-dom/client'),
          '@deepseek-ai/cordis': require('@deepseek-ai/cordis'),
          'dsh-client-store': require('dsh-client-store'),
          'dsh-client-ui-slots': require('dsh-client-ui-slots'),
          'dsh-client-ui-primitives': require('dsh-client-ui-primitives'),
          'dsh-client-runtime': require('dsh-client-runtime'),
        };
        
        // Override require to use DSH externals
        const originalRequire = typeof require !== 'undefined' ? require : null;
        if (originalRequire) {
          const patchedRequire = function(id) {
            if (__dsh_externals__[id]) return __dsh_externals__[id];
            return originalRequire(id);
          };
          patchedRequire.resolve = originalRequire.resolve;
          patchedRequire.cache = originalRequire.cache;
          patchedRequire.extensions = originalRequire.extensions;
          patchedRequire.main = originalRequire.main;
          patchedRequire.main = originalRequire.main;
          if (typeof module !== 'undefined') module.require = patchedRequire;
        }
        
        // Bundle content
        ${bundleContent}
        
        // Export the client module
        if (typeof __DshMdLiveClient__ !== 'undefined') {
          module.exports = __DshMdLiveClient__;
        }
      }
    });
  }
})();
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
