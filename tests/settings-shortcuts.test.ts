import {describe,it,expect} from 'vitest';
import {accelerator,isAccelerator,recorderAction} from '../src/shared/shortcut.js';
describe('grabador de ajustes',()=>{
 it('cancela con Escape y deja navegar con Tab en ambos sentidos',()=>{
  expect(recorderAction('Escape')).toBe('cancel');
  expect(recorderAction('Tab')).toBe('leave');
  for(const shiftKey of [false,true])expect(accelerator({code:'Tab',shiftKey,metaKey:false,ctrlKey:false,altKey:false})).toBeUndefined();
 });
 it('rechaza teclas sin modificador y combinaciones con Tab',()=>{
  for(const key of ['J','Tab','Shift+Tab','Alt+Tab'])expect(isAccelerator(key)).toBe(false);
  expect(accelerator({code:'KeyJ',shiftKey:false,metaKey:false,ctrlKey:false,altKey:false})).toBeUndefined();
  expect(isAccelerator('Alt+J')).toBe(true);
  expect(isAccelerator('Shift+J')).toBe(true);
 });
});
