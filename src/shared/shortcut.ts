export function accelerator(e: Pick<KeyboardEvent,'code'|'altKey'|'ctrlKey'|'metaKey'|'shiftKey'>): string | undefined {
 const codes: Record<string,string>={Space:'Space',Tab:'Tab',Enter:'Enter',Escape:'Escape',Backspace:'Backspace',Delete:'Delete',ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right',Home:'Home',End:'End',PageUp:'PageUp',PageDown:'PageDown',Semicolon:';',Comma:',',Period:'.',Slash:'/',BracketLeft:'[',BracketRight:']',Quote:"'",Minus:'-',Equal:'=',Backslash:'\\'};
 const key = /^(Key[A-Z]|Digit[0-9])$/.test(e.code) ? e.code.replace(/^(Key|Digit)/,'') : /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(e.code) ? e.code : codes[e.code];
 const mods = [e.metaKey?'Command':'',e.ctrlKey?'Control':'',e.altKey?'Alt':'',e.shiftKey?'Shift':''].filter(Boolean);
 return key && mods.length ? [...mods,key].join('+') : undefined;
}
export function voiceModifier(code: string) {
 const match = /^(Alt|Meta|Control|Shift)(Left|Right)$/.exec(code);
 return code==='Fn' ? 'fn' : match ? `${match[2]!.toLowerCase()}-${({Alt:'option',Meta:'command',Control:'control',Shift:'shift'} as Record<string,string>)[match[1]!]}` : undefined;
}
export function shortcutIdentity(value: string) { return value.split('+').map(x=>({Cmd:'Command',Option:'Alt',Ctrl:'Control'}[x] ?? x)).sort().join('+'); }
export function isAccelerator(value: unknown): value is string {
 return typeof value==='string' && /^(?:(?:Alt|Option|Command|Cmd|CommandOrControl|Control|Ctrl|Shift)\+)+(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Tab|Enter|Escape|Backspace|Delete|Up|Down|Left|Right|Home|End|PageUp|PageDown|[;,./\[\]'=\-\\])$/i.test(value);
}
export function replaceShortcuts(changes: {previous:string;next:string;activate:()=>boolean}[], unregister:(key:string)=>void, failure:string) {
 const installed:string[]=[];
 try { for(const change of changes) if(change.next!==change.previous) {
   if(!change.activate())throw new Error(failure);
   installed.push(change.next);
 }} catch(error) { installed.forEach(unregister);throw error; }
 for(const change of changes) if(change.next!==change.previous)unregister(change.previous);
}
export function shortcutLabel(value: string) {
 const side = /^(left|right)-(option|command|control|shift)$/.exec(value);
 if (side) return `${({option:'⌥',command:'⌘',control:'⌃',shift:'⇧'} as Record<string,string>)[side[2]!]} ${side[1]==='left'?'izquierdo':'derecho'}`;
 return value.split('+').map(x=>({Command:'⌘',Cmd:'⌘',CommandOrControl:'⌘',Control:'⌃',Ctrl:'⌃',Alt:'⌥',Option:'⌥',Shift:'⇧'} as Record<string,string>)[x] ?? x).join(' ');
}
