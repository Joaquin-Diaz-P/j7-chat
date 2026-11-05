export async function generateTitle(text: string, generator: (text:string)=>Promise<string>, timeout=15000) {
 let timer: ReturnType<typeof setTimeout> | undefined;
 try {
  const result=await Promise.race([generator(text),new Promise<string>(resolve=>{timer=setTimeout(()=>resolve(''),timeout);})]);
  const title=result.trim().replace(/^["“]+|["”.]+$/g,'');
  return title && title.split(/\s+/).length<=8 ? title : text.trim().split(/\s+/).slice(0,6).join(' ');
 } catch {return text.trim().split(/\s+/).slice(0,6).join(' ');}
 finally {clearTimeout(timer);}
}
