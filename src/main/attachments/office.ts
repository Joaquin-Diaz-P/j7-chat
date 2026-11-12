import { open, stat } from 'node:fs/promises';
import { posix } from 'node:path';
import { crc32 } from 'node:zlib';
import sax from 'sax';
import { openPromise, type ZipFile } from 'yauzl';

export const OFFICE_EXTENSIONS = ['docx', 'pptx'];
export const OFFICE_MAX_BYTES = 50 * 1024 * 1024;
export const OFFICE_TEXT_LIMIT = 400_000;
const MAX_XML_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_XML_BYTES = 32 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 256 * 1024 * 1024;
const WORD_NAMESPACES = new Set(['http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'http://purl.oclc.org/ooxml/wordprocessingml/main']);
const DRAWING_NAMESPACES = new Set(['http://schemas.openxmlformats.org/drawingml/2006/main', 'http://purl.oclc.org/ooxml/drawingml/main']);
const PRESENTATION_NAMESPACES = new Set(['http://schemas.openxmlformats.org/presentationml/2006/main', 'http://purl.oclc.org/ooxml/presentationml/main']);
const CONTENT_TYPES_NAMESPACE = 'http://schemas.openxmlformats.org/package/2006/content-types';
const RELATIONSHIPS_NAMESPACES = new Set(['http://schemas.openxmlformats.org/package/2006/relationships', 'http://purl.oclc.org/ooxml/package/relationships']);
const CHART_NAMESPACES = new Set(['http://schemas.openxmlformats.org/drawingml/2006/chart', 'http://purl.oclc.org/ooxml/drawingml/chart']);
// Embedded media formats that macOS sips can turn into an image every vision model accepts.
const SENDABLE_IMAGES = new Set(['png', 'jpg', 'jpeg', 'jpe', 'gif', 'bmp', 'tif', 'tiff', 'webp', 'heic']);
export const OFFICE_IMAGE_LIMIT = 20;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_MEDIA_BYTES = 100 * 1024 * 1024;
export const OFFICE_NOTE = '[J7: Contenido extraído de Office. Los gráficos se incluyen como tablas de datos y cada imagen se marca como [Imagen N].]';
const CHART_TYPES: Record<string, string> = { barChart: 'barras', bar3DChart: 'barras', lineChart: 'líneas', line3DChart: 'líneas', pieChart: 'circular', pie3DChart: 'circular', ofPieChart: 'circular', doughnutChart: 'anillo', areaChart: 'áreas', area3DChart: 'áreas', scatterChart: 'dispersión', radarChart: 'radar', bubbleChart: 'burbujas', stockChart: 'bursátil', surfaceChart: 'superficie', surface3DChart: 'superficie' };

class OfficeError extends Error {}
function invalid(): never { throw new OfficeError('El archivo Word o PowerPoint está dañado o no tiene un formato compatible.'); }

function parseXml(xml: string, visit: (tag: sax.QualifiedTag, opening: boolean) => void, text?: (value: string) => void) {
  const options: sax.SAXOptions & { strictEntities: boolean } = { xmlns: true, strictEntities: true };
  const parser = sax.parser(true, options);
  const stack: sax.QualifiedTag[] = [];
  parser.onerror = () => invalid();
  parser.ondoctype = () => invalid();
  parser.onopentag = raw => {
    const tag = raw as sax.QualifiedTag;
    if (stack.length >= 128) throw new OfficeError('El documento tiene una estructura demasiado compleja para leerlo.');
    stack.push(tag); visit(tag, true);
  };
  parser.onclosetag = () => { const tag = stack.pop(); if (tag) visit(tag, false); };
  parser.ontext = value => text?.(value);
  parser.oncdata = value => text?.(value);
  parser.write(xml).close();
}

async function readEntry(zip: ZipFile, entry: import('yauzl').Entry, maximum: number, tooLarge: string) {
  const stream = await zip.openReadStreamPromise(entry);
  const chunks: Buffer[] = [];
  let bytes = 0, checksum = 0;
  for await (const chunk of stream) {
    bytes += chunk.length;
    if (bytes > maximum) { stream.destroy(); throw new OfficeError(tooLarge); }
    const buffer = Buffer.from(chunk);
    checksum = crc32(buffer, checksum);
    chunks.push(buffer);
  }
  if (checksum !== entry.crc32) invalid();
  return Buffer.concat(chunks);
}

async function readParts(path: string, extension: string, withMedia: boolean) {
  if ((await stat(path)).size > OFFICE_MAX_BYTES) throw new OfficeError('El tamaño máximo para Word y PowerPoint es 50 MB');
  const file = await open(path, 'r');
  try {
    const header = Buffer.alloc(8); await file.read(header, 0, 8, 0);
    if (header.equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'))) throw new OfficeError('El archivo está protegido con contraseña o usa un formato antiguo. Guarda una copia .docx o .pptx sin contraseña.');
  } finally { await file.close(); }
  let zip: ZipFile | undefined;
  try {
    zip = await openPromise(path, { lazyEntries: true, autoClose: false, validateEntrySizes: true, strictFileNames: true });
    if (zip.entryCount > 10_000) throw new OfficeError('El documento contiene demasiados archivos internos para leerlo.');
    const parts = new Map<string, string>();
    const mediaSizes = new Map<string, number>(), media = new Map<string, Buffer>();
    const names = new Set<string>();
    let expandedBytes = 0, xmlBytes = 0, mediaBytes = 0;
    for await (const entry of zip.eachEntry()) {
      if (entry.isEncrypted()) throw new OfficeError('El archivo está protegido con contraseña. Guarda una copia sin contraseña.');
      if (names.has(entry.fileName)) invalid();
      names.add(entry.fileName);
      expandedBytes += entry.uncompressedSize;
      if (expandedBytes > MAX_EXPANDED_BYTES) throw new OfficeError('El documento es demasiado grande al descomprimirlo.');
      if (new RegExp(`^${extension === 'docx' ? 'word' : 'ppt'}/media/[^/]+$`).test(entry.fileName)) {
        mediaSizes.set(entry.fileName, entry.uncompressedSize);
        if (!withMedia || !sendableMedia(entry.fileName, entry.uncompressedSize) || mediaBytes + entry.uncompressedSize > MAX_TOTAL_MEDIA_BYTES) continue;
        mediaBytes += entry.uncompressedSize;
        media.set(entry.fileName, await readEntry(zip, entry, MAX_IMAGE_BYTES, 'Una imagen del documento es demasiado grande.'));
        continue;
      }
      const needed = entry.fileName === '[Content_Types].xml' || (extension === 'docx'
        ? /^word\/(document\.xml|_rels\/document\.xml\.rels|charts\/chart\d+\.xml)$/.test(entry.fileName)
        : /^ppt\/(presentation\.xml|_rels\/presentation\.xml\.rels|slides\/slide\d+\.xml|slides\/_rels\/slide\d+\.xml\.rels|charts\/chart\d+\.xml)$/.test(entry.fileName));
      if (!needed) continue;
      xmlBytes += entry.uncompressedSize;
      if (entry.uncompressedSize > MAX_XML_BYTES || xmlBytes > MAX_TOTAL_XML_BYTES) throw new OfficeError('El texto del documento es demasiado grande para procesarlo.');
      const data = await readEntry(zip, entry, MAX_XML_BYTES, 'El texto del documento es demasiado grande para procesarlo.');
      const encoding = data[0] === 0xff && data[1] === 0xfe ? 'utf-16le' : data[0] === 0xfe && data[1] === 0xff ? 'utf-16be' : 'utf-8';
      parts.set(entry.fileName, new TextDecoder(encoding, { fatal: true }).decode(data));
    }
    return { parts, mediaSizes, media };
  } finally { zip?.close(); }
}

function sendableMedia(name: string, size: number) {
  return SENDABLE_IMAGES.has(posix.extname(name).slice(1).toLowerCase()) && size <= MAX_IMAGE_BYTES;
}

const attributesOf = (tag: sax.QualifiedTag) => Object.fromEntries(Object.values(tag.attributes).map(attribute => [attribute.local, attribute.value]));
const relationshipId = (tag: sax.QualifiedTag, local: string) => Object.values(tag.attributes).find(attribute => attribute.local === local && attribute.uri.endsWith('/relationships'))?.value;

function relationshipsOf(xml: string | undefined) {
  const targets = new Map<string, { type: string; target: string }>();
  if (!xml) return targets;
  let first = true;
  parseXml(xml, (tag, opening) => {
    if (first && opening) { first = false; if (tag.local !== 'Relationships' || !RELATIONSHIPS_NAMESPACES.has(tag.uri)) invalid(); }
    if (!opening || tag.local !== 'Relationship' || !RELATIONSHIPS_NAMESPACES.has(tag.uri)) return;
    const attributes = attributesOf(tag);
    if (attributes.TargetMode === 'External' || !attributes.Id || !attributes.Target) return;
    targets.set(attributes.Id, { type: attributes.Type ?? '', target: attributes.Target });
  });
  return targets;
}

function resolveTarget(part: string, target: string) {
  return target.startsWith('/') ? target.slice(1) : posix.normalize(posix.join(posix.dirname(part), target));
}

const cell = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, 200);

// Charts keep a cached copy of their data, so the model gets the numbers instead of a picture.
function chartText(xml: string) {
  const stack: string[] = [];
  const types = new Set<string>();
  const series: { name: string; categories: Map<number, string>; values: Map<number, string> }[] = [];
  let title = '', titleDepth = 0, section: 'tx' | 'cat' | 'val' | undefined, point: number | undefined;
  parseXml(xml, (tag, opening) => {
    if (!stack.length && opening && (tag.local !== 'chartSpace' || !CHART_NAMESPACES.has(tag.uri))) invalid();
    if (!opening) {
      stack.pop();
      if (CHART_NAMESPACES.has(tag.uri)) {
        if (tag.local === 'title' && titleDepth === stack.length + 1) titleDepth = 0;
        if (['tx', 'cat', 'xVal', 'val', 'yVal'].includes(tag.local) && stack.at(-1) === 'ser') section = undefined;
        if (tag.local === 'pt') point = undefined;
      }
      return;
    }
    const parent = stack.at(-1);
    stack.push(tag.local);
    if (!CHART_NAMESPACES.has(tag.uri)) return;
    if (tag.local === 'title' && parent === 'chart') titleDepth = stack.length;
    if (CHART_TYPES[tag.local] && parent === 'plotArea') types.add(CHART_TYPES[tag.local]!);
    if (tag.local === 'ser') series.push({ name: '', categories: new Map(), values: new Map() });
    if (parent === 'ser') section = tag.local === 'tx' ? 'tx' : ['cat', 'xVal'].includes(tag.local) ? 'cat' : ['val', 'yVal'].includes(tag.local) ? 'val' : section;
    if (tag.local === 'pt') point = Number(attributesOf(tag).idx);
  }, value => {
    const current = stack.at(-1);
    if (titleDepth && (current === 't' || current === 'v')) { title += value; return; }
    const target = series.at(-1);
    if (!target || current !== 'v' || !section) return;
    if (section === 'tx') target.name += value;
    else if (point !== undefined && Number.isInteger(point) && point >= 0 && point < 10_000) {
      const map = section === 'cat' ? target.categories : target.values;
      map.set(point, map.has(point) ? `${map.get(point)} / ${value}` : value);
    }
  });
  const shown = series.slice(0, 12);
  const total = Math.max(0, ...shown.flatMap(item => [...item.categories.keys(), ...item.values.keys()].map(index => index + 1))), rows = Math.min(200, total);
  const lines = [['Categoría', ...shown.map((item, index) => cell(item.name) || `Serie ${index + 1}`)].join('\t')];
  const categories = shown.find(item => item.categories.size)?.categories;
  for (let index = 0; index < rows; index++) lines.push([cell(categories?.get(index) ?? String(index + 1)), ...shown.map(item => cell(item.values.get(index) ?? ''))].join('\t'));
  const omitted = series.length > shown.length || total > rows ? '\n(Datos del gráfico recortados.)' : '';
  return { kind: [...types].join(', '), title: cell(title), table: rows ? lines.join('\n') + omitted : '(El gráfico no incluye datos guardados.)' };
}

type Reference = (kind: 'image' | 'chart', id: string, description: string) => string | undefined;
function partText(xml: string, extension: string, limit: number, reference: Reference = () => undefined) {
  const namespace = extension === 'docx' ? WORD_NAMESPACES : DRAWING_NAMESPACES;
  let capture = false, text = '', truncated = false, first = true, description = '';
  const append = (value: string) => {
    if (text.length + value.length > limit) truncated = true;
    text += value.slice(0, Math.max(0, limit - text.length));
  };
  parseXml(xml, (tag, opening) => {
    if (first && opening) {
      first = false;
      const validRoot = extension === 'docx' ? tag.local === 'document' && WORD_NAMESPACES.has(tag.uri) : tag.local === 'sld' && PRESENTATION_NAMESPACES.has(tag.uri);
      if (!validRoot) invalid();
    }
    if (opening && (tag.local === 'docPr' || tag.local === 'cNvPr')) { const attributes = attributesOf(tag); description = cell(attributes.descr || attributes.title || ''); }
    const embedded = opening && tag.local === 'blip' && DRAWING_NAMESPACES.has(tag.uri) ? relationshipId(tag, 'embed') : undefined;
    const chart = opening && tag.local === 'chart' && CHART_NAMESPACES.has(tag.uri) ? relationshipId(tag, 'id') : undefined;
    const marker = embedded ? reference('image', embedded, description) : chart ? reference('chart', chart, description) : undefined;
    if (marker) append(`${!text || text.endsWith('\n') ? '' : '\n'}${marker}\n`);
    if (!namespace.has(tag.uri)) return;
    if (tag.local === 't') capture = opening;
    if (opening && (tag.local === 'tab')) append('\t');
    if (opening && (tag.local === 'br' || tag.local === 'cr')) append('\n');
    if (!opening && (tag.local === 'p' || tag.local === 'tr')) append('\n');
    if (!opening && tag.local === 'tc') {
      text = text.replace(/\n+$/, ''); append('\t');
    }
  }, value => { if (capture) append(value); });
  return { text: text.replace(/\t+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(), truncated };
}

function slidePaths(parts: Map<string, string>) {
  const presentation = parts.get('ppt/presentation.xml'), relationships = parts.get('ppt/_rels/presentation.xml.rels');
  if (!presentation || !relationships) invalid();
  const ids: string[] = [], targets = new Map<string, string>();
  let first = true;
  parseXml(presentation, (tag, opening) => {
    if (first && opening) { first = false; if (tag.local !== 'presentation' || !PRESENTATION_NAMESPACES.has(tag.uri)) invalid(); }
    if (!opening || tag.local !== 'sldId' || !PRESENTATION_NAMESPACES.has(tag.uri)) return;
    const id = Object.values(tag.attributes).find(attribute => attribute.local === 'id' && attribute.uri.endsWith('/relationships'))?.value;
    if (!id) invalid();
    ids.push(id);
  });
  first = true;
  parseXml(relationships, (tag, opening) => {
    if (first && opening) { first = false; if (tag.local !== 'Relationships' || !RELATIONSHIPS_NAMESPACES.has(tag.uri)) invalid(); }
    if (!opening || tag.local !== 'Relationship' || !RELATIONSHIPS_NAMESPACES.has(tag.uri)) return;
    const attributes = attributesOf(tag);
    if (!attributes.Type?.endsWith('/slide') || attributes.TargetMode === 'External') return;
    if (!attributes.Id || !attributes.Target) invalid();
    const target = resolveTarget('ppt/presentation.xml', attributes.Target);
    if (!/^ppt\/slides\/slide\d+\.xml$/.test(target) || targets.has(attributes.Id)) invalid();
    targets.set(attributes.Id, target);
  });
  if (ids.length > 2_000 || new Set(ids).size !== ids.length) invalid();
  return ids.map(id => { const target = targets.get(id); if (!target || !parts.has(target)) invalid(); return target; });
}

export interface OfficeImage { number: number; name: string; data?: Buffer }
async function analyzeOffice(path: string, extension: string, maxCharacters: number, withMedia: boolean) {
  if (!OFFICE_EXTENSIONS.includes(extension)) invalid();
  const { parts, mediaSizes, media } = await readParts(path, extension, withMedia);
  if (!parts.has('[Content_Types].xml')) invalid();
  let first = true, mainType = false;
  const mainPart = extension === 'docx' ? '/word/document.xml' : '/ppt/presentation.xml';
  const expectedType = extension === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml';
  parseXml(parts.get('[Content_Types].xml')!, (tag, opening) => {
    if (first && opening) { first = false; if (tag.local !== 'Types' || tag.uri !== CONTENT_TYPES_NAMESPACE) invalid(); }
    if (!opening || tag.local !== 'Override' || tag.uri !== CONTENT_TYPES_NAMESPACE) return;
    const attributes = attributesOf(tag);
    if (attributes.PartName === mainPart && attributes.ContentType === expectedType) mainType = true;
  });
  if (!mainType) invalid();
  const paths = extension === 'docx' ? ['word/document.xml'] : slidePaths(parts);
  // Images are numbered by first appearance so the [Imagen N] markers match the files sent alongside the text.
  const numbers = new Map<string, number>(), images: OfficeImage[] = [];
  let charts = 0, sendable = 0;
  let text = '', truncated = false;
  for (const [index, name] of paths.entries()) {
    const xml = parts.get(name); if (!xml) invalid();
    const relationships = relationshipsOf(parts.get(resolveTarget(name, `_rels/${posix.basename(name)}.rels`)));
    const reference: Reference = (kind, id, description) => {
      const relationship = relationships.get(id); if (!relationship) return undefined;
      const target = resolveTarget(name, relationship.target);
      if (kind === 'chart') {
        const chart = parts.get(target); if (!chart || !/\/charts\/chart\d+\.xml$/.test(target)) return undefined;
        const data = chartText(chart); charts++;
        return `[Gráfico ${charts}${data.kind ? ` · ${data.kind}` : ''}${data.title ? `: ${data.title}` : ''}]\n${data.table}`;
      }
      const size = mediaSizes.get(target); if (size === undefined) return undefined;
      let number = numbers.get(target);
      if (number === undefined) {
        number = numbers.size + 1; numbers.set(target, number);
        const format = posix.extname(target).slice(1).toUpperCase() || '?';
        const fits = sendableMedia(target, size) && sendable < OFFICE_IMAGE_LIMIT;
        if (fits) { sendable++; const data = media.get(target); images.push({ number, name: target, ...(data ? { data } : {}) }); }
        else return `[Imagen ${number}${description ? `: ${description}` : ''} · ${!SENDABLE_IMAGES.has(format.toLowerCase()) ? `formato ${format} no compatible` : size > MAX_IMAGE_BYTES ? 'demasiado grande' : `límite de ${OFFICE_IMAGE_LIMIT} imágenes`}; no se envió]`;
      }
      return `[Imagen ${number}${description ? `: ${description}` : ''}]`;
    };
    const label = extension === 'pptx' ? `Diapositiva ${index + 1}\n` : '';
    const remaining = Math.max(0, maxCharacters - text.length - label.length - 2);
    if (!remaining) { truncated = true; break; }
    const part = partText(xml, extension, remaining, reference);
    if (part.text) text += `${text ? '\n\n' : ''}${label}${part.text}`;
    truncated ||= part.truncated;
    if (truncated) break;
  }
  if (!text.trim()) throw new OfficeError('No encontramos texto, imágenes ni gráficos en el documento.');
  return { text: `${OFFICE_NOTE}\n${text}${truncated ? `\n[J7: El texto se recortó a ${maxCharacters} caracteres; no se incluyó el resto del documento.]` : ''}`, truncated, images, imageCount: numbers.size };
}

function officeFailure(error: unknown): never {
  if (error instanceof OfficeError) throw error;
  throw new OfficeError('No se pudo leer el archivo Word o PowerPoint. Puede estar dañado o protegido con contraseña. Guarda una copia .docx o .pptx sin contraseña.');
}

export async function extractOfficeText(path: string, extension: string, maxCharacters = OFFICE_TEXT_LIMIT) {
  try {
    const { text, truncated, imageCount } = await analyzeOffice(path, extension, maxCharacters, false);
    return { text, truncated, imageCount };
  } catch (error) { officeFailure(error); }
}

// Reads the embedded images that extractOfficeText marked as sendable, in [Imagen N] order.
export async function extractOfficeImages(path: string, extension: string) {
  try { return (await analyzeOffice(path, extension, OFFICE_TEXT_LIMIT, true)).images; }
  catch (error) { officeFailure(error); }
}
