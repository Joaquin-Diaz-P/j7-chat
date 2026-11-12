import { useEffect, useEffectEvent, useState } from 'react';
import type { SettingsData } from '../../shared/ipc.js';
import { canDisableConnection, type Connection, type ConnectionId } from '../../shared/connections.js';
import { connectionStrings as t, settingsStrings as s, settingsPrograms, strings } from '../strings.js';
import { ProviderIcon } from './ProviderIcon.js';

interface Props {
  data: SettingsData;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
}
export function Connections({ data, reload, refresh }: Props) {
  const [connections, setConnections] = useState<Connection[]>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState<string>();
  const [expanded, setExpanded] = useState<ConnectionId[]>([]);
  const [codes, setCodes] = useState<Partial<Record<ConnectionId, string>>>({});
  const load = useEffectEvent(async () => {
    try { setConnections(await window.j7.connectionsData()); await reload(); }
    catch { setError(t.failed); }
  });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false, running = false, again = false;
    const update = async () => {
      if (stopped) return;
      if (running) { again = true; return; }
      running = true;
      await load();
      running = false;
      if (again && !stopped) { again = false; timer = setTimeout(() => void update(), 80); }
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => void update(), 80); };
    const unsubscribe = window.j7.onConnectionsChanged(schedule);
    window.addEventListener('focus', schedule);
    void update();
    return () => { stopped = true; clearTimeout(timer); unsubscribe(); window.removeEventListener('focus', schedule); };
  }, []);
  const act = async (key: string, action: () => Promise<unknown>) => {
    setPending(key); setError('');
    try { await action(); setConnections(await window.j7.connectionsData()); await reload(); }
    catch (e) { setError(String(e).includes(t.lastReady) ? t.lastReady : t.failed); }
    finally { setPending(undefined); }
  };
  const mocks = (['mock', 'mock-a', 'mock-b'] as const).filter(id => data.catalog.statuses[id]);
  return <div className="connections">
    <p className="connections-intro">{mocks.length ? s.mockProgramsIntro : t.intro}</p>
    <h3 className="connections-heading">{t.modelsHeading}</h3>
    {mocks.length ? mocks.map(id => <section className="connection-card" aria-labelledby={'connection-' + id} key={id}>
      <div className="connection-header"><ProviderIcon provider={id} size={34}/><div className="connection-name"><h4 id={'connection-' + id}>{strings.programLabels[id]}</h4><p>{s.mockPurpose}</p></div><span className={'connection-badge ' + data.catalog.statuses[id]!.state}>{s.states[data.catalog.statuses[id]!.state]}</span></div>
    </section>) : connections === undefined ? <p role="status">{s.loading}</p> : connections.filter(connection => connection.id !== 'opencode' || connection.installed).map(connection => {
      const { id, state } = connection, service = t.services[id], program = settingsPrograms[id]!;
      const blocked = !canDisableConnection(connection, connections);
      const models = data.catalog.models.filter(model => model.provider === id);
      const busy = pending !== undefined;
      const official = () => void act(id, () => window.j7.settingsOpenUrl(id));
      return <section className="connection-card" aria-labelledby={'connection-' + id} key={id}>
        <div className="connection-header">
          <ProviderIcon provider={id} size={34}/>
          <div className="connection-name"><h4 id={'connection-' + id}>{service.name} <span>{service.program}{connection.version ? ' ' + connection.version : ''}</span></h4><p>{service.purpose}</p></div>
          <div className="connection-status"><span className={'connection-badge ' + state} role="status">{state === 'signing_in' && connection.login?.terminal ? t.terminalState : t.states[state]}</span>
            <input type="checkbox" role="switch" aria-label={t.enabled(service.name)} checked={connection.enabled} disabled={blocked || busy} title={blocked ? t.lastReady : t.enabled(service.name)} onChange={() => void act(id, () => window.j7.saveSettings({ disabledProviders: connection.enabled ? [...data.settings.disabledProviders, id] : data.settings.disabledProviders.filter(provider => provider !== id) }))}/>
          </div>
        </div>
        {state === 'ready' && <>
          <dl className="connection-account">{connection.account?.email && <div><dt>{t.account}</dt><dd>{connection.account.email}</dd></div>}{connection.account?.plan && <div><dt>{t.plan}</dt><dd>{connection.account.plan}</dd></div>}<div><dt>{t.models}</dt><dd>{connection.enabled ? connection.modelCount : t.disabled}</dd></div></dl>
          <div className="connection-actions">{connection.enabled && <button aria-expanded={expanded.includes(id)} aria-controls={'connection-models-' + id} onClick={() => setExpanded(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])}>{t.viewModels}</button>}
            {(id === 'claude' || id === 'codex') && <button disabled={busy} onClick={() => { if (confirm(t.confirmLogout(service.name, service.program))) void act(id, () => window.j7.connectionsLogout(id)); }}>{t.logout}</button>}
          </div>
          {connection.enabled && expanded.includes(id) && <ul className="connection-models" id={'connection-models-' + id}>{models.map(model => <li key={model.id}>{model.label}</li>)}</ul>}
        </>}
        {state === 'not_authenticated' && <button className="connection-primary" disabled={busy} onClick={() => void act(id, () => window.j7.connectionsLogin(id))}>{t.login}</button>}
        {state === 'signing_in' && <>
          <p className="connection-help">{connection.login?.terminal ? t.terminalHelp : t.browserHelp}</p>
          <div className="connection-actions">{connection.login?.url && <button disabled={busy} onClick={() => void act(id, () => window.j7.connectionsOpenLoginUrl(id))}>{t.reopen}</button>}<button disabled={busy} onClick={() => void act(id, () => window.j7.connectionsCancel(id))}>{t.cancel}</button></div>
          {connection.login?.needsCode && <form className="connection-code" onSubmit={event => { event.preventDefault(); const code = codes[id] ?? ''; if (code) void act(id, async () => { await window.j7.connectionsCode(id, code); setCodes(current => ({ ...current, [id]: '' })); }); }}>
            <label htmlFor={'connection-code-' + id}>{t.code}</label><input id={'connection-code-' + id} autoComplete="off" spellCheck={false} maxLength={512} value={codes[id] ?? ''} onChange={event => setCodes(current => ({ ...current, [id]: event.target.value.replace(/[\r\n]/g, '') }))}/><button disabled={busy || !codes[id]}>{t.submit}</button>
          </form>}
        </>}
        {state === 'not_installed' && <>
          <button className="connection-primary" disabled={busy} onClick={official}>{s.download}</button>
          {program.installCommand && <details className="connection-install"><summary>{t.install}</summary><p className="settings-command"><code>{program.installCommand}</code><button onClick={() => void act(id, () => navigator.clipboard.writeText(program.installCommand!))}>{s.copy}</button></p></details>}
        </>}
        {connection.detail && <p className="connection-help">{connection.detail}</p>}
        {state === 'error' && <button disabled={busy} onClick={() => void act(id, refresh)}>{s.refresh}</button>}
        <button className="connection-official" disabled={busy} onClick={official}>{t.official}</button>
      </section>;
    })}
    <h3 className="connections-heading">{t.voiceHeading}</h3>
    <section className="connection-card" aria-labelledby="connection-hex">
      <div className="connection-header"><div className="connection-name"><h4 id="connection-hex">{settingsPrograms.hex!.label}</h4><p>{settingsPrograms.hex!.purpose}</p></div><span className={'connection-badge ' + (data.hex.running ? 'ready' : data.hex.installed ? 'not_authenticated' : 'not_installed')}>{s.states[data.hex.running ? 'ready' : data.hex.installed ? data.hex.status?.code === 3 ? 'closed' : 'error' : 'not_installed']}</span></div>
      {!data.hex.installed && <><p className="connection-help">{s.hexRequirements}</p><button disabled={pending !== undefined} onClick={() => void act('hex', () => window.j7.settingsOpenUrl('hex'))}>{s.download}</button></>}
      {data.hex.installed && !data.hex.running && <><p className="connection-help">{data.hex.status?.code === 3 ? s.hexClosedProgram : s.hexError}</p><button disabled={pending !== undefined} onClick={() => void act('hex', () => window.j7.settingsStartHex())}>{s.openHex}</button></>}
      <button className="connection-official" onClick={() => void act('hex', () => window.j7.settingsOpenUrl('hex'))}>{t.official}</button>
    </section>
    <button className="connections-refresh" disabled={pending !== undefined} onClick={() => void act('refresh', refresh)}>{s.refresh}</button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
