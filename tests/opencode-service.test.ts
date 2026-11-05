import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenCodeProvider, openCodePermissions, serviceUrl } from '../src/main/providers/opencode.js';
const commands = vi.hoisted(() => [] as string[][]);
vi.mock('node:child_process', async (original) => ({
  ...await original<typeof import('node:child_process')>(),
  execFile: Object.assign(() => {}, { [Symbol.for('nodejs.util.promisify.custom')]: async (_binary: string, args: string[]) => {
    commands.push(args);
    return {stdout: args[1] === 'status' && commands.filter(a => a[1] === 'status').length > 1 ? 'http://127.0.0.1:49374\n' : '', stderr:''};
  }}),
}));
afterEach(() => { vi.unstubAllGlobals(); commands.length = 0; });
it('accepts only a loopback service URL', () => {
  expect(serviceUrl('http://127.0.0.1:49374\n')).toBe('http://127.0.0.1:49374');
  expect(serviceUrl('failed http://127.0.0.1:49374')).toBeUndefined();
  expect(serviceUrl('http://example.com:1234')).toBeUndefined();
});
it('starts only a missing service, applies permissions every turn and never stops it', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'j7-service-test-'));
 await mkdir(join(dir,'.config/opencode'),{recursive:true});
 await writeFile(join(dir,'.config/opencode/service.json'),JSON.stringify({password:'test-only'}));
 let stream: ReadableStreamDefaultController<Uint8Array>;
 const requests: {path:string; method:string; body:Record<string,unknown>}[]=[];
 vi.stubGlobal('fetch', vi.fn(async (url:string, init:RequestInit={}) => {
  const path=new URL(url).pathname, method=init.method ?? 'GET';
  const body=JSON.parse(String(init.body ?? '{}')) as Record<string,unknown>;
  requests.push({path,method,body});
  if(path==='/api/event') return new Response(new ReadableStream<Uint8Array>({start(c){stream=c; init.signal?.addEventListener('abort',()=>c.close());}}));
  if(path.endsWith('/prompt') || path.endsWith('/reply')) queueMicrotask(()=>stream.enqueue(new TextEncoder().encode('data: '+JSON.stringify(path.endsWith('/reply') ? {type:'session.execution.succeeded',data:{sessionID:'test-session'}} : {type:'permission.asked',data:{sessionID:'test-session',id:'permission-test'}})+'\n\n')));
  return Response.json(path==='/api/model' ? {data:[{providerID:'opencode',type:'chat',id:'free',name:'Free',capabilities:{input:['text']},variants:[],cost:[{input:0,output:0,cache:{read:0,write:0}}]}]} : {data:{id:'test-session'}});
 }));
 const provider=new OpenCodeProvider({binaryPath:'/bin/echo',dataDir:join(dir,'data'),environment:{HOME:dir}});
 try {
  for(const webSearch of [false,true]) {
   const events=[];
   for await(const event of provider.runTurn({model:'free',effort:'normal',webSearch,instructions:'J7 instructions',text:'hello',attachments:[],signal:new AbortController().signal,...(webSearch?{nativeSessionId:'test-session'}:{})})) events.push(event);
   expect(events.at(-1)?.type).toBe('done');
  }
  expect(requests.find(r=>r.method==='POST'&&r.path==='/api/session')?.body.permissions).toEqual(openCodePermissions(false));
  expect(requests.filter(r=>r.method==='PATCH').map(r=>r.body.permissions)).toEqual([openCodePermissions(false),openCodePermissions(true)]);
  expect(requests.filter(r=>r.path.endsWith('/reply')).map(r=>r.body)).toEqual([{decision:'reject'},{decision:'reject'}]);
  expect(requests.filter(r=>r.path.endsWith('/prompt')).every(r=>String(r.body.text).includes('J7 instructions'))).toBe(true);
 } finally {await provider.dispose();await rm(dir,{recursive:true,force:true});}
 expect(commands).toEqual([['service','status'],['service','start'],['service','status']]);
});

it('reports an unavailable service without stopping or restarting it', async () => {
 const dir=await mkdtemp(join(tmpdir(),'j7-service-missing-'));
 vi.stubGlobal('fetch',vi.fn());
 const provider=new OpenCodeProvider({binaryPath:'/bin/echo',dataDir:dir,environment:{HOME:dir}});
 try {
  const status=await provider.getStatus();
  expect(status.state).toBe('error');
  expect('detail' in status && status.detail).toContain('servicio de OpenCode');
  expect(fetch).not.toHaveBeenCalled();
 } finally {await provider.dispose();await rm(dir,{recursive:true,force:true});}
 expect(commands.every(args=>args[0]==='service' && ['status','start'].includes(args[1]!))).toBe(true);
});
