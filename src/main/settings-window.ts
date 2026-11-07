import { app, BrowserWindow, ipcMain, nativeTheme, globalShortcut, shell } from 'electron';
import { join } from 'node:path';
import { validateEffortUpdates } from './settings-effort.js';
import type { SettingsStore, Settings } from './settings.js';
import type { Panel } from './window.js';
import type { ChatService } from './chat/service.js';
import { replaceShortcuts, isAccelerator, shortcutIdentity } from '../shared/shortcut.js';
import { strings as s } from '../renderer/strings.js';
import { Hex, modifierCodes, hotkeyConflicts } from './voice/hex.js';
import type { SettingsSection, PermissionKind } from '../shared/ipc.js';
import { programDownloadUrl } from './settings-programs.js';
import { NativeHelper } from './native/helper.js';
let window: BrowserWindow | undefined;
let opener: (section?:SettingsSection)=>void = () => {};
export function openSettings(section?:SettingsSection) { opener(section); }
export function setupSettings(settings: SettingsStore, panel: Panel, chat: ChatService, capture: { rebind(): Promise<void>; question(): void }, updateTray:()=>void) {
 const helper = new NativeHelper(app.isPackaged ? join(process.resourcesPath,'j7-helper') : join(app.getAppPath(),'build/j7-helper'));
 app.on('will-quit',()=>helper.dispose());
 const permissions = () => helper.request('permissions').catch(()=>({screen:false,input:false}));
 opener = section => {
  if(window && !window.isDestroyed()) { if(section){const contents=window.webContents;const select=()=>{if(!contents.isDestroyed())contents.send('settings:section',section);};if(contents.isLoading())contents.once('did-finish-load',select);else select();} window.show(); window.focus(); return; }
  window = new BrowserWindow({width:760,height:540,titleBarStyle:"hiddenInset",backgroundColor:(settings.value.theme==='dark' || (settings.value.theme==='system' && nativeTheme.shouldUseDarkColors))?"#000000":"#fdfdfd",title:s.settingsTitle,webPreferences:{preload:join(import.meta.dirname,'../preload/index.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  window.on('page-title-updated',e=>e.preventDefault());
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',e=>e.preventDefault());
  const url=process.env.ELECTRON_RENDERER_URL;
  const hash='/settings'+(section?'?section='+section:'');
  void (url ? window.loadURL(url+'#'+hash) : window.loadFile(join(import.meta.dirname,'../renderer/index.html'),{hash})).catch(()=>console.error('Settings load failed'));
 };
 const trusted=(e:Electron.IpcMainInvokeEvent)=>window && !window.isDestroyed() && e.sender===window.webContents && e.senderFrame===window.webContents.mainFrame;
 ipcMain.handle('settings:data',async e=>{
  if(!trusted(e))return;
  const hex=new Hex(); const installed=hex.installed();
  const [hotkey,status,grants]=await Promise.all([installed?hex.hotkey():'',installed?hex.status():undefined,permissions()]);
  let hexPermissions:{microphone:boolean;accessibility:boolean} | undefined;
  if(status?.code===0)try {const reply=JSON.parse(status.text);if(reply?.permissions)hexPermissions={microphone:reply.permissions.microphone==='ready',accessibility:reply.permissions.accessibility==='ready'};}catch { /* Hex did not return valid JSON. */ }
  return {settings:settings.value,catalog:chat.catalog.snapshot(),permissions:grants,hex:{installed,status,running:status?.code===0,permissions:hexPermissions,conflict:hotkeyConflicts(settings.value.voiceModifier,hotkey)}};
 });
 ipcMain.handle('settings:save',async(e,raw:Partial<Settings>)=>{
  if(!trusted(e) || !raw || typeof raw!=='object')return;
  const value={...settings.value};
  if(raw.effortByModel!==undefined)value.effortByModel={...value.effortByModel,...validateEffortUpdates(raw.effortByModel,chat.catalog.snapshot().models)};
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
 const privacyPages:Record<PermissionKind,string>={screen:'ScreenCapture',input:'ListenEvent',microphone:'Microphone',accessibility:'Accessibility'};
 ipcMain.handle('settings:permission',async(e,kind:unknown)=>{if(trusted(e)&&typeof kind==='string'&&Object.hasOwn(privacyPages,kind))await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_'+privacyPages[kind as PermissionKind]);});
 ipcMain.handle('settings:open-url',async(e,id:unknown)=>{if(!trusted(e))return;const url=programDownloadUrl(id);if(url)await shell.openExternal(url);});
 ipcMain.handle('settings:open-terminal',async e=>{if(trusted(e))await shell.openPath('/System/Applications/Utilities/Terminal.app');});
 ipcMain.handle('settings:start-hex',async e=>{if(trusted(e))await new Hex().start();});
 ipcMain.handle('settings:relaunch',e=>{if(trusted(e)){app.relaunch();app.exit(0);}});
 return {permissions};
}
