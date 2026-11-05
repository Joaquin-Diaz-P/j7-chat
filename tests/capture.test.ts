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
