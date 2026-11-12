import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import { extractOfficeText, OFFICE_MAX_BYTES, OFFICE_TEXT_LIMIT } from '../src/main/attachments/office.js';
import { expandOfficeAttachments } from '../src/main/attachments/office-media.js';
import { execFileSync } from 'node:child_process';
import { AttachmentStore, validateFile } from '../src/main/attachments/index.js';
import { prepareAttachments } from '../src/main/attachments/policy.js';
import { textWithAttachments } from '../src/main/attachments/content.js';
import { SqliteChatStore } from '../src/main/chat/sqlite-store.js';
import type { Attachment, TurnInput } from '../src/main/providers/types.js';

const directories: string[] = [];
async function directory() { const path = await mkdtemp(join(tmpdir(), 'j7-office-test-')); directories.push(path); return path; }
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, {recursive:true,force:true}); });

interface Part { name: string; content: string | Buffer; encrypted?: boolean; checksum?: number; declaredSize?: number }
// Minimal OPC packages generated in-process: tests do not require Word, PowerPoint or external tools.
function zip(parts: Part[]) {
  const locals: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const part of parts) {
    const name = Buffer.from(part.name), data = Buffer.from(part.content), compressed = deflateRawSync(data);
    const flags = part.encrypted ? 1 : 0, checksum = part.checksum ?? crc32(data), size = part.declaredSize ?? data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20,4); local.writeUInt16LE(flags,6); local.writeUInt16LE(8,8);
    local.writeUInt32LE(checksum,14); local.writeUInt32LE(compressed.length,18); local.writeUInt32LE(size,22); local.writeUInt16LE(name.length,26);
    locals.push(local,name,compressed);
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50); header.writeUInt16LE(20,4); header.writeUInt16LE(20,6); header.writeUInt16LE(flags,8); header.writeUInt16LE(8,10);
    header.writeUInt32LE(checksum,16); header.writeUInt32LE(compressed.length,20); header.writeUInt32LE(size,24); header.writeUInt16LE(name.length,28); header.writeUInt32LE(offset,42);
    central.push(header,name); offset += local.length + name.length + compressed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(parts.length,8); end.writeUInt16LE(parts.length,10); end.writeUInt32LE(directory.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,directory,end]);
}
const w = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const p = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const a = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const r = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const rels = 'http://schemas.openxmlformats.org/package/2006/relationships';
const contentTypes = (extension: 'docx'|'pptx') => `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="${extension==='docx'?'/word/document.xml':'/ppt/presentation.xml'}" ContentType="application/vnd.openxmlformats-officedocument.${extension==='docx'?'wordprocessingml.document':'presentationml.presentation'}.main+xml"/></Types>`;
function word(body = '<w:p><w:r><w:t>Documento de prueba</w:t></w:r></w:p>'): Part[] {
  return [
    {name:'[Content_Types].xml',content:contentTypes('docx')},
    {name:'_rels/.rels',content:`<Relationships xmlns="${rels}"><Relationship Id="rId1" Type="${r}/officeDocument" Target="word/document.xml"/></Relationships>`},
    {name:'word/document.xml',content:`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${w}"><w:body>${body}</w:body></w:document>`},
  ];
}
function presentation(): Part[] {
  const slide = (text: string) => `<p:sld xmlns:p="${p}" xmlns:a="${a}"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  return [
    {name:'[Content_Types].xml',content:contentTypes('pptx')},
    {name:'_rels/.rels',content:`<Relationships xmlns="${rels}"><Relationship Id="rId1" Type="${r}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`},
    {name:'ppt/presentation.xml',content:`<p:presentation xmlns:p="${p}" xmlns:r="${r}"><p:sldIdLst><p:sldId id="256" r:id="rId20"/><p:sldId id="257" r:id="rId10"/></p:sldIdLst></p:presentation>`},
    {name:'ppt/_rels/presentation.xml.rels',content:`<Relationships xmlns="${rels}"><Relationship Id="rId10" Type="${r}/slide" Target="slides/slide1.xml"/><Relationship Id="rId20" Type="${r}/slide" Target="slides/slide2.xml"/></Relationships>`},
    {name:'ppt/slides/slide1.xml',content:slide('Última diapositiva')},
    {name:'ppt/slides/slide2.xml',content:slide('Primera &amp; principal')},
  ];
}
async function document(name: string, parts: Part[]) { const path=join(await directory(),name); await writeFile(path,zip(parts)); return path; }
const model = {id:'test',label:'Test',provider:'codex' as const,supportsImages:false,supportsPdf:false,supportsEffort:false};
const input = (attachments: Attachment[]): TurnInput => ({model:'test',effort:'low',webSearch:false,instructions:'',text:'Resume los archivos',attachments,signal:new AbortController().signal});

