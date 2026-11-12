const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

module.exports = async context => {
  if (context.electronPlatformName !== 'darwin') return;
  const plist = join(context.appOutDir, context.packager.appInfo.productFilename + '.app', 'Contents/Info.plist');
  // Hex owns recording and its microphone permission; J7 only receives the transcript.
  try { execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :NSMicrophoneUsageDescription', plist], {stdio:'ignore'}); }
  catch { return; }
  execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Delete :NSMicrophoneUsageDescription', plist]);
};
