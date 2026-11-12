import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({handlers:new Map<string,(...args:any[])=>any>(),events:new Map<string,(()=>void)[]>(),windows:[] as any[],connections:{readConnections:vi.fn(async()=>[]),startLogin:vi.fn(async()=>{}),cancelLogin:vi.fn(async()=>{}),submitCode:vi.fn(),logout:vi.fn(async()=>{}),loginUrl:vi.fn(()=>undefined as string|undefined),dispose:vi.fn()},open:vi.fn(async()=>{})}));
vi.mock('electron',()=>({
 app:{on:(event:string,callback:()=>void)=>mocks.events.set(event,[...(mocks.events.get(event)??[]),callback]),getAppPath:()=>'/unused',isPackaged:false},
 nativeTheme:{shouldUseDarkColors:false},globalShortcut:{register:()=>true,unregister:vi.fn()},
 shell:{openExternal:mocks.open},ipcMain:{handle:(channel:string,handler:(...args:any[])=>any)=>mocks.handlers.set(channel,handler)},
 BrowserWindow:class {
  webContents={setWindowOpenHandler:vi.fn(),on:vi.fn(),mainFrame:{},isLoading:()=>false,isDestroyed:()=>false,send:vi.fn()};
  constructor(){mocks.windows.push(this);}on=vi.fn();isDestroyed=()=>false;loadFile=async()=>{};show=vi.fn();focus=vi.fn();
 },
}));
vi.mock('../../src/main/connections.js',()=>({setupConnections:()=>mocks.connections}));
vi.mock('../../src/main/native/helper.js',()=>({NativeHelper:class{request=async()=>({});dispose=vi.fn();}}));
import { setupSettings, openSettings } from '../../src/main/settings-window.js';
import { validateSettings } from '../../src/main/settings.js';
let trusted:any;
let settings:{value:ReturnType<typeof validateSettings>;update:ReturnType<typeof vi.fn>};
beforeEach(()=>{
 vi.clearAllMocks();mocks.handlers.clear();mocks.events.clear();
 settings={value:validateSettings({}),update:vi.fn()};
 const chat={catalog:{snapshot:()=>({models:[],statuses:{claude:{state:'ready'},codex:{state:'not_authenticated'}}}),refresh:vi.fn()},notify:vi.fn(),pruneCompareModels:vi.fn()};
 setupSettings(settings as any,{} as any,chat as any,{rebind:async()=>{}} as any,vi.fn());openSettings('programs');
 const window=mocks.windows.at(-1);trusted={sender:window.webContents,senderFrame:window.webContents.mainFrame};
});
it('solo Ajustes y su frame principal pueden leer o cambiar conexiones',async()=>{
 for(const channel of ['connections:data','connections:login','connections:cancel','connections:logout','connections:open-login-url','connections:code']){
  const handler=mocks.handlers.get(channel)!;
  expect(await handler({},'claude','code')).toBeUndefined();
  expect(await handler({...trusted,senderFrame:{}},'claude','code')).toBeUndefined();
 }
 expect(mocks.connections.startLogin).not.toHaveBeenCalled();expect(mocks.connections.submitCode).not.toHaveBeenCalled();expect(mocks.connections.logout).not.toHaveBeenCalled();
 await mocks.handlers.get('connections:data')!(trusted);expect(mocks.connections.readConnections).toHaveBeenCalledOnce();
});
it('valida la lista fija de servicios antes de ejecutar una acción',async()=>{
 for(const action of ['login','cancel','logout','open-login-url','code']){
  for(const id of ['mock','__proto__','constructor','https://example.invalid',null,4,{}])await expect(Promise.resolve().then(()=>mocks.handlers.get('connections:'+action)!(trusted,id,'code'))).rejects.toThrow('Servicio desconocido');
 }
 expect(mocks.connections.startLogin).not.toHaveBeenCalled();
 await mocks.handlers.get('connections:login')!(trusted,'claude');expect(mocks.connections.startLogin).toHaveBeenCalledWith('claude');
});
it('rechaza códigos largos, multilinea y valores que no sean texto',async()=>{
 const handler=mocks.handlers.get('connections:code')!;
 for(const code of ['',512,'a'.repeat(513),'a\nb','a\rb','a\u2028b',null,{}])expect(()=>handler(trusted,'claude',code)).toThrow();
 handler(trusted,'claude','a'.repeat(512));expect(mocks.connections.submitCode).toHaveBeenCalledOnce();
});
it('abre únicamente URLs https que proceden del login activo',async()=>{
 const handler=mocks.handlers.get('connections:open-login-url')!;
 for(const url of ['file:///etc/passwd','javascript:alert(1)','http://example.invalid']){mocks.connections.loginUrl.mockReturnValue(url);await handler(trusted,'codex');}
 expect(mocks.open).not.toHaveBeenCalled();
 mocks.connections.loginUrl.mockReturnValue('https://example.invalid/signin');await handler(trusted,'codex');expect(mocks.open).toHaveBeenCalledWith('https://example.invalid/signin');
});
it('impide desactivar el último proveedor con sesión al guardar',async()=>{
 await expect(mocks.handlers.get('settings:save')!(trusted,{disabledProviders:['claude','unknown']})).rejects.toThrow('último servicio con sesión');
 expect(settings.update).not.toHaveBeenCalled();
 await mocks.handlers.get('settings:save')!(trusted,{disabledProviders:['codex','unknown','codex']});
 expect(settings.update.mock.calls[0]?.[0].disabledProviders).toEqual(['codex']);
});
it('elimina el handler de Terminal y cierra logins al salir',()=>{
 expect(mocks.handlers.has('settings:open-terminal')).toBe(false);
 for(const callback of mocks.events.get('will-quit')??[])callback();
 expect(mocks.connections.dispose).toHaveBeenCalledOnce();
});
