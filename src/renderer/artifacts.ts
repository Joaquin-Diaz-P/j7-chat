export type ArtifactKind = 'html' | 'svg' | 'mermaid';
export interface ArtifactPart { source: string; kind?: ArtifactKind }
// Track every fence, including ordinary code: artifacts must be explicitly closed.
export function extractArtifacts(text: string): ArtifactPart[] {
  const result: ArtifactPart[] = []; let offset = 0, start = 0;
  let fence: { token: string; start: number; body: number; kind?: ArtifactKind } | undefined;
  for (const line of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    const match = /^ {0,3}(`{3,}|~{3,})([^\n]*)/.exec(line);
    if (match) {
      const token = match[1]!, info = match[2]!.trim();
      if (!fence) {
        const kind = info === 'html artifact' ? 'html' : info === 'svg' || info === 'mermaid' ? info : undefined;
        fence = { token, start: offset, body: offset + line.length, ...(kind ? { kind } : {}) };
      } else if (token[0] === fence.token[0] && token.length >= fence.token.length && !info) {
        if (fence.kind) {
          if (start < fence.start) result.push({ source: text.slice(start, fence.start) });
          result.push({ kind: fence.kind, source: text.slice(fence.body, offset).replace(/\n$/, '') });
          start = offset + line.length;
        }
        fence = undefined;
      }
    }
    offset += line.length;
  }
  if (start < text.length) result.push({ source: text.slice(start) });
  return result;
}
export const ARTIFACT_CDNS = 'https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com';
export const ARTIFACT_CSP = `default-src 'none'; script-src 'unsafe-inline' ${ARTIFACT_CDNS}; style-src 'unsafe-inline' ${ARTIFACT_CDNS} https://fonts.googleapis.com; img-src data: https:; font-src ${ARTIFACT_CDNS} https://fonts.gstatic.com; connect-src 'none'; form-action 'none'; base-uri 'none'`;
