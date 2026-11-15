import {build} from 'esbuild';
await build({entryPoints:['apps/wallet-ui/privy-island.jsx'],outdir:'apps/frontend/vendor/privy',entryNames:'privy-wallet',chunkNames:'chunk-[hash]',bundle:true,splitting:true,format:'esm',platform:'browser',target:['es2022'],minify:true,sourcemap:false,legalComments:'linked',define:{'process.env.NODE_ENV':'"production"'}});

await build({entryPoints:['apps/wallet-ui/deposit-qr.js'],outfile:'apps/frontend/vendor/privy/deposit-qr.js',bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:true,sourcemap:false,legalComments:'linked'});
