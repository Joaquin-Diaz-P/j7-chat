import { afterEach, expect, it, vi } from 'vitest';
vi.mock('electron',()=>({app:{},BrowserWindow:class{},screen:{},nativeTheme:{}}));
import { Panel } from '../../src/main/window.js';

function fixture(visible = true, focused = true) {
  const panel = Object.create(Panel.prototype);
  panel.window = {
    isVisible:()=>visible, isFocused:()=>focused, isDestroyed:()=>false,
    focus:vi.fn(()=>{focused=true;}), webContents:{focus:vi.fn()},
  };
  panel.bounds={x:0,y:0,width:520,height:106};
  panel.regions=[{left:0,top:0,right:520,bottom:106}];
  panel.settings = {value:{pinned:false}};
  panel.show = vi.fn(()=>{visible=true;focused=true;panel.outsideInteraction=false;});
  panel.hide = vi.fn();
  return { panel, blur:()=>{focused=false;}, outsideClick:()=>{panel.pointerDown({x:800,y:500});focused=false;} };
}
afterEach(()=>vi.useRealTimers());
it('opens immediately and ignores shortcut auto-repeat until release',()=>{
  vi.useFakeTimers();
  const {panel} = fixture(false,false);
  expect(panel.beginShortcut()).toBe(true);
  expect(panel.show).toHaveBeenCalledOnce();
  expect(panel.beginShortcut()).toBe(false);
  vi.advanceTimersByTime(500);
  panel.endShortcut();
  expect(panel.hide).not.toHaveBeenCalled();
  expect(panel.beginShortcut()).toBe(true);
});
it('a short tap on the focused panel closes it only upon release',()=>{
  vi.useFakeTimers();
  const {panel} = fixture();
  panel.beginShortcut();
  expect(panel.hide).not.toHaveBeenCalled();
  vi.advanceTimersByTime(100); panel.endShortcut();
  expect(panel.hide).toHaveBeenCalledOnce();
});
it('holding on the focused panel keeps it open after release',()=>{
  vi.useFakeTimers();
  const {panel} = fixture();
  panel.beginShortcut(); vi.advanceTimersByTime(300); panel.endShortcut();
  expect(panel.hide).not.toHaveBeenCalled();
});
it('releases protection and hides after interacting with the background',()=>{
  vi.useFakeTimers();
  const {panel,outsideClick} = fixture();
  panel.beginShortcut(); vi.advanceTimersByTime(500); outsideClick(); panel.endShortcut();
  expect(panel.hide).toHaveBeenCalledOnce();
});
it('keeps capture protection independent and safely cancels on helper failure',()=>{
  const {panel,outsideClick} = fixture();
  panel.beginShortcut(); panel.endShortcut(true);
  expect(panel.hide).not.toHaveBeenCalled();
  panel.beginShortcut(); outsideClick(); panel.suppressHide=true; panel.endShortcut();
  expect(panel.hide).not.toHaveBeenCalled();
  panel.suppressHide=false; panel.beginShortcut(); outsideClick(); panel.endShortcut(true);
  expect(panel.hide).toHaveBeenCalledOnce();
});
it('keeps the dropped attachment visible when the opening shortcut is released',()=>{
  vi.useFakeTimers();
  const {panel,outsideClick} = fixture();
  panel.beginShortcut(); outsideClick();
  panel.setAttachmentState(true); // Protect before reading/importing dropped files.
  vi.advanceTimersByTime(500); panel.endShortcut();
  expect(panel.hide).not.toHaveBeenCalled();
  // Removing the attachment restores normal dismissal.
  panel.setAttachmentState(false);
  panel.beginShortcut(); outsideClick(); vi.advanceTimersByTime(500); panel.endShortcut();
  expect(panel.hide).toHaveBeenCalledOnce();
});
it('an accepted drop cancels a hide already scheduled by shortcut release',()=>{
  vi.useFakeTimers();
  const {panel} = fixture();
  const hide = vi.fn();
  panel.hideTimer = setTimeout(hide,150);
  panel.notify = vi.fn();
  vi.advanceTimersByTime(50); panel.setAttachmentState(true);
  vi.advanceTimersByTime(200);
  expect(hide).not.toHaveBeenCalled();
  expect(panel.notify).toHaveBeenCalledWith(true,true);
});
it('manual pinning keeps an expanded chat open without attachments',()=>{
  vi.useFakeTimers();
  const {panel,outsideClick} = fixture();
  panel.settings.value.pinned=true;
  panel.beginShortcut(); outsideClick(); vi.advanceTimersByTime(500); panel.endShortcut();
  expect(panel.hide).not.toHaveBeenCalled();
});
it('a short shortcut tap can still explicitly close a panel with attachments',()=>{
  vi.useFakeTimers();
  const {panel} = fixture();
  panel.setAttachmentState(true); panel.beginShortcut();
  vi.advanceTimersByTime(100); panel.endShortcut();
  expect(panel.hide).toHaveBeenCalledOnce();
});

