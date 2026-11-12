import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolveBinary } from './paths.js';
import { cleanEnvironment, JsonRpc, object, stopChild } from './providers/runtime.js';
import type { ModelCatalog } from './chat/catalog.js';
import type { SettingsStore } from './settings.js';
import { connectionIds, validConnectionCode, type Connection, type ConnectionId } from '../shared/connections.js';
import { connectionStrings as t } from '../renderer/strings.js';

export type { Connection } from '../shared/connections.js';
export const LOGIN_TIMEOUT_MS = 5 * 60_000;
const COMMAND_TIMEOUT_MS = 10_000;
interface ActiveLogin {
  child?: ChildProcessWithoutNullStreams;
  rpc?: JsonRpc;
  login: NonNullable<Connection['login']>;
  poll?: ReturnType<typeof setInterval>;
  timeout?: ReturnType<typeof setTimeout>;
  checking: boolean;
  output: string;
  stderr: string;
}
interface ConnectionOptions {
  settings: Pick<SettingsStore, 'value'>;
  catalog: Pick<ModelCatalog, 'snapshot' | 'refresh' | 'providers' | 'exclusive'>;
  changed?: () => void;
  // Overrides are only supplied by tests; production always uses the official resolver and real HOME.
  resolve?: (id: ConnectionId) => Promise<string | undefined>;
  environment?: NodeJS.ProcessEnv;
  mock?: boolean;
  openTerminal?: (binary: string, args: string[]) => Promise<void>;
}
export function safeConnectionDetail(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  if (/token|secret|api.?key|password|authorization|bearer|sk[-_][A-Za-z0-9_-]+|eyJ[\w-]+\./i.test(text)) return t.failed;
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/https?:\/\/\S+/gi, '').trim().slice(-200) || t.failed;
}
function accountFields(value: unknown): NonNullable<Connection['account']> | undefined {
  const v = object(value);
  const account = {
    ...(typeof v.email === 'string' && /^[^\s@]+@[^\s@]+$/.test(v.email) && v.email.length < 254 ? { email: v.email } : {}),
    ...(typeof v.plan === 'string' && /^[\p{L}\p{N} _-]{1,80}$/u.test(v.plan) ? { plan: v.plan } : {}),
  };
  return Object.keys(account).length ? account : undefined;
}
function planName(value: unknown, prefix: string): string | undefined {
  if (typeof value !== 'string' || !/^[a-z_-]{1,40}$/i.test(value)) return;
  return prefix + value.charAt(0).toUpperCase() + value.slice(1);
}
async function bounded<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(t.statusTimeout)), COMMAND_TIMEOUT_MS); })]); }
  finally { clearTimeout(timer); }
}
export class Connections {
  private active = new Map<ConnectionId, ActiveLogin>();
  private details = new Map<ConnectionId, string>();
  private snapshots = new Map<ConnectionId, string>();
  private disposed = false;
  private readonly env: NodeJS.ProcessEnv;
  constructor(private options: ConnectionOptions) {
    this.env = cleanEnvironment(options.environment ?? { ...process.env, HOME: homedir() });
  }
  private binary(id: ConnectionId) { return (this.options.resolve ?? resolveBinary)(id); }
  private run(binary: string, args: string[]) {
    return new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
      execFile(binary, args, { env: this.env, timeout: COMMAND_TIMEOUT_MS, maxBuffer: 256 * 1024 }, (error, stdout, stderr) => {
        if (error && (typeof error.code !== 'number' || error.killed)) reject(new Error(error.killed ? t.statusTimeout : t.failed));
        else resolve({ stdout, stderr, code: error?.code as number ?? 0 });
      });
    });
  }
  private async codexAccount() {
    try {
      const auth = object(JSON.parse(await readFile(join(this.env.HOME ?? homedir(), '.codex', 'auth.json'), 'utf8')));
      if (String(auth.auth_mode).toLowerCase() === 'apikey' || (!auth.tokens && typeof auth.OPENAI_API_KEY === 'string' && auth.OPENAI_API_KEY)) return { plan: t.apiKey };
      const token = object(auth.tokens).id_token;
      if (typeof token !== 'string') return;
      const payload = object(JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')));
      return accountFields({ email: payload.email, plan: planName(object(payload['https://api.openai.com/auth']).chatgpt_plan_type, 'ChatGPT ') });
    } catch { return undefined; }
  }
  private async readStatus(id: ConnectionId): Promise<Connection> {
    const result: Connection = { id, installed: false, state: 'not_installed', modelCount: this.options.catalog.snapshot().models.filter(m => m.provider === id).length, enabled: !this.options.settings.value.disabledProviders.includes(id) };
    try {
      const binary = await this.binary(id);
      if (!binary) return result;
      result.installed = true;
      const version = await this.run(binary, ['--version']);
      if (version.code) throw new Error(version.stderr || version.stdout || t.failed);
      const parsedVersion = (version.stdout || version.stderr).match(/\b\d+\.\d+\.\d+(?:[-+][\w.-]+)?\b/)?.[0];
      if (parsedVersion) result.version = parsedVersion;
      if (id === 'claude') {
        const reply = await this.run(binary, ['auth', 'status', '--json']);
        const status = object(JSON.parse(reply.stdout));
        if (typeof status.loggedIn !== 'boolean') throw new Error(t.failed);
        if (reply.code && status.loggedIn) throw new Error(reply.stderr || t.failed);
        result.state = status.loggedIn ? 'ready' : 'not_authenticated';
        if (status.loggedIn) {
          const plan = /console|api/i.test(String(status.authMethod)) ? t.apiKey : planName(status.subscriptionType, ['pro', 'max', 'team', 'enterprise'].includes(String(status.subscriptionType)) ? 'Claude ' : '');
          const account = accountFields({ email: status.email, plan });
          if (account) result.account = account;
        }
      } else if (id === 'codex') {
        const reply = await this.run(binary, ['login', 'status']);
        const text = reply.stdout + reply.stderr;
        if (reply.code === 0 && /\bLogged in\b/i.test(text)) {
          result.state = 'ready';
          const account = await this.codexAccount();
          if (account) result.account = account;
        } else if (/not logged in|not authenticated|no.*credentials/i.test(text)) result.state = 'not_authenticated';
        else throw new Error(text || t.failed);
      } else if (id === 'gemini') {
        const provider = this.options.catalog.providers.get(id);
        if (!provider) throw new Error(t.failed);
        const status = await bounded(this.options.catalog.exclusive(id, () => bounded(provider.getStatus())));
        result.state = status.state;
        if (status.detail) result.detail = safeConnectionDetail(status.detail);
        const account = accountFields(provider.connectionAccount?.());
        if (account) result.account = account;
      } else {
        const reply = await this.run(binary, ['auth', 'list']);
        if (reply.code) throw new Error(reply.stderr || reply.stdout || t.failed);
        const text = (reply.stdout + reply.stderr).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
        // OpenCode 1.x prints "N credentials"; 2.x prints one "<provider>  OAuth|API key  stored" row per credential.
        result.state = /\b[1-9]\d*\s+credentials?\b/i.test(text) || /●\s+[^\n]+\s+(?:oauth|api key)\b/i.test(text) || /\b(?:oauth|api key)\s+stored\b/i.test(text) ? 'ready' : 'not_authenticated';
      }
    } catch (error) { result.state = 'error'; result.detail = safeConnectionDetail(error); }
    return result;
  }
  async readConnection(id: ConnectionId): Promise<Connection> {
    const result = await this.readStatus(id);
    const active = this.active.get(id);
    if (active && result.state === 'ready') await this.finish(id, active, true);
    else if (active) { result.state = 'signing_in'; result.login = { ...active.login }; delete result.detail; }
    if (result.state === 'ready') this.details.delete(id);
    const detail = this.details.get(id);
    if (detail) result.detail = detail;
    result.modelCount = this.options.catalog.snapshot().models.filter(m => m.provider === id).length;
    const snapshot = JSON.stringify(result);
    if (this.snapshots.get(id) !== snapshot) { this.snapshots.set(id, snapshot); this.options.changed?.(); }
    return result;
  }
  async readConnections(): Promise<Connection[]> {
    if (this.options.mock) return [];
    return Promise.all(connectionIds.map(id => this.readConnection(id)));
  }
  private async refresh(id: ConnectionId) {
    if (this.disposed) return;
    // Restart the cached provider connection so it observes the CLI's updated credentials.
    await this.options.catalog.exclusive(id, async () => { await this.options.catalog.providers.get(id)?.dispose(); });
    await this.options.catalog.refresh(true);
    this.options.changed?.();
  }
  private async finish(id: ConnectionId, active: ActiveLogin, refresh: boolean, detail?: string) {
    if (this.active.get(id) !== active) return;
    this.active.delete(id);
    clearInterval(active.poll); clearTimeout(active.timeout);
    if (detail) this.details.set(id, detail);
    if (active.rpc) await active.rpc.dispose();
    else if (active.child) await stopChild(active.child);
    this.options.changed?.();
    if (refresh) await this.refresh(id);
  }
  private output(id: ConnectionId, active: ActiveLogin, chunk: Buffer, stderr: boolean) {
    if (this.active.get(id) !== active) return;
    // Keep a bounded, in-memory buffer only; never persist raw authentication output.
    active.output = (active.output + chunk.toString()).slice(-16_384);
    if (stderr) active.stderr = (active.stderr + chunk.toString()).slice(-4096);
    let changed = false;
    for (const match of active.output.matchAll(/https:\/\/[^\s<>"'\x1b]+/g)) {
      const url = match[0].replace(/[),.;]+$/, '');
      if (active.login.url) break;
      try {
        const parsed = new URL(url);
        const parameters = [...parsed.searchParams, ...new URLSearchParams(parsed.hash.slice(1))];
        // Claude's authorization URL carries `code=true` as a flag; only a real code value is sensitive.
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || /eyJ[\w-]+\./.test(url) || parameters.some(([key, value]) => /token|secret|password|authorization|api.?key|^key$/i.test(key) || (/^code$/i.test(key) && value !== 'true'))) continue;
        active.login.url = url; changed = true;
      } catch { /* Wait for a complete URL. */ }
    }
    if (/paste code here/i.test(active.output) && !active.login.needsCode) { active.login.needsCode = true; changed = true; }
    if (changed) this.options.changed?.();
  }
  private async terminal(binary: string, args: string[]) {
    const command = [binary, ...args].map(arg => "'" + arg.replace(/'/g, "'\\''") + "'").join(' ');
    if (this.options.openTerminal) return this.options.openTerminal(binary, args);
    const reply = await this.run('/usr/bin/osascript', ['-e', 'tell application "Terminal" to do script ' + JSON.stringify(command), '-e', 'tell application "Terminal" to activate']);
    if (reply.code) throw new Error(reply.stderr || t.failed);
  }
  async startLogin(id: ConnectionId) {
    if (this.disposed || this.active.has(id) || this.options.mock) return;
    const active: ActiveLogin = { login: {}, checking: false, output: '', stderr: '' };
    this.active.set(id, active); this.details.delete(id); this.options.changed?.();
    active.timeout = setTimeout(() => { void this.finish(id, active, true, t.loginTimeout).catch(() => {}); }, LOGIN_TIMEOUT_MS);
    active.poll = setInterval(() => {
      if (active.checking || this.active.get(id) !== active) return;
      active.checking = true;
      void this.readConnection(id).catch(() => {}).finally(() => { active.checking = false; });
    }, 2_000);
    try {
      const binary = await this.binary(id);
      if (!binary) throw new Error(t.missing);
      if (this.active.get(id) !== active) return;
      if (id === 'gemini') {
        const rpc = new JsonRpc(binary, ['acp'], this.env.HOME ?? homedir(), { ...this.env, AGY_CLI_DISABLE_AUTO_UPDATE: 'true' });
        active.rpc = rpc; active.child = rpc.child;
        rpc.onExit = () => {
          if (this.active.get(id) === active && active.rpc === rpc && rpc.child.exitCode !== 0) void this.finish(id, active, true, safeConnectionDetail(active.stderr)).catch(() => {});
        };
        rpc.child.stderr.on('data', chunk => this.output(id, active, chunk, true));
        const init = await rpc.request<{ authMethods?: { id: string; name: string }[] }>('initialize', { protocolVersion: 1, clientInfo: { name: 'j7_chat', version: '0.0.0' }, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } }, COMMAND_TIMEOUT_MS);
        if (this.active.get(id) !== active) return;
        const method = init.authMethods?.find(method => method.id === 'oauth-personal' && /google/i.test(method.name));
        if (method) {
          rpc.child.stdout.on('data', chunk => this.output(id, active, chunk, false));
          void rpc.request('authenticate', { methodId: method.id }, LOGIN_TIMEOUT_MS).then(async () => {
            if (this.active.get(id) === active) { await this.refresh(id); await this.readConnection(id); }
          }).catch(error => { if (this.active.get(id) === active) void this.finish(id, active, true, safeConnectionDetail(active.stderr || error)).catch(() => {}); });
        } else {
          delete active.rpc; delete active.child; await rpc.dispose();
          if (this.active.get(id) !== active) return;
          active.login.terminal = true; this.options.changed?.();
          await this.terminal(binary, []);
        }
      } else if (id === 'opencode') {
        active.login.terminal = true; this.options.changed?.();
        await this.terminal(binary, ['auth', 'login']);
      } else {
        const child = spawn(binary, id === 'claude' ? ['auth', 'login', '--claudeai'] : ['login'], { env: this.env, stdio: 'pipe' });
        active.child = child;
        child.stdout.on('data', chunk => this.output(id, active, chunk, false));
        child.stderr.on('data', chunk => this.output(id, active, chunk, true));
        child.stdin.on('error', () => {});
        child.once('error', error => { void this.finish(id, active, true, safeConnectionDetail(active.stderr || error)).catch(() => {}); });
        child.once('exit', code => {
          if (this.active.get(id) !== active) return;
          if (code !== 0) void this.finish(id, active, true, safeConnectionDetail(active.stderr)).catch(() => {});
          // A clean exit without a session must not leave the card waiting for five minutes.
          else void this.readConnection(id).then(() => this.finish(id, active, true, t.loginTimeout)).catch(() => {});
        });
      }
    } catch (error) { await this.finish(id, active, true, safeConnectionDetail(active.stderr || error)); }
  }
  async cancelLogin(id: ConnectionId) {
    const active = this.active.get(id);
    if (active) await this.finish(id, active, true);
    this.details.delete(id);
    return this.readConnection(id);
  }
  submitCode(id: ConnectionId, code: string) {
    if (!validConnectionCode(code)) throw new Error(t.invalidCode);
    const active = this.active.get(id);
    if (!active?.login.needsCode || !active.child?.stdin.writable) throw new Error(t.noLogin);
    active.child.stdin.write(code + '\n');
  }
  loginUrl(id: ConnectionId) { return this.active.get(id)?.login.url; }
  async logout(id: ConnectionId) {
    if (id !== 'claude' && id !== 'codex' || this.options.mock || this.disposed) return;
    const active = this.active.get(id);
    if (active) await this.finish(id, active, false);
    this.details.delete(id);
    try {
      const binary = await this.binary(id);
      if (!binary) throw new Error(t.missing);
      const reply = await this.run(binary, id === 'claude' ? ['auth', 'logout'] : ['logout']);
      if (reply.code) throw new Error(reply.stderr || reply.stdout || t.failed);
    } catch (error) { this.details.set(id, safeConnectionDetail(error)); }
    await this.refresh(id);
    return this.readConnection(id);
  }
  dispose() {
    this.disposed = true;
    for (const active of this.active.values()) {
      clearInterval(active.poll); clearTimeout(active.timeout);
      if (active.rpc) void active.rpc.dispose();
      else if (active.child) void stopChild(active.child);
    }
    this.active.clear();
  }
}
let connections: Connections;
export function setupConnections(options: ConnectionOptions) { connections = new Connections(options); return connections; }
export const readConnection = (id: ConnectionId) => connections.readConnection(id);
export const readConnections = () => connections.readConnections();
export const startLogin = (id: ConnectionId) => connections.startLogin(id);
export const cancelLogin = (id: ConnectionId) => connections.cancelLogin(id);
export const submitCode = (id: ConnectionId, code: string) => connections.submitCode(id, code);
export const logout = (id: ConnectionId) => connections.logout(id);
