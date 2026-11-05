// npm run icons: regenerate transparent menu templates and the macOS iconset from SVG sources.
import sharp from "sharp";
for (const scale of [1, 2]) {
  const size = 18 * scale;
  await sharp("assets/logo.svg").resize(size,size,{fit:"contain",background:{r:0,g:0,b:0,alpha:0}}).png().toFile(`assets/iconTemplate${scale === 2 ? "@2x" : ""}.png`);
}
const {mkdir,rm} = await import('node:fs/promises');
const {execFileSync} = await import('node:child_process');
const directory='build/icon.iconset';
await mkdir(directory,{recursive:true});
for(const size of [16,32,128,256,512])for(const scale of [1,2])await sharp('assets/icon.svg').resize(size*scale,size*scale).png().toFile(`${directory}/icon_${size}x${size}${scale===2?'@2x':''}.png`);
execFileSync('/usr/bin/iconutil',['-c','icns',directory,'-o','assets/icon.icns']);
await rm(directory,{recursive:true});
