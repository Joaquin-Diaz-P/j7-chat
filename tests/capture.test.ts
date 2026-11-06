import { describe,it,expect,vi,afterEach } from 'vitest';
import { CaptureFlows, type FlowPorts } from '../src/main/capture/flows.js';
import { Hex,hotkeyConflicts } from '../src/main/voice/hex.js';
import { validateFile } from '../src/main/attachments/index.js';
import { prepareAttachments } from '../src/main/attachments/policy.js';
import type { ModelInfo } from '../src/main/providers/types.js';
import type { CaptureEvent } from '../src/shared/capture.js';
function fixture(stop = vi.fn(async()=>({code:0,text:'dictado'}))) {
  const events: CaptureEvent[] = [];
  const ports: FlowPorts = {capture:vi.fn(async()=>({id:'capture',kind:'image' as const,path:'/tmp/a.png',name:'a.png',mime:'image/png'})),show:vi.fn(),hide:vi.fn(),visible:()=>false,emit:e=>events.push(e),protect:vi.fn()};
  const hex = {begin:vi.fn(async()=>({code:0,text:''})),start:vi.fn(async()=>({code:0,text:''})),stop,recoverSince:vi.fn(async()=> 'recuperado')};
  return {flow:new CaptureFlows(ports,hex),ports,hex,events};
}
afterEach(()=>vi.useRealTimers());
describe('capture flows with fake Hex',()=>{
  it('microphone dictation skips screen capture and leaves text for review',async()=>{
    const f=fixture(); await f.flow.begin(true,false);
    expect(f.ports.capture).not.toHaveBeenCalled();
    expect(f.flow.state).toMatchObject({phase:'listening',locked:true});
    expect(f.flow.state.permission).toBeUndefined();
    await f.flow.end(false);
    expect(f.events.at(-1)).toMatchObject({state:{phase:'idle'},text:'dictado',autoSend:false});
    expect(f.ports.protect).toHaveBeenLastCalledWith(false);
  });
  it('send finishes microphone dictation and sends the transcript',async()=>{
    const f=fixture(); await f.flow.begin(true,false); await f.flow.end(true);
    expect(f.events.at(-1)).toMatchObject({text:'dictado',autoSend:true});
    expect(f.hex.stop).toHaveBeenCalledOnce();
  });
  it('send during transcription promotes delivery without stopping Hex twice',async()=>{
    let release!:(v:{code:number;text:string})=>void;
    const f=fixture(vi.fn(()=>new Promise(r=>{release=r;})));
    await f.flow.begin(true,false); const end=f.flow.end(false);
    await f.flow.end(true); release({code:0,text:'dictado'}); await end;
    expect(f.hex.stop).toHaveBeenCalledOnce();
    expect(f.events.at(-1)).toMatchObject({text:'dictado',autoSend:true});
  });
  it('send while Hex is opening waits for recording before stopping',async()=>{
    let release!:(v:{code:number;text:string})=>void;
    const f=fixture();f.hex.begin.mockImplementation(()=>new Promise(r=>{release=r;}));
    const begin=f.flow.begin(true,false); await f.flow.end(true);
    expect(f.hex.stop).not.toHaveBeenCalled();
    release({code:0,text:''});await begin;
    expect(f.events.at(-1)).toMatchObject({text:'dictado',autoSend:true});
  });
  it('history recovery preserves transcription-only intent',async()=>{
    const f=fixture(vi.fn(async()=>({code:1,text:''})));
    await f.flow.begin(true,false);await f.flow.end(false);
    expect(f.events.at(-1)).toMatchObject({state:{phase:'idle'},text:'recuperado',autoSend:false});
  });
  it('waits forty seconds and emits elapsed time and text',async()=>{
    vi.useFakeTimers(); const f=fixture(vi.fn(()=>new Promise(resolve=>setTimeout(()=>resolve({code:0,text:'largo'}),40000))));
    await f.flow.begin(); const end=f.flow.end();
    await vi.advanceTimersByTimeAsync(8000); expect(f.flow.state.seconds).toBe(8);
    await vi.advanceTimersByTimeAsync(32000); await end;
    expect(f.events.at(-1)?.text).toBe('largo');
  });
  it('recovers after 120 seconds',async()=>{
    vi.useFakeTimers(); const f=fixture(vi.fn(()=>new Promise(resolve=>setTimeout(()=>resolve({code:-1,text:''}),120000))));
    await f.flow.begin(); const end=f.flow.end(); await vi.advanceTimersByTimeAsync(120000); await end;
    expect(f.hex.recoverSince).toHaveBeenCalled(); expect(f.events.at(-1)?.text).toBe('recuperado');
  });
  it('cancels transcription leaving attachment and discarding late text',async()=>{
    let resolve!: (v:{code:number;text:string})=>void;
    const f=fixture(vi.fn(()=>new Promise(r=>{resolve=r;})));
    await f.flow.begin(); const end=f.flow.end(); const cancel=f.flow.cancel();
    resolve({code:0,text:'discard'}); await end; // cancel also waits for a stop
    expect(f.events.some(e=>e.text)).toBe(false); expect(f.events.some(e=>e.removeId)).toBe(false);
    void cancel;
  });
  it('dictates without a screenshot when screen recording is not allowed, keeping the notice up',async()=>{
    const f=fixture(); vi.mocked(f.ports.capture).mockResolvedValue(undefined);
    await f.flow.begin(true);
    expect(f.hex.begin).toHaveBeenCalled(); expect(f.flow.state).toMatchObject({phase:'listening',locked:true,permission:'screen'});
    expect(f.events.some(e=>e.attachment)).toBe(false);
    await f.flow.end(); expect(f.events.at(-1)).toMatchObject({text:'dictado',autoSend:true});
  });
  it('double tap keeps listening until finished, then sends',async()=>{
    const f=fixture(); await f.flow.begin(true);
    expect(f.flow.state).toMatchObject({phase:'listening',locked:true}); expect(f.flow.locked).toBe(true);
    expect(f.hex.stop).not.toHaveBeenCalled();
    await f.flow.end();
    expect(f.flow.locked).toBe(false); expect(f.events.at(-1)).toMatchObject({text:'dictado',autoSend:true});
  });
  it('discarding a locked recording keeps the capture',async()=>{
    const f=fixture(); await f.flow.begin(true); await f.flow.cancel();
    expect(f.flow.locked).toBe(false); expect(f.hex.stop).toHaveBeenCalled();
    expect(f.events.some(e=>e.text)).toBe(false); expect(f.events.some(e=>e.removeId)).toBe(false);
  });
  it('leaves a dictation that Hex was already recording alone',async()=>{
    const f=fixture(); f.hex.begin.mockResolvedValueOnce({code:5,text:''});
    await f.flow.begin(true);
    expect(f.hex.stop).not.toHaveBeenCalled(); expect(f.flow.locked).toBe(false);
    expect(f.flow.state).toMatchObject({phase:'idle',hexBusy:true});
  });
  it('stops on shutdown and removes capture on chord cancellation',async()=>{
    const f=fixture(); await f.flow.begin(); await f.flow.cancel(true);
    expect(f.hex.stop).toHaveBeenCalled(); expect(f.events.at(-1)?.removeId).toBe('capture');
    await f.flow.begin(); await f.flow.dispose(); expect(f.hex.stop).toHaveBeenCalledTimes(2);
  });
  it('hidden panel does not interrupt; queue is acknowledged',async()=>{
    const f=fixture(); await f.flow.begin(); f.ports.hide(); await f.flow.end();
    expect(f.events.at(-1)?.autoSend).toBe(true); f.flow.acknowledge('queued'); expect(f.flow.state.phase).toBe('queued');
  });
  it('ignores second hold during transcription',async()=>{
    vi.useFakeTimers(); const f=fixture(vi.fn(()=>new Promise(r=>setTimeout(()=>r({code:0,text:'ok'}),40000))));
    await f.flow.begin(); const end=f.flow.end(); await f.flow.begin(); expect(f.hex.begin).toHaveBeenCalledTimes(1);
    expect(f.events.at(-1)?.state.busy).toBe(true); await vi.advanceTimersByTimeAsync(40000); await end;
  });
  it('retains capture on empty speech',async()=>{vi.useFakeTimers();const f=fixture(vi.fn(async()=>({code:4,text:''})));await f.flow.begin();await f.flow.end();expect(f.flow.state.phase).toBe('empty');await vi.advanceTimersByTimeAsync(2000);expect(f.flow.state.phase).toBe('idle');});
});
it('rejects environment files and tells model about truncated PDF',()=>{
  for(const name of ['.env','.env.local','.env.json','secret.env']) expect(()=>validateFile(name,1)).toThrow();
  const result=prepareAttachments([{kind:'pdf',path:'x',name:'x.pdf',mime:'application/pdf',pages:20,sentPages:3,truncated:true,extractedText:'hello'}],{supportsPdf:false,supportsImages:true} as ModelInfo);
  expect(result[0]?.extractedText).toContain('recortado="páginas 1 a 3 de 20"');
  expect(result[0]?.extractedText).toContain('El resto del documento no se incluyó.');
});
it('reports a dictation Hex was already recording as code 5',async()=>{
  const hex=new Hex(); const run=vi.spyOn(hex,'run');
  run.mockResolvedValueOnce({code:0,text:JSON.stringify({version:4,status:'done',message:'Dictation is already recording',changed:false})});
  expect((await hex.begin()).code).toBe(5);
  run.mockResolvedValueOnce({code:0,text:JSON.stringify({version:4,status:'done',changed:true})});
  expect((await hex.begin()).code).toBe(0);
});
it('matches observed Hex hotkey and validates history timestamp',async()=>{
  expect(hotkeyConflicts('right-command','right-command\n')).toBe(true);
  const hex=new Hex(); vi.spyOn(hex,'run').mockResolvedValue({code:0,text:JSON.stringify({entries:[{kind:'dictation',timestamp_ms:1000,final_text:'recovered'}]})});
  expect(await hex.recoverSince(new Date(900))).toBe('recovered'); expect(await hex.recoverSince(new Date(1100))).toBe('');
});
it('runs fake Hex executable: exit codes and stop timeout without recording',async()=>{
  const {mkdtemp,writeFile,chmod,rm}=await import('node:fs/promises');
  const {tmpdir}=await import('node:os'); const {join}=await import('node:path');
  const dir=await mkdtemp(join(tmpdir(),'fake-hex-')); const path=join(dir,'hex');
  try {
    await writeFile(path,'#!/bin/sh\ncase "$1" in\nstatus) echo "{}";;\ndictation) exit 4;;\nsettings) echo right-command;;\nhang) sleep 1;;\nesac\n'); await chmod(path,0o700);
    const hex=new Hex(path); expect((await hex.status()).code).toBe(0); expect((await hex.stop()).code).toBe(4);
    expect(await hex.hotkey()).toBe('right-command'); expect((await hex.run(['hang'],20)).code).toBe(-1);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
it('reopens Hex on code 3 and retries recording',async()=>{
  const f=fixture();f.hex.begin.mockResolvedValueOnce({code:3,text:''});
  await f.flow.begin();expect(f.hex.start).toHaveBeenCalledOnce();expect(f.hex.begin).toHaveBeenCalledTimes(2);await f.flow.cancel();
});
it('offers recovery retry and keeps capture after failed history',async()=>{
  const f=fixture(vi.fn(async()=>({code:1,text:''})));f.hex.recoverSince.mockResolvedValueOnce('');
  await f.flow.begin();await f.flow.end();expect(f.flow.state.phase).toBe('failed');
  await f.flow.recover();expect(f.events.at(-1)?.text).toBe('recuperado');expect(f.events.some(e=>e.removeId)).toBe(false);
});
it('release during capture stops after pending start completes',async()=>{
  const f=fixture();let resolve!:()=>void;
  const wait=new Promise<void>(r=>{resolve=r;});
  const original=f.ports.capture;f.ports.capture=async()=>{await wait;return original();};
  const begin=f.flow.begin();await f.flow.end();resolve();await begin;
  expect(f.hex.stop).toHaveBeenCalledOnce();expect(f.events.at(-1)?.text).toBe('dictado');
});
it('shutdown bounds a hung stop to three seconds',async()=>{
 vi.useFakeTimers();const f=fixture(vi.fn(()=>new Promise(()=>{})));
 await f.flow.begin();void f.flow.end();
 const done=vi.fn();const dispose=f.flow.dispose().then(done);
 await vi.advanceTimersByTimeAsync(2999);expect(done).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(1);await dispose;expect(done).toHaveBeenCalled();
});
it('issues a fresh stop when cancelled start resolves after an earlier stop',async()=>{
 let release!:(v:{code:number;text:string})=>void;
 const f=fixture();f.hex.begin.mockImplementation(()=>new Promise(r=>{release=r;}));
 const begin=f.flow.begin();await Promise.resolve();await f.flow.cancel();
 release({code:0,text:''});await begin;expect(f.hex.stop).toHaveBeenCalledTimes(2);
});
it('requests oldest history first and detects installation independent of settings',async()=>{
 const hex=new Hex(process.execPath);const run=vi.spyOn(hex,'run').mockResolvedValue({code:1,text:''});
 expect(hex.installed()).toBe(true);await hex.hotkey();expect(hex.installed()).toBe(true);
 const start=new Date(0);await hex.recoverSince(start);
 expect(run).toHaveBeenLastCalledWith(['history','--since',start.toISOString(),'--oldest-first','--limit','1','--json']);
});
it('shutdown during an in-flight start executes the later stop within three seconds',async()=>{
 vi.useFakeTimers(); const f=fixture();
 f.hex.begin.mockImplementation(()=>new Promise(resolve=>setTimeout(()=>resolve({code:0,text:''}),900)));
 const begin=f.flow.begin(); await Promise.resolve();
 const closed=vi.fn();const shutdown=f.flow.dispose().then(closed);
 await vi.advanceTimersByTimeAsync(901);await begin;await shutdown;
 expect(closed).toHaveBeenCalledOnce();expect(f.hex.stop).toHaveBeenCalled();
});
