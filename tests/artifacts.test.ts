import { artifactCsp } from '../src/main/artifact-registry.js';
import { describe, expect, it } from 'vitest';
import { extractArtifacts } from '../src/renderer/artifacts.js';
import { translateCodexEvent, CODEX_SAFE_CONFIG } from '../src/main/providers/codex.js';
const ARTIFACT_CSP = artifactCsp('file:');
describe('inline artifacts', () => {
  it('extracts only closed, explicitly marked HTML and SVG/Mermaid fences', () => {
    const text = 'Antes\n\n```html\n<p>código</p>\n```\n\n```html artifact\n<title>Gráfico</title>\n```\n```svg\n<svg/>\n```\n~~~mermaid\ngraph LR\n A-->B\n~~~~\n```html artifact\nincompleto';
    const parts = extractArtifacts(text);
    expect(parts.filter(p => p.kind).map(p => p.kind)).toEqual(['html','svg','mermaid']);
    expect(parts[0]?.source).toContain('```html\n');
    expect(parts.at(-1)?.source).toContain('incompleto');
  });
  it('does not interpret nested examples inside an ordinary fence', () => {
    expect(extractArtifacts('````md\n```svg\n<svg/>\n```\n````').some(p => p.kind)).toBe(false);
    expect(extractArtifacts('```html artifact\nx\n``` trailing').some(p => p.kind)).toBe(false);
  });
  it('disables connections and forms and restricts library origins', () => {
    expect(ARTIFACT_CSP).toContain("default-src 'none'");
    expect(ARTIFACT_CSP).toContain("form-action 'none'");
    expect(ARTIFACT_CSP).toContain('https://cdn.jsdelivr.net');
    expect(ARTIFACT_CSP).not.toContain('allow-same-origin');
  });
});
it('enables generation and translates start/failure without exposing image payloads', () => {
  expect(CODEX_SAFE_CONFIG['features.image_generation']).toBe(true);
  expect(translateCodexEvent({method:'item/started',params:{item:{type:'imageGeneration',id:'img-1',status:'in_progress'}}})).toEqual([{type:'image-generation',image:{id:'img-1',status:'generating'}}]);
  expect(translateCodexEvent({method:'item/completed',params:{item:{type:'imageGeneration',id:'img-1',status:'failed',result:'private-payload'}}})).toEqual([{type:'image-generation',image:{id:'img-1',status:'failed'}}]);
});
