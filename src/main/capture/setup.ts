import { app, globalShortcut, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { NativeHelper } from '../native/helper.js';
import { fromMainFrame } from '../ipc-trust.js';
import { Hex, hotkeyConflicts, modifierCodes } from '../voice/hex.js';
import { CaptureFlows } from './flows.js';
import type { Panel } from '../window.js';
import type { AttachmentStore } from '../attachments/index.js';
import type { SettingsStore } from '../settings.js';
import type { CaptureEvent } from '../../shared/capture.js';
export function setupCapture(panel: Panel, attachments: AttachmentStore, settings: SettingsStore, helper = new NativeHelper(app.isPackaged ? join(process.resourcesPath,'j7-helper') : join(app.getAppPath(),'build/j7-helper'))) {
  const hex = new Hex(process.env.J7_HEX_BINARY);
  const emit = (event: CaptureEvent) => { if (!panel.window.isDestroyed()) panel.window.webContents.send('capture:event',event); };
  let permission: 'screen'|'input'|undefined;
  const check = async (kind: 'screen'|'input') => {
    const reply = await helper.request('permissions');
    if (!reply[kind]) {
      permission = kind; panel.show(); emit({state:{phase:'idle',seconds:0,permission:kind}});
      return false;
    }
    if (permission === kind) { permission = undefined; emit({state:{...flows.state,permission:null}}); }
    return true;
  };
  const flows = new CaptureFlows({
    visible:()=>panel.window.isVisible(), show:()=>panel.show(), hide:()=>panel.hide(),
    protect:value=>{ panel.suppressHide = value; }, emit,
    capture:async()=>{
      if (!await check('screen')) return undefined;
      panel.hide(); await new Promise(resolve=>setTimeout(resolve,180));
      const path = join(tmpdir(),randomUUID()+'.png');
      try {
        const reply = await helper.request('captureDisplayUnderMouse',{path,pid:process.pid});
        if (!reply.ok) throw new Error('Capture');
        const files = await attachments.ingest([path]); return files[0]!;
      } finally { await unlink(path).catch(()=>{}); }
    }
  },hex);
  // The tap only delivers events with input permission; begin synchronously so an early holdEnd is not lost.
  helper.on('pointerDown',event=>{
    if (Number.isFinite(event.x) && Number.isFinite(event.y)) panel.pointerDown({x:event.x,y:event.y});
  });
  helper.on('spaceChanged',()=>panel.spaceChanged());
  helper.on('shortcutReleased',()=>panel.endShortcut());
  helper.on('holdStart',()=>{ if (!flows.locked) void flows.begin(); });
  // Double tap locks the recording; a later tap (or Enter in the bar) finishes and sends it.
  helper.on('doubleTap',()=>{ if (['idle','cancelled','empty','failed'].includes(flows.state.phase)) void flows.begin(true); });
  helper.on('tap',()=>{ if (flows.locked) void flows.end(); });
  helper.on('holdEnd',()=>{void flows.end();});
  helper.on('holdCancel',()=>{if (['capturing','opening','listening'].includes(flows.state.phase)) void flows.cancel(true);});
  // A crash while transcribing must not discard the dictated text.
  helper.on('disconnect',()=>{panel.endShortcut(true);if (['capturing','opening','listening'].includes(flows.state.phase)) void flows.cancel();});
  const trusted = (event: Electron.IpcMainInvokeEvent) => fromMainFrame(panel.window, event);
  ipcMain.handle('capture:action',async(event,action: unknown)=>{
    if (!trusted(event)) return;
    if (action === 'cancel') await flows.cancel();
    if (action === 'dictate') await flows.begin(true, false);
    if (action === 'transcribe' && flows.locked) await flows.end(false);
    if (action === 'finish') await flows.end(true);
    if (action === 'recover' && flows.state.phase === 'failed' && flows.state.recoverable) await flows.recover();
    if (action === 'idle' || action === 'queued' || action === 'failed') flows.acknowledge(action);
    if (action === 'screen' || action === 'input') {
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_'+(action === 'screen'?'ScreenCapture':'ListenEvent'));
      await helper.request('permissions',{request:true});
      await helper.watch(modifierCodes[settings.value.voiceModifier]!);
    }
    if (action === 'status') {
      if (permission) emit({state:{phase:'idle',seconds:0,permission}});
      const hotkey = await hex.hotkey();
      emit({state:{phase:flows.state.phase,seconds:0,conflict:hotkeyConflicts(settings.value.voiceModifier,hotkey),missingHex:!hex.installed()}});
      if (!await check('input')) return;
      await helper.watch(modifierCodes[settings.value.voiceModifier]!);
    }
  });
  helper.start();
  void helper.watch(modifierCodes[settings.value.voiceModifier]!).catch(()=>{});
  globalShortcut.register(settings.value.captureShortcut,()=>{void flows.question();});
  const activatePanel = () => {
    if (!panel.beginShortcut()) return;
    void helper.request('watchShortcutRelease', { modifiers: settings.value.shortcut.split('+').slice(0,-1) })
      .then(reply => { if (!reply.ok) panel.endShortcut(true); })
      .catch(()=>panel.endShortcut(true));
  };
  return { activatePanel, question:()=>{void flows.question();}, rebind:async()=>{await helper.watch(modifierCodes[settings.value.voiceModifier]!);}, dispose:async()=>{const stopped = flows.dispose(); helper.dispose(); await stopped;} };
}
