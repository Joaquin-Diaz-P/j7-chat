import type { Attachment, ModelInfo } from '../providers/types.js';
// docs/etapa-0-resultados.md (Claude, PDF): verified 30 native pages in Claude; larger PDFs use extracted text.
export const NATIVE_PDF_PAGES = { claude: 30 };
export function nativePdf(file: Attachment, model: Pick<ModelInfo, 'provider' | 'supportsPdf'>) {
  return model.supportsPdf && model.provider === 'claude' && (file.pages ?? Infinity) <= NATIVE_PDF_PAGES.claude;
}
export function prepareAttachments(files: Attachment[], model: ModelInfo): Attachment[] {
  if (files.some(f => f.kind === 'image') && !model.supportsImages) throw new Error(`${model.label} no ve imágenes. Cambia de modelo o quita la imagen`);
  return files.map(file => file.kind === 'pdf' && !nativePdf(file, model) ? { ...file, kind: 'text', extractedText: `<documento nombre="${file.name.replace(/[<>&"]/g, '_')}" paginas="${file.pages ?? 0}"${file.truncated ? ` recortado="páginas 1 a ${file.sentPages ?? 0} de ${file.pages ?? 0}"` : ''}>${file.extractedText ?? ''}${file.truncated ? '\nEl resto del documento no se incluyó.' : ''}</documento>` } : file);
}
