import * as esbuild from 'esbuild';

async function build() {
  await esbuild.build({
    entryPoints: ['src/client/index.tsx'],
    bundle: true,
    format: 'cjs',
    outfile: 'lib/client.cjs',
    platform: 'browser',
    target: ['es2020'],
    sourcemap: true,
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

  console.log('✓ Client bundle built: lib/client.cjs');
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
