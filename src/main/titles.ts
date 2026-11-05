export function cleanTitle(text: string) { return text.replace(/["“”„‟«»`]/g, "").replace(/(^|\s)['‘’]+|['‘’]+(?=[\s.,;:!?]|$)/g, "$1").trim().replace(/[.。]+$/, "").trim(); }
export async function generateTitle(text: string, generator: (text:string)=>Promise<string>, timeout=15000) {
 let timer: ReturnType<typeof setTimeout> | undefined;
 try {
  const result=await Promise.race([generator(text),new Promise<string>(resolve=>{timer=setTimeout(()=>resolve(''),timeout);})]);
  const title=cleanTitle(result);
  return title && title.split(/\s+/).length<=8 ? title : cleanTitle(text).split(/\s+/).slice(0,6).join(' ');
 } catch {return cleanTitle(text).split(/\s+/).slice(0,6).join(' ');}
 finally {clearTimeout(timer);}
}
