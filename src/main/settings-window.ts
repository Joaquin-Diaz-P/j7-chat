import { app, BrowserWindow, ipcMain, nativeTheme, globalShortcut, shell } from 'electron';
import { join } from 'node:path';
import type { SettingsStore, Settings } from './settings.js';
import type { Panel } from './window.js';
import type { ChatService } from './chat/service.js';
import { replaceShortcuts, isAccelerator, shortcutIdentity } from '../shared/shortcut.js';
import { strings as s } from '../renderer/strings.js';
import { Hex, modifierCodes, hotkeyConflicts } from './voice/hex.js';
import { NativeHelper } from './native/helper.js';
let window: BrowserWindow | undefined;
let opener = () => {};
export function openSettings() { opener(); }
export function setupSettings(settings: SettingsStore, panel: Panel, chat: ChatService, capture: { rebind(): Promise<void>; question(): void }, updateTray:()=>void) {
 const helper = new NativeHelper(app.isPackaged ? join(process.resourcesPath,'j7-helper') : join(app.getAppPath(),'build/j7-helper'));
 app.on('will-quit',()=>helper.dispose());
 opener = () => {
  if(window && !window.isDestroyed()) { window.show(); window.focus(); return; }
  window = new BrowserWindow({width:720,height:560,title:s.settingsTitle,webPreferences:{preload:join(import.meta.dirname,'../preload/index.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  window.on('page-title-updated',e=>e.preventDefault());
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',e=>e.preventDefault());
  const url=process.env.ELECTRON_RENDERER_URL;
  void (url ? window.loadURL(url+'#/settings') : window.loadFile(join(import.meta.dirname,'../renderer/index.html'),{hash:'/settings'})).catch(()=>console.error('Settings load failed'));
 };
 const trusted=(e:Electron.IpcMainInvokeEvent)=>window && !window.isDestroyed() && e.sender===window.webContents && e.senderFrame===window.webContents.mainFrame;
 ipcMain.handle('settings:data',async e=>{
  if(!trusted(e))return;
  const hex=new Hex(); const hotkey=hex.installed()?await hex.hotkey():'';
  return {settings:settings.value,catalog:chat.catalog.snapshot(),permissions:await helper.request('permissions').catch(()=>({screen:false,input:false})),hex:{installed:hex.installed(),status:hex.installed()?await hex.status():undefined,conflict:hotkeyConflicts(settings.value.voiceModifier,hotkey)}};
 });
 ipcMain.handle('settings:save',async(e,raw:Partial<Settings>)=>{
  if(!trusted(e) || !raw || typeof raw!=='object')return;
  const value={...settings.value};
  if(raw.theme && ['system','light','dark'].includes(raw.theme)) value.theme=raw.theme;
  if(typeof raw.openAtLogin==='boolean')value.openAtLogin=raw.openAtLogin;
  if(typeof raw.personalInstructions==='string')value.personalInstructions=raw.personalInstructions.slice(0,4000);
  if(typeof raw.voiceModifier==='string') { if(!(raw.voiceModifier in modifierCodes))throw Error(s.invalidShortcut); value.voiceModifier=raw.voiceModifier; }
  const next={shortcut:raw.shortcut??value.shortcut,captureShortcut:raw.captureShortcut??value.captureShortcut};
  if(shortcutIdentity(next.shortcut)===shortcutIdentity(next.captureShortcut))throw Error(s.duplicateShortcut);
  for(const key of ['shortcut','captureShortcut'] as const) if(!isAccelerator(next[key]))throw Error(s.invalidShortcut);
  replaceShortcuts((['shortcut','captureShortcut'] as const).map(key=>({previous:value[key],next:next[key],activate:()=>globalShortcut.register(next[key],key==='shortcut'?()=>panel.toggle():()=>capture.question())})),key=>globalShortcut.unregister(key),s.shortcutUsed);
  settings.update({...value,...next}); nativeTheme.themeSource=settings.value.theme;
  if(app.isPackaged)app.setLoginItemSettings({openAtLogin:settings.value.openAtLogin}); await capture.rebind();updateTray();chat.notify();return settings.value;
 });
 ipcMain.handle('settings:model',(e,key:string,favorite:boolean)=>{if(trusted(e))favorite && chat.catalog.favorite(key);});
 ipcMain.handle('settings:refresh',async e=>{if(trusted(e))await chat.catalog.refresh(true);});
 ipcMain.handle('settings:permission',async(e,kind:unknown)=>{if(trusted(e)&&['screen','input'].includes(String(kind)))await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_'+(kind==='screen'?'ScreenCapture':'ListenEvent'));});
}
