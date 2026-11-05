const {execFileSync}=require('node:child_process');
const {join}=require('node:path');
module.exports=async context=>{
  const app=join(context.appOutDir,'J7 Chat.app');
  const run=(args)=>{
    try {return execFileSync('codesign',args,{stdio:'inherit',timeout:300000});}
    catch(error){throw new Error('No se pudo firmar. Desbloquea el llavero de inicio de sesión y autoriza /usr/bin/codesign para la clave J7 Chat Local en Acceso a Llaveros. Consulta docs/firma.md.',{cause:error});}
  };
  // Without the local identity (a fresh clone), sign ad hoc: the app works, but macOS asks for permissions again after each update.
  let identity='J7 Chat Local';
  try {execFileSync('security',['find-certificate','-c',identity],{stdio:'ignore'});}
  catch {identity='-';console.warn('Sin la identidad J7 Chat Local: se firma ad hoc. Para conservar permisos entre versiones, ejecuta bash scripts/signing/create-identity.sh.');}
  const sign=(path,id,deep=false)=>run(['--force',...(deep?['--deep']:[]),'--timestamp=none','--sign',identity,'--identifier',id,path]);
  sign(app,'cl.j7.chat',true);
  sign(join(app,'Contents/Resources/j7-helper'),'cl.j7.chat.helper');
  sign(app,'cl.j7.chat');
  run(['--verify','--deep','--strict',app]);
};
