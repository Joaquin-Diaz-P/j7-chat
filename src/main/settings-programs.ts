import type { CatalogSnapshot } from '../shared/ipc.js';
const downloadUrls = {
 claude:'https://code.claude.com/docs/en/setup',
 codex:'https://developers.openai.com/codex/cli',
 gemini:'https://antigravity.google/docs/getting-started',
 opencode:'https://opencode.ai/download',
 hex:'https://anoma.ly/hex/download/macos-arm64-dmg'
} as const;
export function programDownloadUrl(id:unknown):string | undefined {
 return typeof id==='string' && Object.hasOwn(downloadUrls,id)?downloadUrls[id as keyof typeof downloadUrls]:undefined;
}

export function settingsProgramIds(statuses: CatalogSnapshot['statuses']): string[] {
 const mocks=Object.keys(statuses).filter(id=>id==='mock'||id==='mock-a'||id==='mock-b');
 if(mocks.length)return [...mocks,'hex'];
 return ['claude','codex','gemini',...(statuses.opencode && statuses.opencode.state!=='not_installed'?['opencode']:[]),'hex'];
}
