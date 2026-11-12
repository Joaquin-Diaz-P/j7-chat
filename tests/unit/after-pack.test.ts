import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const afterPack = createRequire(import.meta.url)('../../scripts/after-pack.cjs') as (context: {
  electronPlatformName: string;
  appOutDir: string;
  packager: { appInfo: { productFilename: string } };
}) => Promise<void>;

describe.skipIf(process.platform !== 'darwin')('macOS packaging metadata', () => {
  it('removes Electron microphone usage text before signing while retaining app metadata', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'j7-after-pack-'));
    const contents = join(directory, 'J7 Chat.app', 'Contents');
    await mkdir(contents, { recursive: true });
    const plist = join(contents, 'Info.plist');
    await writeFile(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>cl.j7.chat</string>
<key>NSMicrophoneUsageDescription</key><string>Electron needs access to your microphone</string>
<key>NSScreenCaptureUsageDescription</key><string>Captura de pantalla</string>
</dict></plist>`);
    const context = { electronPlatformName: 'darwin', appOutDir: directory, packager: { appInfo: { productFilename: 'J7 Chat' } } };
    try {
      await afterPack(context);
      await afterPack(context);
      const print = (key: string) => execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, plist], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      expect(print('CFBundleIdentifier')).toBe('cl.j7.chat');
      expect(print('NSScreenCaptureUsageDescription')).toBe('Captura de pantalla');
      expect(() => print('NSMicrophoneUsageDescription')).toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
