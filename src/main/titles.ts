export function cleanTitle(text: string) { return text.replace(/["“”„‟«»`]/g, "").replace(/(^|\s)['‘’]+|['‘’]+(?=[\s.,;:!?]|$)/g, "$1").trim().replace(/[.。]+$/, "").trim(); }
const ACUTE: Record<string,string> = { à:'á', è:'é', ì:'í', ò:'ó', ù:'ú', À:'Á', È:'É', Ì:'Í', Ò:'Ó', Ù:'Ú' };
export function fixGraveAccents(text: string) { return text.replace(/[àèìòùÀÈÌÒÙ]/g, c => ACUTE[c]!); }
export async function generateTitle(text: string, generator: (text:string)=>Promise<string>, timeout=15000) {
 let timer: ReturnType<typeof setTimeout> | undefined;
 try {
  const result=await Promise.race([generator(text),new Promise<string>(resolve=>{timer=setTimeout(()=>resolve(''),timeout);})]);
  // Apple Intelligence sometimes writes Spanish accents backwards (ò instead of ó). Only fix it
  // when the question itself has no grave accents, so French, Italian or Catalan titles stay intact.
  const title=/[àèìòù]/i.test(text) ? cleanTitle(result) : fixGraveAccents(cleanTitle(result));
  return title && !title.includes("\uFFFD") && title.split(/\s+/).length<=8 ? title : cleanTitle(text).split(/\s+/).slice(0,6).join(' ');
 } catch {return cleanTitle(text).split(/\s+/).slice(0,6).join(' ');}
 finally {clearTimeout(timer);}
}
