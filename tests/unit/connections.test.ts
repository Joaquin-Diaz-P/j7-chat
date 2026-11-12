import { afterEach, describe, expect, it, vi } from 'vitest';
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Connections, LOGIN_TIMEOUT_MS, safeConnectionDetail } from '../../src/main/connections.js';
import { SettingsStore } from '../../src/main/settings.js';
import { ModelCatalog } from '../../src/main/chat/catalog.js';
import { ChatService } from '../../src/main/chat/service.js';
import type { ChatProvider, ProviderId } from '../../src/main/providers/types.js';
import { connectionStrings as t } from '../../src/renderer/strings.js';
import { canDisableConnection, leavesReadyProvider, validateDisabledProviders } from '../../src/shared/connections.js';
const roots: string[] = [], services: Connections[] = [], catalogs: ModelCatalog[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const service of services.splice(0)) service.dispose();
  await Promise.all(catalogs.splice(0).map(catalog => catalog.dispose()));
  await Promise.all(roots.splice(0).map(root => rm(root,{recursive:true,force:true})));
});
async function fixture(config: Record<string,unknown> = {}) {
  const home = await mkdtemp(join(tmpdir(),'j7-connections-')); roots.push(home);
  await writeFile(join(home,'connection-fixture.json'),JSON.stringify({sandbox:true,...config}));
  for(const id of ['claude','codex','gemini','opencode']) {
    await copyFile(resolve('tests/fixtures/connections/cli.cjs'),join(home,id)); await chmod(join(home,id),0o755);
  }
  const settings = new SettingsStore(join(home,'settings.json'));
  const provider = (id: ProviderId): ChatProvider => ({ id, getStatus:vi.fn(async()=>({state:'ready' as const})), listModels:vi.fn(async()=>[{id:'model',provider:id,label:id,supportsImages:false,supportsPdf:false,supportsEffort:false}]), async *runTurn(){}, dispose:vi.fn(async()=>{}) });
  const gemini = provider('gemini');
  gemini.getStatus=vi.fn(async()=>({state:await readFile(join(home,'gemini-ready'),'utf8').then(()=>true,()=>false)?'ready' as const:'not_authenticated' as const}));
  const catalog = new ModelCatalog(settings,[provider('claude'),provider('codex'),gemini]); catalogs.push(catalog);
  const refresh = vi.spyOn(catalog,'refresh');
  const changed = vi.fn();
  const binary = vi.fn(async (id:string)=>join(home,id));
  const service = new Connections({ settings,catalog,changed,resolve:binary,environment:{HOME:home,CODEX_HOME:'/never-used'} }); services.push(service);
  const mark = (id:string) => writeFile(join(home,id+'-ready'),'ready');
  const calls = async () => (await readFile(join(home,'calls.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  return {home,settings,catalog,refresh,changed,binary,service,mark,calls};
}
describe('Conexiones — exclusivamente CLI falsas y HOME temporal',()=>{
  it.each(['pro','max','team','enterprise'])('lee cuenta y plan Claude %s',async plan=>{
    const f=await fixture({plan});await f.mark('claude');await f.catalog.refresh();
    expect(await f.service.readConnection('claude')).toMatchObject({installed:true,state:'ready',version:'2.1.309',account:{email:'fixture@example.invalid',plan:'Claude '+plan[0]!.toUpperCase()+plan.slice(1)},modelCount:1,enabled:true});
    expect((await f.calls()).every(call=>call.home===f.home && call.privateHome===false)).toBe(true);
  });
  it('Claude reconoce las cuentas de consola y planes desconocidos',async()=>{
    const f=await fixture({authMethod:'console',plan:'pro'});await f.mark('claude');
    expect((await f.service.readConnection('claude')).account?.plan).toBe(t.apiKey);
    await writeFile(join(f.home,'connection-fixture.json'),JSON.stringify({sandbox:true,plan:'custom'}));
    expect((await f.service.readConnection('claude')).account?.plan).toBe('Custom');
  });
  it.each(['plus','pro','free','team','business','enterprise','edu'])('extrae solo email y plan Codex %s de un JWT inventado',async plan=>{
    const f=await fixture();await f.mark('codex');await mkdir(join(f.home,'.codex'));
    const payload=Buffer.from(JSON.stringify({email:'fixture@example.invalid','https://api.openai.com/auth':{chatgpt_plan_type:plan},unrelated:'omitted'})).toString('base64url');
    await writeFile(join(f.home,'.codex/auth.json'),JSON.stringify({tokens:{id_token:['fixture',payload,'unsigned'].join('.')},auth_mode:'chatgpt'}));
    const connection=await f.service.readConnection('codex');
    expect(connection.account).toEqual({email:'fixture@example.invalid',plan:'ChatGPT '+plan[0]!.toUpperCase()+plan.slice(1)});
    expect(JSON.stringify(connection)).not.toMatch(/tokens|id_token|unsigned|omitted/);
  });
  it('Codex mantiene ready si el archivo falta o no es válido y reconoce apiKey',async()=>{
    const f=await fixture();await f.mark('codex');
    expect((await f.service.readConnection('codex')).account).toBeUndefined();
    await mkdir(join(f.home,'.codex'));await writeFile(join(f.home,'.codex/auth.json'),'not json');
    expect((await f.service.readConnection('codex')).state).toBe('ready');
    await writeFile(join(f.home,'.codex/auth.json'),JSON.stringify({auth_mode:'apikey'}));
    expect((await f.service.readConnection('codex')).account).toEqual({plan:t.apiKey});
  });
  it('distingue ausencia, falta de sesión y error de ejecución',async()=>{
    const f=await fixture();
    expect((await f.service.readConnection('claude')).state).toBe('not_authenticated');
    expect((await f.service.readConnection('codex')).state).toBe('not_authenticated');
    f.binary.mockResolvedValueOnce(undefined as unknown as string);
    expect(await f.service.readConnection('claude')).toMatchObject({installed:false,state:'not_installed'});
    f.binary.mockResolvedValueOnce('/nonexistent/fixture');
    expect(await f.service.readConnection('claude')).toMatchObject({installed:true,state:'error'});
  });
  it('OpenCode detecta credenciales sin exponer cuentas',async()=>{
    const f=await fixture();expect((await f.service.readConnection('opencode')).state).toBe('not_authenticated');
    await f.mark('opencode');expect(await f.service.readConnection('opencode')).toMatchObject({state:'ready'});
    expect((await f.service.readConnection('opencode')).account).toBeUndefined();
  });
  it('OpenCode 2.x detecta credenciales en su tabla de auth list',async()=>{
    const f=await fixture({opencodeTable:true});expect((await f.service.readConnection('opencode')).state).toBe('not_authenticated');
    await f.mark('opencode');expect((await f.service.readConnection('opencode')).state).toBe('ready');
  });
  it.each(['claude','codex'] as const)('login %s publica URL, termina en ready y refresca el catálogo',async id=>{
    const f=await fixture({loginMode:'auto'});
    await Promise.all([f.service.startLogin(id),f.service.startLogin(id)]);
    await vi.waitFor(()=>expect(f.service.loginUrl(id)).toBe(id==='claude'?'https://claude.ai/oauth/authorize?code=true&client_id=x&state=y':'https://auth.example.invalid/signin'));
    await vi.waitFor(async()=>expect((await f.service.readConnection(id)).state).toBe('ready'));
    expect(f.refresh).toHaveBeenCalledWith(true);expect(f.changed).toHaveBeenCalled();
    expect((await f.calls()).filter(call=>call.args?.includes('login')&&!call.args.includes('status'))).toHaveLength(1);
  });
  it('pide código y escribe por stdin sin registrarlo',async()=>{
    const f=await fixture({loginMode:'code'});await f.service.startLogin('claude');
    await vi.waitFor(async()=>expect((await f.service.readConnection('claude')).login?.needsCode).toBe(true));
    expect(()=>f.service.submitCode('claude','a\nb')).toThrow();
    f.service.submitCode('claude','fixture-code');
    await vi.waitFor(async()=>expect((await f.service.readConnection('claude')).state).toBe('ready'));
    expect(await readFile(join(f.home,'calls.jsonl'),'utf8')).not.toContain('fixture-code');
  });
  it('cancela el proceso con SIGTERM y devuelve el estado leído',async()=>{
    const f=await fixture();await f.service.startLogin('codex');
    await vi.waitFor(()=>expect(f.service.loginUrl('codex')).toBeDefined());
    expect(await f.service.cancelLogin('codex')).toMatchObject({state:'not_authenticated'});
    expect(f.service.loginUrl('codex')).toBeUndefined();
    await vi.waitFor(async()=>expect((await f.calls()).some(call=>call.stopped)).toBe(true));
  });
  it('vence a los cinco minutos con temporizadores falsos y limpia el proceso',async()=>{
    const f=await fixture();vi.useFakeTimers({toFake:['setTimeout','clearTimeout','setInterval','clearInterval']});
    await f.service.startLogin('claude');
    await vi.advanceTimersByTimeAsync(LOGIN_TIMEOUT_MS);
    vi.useRealTimers();
    await vi.waitFor(async()=>expect(await f.service.readConnection('claude')).toMatchObject({state:'not_authenticated',detail:t.loginTimeout}));
    expect(f.service.loginUrl('claude')).toBeUndefined();
  });
  it('limpia URLs del error de login',async()=>{
    const f=await fixture({loginMode:'error'});await f.service.startLogin('claude');
    await vi.waitFor(async()=>expect((await f.service.readConnection('claude')).detail).toBe('Could not sign in'));
    expect(safeConnectionDetail('Authorization Bearer synthetic')).toBe(t.failed);
    expect(safeConnectionDetail('Error https://example.invalid/?code=synthetic')).toBe('Error');
  });
  it.each(['claude','codex'] as const)('logout %s usa el programa falso y refresca',async id=>{
    const f=await fixture();await f.mark(id);expect((await f.service.readConnection(id)).state).toBe('ready');
    expect((await f.service.logout(id))?.state).toBe('not_authenticated');expect(f.refresh).toHaveBeenCalledWith(true);
    expect((await f.calls()).some(call=>call.id===id&&call.args?.includes('logout'))).toBe(true);
  });
  it('Antigravity autentica con Google en otro ACP y lee el estado del proveedor',async()=>{
    const f=await fixture();await f.service.startLogin('gemini');
    await vi.waitFor(async()=>expect((await f.service.readConnection('gemini')).state).toBe('ready'));
    expect((await f.calls()).some(call=>call.method==='authenticate'&&call.methodId==='oauth-personal')).toBe(true);
    expect((await f.service.readConnection('gemini')).account).toBeUndefined();
    expect(f.catalog.providers.get('gemini')?.dispose).toHaveBeenCalled();
  });
  it('modo mock no resuelve ni ejecuta programas reales',async()=>{
    const f=await fixture();const service=new Connections({settings:f.settings,catalog:f.catalog,mock:true,resolve:f.binary});services.push(service);
    expect(await service.readConnections()).toEqual([]);await service.startLogin('claude');await service.logout('codex');expect(f.binary).not.toHaveBeenCalled();
  });
  it('dispose mata los logins y elimina sus temporizadores',async()=>{
    const f=await fixture();await f.service.startLogin('claude');await vi.waitFor(()=>expect(f.service.loginUrl('claude')).toBeDefined());
    f.service.dispose();expect(f.service.loginUrl('claude')).toBeUndefined();
    await vi.waitFor(async()=>expect((await f.calls()).some(call=>call.stopped)).toBe(true));
  });
});
it('filtra proveedores desactivados en el catálogo único y la barra elige otro modelo',async()=>{
  const f=await fixture();await f.catalog.refresh();
  const chat=new ChatService(f.catalog,()=>{});
  chat.updateChat({model:'claude:model'});expect(chat.snapshot().model).toBe('claude:model');
  f.settings.update({disabledProviders:['claude']});
  const snapshot=f.catalog.snapshot();expect(snapshot.models.every(model=>model.provider!=='claude')).toBe(true);
  expect(snapshot.statuses.claude?.state).toBe('ready');expect(chat.snapshot().model).toBe('codex:model');
  f.settings.update({disabledProviders:[]});expect(f.catalog.snapshot().models.some(model=>model.provider==='claude')).toBe(true);
  await chat.dispose();
});
it('valida ids al guardar y bloquea únicamente el último servicio activo con sesión',()=>{
  expect(validateDisabledProviders(['claude','claude','invalid',{},'codex'])).toEqual(['claude','codex']);
  expect(validateDisabledProviders('claude')).toEqual([]);
  const claude={id:'claude' as const,state:'ready' as const,enabled:true};
  const codex={id:'codex' as const,state:'ready' as const,enabled:false};
  expect(canDisableConnection(claude,[claude,codex])).toBe(false);
  expect(canDisableConnection(claude,[claude,{...codex,enabled:true}])).toBe(true);
  expect(canDisableConnection(codex,[claude,codex])).toBe(true);
  expect(leavesReadyProvider({claude:{state:'ready'},codex:{state:'ready'}},['codex'],['claude','codex'])).toBe(false);
  expect(leavesReadyProvider({claude:{state:'not_authenticated'}},[],['claude'])).toBe(true);
});
