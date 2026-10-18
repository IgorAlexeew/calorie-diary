/* Web preview only: stands in for the Android bridge (window.Native) so the app page runs in a browser.
   AI goes through the Artifact's own "sample" (Claude) when the page is opened on claude.ai; reminders,
   notifications and widgets do nothing; voice types a sample phrase; data stays in this browser. */
(() => {
  const ls = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const js = f => setTimeout(f, 0);
  const aborts = new Map();
  const toBlob = url => fetch(url).then(r => r.blob());
  async function run(id, body, stream){
    const host = window.claude;               // the claude.ai Artifact runtime, absent elsewhere
    const sample = host && host.use ? await host.use("sample") : null;
    if (!sample) return window.__native.fail(id, "network", "В превью ИИ работает только на claude.ai");
    if ((body.messages || []).some(m => Array.isArray(m.content) && m.content.some(p => p.type === "input_audio")))
      return window.__native.fail(id, "bad_model", "голос через ИИ в превью отключён");
    let sys = "", images = [];
    const msgs = [];
    for (const m of body.messages || []){
      let t = m.content;
      if (Array.isArray(t)){
        for (const p of t) if (p.type === "image_url") images.push(await toBlob(p.image_url.url));
        t = t.filter(p => p.type === "text").map(p => p.text).join("\n");
      }
      if (m.role === "system") sys += t + "\n\n";
      else msgs.push({role: m.role === "assistant" ? "assistant" : "user", content: String(t)});
    }
    if (sys && msgs.length) msgs[0].content = sys + msgs[0].content;
    const ac = new AbortController(); aborts.set(id, ac);
    try {
      const r = await sample(msgs, {signal: ac.signal, cache: false, images: images.length ? images : undefined,
        onText: stream ? ({delta}) => delta && window.__native.chunk(id, delta) : undefined});
      window.__native.done(id, stream ? r.text : JSON.stringify({choices: [{message: {content: r.text}}]}));
    } catch (e) {
      window.__native.fail(id, e && e.code === "aborted" ? "cancelled" : "http", (e && (e.message || e.code)) || "ошибка");
    } finally { aborts.delete(id); }
  }
  let srTimer = null, srOn = false;
  const sr = (k, v) => window.__native && window.__native.sr && window.__native.sr(k, v);
  const say = ["овсянка с бананом и кофе с молоком", "борщ и два куска хлеба", "куриная грудка с рисом"];
  window.Native = {
    config: () => JSON.stringify({base: "claude.ai", model: "Claude (превью)", audioModel: "", hasKey: true, builtIn: true,
      reminders: ls("pv.reminders", []), notifyAllowed: true, night: matchMedia("(prefers-color-scheme: dark)").matches}),
    saveConfig: j => put("pv.config", JSON.parse(j || "{}")),
    saveReminders: j => put("pv.reminders", JSON.parse(j || "[]")),
    openNotifySettings: () => {},
    pushToday: () => {},
    takeAddRequest: () => false,
    chat: (id, body, stream) => { run(id, JSON.parse(body), stream); },
    models: id => js(() => window.__native.done(id, JSON.stringify({data: []}))),
    cancel: id => { const a = aborts.get(id); if (a) a.abort(); },
    srStart: () => {
      if (srOn) return; srOn = true;
      js(() => sr("ready", ""));
      srTimer = setInterval(() => sr("level", String(0.3 + Math.random() * 0.6)), 120);
      /* the phrase comes in word by word, like the phone's recognizer does */
      const w = say[0].split(" "); let n = 0;
      const next = () => { if (!srOn || n >= w.length) return; sr("partial", w.slice(0, ++n).join(" ")); setTimeout(next, 450); };
      setTimeout(next, 600);
    },
    srStop: () => { if (!srOn) return; srOn = false; clearInterval(srTimer); const t = say.shift(); say.push(t); js(() => sr("final", t)); },
    srCancel: () => { srOn = false; clearInterval(srTimer); },
    exportFile: (name, content) => {
      try { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], {type: "application/json"})); a.download = name; a.click(); js(() => window.__native.exported(true)); }
      catch (e) { js(() => window.__native.exported(false)); }
    }
  };
})();
