import {execFileSync} from 'node:child_process';
import {cp,rm} from 'node:fs/promises';
execFileSync('npm',['run','build:helper'],{stdio:'inherit'});
execFileSync('npm',['run','build'],{stdio:'inherit'});
execFileSync('node_modules/.bin/electron-builder',['--mac','--arm64'],{stdio:'inherit',env:{...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false'}});
await rm('release/J7 Chat.app',{recursive:true,force:true});
await cp('release/mac-arm64/J7 Chat.app','release/J7 Chat.app',{recursive:true,verbatimSymlinks:true});
