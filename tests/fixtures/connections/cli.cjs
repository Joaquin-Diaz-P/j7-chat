#!/usr/bin/env node
// Offline peer: it requires an explicit sandbox file in a temporary HOME.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const root = process.env.HOME;
const config = JSON.parse(fs.readFileSync(path.join(root, 'connection-fixture.json'), 'utf8'));
if (config.sandbox !== true) process.exit(90);
const id = path.basename(process.argv[1]).split('.')[0];
const args = process.argv.slice(2);
const marker = path.join(root, id + '-ready');
const ready = () => fs.existsSync(marker);
const log = value => fs.appendFileSync(path.join(root, 'calls.jsonl'), JSON.stringify(value) + '\n');
log({id, args, home:root, privateHome:!!process.env.CODEX_HOME, pid:process.pid});
process.on('SIGTERM', () => { log({id, stopped:true}); process.exit(0); });
if (args[0] === '--version') {
  console.log(id === 'claude' ? '2.1.309 (Claude Code)' : id === 'codex' ? 'codex-cli 0.167.0' : '1.5.6');
} else if (id === 'claude' && args[1] === 'status') {
  console.log(JSON.stringify({loggedIn:ready(),email:'fixture@example.invalid',subscriptionType:config.plan ?? 'pro',authMethod:config.authMethod ?? 'claude.ai'}));
  process.exitCode = ready() ? 0 : 1;
} else if (id === 'codex' && args[1] === 'status') {
  console.error(ready() ? 'Logged in using ChatGPT' : 'Not logged in');
  process.exitCode = ready() ? 0 : 1;
} else if (args.includes('logout')) {
  fs.rmSync(marker, {force:true});
  console.log('Logged out');
} else if (id === 'opencode' && args[1] === 'list') {
  if (config.opencodeTable) { if (ready()) console.log('OpenCode Go       API key                     stored\nOpenAI            OAuth                       stored'); }
  else console.log('\x1b[90m┌ Credentials ~/.local/share/opencode/auth.json\x1b[0m\n│\n└ ' + (ready() ? '1 credential' : '0 credentials'));
} else if (args[0] === 'acp') {
  const send = (id, result) => console.log(JSON.stringify({jsonrpc:'2.0',id,result}));
  readline.createInterface({input:process.stdin}).on('line', line => {
    const message = JSON.parse(line);
    log({id,method:message.method,methodId:message.params?.methodId});
    if(message.method === 'initialize') send(message.id, {protocolVersion:1,authMethods:[{id:'oauth-personal',name:'Log in with Google'}]});
    if(message.method === 'authenticate') {
      console.error('Open https://accounts.example.invalid/signin');
      fs.writeFileSync(marker,'ready');
      send(message.id,{});
    }
  });
} else if (args.includes('login')) {
  if (config.loginMode === 'error') {
    console.error('Could not sign in https://auth.example.invalid/private?code=synthetic');
    process.exit(2);
  }
  console.error(id === 'claude' ? 'Open https://claude.ai/oauth/authorize?code=true&client_id=x&state=y' : 'Open https://auth.example.invalid/signin');
  if (config.loginMode === 'code') {
    console.log('Paste code here');
    readline.createInterface({input:process.stdin}).once('line', () => { fs.writeFileSync(marker, 'ready'); process.exit(0); });
  } else if (config.loginMode === 'auto') {
    setTimeout(() => { fs.writeFileSync(marker, 'ready'); process.exit(0); }, 60);
  } else {
    setInterval(() => {}, 1000);
  }
} else {
  console.error('Unexpected fixture command');
  process.exitCode = 2;
}
