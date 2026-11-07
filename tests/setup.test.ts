import {describe,it,expect} from 'vitest';
import {setupSection} from '../src/main/setup.js';
import {programDownloadUrl} from '../src/main/settings-programs.js';
import type {CatalogSnapshot} from '../src/shared/ipc.js';
const granted={screen:true,input:true};
const ready:CatalogSnapshot['statuses']={claude:{state:'ready'}};
describe('primeros pasos (J8)',()=>{
 it.each([true,false])('abre Programas sin ningún chat listo; primer arranque: %s',firstRun=>{
  expect(setupSection({statuses:{claude:{state:'not_installed'},codex:{state:'not_authenticated'},opencode:{state:'error'}},permissions:granted,firstRun})).toBe('programs');
  expect(setupSection({statuses:{},permissions:{},firstRun})).toBe('programs');
 });
 it.each([{screen:false,input:true},{screen:true,input:false},{screen:false,input:false},{}])('abre Permisos solo en el primer arranque si falta %j',permissions=>{
  expect(setupSection({statuses:ready,permissions,firstRun:true})).toBe('permissions');
  expect(setupSection({statuses:ready,permissions,firstRun:false})).toBeUndefined();
 });
 it.each([true,false])('no abre ajustes con todo listo, independientemente de Hex; primer arranque: %s',firstRun=>{
  expect(setupSection({statuses:ready,permissions:granted,firstRun})).toBeUndefined();
 });
 it('acepta cualquier programa de chat listo',()=>{
  for(const id of ['codex','opencode','mock-a'] as const)expect(setupSection({statuses:{[id]:{state:'ready'}},permissions:granted,firstRun:true})).toBeUndefined();
 });
});
describe('descargas permitidas (J6)',()=>{
 it.each([
  ['claude','https://code.claude.com/docs/en/setup'],
  ['codex','https://developers.openai.com/codex/cli'],
  ['hex','https://anoma.ly/hex/download/macos-arm64-dmg']
 ])('resuelve únicamente el enlace fijo de %s',(id,url)=>expect(programDownloadUrl(id)).toBe(url));
 it.each(['opencode','gemini','https://example.com','https://code.claude.com/docs/en/setup','file:///tmp/a','__proto__','constructor','toString','',null,undefined,3,{},['hex']])('rechaza entradas desconocidas: %j',id=>expect(programDownloadUrl(id)).toBeUndefined());
});
