import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
mkdirSync('build',{recursive:true});
execFileSync('clang++',['-std=c++17','-fobjc-arc','-mmacosx-version-min=14.0','-arch','arm64','-bundle','-undefined','dynamic_lookup','-I','node_modules/node-api-headers/include','-framework','Cocoa','-framework','QuartzCore','native/glass/glass.mm','-o','build/j7-glass.node'],{stdio:'inherit'});
