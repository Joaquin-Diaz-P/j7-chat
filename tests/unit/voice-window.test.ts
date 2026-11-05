import { it,expect,vi } from 'vitest';
vi.mock('electron',()=>({app:{hide:vi.fn()},BrowserWindow:class{},screen:{},nativeTheme:{}}));
import { Panel } from '../../src/main/window.js';
import { VisibilityClock } from '../../src/main/window-state.js';
import { CaptureFlows } from '../../src/main/capture/flows.js';
import { voiceDelivery } from '../../src/renderer/voice-delivery.js';
it('queues delivery during a response, then sends; vision block preserves composer path',()=>{
 expect(voiceDelivery(true,true,true,false,false)).toBe('queued');
 expect(voiceDelivery(true,false,true,false,false)).toBe('send');
 expect(voiceDelivery(false,false,true,false,false)).toBe('none');
 expect(voiceDelivery(true,false,true,true,false)).toBe('blocked-image');
 expect(voiceDelivery(true,false,true,false,true)).toBe('wait');
});
it('hides through Panel.hide during a pending transcription and still delivers text',async()=>{
 let visible=true,release!:(v:{code:number;text:string})=>void;
 const panel=Object.create(Panel.prototype);
 panel.window={isVisible:()=>visible,hide:()=>{visible=false;}};
 panel.clock=new VisibilityClock();
 const delivered=vi.fn();
 const flows=new CaptureFlows({capture:async()=>({id:'a',kind:'image',path:'/tmp/a',name:'a',mime:'image/png'}),show:()=>{visible=true;},hide:()=>panel.hide(),visible:()=>visible,emit:delivered,protect:()=>{}},
 {begin:async()=>({code:0,text:''}),start:async()=>({code:0,text:''}),stop:()=>new Promise(r=>{release=r;}),recoverSince:async()=>''});
 await flows.begin();const end=flows.end();panel.hide();expect(visible).toBe(false);
 release({code:0,text:'dictado'});await end;
 expect(delivered).toHaveBeenLastCalledWith(expect.objectContaining({text:'dictado',autoSend:true}));
 expect(visible).toBe(false);
});
it('capture resume uses saved chat existence at the five minute boundary',()=>{
 let now=0;const clock=new VisibilityClock(()=>now);clock.hide();
 now=299000;expect(clock.shouldResume(true)).toBe(true);
 now=301000;expect(clock.shouldResume(true)).toBe(false);
});
it('expands left preserving chat column and clamps at the display edge',async()=>{
 const {historyBounds}=await import('../../src/main/window-state.js');
 const area={x:0,y:0,width:1440,height:900};
 const original={x:400,y:100,width:680,height:400};
 const open=historyBounds(original,true,area);
 expect(open.x+260).toBe(original.x);
 expect(historyBounds(open,false,area)).toEqual(original);
 expect(historyBounds({...original,x:50},true,area).x).toBe(0);
});
