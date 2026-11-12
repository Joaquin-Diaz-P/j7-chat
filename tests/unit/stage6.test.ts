import {describe,it,expect} from 'vitest';
import {replaceShortcuts,resolveShortcutBindings,isAccelerator,accelerator,voiceModifier,shortcutIdentity,shortcutLabel} from '../../src/shared/shortcut.js';
import {generateTitle,cleanTitle} from '../../src/main/titles.js';
import {validateSettings} from '../../src/main/settings.js';
describe('etapa 6',()=>{
 it('teclado español usa code y no el carácter transformado',()=>{expect(accelerator({code:'KeyJ',altKey:true,shiftKey:true,metaKey:false,ctrlKey:false})).toBe('Alt+Shift+J');expect(accelerator({code:'KeyJ',altKey:false,shiftKey:false,metaKey:false,ctrlKey:false})).toBeUndefined();expect(voiceModifier('AltRight')).toBe('right-option');expect(voiceModifier('KeyJ')).toBeUndefined();expect(shortcutIdentity('Shift+Alt+J')).toBe(shortcutIdentity('Alt+Shift+J'));expect(shortcutLabel('Alt+Shift+J')).toBe('⌥ ⇧ J');expect(shortcutLabel('right-option')).toBe('⌥ derecho');});
 it('limpia todas las comillas y puntos finales también en fallback',async()=>{expect(cleanTitle('“Hola «mundo» con "comillas".”')).toBe('Hola mundo con comillas');expect(cleanTitle("Let's fix 'it'.")).toBe("Let's fix it");expect(await generateTitle('say hello',async()=> '“Say hello.”')).toBe('Say hello');expect(await generateTitle('dime "hola" mundo.',async()=>{throw Error();})).toBe('dime hola mundo');});
 it('primer arranque y límite de instrucciones',()=>{expect(validateSettings({}).firstRunDone).toBe(false);expect(validateSettings({firstRunDone:true,openAtLogin:false}).openAtLogin).toBe(false);expect(validateSettings({personalInstructions:'x'.repeat(5000)}).personalInstructions).toHaveLength(4000);});
});
import {ChatService} from '../../src/main/chat/service.js';
import {MemoryChatStore} from '../../src/main/chat/memory-store.js';
import {MockProvider} from '../../src/main/providers/mock.js';
it('recovers missing titles at startup without overwriting manual titles',async()=>{
 const store=Object.assign(new MemoryChatStore(),{list:(_q:string,offset:number)=>offset?[]:[{id:'a',title:'',titleSource:'auto'},{id:'manual',title:'',titleSource:'manual'}],rename:(id:string,title:string)=>{renamed.push([id,title]);}});
 const renamed:string[][]=[];
 store.createChat({id:'a',model:'mock:mock-a',provider:'mock',webSearch:false,effort:'normal'});
 store.appendMessage('a',{id:'q',role:'user',text:'Why is the sky blue?',status:'complete'});
 const chat=new ChatService(new MockProvider(),()=>{},undefined,undefined,undefined,undefined,store);
 chat.titleGenerator=async text=>{expect(text).toBe('Why is the sky blue?');return 'Why the sky is blue';};
 chat.start();await Promise.resolve();expect(renamed).toEqual([['a','Why the sky is blue']]);await chat.dispose();
});

it('exchanges shortcut bindings and restores originals after a partial collision',()=>{
 const bindings=new Map<string,string>([['Alt+J','panel'],['Alt+Shift+J','capture']]);
 const change=(previous:string,next:string,callback:string)=>({previous,next,activate:(key:string)=>{
  if(bindings.has(key)||key==='Alt+L')return false;
  bindings.set(key,callback);return true;
 }});
 const unregister=(key:string)=>{bindings.delete(key);};
 replaceShortcuts([change('Alt+J','Alt+Shift+J','panel'),change('Alt+Shift+J','Alt+J','capture')],unregister,'collision');
 expect([...bindings]).toEqual([['Alt+Shift+J','panel'],['Alt+J','capture']]);
 expect(()=>replaceShortcuts([change('Alt+Shift+J','Alt+K','panel'),change('Alt+J','Alt+L','capture')],unregister,'collision')).toThrow('collision');
 expect([...bindings]).toEqual([['Alt+Shift+J','panel'],['Alt+J','capture']]);
 expect(isAccelerator('J')).toBe(false);expect(isAccelerator('Alt+;')).toBe(true);
 expect(accelerator({code:'Semicolon',altKey:true,metaKey:false,ctrlKey:false,shiftKey:false})).toBe('Alt+;');
});
it('swaps both settings when the recorder chooses the other J7 binding',()=>{
 const previous={shortcut:'Alt+J',captureShortcut:'Alt+Shift+J'};
 expect(resolveShortcutBindings(previous,{shortcut:'Shift+Option+J'})).toEqual({shortcut:'Shift+Option+J',captureShortcut:'Alt+J'});
 expect(resolveShortcutBindings(previous,{captureShortcut:'Alt+J'})).toEqual({shortcut:'Alt+Shift+J',captureShortcut:'Alt+J'});
 expect(resolveShortcutBindings(previous,{shortcut:'Alt+K'})).toEqual({shortcut:'Alt+K',captureShortcut:'Alt+Shift+J'});
});

import {settingsStrings} from '../../src/renderer/strings.js';
it('mantiene Conexiones en el índice que abre Primeros pasos',()=>{expect(settingsStrings.sections[4]).toBe('Conexiones');expect(validateSettings({disabledProviders:['claude','invalid','claude']}).disabledProviders).toEqual(['claude']);});
