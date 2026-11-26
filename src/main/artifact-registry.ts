import { randomBytes } from 'node:crypto';

const CDNS = 'https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com';
export function artifactCsp(appOrigin: string) {
  return `default-src 'none'; script-src 'unsafe-inline' ${CDNS}; style-src 'unsafe-inline' ${CDNS} https://fonts.googleapis.com; img-src data: https:; font-src ${CDNS} https://fonts.gstatic.com; form-action 'none'; base-uri 'none'; frame-ancestors ${appOrigin}`;
}
export class ArtifactRegistry {
  private entries = new Map<string, { owner: number; html: string }>();
  constructor(private maxBytes = 8 * 1024 * 1024, private maxEntries = 64) {}
  register(owner: number, html: unknown): string {
    if (typeof html !== 'string' || Buffer.byteLength(html) > this.maxBytes) throw new Error('Artifact demasiado grande');
    if (this.entries.size >= this.maxEntries) throw new Error('Demasiados artifacts');
    const url = `j7-artifact://document/${randomBytes(24).toString('hex')}`;
    this.entries.set(url, { owner, html });
    return url;
  }
  release(owner: number, url: unknown) {
    if (typeof url === 'string' && this.entries.get(url)?.owner === owner) this.entries.delete(url);
  }
  clear(owner: number) {
    for (const [url, entry] of this.entries) if (entry.owner === owner) this.entries.delete(url);
  }
  respond(url: string, appOrigin: string, method = 'GET'): Response {
    const entry = this.entries.get(url);
    if (method !== 'GET' || !entry) return new Response(null, { status: 404 });
    return new Response(entry.html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': artifactCsp(appOrigin), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  }
}
