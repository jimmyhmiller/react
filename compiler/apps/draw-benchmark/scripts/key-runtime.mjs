import {execFileSync} from 'node:child_process';
import {REPO} from './config.mjs';
execFileSync(process.execPath,['scripts/rollup/build.js','react/compiler-runtime','--type=NODE_PROD','--unsafe-partial'],{cwd:REPO,stdio:'inherit'});
