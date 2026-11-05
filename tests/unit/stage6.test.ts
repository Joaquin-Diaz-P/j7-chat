import {describe,it,expect} from 'vitest';
import {replaceShortcuts,isAccelerator,accelerator,voiceModifier,shortcutIdentity,shortcutLabel} from '../../src/shared/shortcut.js';
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

it('keeps old shortcuts active on registration collision and rolls back partial changes',()=>{
 const removed:string[]=[];
 expect(()=>replaceShortcuts([{previous:'Alt+J',next:'Alt+K',activate:()=>true},{previous:'Alt+Shift+J',next:'Alt+L',activate:()=>false}],key=>removed.push(key),'collision')).toThrow('collision');
 expect(removed).toEqual(['Alt+K']);
 replaceShortcuts([{previous:'Alt+J',next:'Alt+K',activate:()=>true}],key=>removed.push(key),'collision');expect(removed.at(-1)).toBe('Alt+J');
 expect(isAccelerator('J')).toBe(false);expect(isAccelerator('Alt+;')).toBe(true);
 expect(accelerator({code:'Semicolon',altKey:true,metaKey:false,ctrlKey:false,shiftKey:false})).toBe('Alt+;');
});
