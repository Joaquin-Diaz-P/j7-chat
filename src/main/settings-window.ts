import { setupConnections } from './connections.js';
import { isConnectionId, validConnectionCode, leavesReadyProvider, validateDisabledProviders } from '../shared/connections.js';
import { connectionStrings } from '../renderer/strings.js';
import { app, BrowserWindow, ipcMain, nativeTheme, globalShortcut, shell } from 'electron';
import { join } from 'node:path';
import { validateEffortUpdates } from './settings-effort.js';
import type { SettingsStore, Settings } from './settings.js';
import type { Panel } from './window.js';
import type { ChatService } from './chat/service.js';
import { replaceShortcuts, resolveShortcutBindings, isAccelerator, shortcutIdentity } from '../shared/shortcut.js';
import { strings as s } from '../renderer/strings.js';
import { Hex, modifierCodes, hotkeyConflicts } from './voice/hex.js';
import type { SettingsSection, PermissionKind } from '../shared/ipc.js';
import { programDownloadUrl } from './settings-programs.js';
import { NativeHelper } from './native/helper.js';
import { fromMainFrame } from './ipc-trust.js';
let window: BrowserWindow | undefined;
let opener: (section?:SettingsSection)=>void = () => {};
export function openSettings(section?:SettingsSection) { opener(section); }
export function setupSettings(settings: SettingsStore, panel: Panel, chat: ChatService, capture: { activatePanel(): void; rebind(): Promise<void>; question(): void }, updateTray:()=>void, helper = new NativeHelper(app.isPackaged ? join(process.resourcesPath,'j7-helper') : join(app.getAppPath(),'build/j7-helper'))) {
 const connections = setupConnections({settings, catalog:chat.catalog, mock:process.env.J7_MOCK==='1', changed:()=>{if(window && !window.isDestroyed())window.webContents.send('connections:changed');}});
 app.on('will-quit',()=>connections.dispose());
 // The main shutdown path uses app.exit(), which bypasses will-quit.
 app.on('before-quit',()=>connections.dispose());
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
 const trusted=(e:Electron.IpcMainInvokeEvent)=>fromMainFrame(window,e);
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
  if(raw.disabledProviders!==undefined) {
   const disabled = validateDisabledProviders(raw.disabledProviders);
   if(!leavesReadyProvider(chat.catalog.snapshot().statuses,value.disabledProviders,disabled))throw Error(connectionStrings.lastReady);
   value.disabledProviders=disabled;
  }
  if(raw.effortByModel!==undefined)value.effortByModel={...value.effortByModel,...validateEffortUpdates(raw.effortByModel,chat.catalog.snapshot().models)};
  if(raw.theme && ['system','light','dark'].includes(raw.theme)) value.theme=raw.theme;
  if(typeof raw.openAtLogin==='boolean')value.openAtLogin=raw.openAtLogin;
  if(typeof raw.personalInstructions==='string')value.personalInstructions=raw.personalInstructions.slice(0,4000);
  if(typeof raw.voiceModifier==='string') { if(!(raw.voiceModifier in modifierCodes))throw Error(s.invalidShortcut); value.voiceModifier=raw.voiceModifier; }
  const next=resolveShortcutBindings(value,raw);
  if(shortcutIdentity(next.shortcut)===shortcutIdentity(next.captureShortcut))throw Error(s.duplicateShortcut);
  for(const key of ['shortcut','captureShortcut'] as const) if(!isAccelerator(next[key]))throw Error(s.invalidShortcut);
  replaceShortcuts((['shortcut','captureShortcut'] as const).map(key=>({previous:value[key],next:next[key],activate:shortcut=>globalShortcut.register(shortcut,key==='shortcut'?()=>capture.activatePanel():()=>capture.question())})),key=>globalShortcut.unregister(key),s.shortcutUsed);
  settings.update({...value,...next}); nativeTheme.themeSource=settings.value.theme;
  if(app.isPackaged)app.setLoginItemSettings({openAtLogin:settings.value.openAtLogin}); await capture.rebind();updateTray();chat.notify();return settings.value;
 });
 ipcMain.handle('settings:model',(e,key:string,favorite:boolean)=>{if(trusted(e))favorite && chat.catalog.favorite(key);});
 ipcMain.handle('settings:refresh',async e=>{if(trusted(e))await chat.catalog.refresh(true);});
 const privacyPages:Record<PermissionKind,string>={screen:'ScreenCapture',input:'ListenEvent',microphone:'Microphone',accessibility:'Accessibility'};
 ipcMain.handle('settings:permission',async(e,kind:unknown)=>{if(trusted(e)&&typeof kind==='string'&&Object.hasOwn(privacyPages,kind))await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_'+privacyPages[kind as PermissionKind]);});
 ipcMain.handle('settings:open-url',async(e,id:unknown)=>{if(!trusted(e))return;const url=programDownloadUrl(id);if(url)await shell.openExternal(url);});
 ipcMain.handle('connections:data', e=>{if(trusted(e))return connections.readConnections();});
 for(const action of ['login','cancel','logout','open-login-url'] as const)ipcMain.handle('connections:'+action,async(e,id:unknown)=>{
  if(!trusted(e))return;
  if(!isConnectionId(id))throw Error(connectionStrings.invalidId);
  if(action==='login')return connections.startLogin(id);
  if(action==='cancel')return connections.cancelLogin(id);
  if(action==='logout')return connections.logout(id);
  const url=connections.loginUrl(id);
  if(url?.startsWith('https://'))await shell.openExternal(url);
 });
 ipcMain.handle('connections:code',(e,id:unknown,code:unknown)=>{
  if(!trusted(e))return;
  if(!isConnectionId(id))throw Error(connectionStrings.invalidId);
  if(!validConnectionCode(code))throw Error(connectionStrings.invalidCode);
  connections.submitCode(id,code);
 });
 ipcMain.handle('settings:start-hex',async e=>{if(trusted(e))await new Hex().start();});
 ipcMain.handle('settings:relaunch',e=>{if(trusted(e)){app.relaunch();app.exit(0);}});
 return {permissions, activatePreviousApp: () => helper.activatePreviousApp()};
}
