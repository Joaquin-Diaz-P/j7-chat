const downloadUrls = {
 claude:'https://code.claude.com/docs/en/setup',
 codex:'https://developers.openai.com/codex/cli',
 hex:'https://anoma.ly/hex/download/macos-arm64-dmg'
} as const;
export function programDownloadUrl(id:unknown):string | undefined {
 return typeof id==='string' && Object.hasOwn(downloadUrls,id)?downloadUrls[id as keyof typeof downloadUrls]:undefined;
}