it('keeps J7 visible across a Space blur and restores keyboard focus',()=>{
  vi.useFakeTimers();
  const {panel,blur} = fixture();
  panel.beginShortcut(); blur(); vi.advanceTimersByTime(300); panel.endShortcut();
  panel.spaceChanged(); vi.advanceTimersByTime(100);
  expect(panel.hide).not.toHaveBeenCalled();
  expect(panel.window.focus).toHaveBeenCalledOnce();
  expect(panel.window.webContents.focus).toHaveBeenCalledOnce();
});
it('an outside click dismisses J7 even before macOS delivers blur',()=>{
  const {panel} = fixture();
  panel.pointerDown({x:800,y:500});
  expect(panel.hide).toHaveBeenCalledOnce();
});
it('a click inside J7 does not dismiss it',()=>{
  const {panel} = fixture();
  panel.pointerDown({x:100,y:50});
  expect(panel.hide).not.toHaveBeenCalled();
});
it('an outside click during the Space transition cancels focus restoration',()=>{
  vi.useFakeTimers();
  const {panel,outsideClick} = fixture();
  panel.spaceChanged(); outsideClick(); vi.advanceTimersByTime(200);
  expect(panel.window.focus).not.toHaveBeenCalled();
  expect(panel.hide).toHaveBeenCalledOnce();
});
it('a pinned panel remains visible after an outside click without stealing focus on another Space',()=>{
  vi.useFakeTimers();
  const {panel,outsideClick} = fixture();
  panel.settings.value.pinned=true;
  outsideClick(); panel.spaceChanged(); vi.advanceTimersByTime(200);
  expect(panel.hide).not.toHaveBeenCalled();
  expect(panel.window.focus).not.toHaveBeenCalled();
});
it('does not restore focus while a file dialog or capture owns it',()=>{
  vi.useFakeTimers();
  const {panel} = fixture();
  panel.spaceChanged(); panel.suppressHide=true; vi.advanceTimersByTime(200);
  expect(panel.window.focus).not.toHaveBeenCalled();
});

it('releasing the hold after an outside click dismisses even if blur has not arrived yet',()=>{
  vi.useFakeTimers();
  const {panel} = fixture();
  panel.beginShortcut(); panel.pointerDown({x:800,y:500});
  vi.advanceTimersByTime(300); panel.endShortcut();
  expect(panel.hide).toHaveBeenCalledOnce();
});
it('a deliberate outside click closes a panel that already has an attachment',()=>{
  const {panel,outsideClick} = fixture();
  panel.setAttachmentState(true);
  outsideClick();
  expect(panel.hide).toHaveBeenCalledOnce();
});
it('finishing an import cannot cancel dismissal from a later outside click',()=>{
  vi.useFakeTimers();
  const {panel} = fixture();
  panel.setAttachmentState(true);
  const hidden=vi.fn();
  panel.hideTimer=setTimeout(hidden,150);
  panel.setAttachmentState(true);
  vi.advanceTimersByTime(200);
  expect(hidden).toHaveBeenCalledOnce();
});

it('returning to compact clears the manual pin so outside clicks dismiss again',()=>{
  const {panel,outsideClick} = fixture();
  panel.settings.value.pinned=true;
  panel.settings.update=vi.fn(value=>Object.assign(panel.settings.value,value));
  panel.layout(106,false);
  expect(panel.settings.value.pinned).toBe(false);
  outsideClick();
  expect(panel.hide).toHaveBeenCalledOnce();
});
it('expanded layouts retain the manual pin',()=>{
  const {panel} = fixture();
  panel.settings.value.pinned=true;
  panel.layout(680,false);
  expect(panel.settings.value.pinned).toBe(true);
});
