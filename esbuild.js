require('esbuild').build({
  entryPoints: ['./src/extension.ts'],
  bundle: true,
  platform: 'node',                 
  external: ['vscode'],                // do NOT bundle the 'vscode' module
  outfile: 'out/src/extension.js',         
});