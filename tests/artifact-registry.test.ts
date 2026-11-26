import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ArtifactRegistry } from '../src/main/artifact-registry.js';
describe('artifact memory registry', () => {
  it('uses random capabilities, enforces limits and checks release ownership', async () => {
    const registry = new ArtifactRegistry(8, 2);
    const a = registry.register(1, 'áááá');
    const b = registry.register(2, 'second');
    expect(a).not.toBe(b);
    expect(() => registry.register(1, '')).toThrow();
    registry.release(2, a);
    expect(await registry.respond(a, 'file:').text()).toBe('áááá');
    registry.release(1, a);
    expect(registry.respond(a, 'file:').status).toBe(404);
    expect(() => registry.register(1, 'ááááá')).toThrow();
    expect(() => registry.register(1, 12)).toThrow();
    registry.clear(2);
    expect(registry.respond(b, 'file:').status).toBe(404);
  });
  it('serves only exact registered URLs with an independent CSP header', () => {
    const registry = new ArtifactRegistry();
    const url = registry.register(1, '<script>1</script>');
    for (const path of [url + '/extra', url + '?query', 'j7-artifact://document/etc/passwd']) expect(registry.respond(path, 'file:').status).toBe(404);
    expect(registry.respond(url, 'file:', 'POST').status).toBe(404);
    const response = registry.respond(url, 'http://localhost:5173');
    const csp = response.headers.get('Content-Security-Policy')!;
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain('frame-ancestors http://localhost:5173');
    expect(csp).toContain("form-action 'none'");
    expect(csp).not.toContain('connect-src');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const renderer = readFileSync('src/renderer/index.html', 'utf8');
    expect(renderer).toContain('frame-src j7-artifact:');
    expect(renderer).not.toMatch(/jsdelivr|cdnjs|unpkg|nonce-/);
  });
});
