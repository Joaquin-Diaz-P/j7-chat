// Usage: node cdpx.mjs '<json array of [method, params]>' — runs CDP commands in order, prints results.
const list = await (await fetch("http://127.0.0.1:9333/json/list")).json();
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); });
const call = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
for (const [method, params] of JSON.parse(process.argv[2])) {
  if (method === "sleep") { await new Promise((r) => setTimeout(r, params)); continue; }
  const m = await call(method, params);
  const v = m.result?.result?.value;
  if (method === "Runtime.evaluate") console.log(JSON.stringify(v ?? m.result?.exceptionDetails?.exception?.description ?? m));
}
ws.close();
