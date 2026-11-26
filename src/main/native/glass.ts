import { createRequire } from 'node:module';
import { join } from 'node:path';
import { app, type BrowserWindow } from 'electron';
type Glass = {
  update(handle:Buffer,x:number,y:number,width:number,height:number,dark:boolean,radius:number,opacity:number):void;
};
let glass: Glass | null | undefined;
export function updateGlass(window: BrowserWindow, rect:{left:number;top:number;right:number;bottom:number},dark:boolean,opacity = 1) {
  if (glass === undefined) {
    // Without the addon the card keeps its translucent tint; the panel must still work.
    try { glass = createRequire(import.meta.url)(app.isPackaged ? join(process.resourcesPath,'j7-glass.node') : join(app.getAppPath(),'build/j7-glass.node')) as Glass; }
    catch (error) { glass = null; console.error('Glass addon unavailable', error); }
  }
  if (!glass || window.isDestroyed()) return;
  glass.update(window.getNativeWindowHandle(),rect.left,rect.top,rect.right-rect.left,rect.bottom-rect.top,dark,12,opacity);
}
