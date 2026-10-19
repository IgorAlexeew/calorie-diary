/* Stands in for the Claude artifact runtime inside the Android app:
   "db" keeps the diary in IndexedDB on the phone, "sample" sends prompts to odirouter through the app. */
(() => {
  const N = window.Native;
  const cfg = () => { try { return JSON.parse(N.config()); } catch (e) { return {}; } };
  try { if (cfg().night) document.documentElement.dataset.theme = "dark"; else document.documentElement.dataset.theme = "light"; } catch (e) {}

  /* ---------- requests through the app ---------- */
  const pending = new Map();
  let seq = 0;
  window.__native = {
    chunk(id, t){ const p = pending.get(id); if (p && p.onChunk) p.onChunk(t); },
    done(id, t){ const p = pending.get(id); if (p){ pending.delete(id); p.resolve(t); } },
    fail(id, code, message){ const p = pending.get(id); if (p){ pending.delete(id); p.reject({code, message}); } },
    notifyChanged(){ if (sheetRefresh) sheetRefresh(); },
    exported(ok){ const f = window.__onExported; window.__onExported = null; if (f) f(ok); }
  };
  function call(kind, body, stream, onChunk, signal){
    return new Promise((resolve, reject) => {
      const id = "r" + (++seq);
      pending.set(id, {resolve, reject, onChunk});
      if (signal){
        if (signal.aborted){ pending.delete(id); reject({code:"cancelled"}); return; }
        signal.addEventListener("abort", () => { N.cancel(id); window.__native.fail(id, "cancelled", ""); }, {once:true});
      }
      if (kind === "models") N.models(id); else N.chat(id, JSON.stringify(body), !!stream);
    });
  }

  /* ---------- db: collections of documents in IndexedDB ---------- */
  const DBNAME = "diary", STORE = "docs";
  const cache = new Map(), listeners = new Map();
  const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));
  let idb = null;
  const openIdb = () => new Promise((res, rej) => {
    const r = indexedDB.open(DBNAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = (mode, fn) => new Promise((res, rej) => {
    const t = idb.transaction(STORE, mode); const st = t.objectStore(STORE);
    const out = fn(st);
    t.oncomplete = () => res(out && "result" in out ? out.result : undefined);
    t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || {code:"quota_exceeded"});
  });
  async function loadAll(){
    idb = await openIdb();
    const [keys, vals] = await Promise.all([tx("readonly", s => s.getAllKeys()), tx("readonly", s => s.getAll())]);
    keys.forEach((k, i) => {
      const cut = k.indexOf("\u0000"), c = k.slice(0, cut), id = k.slice(cut + 1);
      if (!cache.has(c)) cache.set(c, new Map());
      cache.get(c).set(id, vals[i]);
    });
  }
  const ready = loadAll();
  const coll = c => { if (!cache.has(c)) cache.set(c, new Map()); return cache.get(c); };
  const snapOf = c => ({docs: Array.from(coll(c).entries()).map(([id, d]) => ({id, exists:true, data: () => clone(d)}))});
  function notify(c){
    const ls = listeners.get(c); if (!ls) return;
    setTimeout(() => { for (const l of ls) try { l(snapOf(c)); } catch (e) { console.error(e); } }, 0);
  }
  const db = {
    collection(c){
      return {
        doc(id){
          return {
            async get(){ await ready; const d = coll(c).get(id); return {id, exists: d !== undefined, data: () => clone(d)}; },
            async set(data){ await ready; const v = clone(data); await tx("readwrite", s => s.put(v, c + "\u0000" + id)); coll(c).set(id, v); notify(c); },
            async delete(){ await ready; await tx("readwrite", s => s.delete(c + "\u0000" + id)); coll(c).delete(id); notify(c); }
          };
        },
        onSnapshot(cb, onErr){
          if (!listeners.has(c)) listeners.set(c, new Set());
          listeners.get(c).add(cb);
          ready.then(() => cb(snapOf(c)), e => onErr && onErr(e));
          return () => listeners.get(c).delete(cb);
        }
      };
    }
  };

  /* backup: everything in one JSON file */
  async function exportAll(){
    await ready;
    const out = {app:"calorie-diary", version:1, exported:new Date().toISOString(), collections:{}};
    for (const [c, m] of cache) out.collections[c] = Object.fromEntries(m);
    return out;
  }
  async function importAll(obj){
    await ready;
    const cols = obj && obj.collections;
    if (!cols || typeof cols !== "object") throw new Error("format");
    let n = 0;
    await tx("readwrite", s => { for (const [c, docs] of Object.entries(cols)) for (const [id, d] of Object.entries(docs || {})) { s.put(clone(d), c + "\u0000" + id); n++; } });
    for (const [c, docs] of Object.entries(cols)){ for (const [id, d] of Object.entries(docs || {})) coll(c).set(id, clone(d)); notify(c); }
    return n;
  }

  /* ---------- sample: chat completions via odirouter ---------- */
  const blobToDataUrl = b => typeof b === "string" ? Promise.resolve(b) : new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej({code:"image_rejected"}); r.readAsDataURL(b); });
  async function buildMessages(input, images){
    let msgs = typeof input === "string" ? [{role:"user", content:input}]
      : (input || []).map(m => ({role: m.role === "assistant" || m.role === "ai" ? "assistant" : m.role === "system" ? "system" : "user", content: typeof m.content === "string" ? m.content : JSON.stringify(m.content)}));
    if (images && images.length){
      const urls = await Promise.all(images.map(blobToDataUrl));
      let i = msgs.length - 1; while (i > 0 && msgs[i].role !== "user") i--;
      msgs[i] = {role:"user", content: [{type:"text", text: msgs[i].content}, ...urls.map(url => ({type:"image_url", image_url:{url}}))]};
    }
    return msgs;
  }
  function needModel(){
    const c = cfg();
    if (!c.hasKey){ if (!c.builtIn) openSettings(); throw {code:"no_key"}; }
    return c.model;
  }
  async function sample(input, opts){
    opts = opts || {};
    const model = needModel();
    const body = {model, messages: await buildMessages(input, opts.images), stream: true, max_tokens: opts.maxTokens || 4096};
    let text = "";
    const full = await call("chat", body, true, delta => { text += delta; if (opts.onText) opts.onText({text, delta}); }, opts.signal);
    if (!full && !text) throw {code:"empty_completion"};
    return {text: full || text};
  }
  function parseJson(t){
    t = String(t || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    try { return JSON.parse(t); } catch (e) {}
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a >= 0 && b > a) try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {}
    throw {code:"invalid_json"};
  }
  sample.json = async (prompt, opts) => {
    opts = opts || {};
    const model = needModel();
    const body = {model, messages: await buildMessages(prompt, opts.images), max_tokens: opts.maxTokens || 4096};
    const raw = await call("chat", body, false, null, opts.signal);
    let o; try { o = JSON.parse(raw); } catch (e) { throw {code:"invalid_json"}; }
    const msg = o && o.choices && o.choices[0] && o.choices[0].message;
    let content = msg && msg.content;
    if (Array.isArray(content)) content = content.map(p => p.text || "").join("");
    if (!content) throw {code:"empty_completion"};
    return parseJson(content);
  };
  sample.limits = async () => ({images:{maxCount:4, mediaTypes:["image/jpeg","image/png","image/webp","image/gif","image/heic","image/heif"]}});

  window.claude = {use: async name => name === "db" ? db : name === "sample" ? sample : null};

  /* ---------- voice (pixel version): recording -> 16 kHz mono WAV -> Gemini on odirouter -> text ---------- */
  async function toWav(blob){
    const AC = window.AudioContext || window.webkitAudioContext;
    const ac = new AC();
    let buf;
    try { buf = await ac.decodeAudioData(await blob.arrayBuffer()); } finally { try { ac.close(); } catch (e) {} }
    const rate = 16000, len = Math.max(1, Math.ceil(buf.duration * rate));
    const off = new OfflineAudioContext(1, len, rate);
    const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
    const pcm = (await off.startRendering()).getChannelData(0);
    const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
    const w = (o, t) => { for (let i = 0; i < t.length; i++) out.setUint8(o + i, t.charCodeAt(i)); };
    w(0, "RIFF"); out.setUint32(4, 36 + pcm.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
    out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
    out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
    w(36, "data"); out.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++){ const v = Math.max(-1, Math.min(1, pcm[i])); out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true); }
    const bytes = new Uint8Array(out.buffer); let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  /* the audio model comes from the build; without one, the first free Gemini model odirouter lists (remembered) */
  let audioModel = null;
  async function pickAudioModel(){
    if (audioModel) return audioModel;
    const c = cfg();
    if (c.audioModel) return audioModel = c.audioModel;
    try { const m = localStorage.getItem("audioModel"); if (m) return audioModel = m; } catch (e) {}
    const ids = ((JSON.parse(await call("models")) || {}).data || []).map(m => m.id).filter(Boolean);
    const rank = id => (/free/i.test(id) ? 0 : 4) + (/flash/i.test(id) ? 0 : 2) + (/lite|image|tts|embed/i.test(id) ? 1 : 0);
    const gem = ids.filter(id => /gemini/i.test(id) && !/tts|embed|image/i.test(id)).sort((a, b) => rank(a) - rank(b));
    if (!gem.length) throw {code:"bad_model", message:"нет модели Gemini для голоса"};
    audioModel = gem[0];
    try { localStorage.setItem("audioModel", audioModel); } catch (e) {}
    return audioModel;
  }
  window.__transcribe = async blob => {
    if (!cfg().hasKey) throw {code:"no_key"};
    const [data, model] = await Promise.all([toWav(blob), pickAudioModel()]);
    const body = {model, max_tokens: 1024, messages: [{role:"user", content: [
      {type:"text", text:"Это голосовое сообщение для дневника питания на русском. Запиши дословно, что сказано, обычным текстом, без пояснений и кавычек. Если к сообщению не приложен звук, ответь ровно NO_AUDIO. Если звук есть, но речи в нём не слышно, ответь ровно NO_SPEECH. Ничего не придумывай."},
      {type:"input_audio", input_audio:{data, format:"wav"}}
    ]}]};
    let raw;
    try { raw = await call("chat", body, false); }
    catch (e) { if (e && e.code === "bad_model" && !cfg().audioModel){ audioModel = null; try { localStorage.removeItem("audioModel"); } catch (x) {} } throw e; }
    const msg = ((JSON.parse(raw) || {}).choices || [])[0];
    let t = msg && msg.message && msg.message.content;
    if (Array.isArray(t)) t = t.map(p => p.text || "").join("");
    t = String(t || "").trim().replace(/^["«]|["»]$/g, "");
    if (/^NO_AUDIO\b/.test(t)) throw {code:"no_audio", model};
    if (/^NO_SPEECH\b/.test(t)) return "";
    return t;
  };
  window.__transcribe.model = () => audioModel || cfg().audioModel || "";

  /* ---------- hold-to-talk (pixel version) ----------
     The mic buttons record while held and send on release; sliding the finger left along the lane that opens beside
     the button cancels: on the bin at its end the lane turns red and letting go throws the message away.
     Engines: "phone" = Android speech recognition through Native.sr*, "gemini" = recording + __transcribe.
     While held, the button shows pixel level bars and what is heard is typed right into the message field
     (the chat's text box, and the chat bar on the pet screen, which looks like the same field). */
  const VOICE_KEY = "voiceEngine", DIAG_KEY = "voiceDiag";
  const lsGet = (k, d) => { try { return localStorage.getItem(k) || d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const voiceEngine = () => lsGet(VOICE_KEY, "phone");
  const SR_ERR = {"1":"нет сети","2":"нет сети","3":"микрофон занят","4":"сервер распознавания не ответил","5":"сбой распознавания","8":"распознавание занято, попробуй ещё раз","9":"нет доступа к микрофону",
    permission:"нет доступа к микрофону, разреши его в настройках телефона", unavailable:"на телефоне нет распознавания речи, переключи голос на ИИ в настройках", start:"распознавание не запустилось"};
  let hold = null;
  const pct = v => Math.round(v * 100) + "%";
  function voiceSay(t, err){
    const p = document.getElementById("chatPrev");
    if (p){ p.classList.remove("live", "empty"); p.textContent = t; p.classList.toggle("busy", !err); }
    if (typeof setStatus === "function") setStatus(t, err);
  }
  /* what is heard goes into the message field, after anything already typed there */
  const joinT = (a, b) => [a, b].map(x => (x || "").trim()).filter(Boolean).join(" ");
  function voiceField(h, text){
    h.heard = text || "";
    const ta = document.getElementById("foodText"), all = joinT(h.base, h.heard);
    if (ta){ ta.value = all; if (typeof autoGrow === "function") autoGrow(); ta.scrollTop = ta.scrollHeight; }
    const p = document.getElementById("chatPrev");
    /* one line that never grows: the newest words stay in sight */
    if (p){ p.classList.add("live", "busy"); p.classList.toggle("empty", !all); p.textContent = all || "Говори…"; p.scrollLeft = p.scrollWidth; }
  }
  function voiceRestore(h, msg){
    const ta = document.getElementById("foodText");
    if (ta){ ta.value = h.base || ""; if (typeof autoGrow === "function") autoGrow(); }
    const p = document.getElementById("chatPrev"); if (p) p.classList.remove("live", "empty");
    voiceSay(msg || "");
    if (msg) setTimeout(() => { if (!hold && typeof chatBarPreview === "function") chatBarPreview(); }, 1800);
  }
  /* the cancel track: while the button is held, a lane opens to the left of it with a bin at the far end; the button's
     thumb rides along the lane under the finger, and on the bin it turns red ("отпусти — отмена") */
  const CANCEL_PX = 120;
  const pxI = (n, sz) => typeof pxIcon === "function" ? pxIcon(n, sz) : "";
  function hintShow(h){
    const el = document.getElementById("voiceHint"); if (!el) return;
    const r = h.btn.getBoundingClientRect();
    /* the lane covers the button exactly and runs CANCEL_PX further left; bin and thumb are both the button's size */
    el.style.left = (r.right - CANCEL_PX - r.width) + "px";
    el.style.top = r.top + "px";
    el.style.height = r.height + "px";
    el.style.width = (CANCEL_PX + r.width) + "px";
    /* the chat bar's text stops where the lane begins */
    const op = document.getElementById("chatOpen");
    if (op && h.btn.id === "barMic") op.style.paddingRight = Math.max(10, Math.round(op.getBoundingClientRect().right - (r.right - CANCEL_PX - r.width) + 8)) + "px";
    el.style.setProperty("--th", r.width + "px");
    el.innerHTML = `<span class="vtBin">${pxI("trash", 18)}</span><span class="vtPath"><span class="vtLab"></span></span><span class="vtThumb">${pxI("mic", 18)}</span>`;
    hintArm(h, false); hintPos(0); el.hidden = false;
  }
  function hintPos(dx){
    /* in 4 px steps, and all the way onto the bin at the end */
    const t = document.querySelector("#voiceHint .vtThumb"); if (t) t.style.transform = `translateX(${dx <= -CANCEL_PX ? -CANCEL_PX : Math.round(dx / 4) * 4}px)`;
  }
  function hintArm(h, on){
    const el = document.getElementById("voiceHint"); if (!el) return;
    el.classList.toggle("armed", on);
    const lab = el.querySelector(".vtLab");
    if (lab) lab.innerHTML = on ? "Отпусти" : `${pxI("chevL", 10)}${pxI("chevL", 10)} отмена`;
    const t = el.querySelector(".vtThumb"); if (t) t.innerHTML = pxI(on ? "trash" : "mic", 18);
    for (const id of ["chatBar", "composer"]){ const b = document.getElementById(id); if (b) b.classList.toggle("voiceCancel", on); }
  }
  function hintHide(){
    const el = document.getElementById("voiceHint"); if (el) el.hidden = true;
    const op = document.getElementById("chatOpen"); if (op) op.style.paddingRight = "";
    for (const id of ["chatBar", "composer"]){ const b = document.getElementById(id); if (b) b.classList.remove("voiceCancel"); }
  }
  function voiceMove(btn, e){
    if (!hold || hold.btn !== btn || (hold.pid != null && e.pointerId !== hold.pid)) return;
    const dx = Math.min(0, e.clientX - hold.x), armed = dx <= -CANCEL_PX;
    hintPos(dx);
    if (armed !== hold.armed){
      hold.armed = armed; hintArm(hold, armed);
      if (navigator.vibrate) try { navigator.vibrate(armed ? 30 : 10); } catch (x) {}
    }
  }
  /* the pet listens while the button is held: window.__petListen(true, level 0..1) / (false), provided by pet/ */
  const petListen = (on, v) => { try { if (typeof window.__petListen === "function") window.__petListen(on, v || 0); } catch (e) {} };
  function setLevel(v){
    if (!hold) return;
    petListen(true, v);
    hold.peak = Math.max(hold.peak, v);
    const h = hold.btn.clientHeight - 14, prof = [.45, .75, 1, .75, .45];
    hold.bars.forEach((b, i) => {
      const x = Math.min(1, v * prof[i] * (0.8 + Math.random() * 0.4));
      b.style.height = Math.max(4, Math.round(x * h / 4) * 4) + "px";
    });
  }
  let holdEndAt = 0;
  function endHold(){
    if (!hold) return null;
    holdEndAt = Date.now();
    const h = hold; hold = null;
    petListen(false);
    const bar = document.getElementById("chatBar"); if (bar) bar.classList.remove("voiceHold");
    h.btn.classList.remove("holding", "rec");
    hintHide();
    h.bars.forEach(b => b.style.height = "4px");
    if (h.timer) clearTimeout(h.timer);
    return h;
  }
  function voiceDone(h, text, diag){
    if (diag) lsSet(DIAG_KEY, diag);
    text = (text || "").trim();
    if (!text){
      const short = h && h.dur != null && h.dur < 700;
      if (h) voiceRestore(h);
      voiceSay(short ? "Держи кнопку, пока говоришь, и отпусти в конце." : "Не расслышал. " + (diag || ""), true);
      return;
    }
    if (h) voiceField(h, text);
    const all = h ? joinT(h.base, text) : text;
    voiceSay("");
    if (typeof openChat === "function") openChat(true);
    if (typeof sendChat === "function") sendChat(all, true);
  }
  /* phone engine: Java SpeechRecognizer; it may stop on a pause while the button is still held, then it is restarted */
  window.__native.sr = (kind, v) => {
    const h = hold && hold.engine === "phone" ? hold : null;
    const ph = window.__phone; if (!ph) return;
    const join = (a, b) => [a, b].filter(Boolean).join(" ");
    if (kind === "level"){ if (h) setLevel(+v); }
    else if (kind === "granted"){ if (h) N.srStart(); }
    else if (kind === "partial"){ ph.partial = v; if (!ph.done) voiceField(ph.h, join(ph.text, v)); }
    else if (kind === "final"){
      ph.text = join(ph.text, v || ph.partial); ph.partial = "";
      if (h){ N.srStart(); voiceField(h, ph.text); }
      else if (!ph.done){ ph.done = true; voiceDone(ph.h, ph.text, `Телефон: «${ph.text.slice(0, 60)}»`); }
    } else if (kind === "error"){
      const quiet = v === "6" || v === "7";
      if (h && quiet){ N.srStart(); return; }
      if (h && !quiet){ endHold(); }
      if (ph.done) return;
      ph.done = true;
      const text = join(ph.text, ph.partial);
      if (text || quiet || (v === "5" && !h)) voiceDone(ph.h, text, `Телефон: ${quiet ? "речь не распознана" : "ошибка " + v}`);
      else { voiceRestore(ph.h); voiceSay("Голос не сработал: " + (SR_ERR[v] || "ошибка " + v) + ".", true); lsSet(DIAG_KEY, "Телефон: ошибка " + v); }
    }
  };
  function phoneStart(h){
    window.__phone = {h, text:"", partial:"", done:false};
    N.srStart();
  }
  function phoneStop(h, send){
    const ph = window.__phone;
    if (!send){ N.srCancel(); if (ph) ph.done = true; return; }
    N.srStop();
    /* if the recognizer goes quiet after release, send what was heard */
    setTimeout(() => { if (ph && !ph.done){ ph.done = true; voiceDone(h, [ph.text, ph.partial].filter(Boolean).join(" "), "Телефон: нет финального ответа"); } }, 4000);
  }
  /* gemini engine: MediaRecorder + level meter, then __transcribe */
  async function geminiStart(h){
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({audio: true}); }
    catch (e) { if (hold === h) endHold(); voiceRestore(h); voiceSay("Нет доступа к микрофону. Разреши его в настройках телефона.", true); return; }
    if (hold !== h){ stream.getTracks().forEach(t => t.stop()); return; }
    const AC = window.AudioContext || window.webkitAudioContext, ac = new AC();
    const an = ac.createAnalyser(); an.fftSize = 1024; ac.createMediaStreamSource(stream).connect(an);
    const buf = new Float32Array(an.fftSize);
    const tick = () => { if (hold !== h) return; an.getFloatTimeDomainData(buf); let sum = 0; for (const x of buf) sum += x * x; setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 5)); requestAnimationFrame(tick); };
    const mr = new MediaRecorder(stream), chunks = [];
    mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    h.rec = {stream, ac, mr, chunks};
    mr.start(); tick();
  }
  function geminiStop(h, send){
    const r = h.rec;
    if (!r){ if (send) voiceDone(h, "", ""); return; }
    r.mr.onstop = async () => {
      r.stream.getTracks().forEach(t => t.stop()); try { r.ac.close(); } catch (e) {}
      if (!send) return;
      const blob = new Blob(r.chunks, {type: r.mr.mimeType || "audio/webm"});
      const info = `запись ${(h.dur / 1000).toFixed(1)} с, громкость ${pct(h.peak)}`;
      if (h.dur < 700) return voiceDone(h, "", "");
      if (h.peak < 0.04) return voiceRestore(h), voiceSay(`Микрофон ничего не услышал (${info}).`, true), lsSet(DIAG_KEY, "ИИ: тишина, " + info);
      voiceField(h, ""); const p = document.getElementById("chatPrev"); if (p) p.textContent = joinT(h.base, "") || "Распознаю голос…";
      if (typeof setStatus === "function") setStatus("Распознаю голос…");
      try {
        const t = await window.__transcribe(blob);
        voiceDone(h, t, `ИИ ${window.__transcribe.model()}: ${info}${t ? ", «" + t.slice(0, 60) + "»" : ", речи не нашёл"}`);
      } catch (e) {
        const m = window.__transcribe.model();
        voiceRestore(h);
        if (e && e.code === "no_audio"){ voiceSay(`Модель ${m} не получила звук: odirouter, похоже, не передаёт ей аудио. Переключи голос на «Телефон» в настройках.`, true); lsSet(DIAG_KEY, `ИИ ${m}: модель не получила звук, ${info}`); }
        else { const d = (e && (e.message || e.code)) || "ошибка"; voiceSay("Не получилось распознать голос: " + d, true); lsSet(DIAG_KEY, `ИИ ${m}: ${d}, ${info}`); }
      }
    };
    r.mr.stop();
  }
  function voiceDown(btn, e){
    if (hold || (typeof chatBusy !== "undefined" && chatBusy)) return;
    e.preventDefault();
    try { btn.setPointerCapture(e.pointerId); } catch (x) {}
    const engine = voiceEngine();
    const ta = document.getElementById("foodText");
    hold = {btn, engine, pid: e.pointerId, t0: Date.now(), x: e.clientX, y: e.clientY, peak: 0, armed: false, base: ta ? ta.value : "", heard: "", bars: Array.from(btn.querySelectorAll(".vu i"))};
    btn.classList.add("holding", "rec");
    const bar = document.getElementById("chatBar"); if (bar) bar.classList.add("voiceHold");
    petListen(true, 0);
    if (navigator.vibrate) try { navigator.vibrate(15); } catch (x) {}
    voiceField(hold, "");
    if (typeof setStatus === "function") setStatus("Говори. Отпусти, чтобы отправить.");
    hintShow(hold);
    hold.timer = setTimeout(() => voiceUp(btn, null), 120000);
    if (engine === "phone") phoneStart(hold); else geminiStart(hold);
  }
  function voiceUp(btn, e){
    if (!hold || hold.btn !== btn || (e && hold.pid != null && e.pointerId !== hold.pid)) return;
    const cancel = e && (e.type === "pointercancel" || hold.armed || e.clientX - hold.x <= -CANCEL_PX);
    const h = endHold(); h.dur = Date.now() - h.t0;
    if (cancel) voiceRestore(h, "Запись отменена");
    else if (h.engine === "phone" && typeof setStatus === "function") setStatus("Распознаю…");
    if (h.engine === "phone") phoneStop(h, !cancel); else geminiStop(h, !cancel);
  }
  function setupVoice(){
    const btns = ["barMic", "micBtn"].map(id => document.getElementById(id)).filter(Boolean);
    if (!btns.length) return;
    const st = document.createElement("style");
    st.textContent = `.pxBtn.mic{position:relative;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.pxBtn.mic .vu{position:absolute;inset:0;display:none;align-items:center;justify-content:center;gap:3px;background:var(--over);pointer-events:none}
.pxBtn.mic.holding{animation:none;background:var(--over);transform:none;box-shadow:var(--shadow)}
.pxBtn.mic.holding .vu{display:flex}
.pxBtn.mic .vu i{display:block;width:4px;height:4px;background:#fff}
.chatBar.voiceHold .chatPrev{text-overflow:clip;color:var(--fg)}
.chatPrev.live::after{content:"";display:inline-block;width:2px;height:1em;margin-left:2px;vertical-align:-2px;background:currentColor;animation:vCaret 1s steps(1) infinite}
.chatPrev.live.empty{color:var(--muted)}
@keyframes vCaret{50%{opacity:0}}
.voiceCancel .chatPrev,.voiceCancel textarea{opacity:.45;text-decoration:line-through}
.voiceHint{position:fixed;z-index:60;box-sizing:border-box;background:var(--bg);border:3px solid var(--line);box-shadow:var(--shadow);pointer-events:none;font:600 14px var(--display, inherit);color:var(--muted)}
.voiceHint .vtBin,.voiceHint .vtThumb{position:absolute;top:-3px;bottom:-3px;width:var(--th);box-sizing:border-box;display:flex;align-items:center;justify-content:center;border:3px solid var(--line)}
.voiceHint .vtBin{left:-3px;color:var(--muted);border-right-style:dashed}
.voiceHint .vtPath{position:absolute;inset:0 calc(var(--th) - 3px) 0 calc(var(--th) - 3px);display:flex;align-items:center;justify-content:center;white-space:nowrap;overflow:hidden}
.voiceHint .vtLab{display:inline-flex;align-items:center;gap:2px;animation:vLeft .8s steps(2) infinite}
.voiceHint .vtThumb{right:-3px;background:var(--over);color:#fff}
.voiceHint.armed .vtPath{inset:0 0 0 calc(var(--th) - 3px)}
.voiceHint.armed{background:var(--over);color:#fff}
.voiceHint.armed .vtBin{color:#fff}
.voiceHint.armed .vtLab{animation:none}
.voiceHint.armed .vtThumb{background:#fff;color:var(--over)}
@keyframes vLeft{50%{transform:translateX(-4px)}}`;
    document.head.append(st);
    const hint = document.createElement("div"); hint.id = "voiceHint"; hint.className = "voiceHint"; hint.hidden = true; hint.setAttribute("aria-live", "polite");
    document.body.append(hint);
    for (const b of btns){
      b.onclick = null;
      b.setAttribute("aria-label", "Держи, чтобы записать голосовое");
      const vu = document.createElement("span"); vu.className = "vu"; vu.setAttribute("aria-hidden", "true");
      vu.innerHTML = "<i></i><i></i><i></i><i></i><i></i>"; b.append(vu);
      b.addEventListener("pointerdown", e => voiceDown(b, e));
      b.addEventListener("contextmenu", e => e.preventDefault());
    }
    /* if the WebView loses the pointer capture, the finger is still followed over the whole page */
    document.addEventListener("pointermove", e => { if (hold) voiceMove(hold.btn, e); });
    document.addEventListener("pointerup", e => { if (hold) voiceUp(hold.btn, e); });
    document.addEventListener("pointercancel", e => { if (hold) voiceUp(hold.btn, e); });
    /* letting go over the chat bar after a slide is not a tap on it: the click that follows a hold is swallowed */
    document.addEventListener("click", e => { if (Date.now() - holdEndAt < 500){ e.preventDefault(); e.stopPropagation(); } }, true);
  }

  /* ---------- settings sheet ---------- */
  const css = `
.gear{border:1px solid var(--line);background:var(--surface);border-radius:8px;width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;color:var(--muted);padding:0}
.top h1{flex:1}
.sheetBack{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:50;display:flex;align-items:flex-end;justify-content:center}
.sheet{background:var(--surface);color:var(--fg);width:100%;max-width:620px;max-height:92vh;overflow-y:auto;border-radius:16px 16px 0 0;padding:18px 16px 24px;display:flex;flex-direction:column;gap:12px}
.sheet h2{margin:0}
.sheet .field input,.sheet .field select{border:1px solid var(--line);background:var(--bg);border-radius:10px;padding:9px 10px;width:100%;color:var(--fg)}
.sheet .row2{display:flex;gap:8px;flex-wrap:wrap}
.sheet .row2 > *{flex:1}
.sheet .msgLine{font-size:13px;margin:0;min-height:1em;color:var(--muted)}
.sheet .msgLine.err{color:var(--over)}
.sheet .sep{border-top:1px solid var(--line);margin:4px 0}
.sheet .rem{display:flex;align-items:center;gap:10px}
.sheet .rem label{flex:1;display:flex;align-items:center;gap:8px}
.sheet .rem input[type=time]{border:1px solid var(--line);background:var(--bg);border-radius:10px;padding:7px 8px;color:var(--fg)}
.sheet .rem input[type=time]:disabled{opacity:.45}`;
  const st = document.createElement("style"); st.textContent = css; document.head.append(st);

  let sheet = null;
  const PET = () => !!document.getElementById("petScreen");
  const esc = t => String(t || "").replace(/[&<>"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
  const MEALS = ["Завтрак", "Обед", "Перекус", "Ужин"];
  const hm = r => String(r.h).padStart(2, "0") + ":" + String(r.m).padStart(2, "0");
  function renderReminders(back, c){
    const box = back.querySelector("#sRems"), warn = back.querySelector("#sNotify");
    const rems = (c.reminders || []).slice().sort((a, b) => a.meal - b.meal);
    const showWarn = () => { warn.hidden = !(rems.some(r => r.on) && !cfg().notifyAllowed); };
    const save = () => { N.saveReminders(JSON.stringify(rems)); showWarn(); };
    box.replaceChildren(...rems.map(r => {
      const row = document.createElement("div"); row.className = "rem";
      row.innerHTML = `<label><input type="checkbox"${r.on ? " checked" : ""}> ${MEALS[r.meal] || ""}</label><input type="time" value="${hm(r)}"${r.on ? "" : " disabled"} aria-label="Время, ${MEALS[r.meal] || ""}">`;
      const [cb, tm] = row.querySelectorAll("input");
      cb.onchange = () => { r.on = cb.checked; tm.disabled = !r.on; save(); };
      tm.onchange = () => { const [h, m] = tm.value.split(":").map(Number); if (h >= 0 && m >= 0){ r.h = h; r.m = m; save(); } };
      return row;
    }));
    back.querySelector("#sNotifyBtn").onclick = () => N.openNotifySettings();
    sheetRefresh = showWarn;
    showWarn();
  }
  let sheetRefresh = null;
  function openSettings(){
    if (sheet) return;
    const c = cfg();
    const back = document.createElement("div"); back.className = "sheetBack";
    back.innerHTML = `<div class="sheet${PET() ? " px" : ""}" role="dialog" aria-label="Настройки">
      <div id="sAi" style="display:flex;flex-direction:column;gap:12px"${c.builtIn ? " hidden" : ""}>
      <h2>Настройки ИИ</h2>
      <label class="field">Ключ odirouter<input id="sKey" type="password" autocomplete="off" placeholder="${c.hasKey ? "Ключ сохранён, введи новый, чтобы заменить" : "Вставь ключ"}"></label>
      <div hidden><label class="field">Модель<input id="sModel" list="sModels" autocomplete="off"></label>
      <datalist id="sModels"></datalist>
      <div class="row2"><button type="button" class="small" id="sLoad">Загрузить список моделей</button></div>
      <label class="field">Адрес API<input id="sBase" type="url" autocomplete="off"></label></div>
      <p class="msgLine" id="sMsg"></p>
      <div class="row2"><button type="button" class="primary" id="sSave">Сохранить</button></div>
      <div class="sep"></div>
      </div>
      ${PET() ? `<h2>Голос</h2>
      <p class="hint">Держи кнопку микрофона, пока говоришь. Отпусти, чтобы отправить, или уведи палец в сторону, чтобы отменить.</p>
      <label class="rem"><input type="radio" name="sVoice" value="phone"${voiceEngine() === "phone" ? " checked" : ""}> Телефон: распознавание Android, без лимита</label>
      <label class="rem"><input type="radio" name="sVoice" value="gemini"${voiceEngine() === "gemini" ? " checked" : ""}> ИИ: Gemini через odirouter</label>
      <p class="hint" id="sVoiceDiag">${esc(lsGet(DIAG_KEY, "") ? "Последняя запись: " + lsGet(DIAG_KEY, "") : "")}</p>
      <div class="sep"></div>` : ""}
      <h2>Напоминания</h2>
      <p class="hint">Приходят, только если этот приём пищи ещё не записан за сегодня.</p>
      <div id="sRems" style="display:flex;flex-direction:column;gap:8px"></div>
      <p class="msgLine err" id="sNotify" hidden>Уведомления для приложения выключены. <button type="button" class="small" id="sNotifyBtn">Включить</button></p>
      <div class="sep"></div>
      <h2>Данные</h2>
      <p class="hint">Записи хранятся только на этом телефоне. Сохраняй копию, чтобы не потерять их.</p>
      <div class="row2"><button type="button" class="small" id="sExport">Сохранить копию</button><button type="button" class="small" id="sImport">Загрузить из файла</button></div>
      <input type="file" id="sFile" accept="application/json,.json" hidden>
      <p class="hint">Модель ИИ: ${esc(c.model)} (задана при сборке).</p>
      <div class="row2"><button type="button" class="small" id="sClose">Закрыть</button></div>
    </div>`;
    document.body.append(back); sheet = back;
    const $s = id => back.querySelector("#" + id), msg = (t, err) => { const m = $s("sMsg"); m.textContent = t || ""; m.className = "msgLine" + (err ? " err" : ""); };
    renderReminders(back, c);
    back.querySelectorAll('input[name="sVoice"]').forEach(r => r.onchange = () => { if (r.checked) lsSet(VOICE_KEY, r.value); });
    $s("sModel").value = c.model || "";
    $s("sBase").value = c.base || "";
    const close = () => { back.remove(); sheet = null; sheetRefresh = null; };
    back.addEventListener("click", e => { if (e.target === back) close(); });
    $s("sClose").onclick = close;
    const save = () => {
      const o = {model: $s("sModel").value.trim(), base: $s("sBase").value.trim()};
      const k = $s("sKey").value.trim(); if (k) o.key = k;
      N.saveConfig(JSON.stringify(o)); $s("sKey").value = "";
      $s("sKey").placeholder = cfg().hasKey ? "Ключ сохранён, введи новый, чтобы заменить" : "Вставь ключ";
    };
    $s("sSave").onclick = () => { save(); if (!cfg().hasKey){ msg("Без ключа чат не заработает.", true); return; } msg("Сохранено."); setTimeout(close, 500); if (window.__afterSettings) window.__afterSettings(); };
    $s("sLoad").onclick = async () => {
      save();
      if (!cfg().hasKey){ msg("Сначала вставь ключ.", true); return; }
      msg("Загружаю модели…");
      try {
        const o = JSON.parse(await call("models"));
        const ids = ((o && o.data) || []).map(m => m.id).filter(Boolean).sort();
        const dl = $s("sModels"); dl.replaceChildren(...ids.map(id => { const op = document.createElement("option"); op.value = id; return op; }));
        if (!$s("sModel").value){
          const pick = ids.find(i => /claude.*opus-5/.test(i)) || ids.find(i => /claude.*sonnet/.test(i)) || ids.find(i => /claude/.test(i));
          if (pick) $s("sModel").value = pick;
        }
        const cl = ids.filter(i => /claude/i.test(i));
        msg(`Ключ работает. Моделей: ${ids.length}${cl.length ? ", из них Claude: " + cl.slice(0, 6).join(", ") + (cl.length > 6 ? "…" : "") : ""}. Выбери модель в поле выше.`);
      } catch (e) {
        msg(e && e.code === "auth" ? "Ключ не подошёл." : "Не удалось загрузить список: " + ((e && e.message) || "нет связи"), true);
      }
    };
    $s("sExport").onclick = async () => {
      const data = await exportAll();
      window.__onExported = ok => msg(ok ? "Копия сохранена." : "Копия не сохранена.", !ok);
      N.exportFile("дневник-калорий-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(data));
    };
    $s("sImport").onclick = () => $s("sFile").click();
    $s("sFile").onchange = async () => {
      const f = $s("sFile").files && $s("sFile").files[0]; $s("sFile").value = "";
      if (!f) return;
      try { const n = await importAll(JSON.parse(await f.text())); msg(`Загружено записей: ${n}.`); }
      catch (e) { msg("Этот файл не похож на копию дневника.", true); }
    };
    if (!c.hasKey) setTimeout(() => $s("sKey").focus(), 50);
  }
  window.openSettings = openSettings;

  /* opened from a reminder: jump to the input on today's page */
  window.__focusAdd = () => {
    const t = document.getElementById("foodText"); if (!t) return;
    if (window.__goToday) window.__goToday();
    if (PET() && typeof window.openChat === "function"){ window.openChat(true); setTimeout(() => t.focus(), 50); return; }
    t.scrollIntoView({block: "center"}); t.focus();
  };
  window.__pushToday = o => { try { N.pushToday(JSON.stringify(o)); } catch (e) {} };

  document.addEventListener("DOMContentLoaded", () => {
    const top = document.querySelector(".top");
    /* pixel version: settings live in the pet menu */
    const pm = document.querySelector("#petMenu .modalBox");
    if (pm){
      const h = document.createElement("h3"); h.textContent = "Приложение";
      const p = document.createElement("p"); p.className = "hint"; p.textContent = "Напоминания о еде и копия записей.";
      const b = document.createElement("button"); b.type = "button"; b.className = "small"; b.textContent = "Настройки";
      b.onclick = () => { document.getElementById("petMenu").hidden = true; openSettings(); };
      pm.append(h, p, b);
    }
    if (top){
      const g = document.createElement("button");
      g.type = "button"; g.className = "gear"; g.setAttribute("aria-label", "Настройки");
      g.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
      g.onclick = openSettings;
      const h = top.querySelector("h1"); if (h) h.after(g); else top.append(g);
    }
    if (PET()) setupVoice();
    if (!cfg().hasKey) setTimeout(openSettings, 300);
    if (N.takeAddRequest()) setTimeout(window.__focusAdd, 300);
  });
})();
