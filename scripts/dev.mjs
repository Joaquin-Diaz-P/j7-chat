// Editor hosts may export this for their own Electron process. The app must run as Electron.
delete process.env.ELECTRON_RUN_AS_NODE;
await import(
  new URL("../node_modules/electron-vite/bin/electron-vite.js", import.meta.url)
    .href
);