describe('Office attachments', () => {
  it('reads Word paragraphs, unicode, tabs, line breaks and table cells in order', async () => {
    const path = await document('texto.docx',word('<w:p><w:r><w:t>Ácido &amp; base</w:t><w:tab/><w:t>Final</w:t><w:br/><w:t>Línea dos</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Celda A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Celda B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'));
    const result = await extractOfficeText(path,'docx');
    expect(result.text).toContain('Ácido & base\tFinal\nLínea dos');
    expect(result.text).toContain('Celda A\tCelda B'); expect(result.truncated).toBe(false);
    expect(result.text).toContain('[J7: Contenido extraído de Office.');
  });
  it('reads UTF-16 XML without corrupting text', async () => {
    const parts=word(); const xml=parts[2]!;
    xml.content=Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from(String(xml.content).replace('UTF-8','UTF-16'),'utf16le')]);
    expect((await extractOfficeText(await document('utf16.docx',parts),'docx')).text).toContain('Documento de prueba');
  });
  it('orders PowerPoint slides by presentation relationships rather than ZIP or numeric order', async () => {
    const result = await extractOfficeText(await document('presentacion.pptx',presentation()),'pptx');
    expect(result.text).toContain('Diapositiva 1\nPrimera & principal\n\nDiapositiva 2\nÚltima diapositiva');
  });
  it('copies Office originals, persists metadata and sends extracted text after reopening', async () => {
    const dir=await directory(), attachmentsPath=join(dir,'attachments'), dbPath=join(dir,'j7.db');
    const source=await document('informe.docx',word()); const deck=await document('clase.pptx',presentation());
    let database=new SqliteChatStore(dbPath,attachmentsPath);
    const files=await new AttachmentStore(attachmentsPath,database).ingest([source,deck]);
    expect(files.map(f=>f.mime)).toEqual(['application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation']);
    database.createChat({id:'chat',model:'codex:test',provider:'codex',webSearch:true,effort:'low'});
    database.appendMessage('chat',{id:'question',role:'user',text:'Resume',status:'complete',attachments:files});
    await unlink(source); await unlink(deck); database.db.close();
    database=new SqliteChatStore(dbPath,attachmentsPath);
    try {
      const reopened=new AttachmentStore(attachmentsPath,database);
      const saved=database.listMessages('chat')[0]!.attachments!;
      expect(await readFile(await reopened.resolve(saved[0]!.id!))).toEqual(zip(word()));
      const text=await textWithAttachments(input(prepareAttachments(saved,model)),false);
      expect(text).toContain('Documento de prueba'); expect(text).toContain('Primera & principal'); expect(text).not.toContain('PK\u0003\u0004');
      // Compatibility fallback must also extract OOXML, never decode the binary ZIP as plain text.
      const {extractedText:_,...withoutText}=saved[1]!;
      expect(await textWithAttachments(input([withoutText]),false)).toContain('Última diapositiva');
    } finally { database.db.close(); }
  });
  it('rejects old formats, wrong suffixes and oversize Office files before copying', async () => {
    expect(validateFile('documento.DOCX',1).kind).toBe('text'); expect(validateFile('slides.pptx',OFFICE_MAX_BYTES).kind).toBe('text');
    for (const extension of ['doc','ppt','docm','pptm']) expect(()=>validateFile(`x.${extension}`,1)).toThrow(`.${extension}`);
    expect(()=>validateFile('x.docx',OFFICE_MAX_BYTES+1)).toThrow('50 MB');
  });
  it('rejects invalid ZIP, corrupt checksums and encrypted Office with clear errors', async () => {
    const dir=await directory(), invalidPath=join(dir,'bad.docx'); await writeFile(invalidPath,'not a ZIP');
    await expect(extractOfficeText(invalidPath,'docx')).rejects.toThrow('No se pudo leer');
    const badCrc=word(); badCrc[2]!.checksum=0;
    await expect(extractOfficeText(await document('crc.docx',badCrc),'docx')).rejects.toThrow('dañado');
    const encrypted=word(); encrypted[2]!.encrypted=true;
    await expect(extractOfficeText(await document('encrypted.docx',encrypted),'docx')).rejects.toThrow('contraseña');
    await writeFile(invalidPath,Buffer.from('d0cf11e0a1b11ae1','hex'));
    await expect(extractOfficeText(invalidPath,'docx')).rejects.toThrow('contraseña');
  });
  it('rejects mislabeled archives, malformed XML, entities and empty image-only documents', async () => {
    await expect(extractOfficeText(await document('wrong.docx',presentation()),'docx')).rejects.toThrow('compatible');
    const malformed=word(); malformed[2]!.content=`<w:document xmlns:w="${w}"><w:body>`;
    await expect(extractOfficeText(await document('badxml.docx',malformed),'docx')).rejects.toThrow('dañado');
    const entities=word(); entities[2]!.content='<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'+String(entities[2]!.content);
    await expect(extractOfficeText(await document('xxe.docx',entities),'docx')).rejects.toThrow('dañado');
    await expect(extractOfficeText(await document('images.docx',word('<w:p/>')),'docx')).rejects.toThrow('No encontramos texto, imágenes ni gráficos');
  });
  it('rejects external and missing slide relationships rather than following URLs or paths', async () => {
    for (const target of ['https://example.com/slide.xml','../../secret.xml','slides/slide99.xml']) {
      const parts=presentation(); parts[3]!.content=String(parts[3]!.content).replace('slides/slide2.xml',target);
      await expect(extractOfficeText(await document('badrel.pptx',parts),'pptx')).rejects.toThrow('compatible');
    }
  });
  it('bounds XML, total ZIP expansion and declared entry counts before decompression', async () => {
    const hugeXml=word(); hugeXml[2]!.content='x'.repeat(8*1024*1024+1);
    await expect(extractOfficeText(await document('huge.docx',hugeXml),'docx')).rejects.toThrow('demasiado grande');
    const hugeExpanded=word(); hugeExpanded.push({name:'word/media/image.bin',content:'tiny',declaredSize:256*1024*1024});
    await expect(extractOfficeText(await document('expanded.docx',hugeExpanded),'docx')).rejects.toThrow('descomprimir');
    const tooMany=Array.from({length:10001},(_,i)=>({name:`part${i}`,content:''}));
    await expect(extractOfficeText(await document('entries.docx',tooMany),'docx')).rejects.toThrow('demasiados archivos');
  });
  it('marks extraction truncation and tells the model the rest was omitted', async () => {
    const path=await document('large.docx',word(`<w:p><w:r><w:t>${'a'.repeat(OFFICE_TEXT_LIMIT+10)}</w:t></w:r></w:p>`));
    const [file]=await new AttachmentStore(join(await directory(),'attachments')).ingest([path]);
    expect(file!.truncated).toBe(true);
    expect(file!.extractedText).toContain('400000 caracteres');
    expect((await textWithAttachments(input([file!]),false))).toContain('no se incluyó el resto');
  });
  it('rolls back copied Office files when a batch contains an unreadable document', async () => {
    const dir=await directory(), attachments=join(dir,'attachments'), bad=join(dir,'bad.pptx'); await writeFile(bad,'broken');
    const store=new AttachmentStore(attachments);
    await expect(store.ingest([await document('good.docx',word()),bad])).rejects.toThrow();
    expect(store.files.size).toBe(0); expect(await readdir(attachments)).toEqual([]);
  });
  it('marks Word images in order, sends them to vision models and turns charts into data tables', async () => {
    const dir=await directory(), png=join(dir,'pixel.png');
    execFileSync('/usr/bin/sips',['-s','format','png','-z','4','4','/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericDocumentIcon.icns','--out',png],{stdio:'ignore'});
    const c='http://schemas.openxmlformats.org/drawingml/2006/chart', wp='http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
    const picture=(id: string, descr: string)=>`<w:r><w:drawing><wp:inline xmlns:wp="${wp}"><wp:docPr id="1" name="x" descr="${descr}"/><a:graphic xmlns:a="${a}"><a:graphicData><a:blip xmlns:r="${r}" r:embed="${id}"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    const parts=word(`<w:p><w:r><w:t>Antes</w:t></w:r>${picture('rId2','Logo')}</w:p><w:p>${picture('rId3','')}<w:r><w:t>Entre</w:t></w:r></w:p><w:p>${picture('rId2','Logo')}<w:r><w:drawing><c:chart xmlns:c="${c}" xmlns:r="${r}" r:id="rId4"/></w:drawing></w:r></w:p>`);
    parts.push(
      {name:'word/_rels/document.xml.rels',content:`<Relationships xmlns="${rels}"><Relationship Id="rId2" Type="${r}/image" Target="media/image1.png"/><Relationship Id="rId3" Type="${r}/image" Target="media/image2.emf"/><Relationship Id="rId4" Type="${r}/chart" Target="charts/chart1.xml"/></Relationships>`},
      {name:'word/media/image1.png',content:await readFile(png)},
      {name:'word/media/image2.emf',content:'emf'},
      {name:'word/charts/chart1.xml',content:`<c:chartSpace xmlns:c="${c}" xmlns:a="${a}"><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>Ventas</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:barChart><c:ser><c:tx><c:strRef><c:strCache><c:pt idx="0"><c:v>2025</c:v></c:pt></c:strCache></c:strRef></c:tx><c:cat><c:strRef><c:strCache><c:pt idx="0"><c:v>Q1</c:v></c:pt><c:pt idx="1"><c:v>Q2</c:v></c:pt></c:strCache></c:strRef></c:cat><c:val><c:numRef><c:numCache><c:pt idx="0"><c:v>10</c:v></c:pt><c:pt idx="1"><c:v>12.5</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser></c:barChart><c:valAx><c:title><c:tx><c:rich><a:p><a:r><a:t>Eje</a:t></a:r></a:p></c:rich></c:tx></c:title></c:valAx></c:plotArea></c:chart></c:chartSpace>`},
    );
    const attachments=join(dir,'attachments');
    const [file]=await new AttachmentStore(attachments).ingest([await document('informe.docx',parts)]);
    expect(file!.extractedText).toContain('Antes\n[Imagen 1: Logo]');
    expect(file!.extractedText).toContain('[Imagen 2 · formato EMF no compatible; no se envió]\nEntre');
    expect(file!.extractedText).toContain('[Gráfico 1 · barras: Ventas]\nCategoría\t2025\nQ1\t10\nQ2\t12.5');
    expect(file!.extractedText).not.toContain('Eje');
    const vision=await expandOfficeAttachments([file!],{supportsImages:true});
    expect(vision.map(f=>[f.kind,f.name,f.mime])).toEqual([['text','informe.docx',file!.mime],['image','informe.docx · Imagen 1','image/png']]);
    expect((await readFile(vision[1]!.path)).subarray(1,4).toString()).toBe('PNG');
    expect(vision[0]!.extractedText).toContain('se adjuntan aparte, en orden: Imagen 1.');
    expect((await expandOfficeAttachments([file!],{supportsImages:true}))[1]!.path).toBe(vision[1]!.path);
    const blind=await expandOfficeAttachments([file!],{supportsImages:false});
    expect(blind).toHaveLength(1); expect(blind[0]!.extractedText).toContain('Este modelo no ve imágenes');
    expect(await textWithAttachments(input(blind),false)).toContain('Q2\t12.5');
    const database=new SqliteChatStore(join(dir,'j7.db'),attachments);
    try {
      database.createChat({id:'chat',model:'codex:test',provider:'codex',webSearch:true,effort:'low'});
      database.appendMessage('chat',{id:'question',role:'user',text:'Resume',status:'complete',attachments:[file!]});
      database.deleteChat('chat');
      expect(await readdir(attachments)).toEqual([]);
    } finally { database.db.close(); }
  });
  it('reads PowerPoint slide images and charts through each slide relationships file', async () => {
    const dir=await directory(), png=join(dir,'pixel.png');
    execFileSync('/usr/bin/sips',['-s','format','png','-z','4','4','/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericDocumentIcon.icns','--out',png],{stdio:'ignore'});
    const c='http://schemas.openxmlformats.org/drawingml/2006/chart';
    const parts=presentation();
    parts[4]!.content=String(parts[4]!.content).replace('</p:spTree>',`<p:pic><p:nvPicPr><p:cNvPr id="2" name="Foto" descr="Gráfico de barras escaneado"/></p:nvPicPr><p:blipFill><a:blip xmlns:r="${r}" r:embed="rId1"/></p:blipFill></p:pic><p:graphicFrame><a:graphic><a:graphicData><c:chart xmlns:c="${c}" xmlns:r="${r}" r:id="rId2"/></a:graphicData></a:graphic></p:graphicFrame></p:spTree>`);
    parts.push(
      {name:'ppt/slides/_rels/slide1.xml.rels',content:`<Relationships xmlns="${rels}"><Relationship Id="rId1" Type="${r}/image" Target="../media/image1.png"/><Relationship Id="rId2" Type="${r}/chart" Target="../charts/chart3.xml"/></Relationships>`},
      {name:'ppt/media/image1.png',content:await readFile(png)},
      {name:'ppt/charts/chart3.xml',content:`<c:chartSpace xmlns:c="${c}"><c:chart><c:plotArea><c:pieChart><c:ser><c:cat><c:strRef><c:strCache><c:pt idx="0"><c:v>Sí</c:v></c:pt><c:pt idx="1"><c:v>No</c:v></c:pt></c:strCache></c:strRef></c:cat><c:val><c:numRef><c:numCache><c:pt idx="0"><c:v>70</c:v></c:pt><c:pt idx="1"><c:v>30</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser></c:pieChart></c:plotArea></c:chart></c:chartSpace>`},
    );
    const [file]=await new AttachmentStore(join(dir,'attachments')).ingest([await document('clase.pptx',parts)]);
    expect(file!.extractedText).toContain('Diapositiva 2\nÚltima diapositiva\n[Imagen 1: Gráfico de barras escaneado]\n[Gráfico 1 · circular]\nCategoría\tSerie 1\nSí\t70\nNo\t30');
    const expanded=await expandOfficeAttachments([file!],{supportsImages:true});
    expect(expanded.map(f=>f.kind)).toEqual(['text','image']);
  });
});
