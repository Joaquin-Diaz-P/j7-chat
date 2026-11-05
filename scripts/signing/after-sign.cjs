const {execFileSync}=require('node:child_process');
const {join}=require('node:path');
module.exports=async context=>{
  const app=join(context.appOutDir,'J7 Chat.app');
  const run=(args)=>{
    try {return execFileSync('codesign',args,{stdio:'inherit',timeout:15000});}
    catch(error){throw new Error('No se pudo firmar. Desbloquea el llavero de inicio de sesión y autoriza /usr/bin/codesign para la clave J7 Chat Local en Acceso a Llaveros. Consulta README (K2).',{cause:error});}
  };
  const sign=(path,id,deep=false)=>run(['--force',...(deep?['--deep']:[]),'--timestamp=none','--sign','J7 Chat Local','--identifier',id,path]);
  sign(app,'cl.j7.chat',true);
  sign(join(app,'Contents/Resources/j7-helper'),'cl.j7.chat.helper');
  sign(app,'cl.j7.chat');
  run(['--verify','--deep','--strict',app]);
};
