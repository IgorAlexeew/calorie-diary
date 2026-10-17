/* ---------- pixel versions of the diary's widgets ---------- */
/* the day's calories: 20 segments, overflow turns the last ones red */
function drawRing(ratio){
  const n = 20, filled = Math.min(n, Math.round(Math.max(0, ratio) * n)), over = ratio > 1 ? Math.min(n, Math.max(1, Math.round((ratio - 1) * n))) : 0;
  const box = $("#kcalSeg"); box.style.setProperty("--c", ratio > 1 ? "var(--warn)" : "var(--ok)");
  segs(box, n, filled, over);
}

/* ---------- screens ---------- */
function showScreen(name){
  const sc = $("#screens"); sc.dataset.screen = name;
  $("#petScreen").inert = name !== "pet"; $("#diaryScreen").inert = name !== "diary";
  if (name === "pet" && cur !== todayKey()){ cur = todayKey(); render(); renderChat(); }
  (name === "pet" ? $("#petScreen") : $("#diaryScreen")).scrollTop = 0;
}
$("#toDiary").innerHTML = pxIcon("book", 20);
$("#toPet").innerHTML = pxIcon("back", 18);
$("#petMenuBtn").innerHTML = pxIcon("menu", 18);
$("#prev").innerHTML = pxIcon("chevL", 14);
$("#next").innerHTML = pxIcon("chevR", 14);
$("#toDiary").onclick = () => showScreen("diary");
$("#toPet").onclick = () => showScreen("pet");

/* ---------- chat sheet ---------- */
$("#chatIco").innerHTML = pxIcon("chat", 18);
$("#attachIco").innerHTML = ICON_CLIP;
$("#chatClose").innerHTML = pxIcon("down", 16);
$("#barMic").innerHTML = pxIcon("mic", 20);
$("#micBtn").innerHTML = pxIcon("mic", 16);
function openChat(open){
  const sh = $("#chatSheet"); sh.dataset.open = String(open);
  $("#sheetShade").hidden = !open;
  $("#chatOpen").setAttribute("aria-expanded", String(open));
  if (open){ const f = $("#feed"); f.scrollTop = f.scrollHeight; renderCookChips(); }
}
$("#chatOpen").onclick = () => openChat(true);
$("#chatClose").onclick = () => openChat(false);
$("#sheetShade").onclick = () => openChat(false);
document.addEventListener("keydown", e => { if (e.key === "Escape"){ openChat(false); closeMenu(); } });
function chatBarPreview(){
  const p = $("#chatPrev"); if (!p) return;
  const msgs = chatMsgs(cur), lastM = msgs[msgs.length - 1];
  p.classList.toggle("busy", chatBusy);
  if (chatBusy) p.textContent = "Думаю…";
  else if (lastM) p.textContent = lastM.role === "user" ? (lastM.text || "Фото") : (lastM.text || "Готово");
  else p.textContent = "Напиши или скажи, что съел";
}

/* ---------- voice messages ----------
   In the Android app native.js provides window.__transcribe(blob) → text (Gemini via odirouter).
   In a browser, the built-in speech recognition is used where it exists. */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let voice = null; /* {kind, rec|mr, chunks, text} */
function setMic(on){ for (const b of [$("#barMic"), $("#micBtn")]){ b.classList.toggle("rec", on); b.setAttribute("aria-label", on ? "Остановить запись" : "Голосовое сообщение"); } }
function voiceErr(t){ setStatus(t, true); openChat(true); }
async function startVoice(){
  if (chatBusy) return;
  if (voice){ stopVoice(); return; }
  openChat(true);
  if (window.__transcribe && navigator.mediaDevices && window.MediaRecorder){
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({audio: true}); }
    catch (e) { voiceErr("Нет доступа к микрофону. Разреши его в настройках."); return; }
    const mr = new MediaRecorder(stream), chunks = [];
    voice = {kind: "rec", mr, chunks};
    mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = async () => {
      stream.getTracks().forEach(t => t.stop()); voice = null; setMic(false);
      const blob = new Blob(chunks, {type: mr.mimeType || "audio/webm"});
      if (blob.size < 2000){ setStatus("Слишком короткая запись.", true); return; }
      setStatus("Распознаю голос…");
      try { const t = str(await window.__transcribe(blob), 2000); setStatus(""); if (t) sendChat(t, true); else setStatus("Не расслышал. Попробуй ещё раз.", true); }
      catch (e) { setStatus("Не получилось распознать голос.", true); }
    };
    mr.start(); setMic(true); setStatus("Говори. Нажми на микрофон ещё раз, чтобы отправить.");
    return;
  }
  if (!SR){ voiceErr("Голосовой ввод в этом окне недоступен. В приложении на телефоне он будет работать через Gemini."); return; }
  const rec = new SR(), ta = $("#foodText"), before = ta.value;
  rec.lang = "ru-RU"; rec.interimResults = true; rec.continuous = true;
  voice = {kind: "sr", rec, text: "", failed: false};
  rec.onresult = e => {
    let t = ""; for (const r of e.results) t += r[0].transcript;
    voice.text = t; ta.value = (before ? before + " " : "") + t; autoGrow();
  };
  rec.onerror = e => {
    if (!voice) return; voice.failed = true;
    voiceErr(e.error === "not-allowed" || e.error === "service-not-allowed" ? "Здесь браузер не даёт доступа к микрофону. В приложении на телефоне голос будет работать через Gemini, а пока напиши текстом." : e.error === "no-speech" ? "Не расслышал. Попробуй ещё раз." : "Голосовой ввод сейчас не сработал.");
  };
  rec.onend = () => {
    const v = voice; voice = null; setMic(false);
    if (!v || v.failed) return;
    setStatus("");
    const t = ta.value.trim();
    if (v.text.trim() && t) sendChat(t, true);
  };
  try { rec.start(); setMic(true); setStatus("Говори. Нажми на микрофон ещё раз, чтобы отправить."); }
  catch (e) { voice = null; voiceErr("Голосовой ввод сейчас не сработал."); }
}
function stopVoice(){ if (!voice) return; if (voice.kind === "rec") voice.mr.stop(); else voice.rec.stop(); }
$("#barMic").onclick = startVoice;
$("#micBtn").onclick = startVoice;

/* ---------- pet menu ---------- */
function closeMenu(){ $("#petMenu").hidden = true; }
$("#pmClose").innerHTML = pxIcon("close", 14);
$("#pmClose").onclick = closeMenu;
$("#petMenu").addEventListener("click", e => { if (e.target === e.currentTarget) closeMenu(); });
$("#petMenuBtn").onclick = () => {
  const info = $("#pmInfo"); info.replaceChildren();
  const s = petStatsNow || petStats(), age = petAge(), stage = petStage(age), br = petBranch(s, stage);
  const rows = pet ? [["Имя", pet.name], ["Характер", pet.trait || "—"], ["Стадия", `${STAGE_RU[stage]}, дней с записями: ${age}`],
    ["Ветка", br ? `${BRANCH_RU[br][0]}: ${BRANCH_RU[br][1]}` : "появится с 7 дней"], ["Опыт", `${petXp()}, уровень ${petLevel(petXp())}`],
    ["Поколение", String(pet.gen || 1)]] : [["Яйцо", "вылупится после первой записи еды"]];
  const dl = el("dl",{class:"pmInfo"}); for (const [a, b] of rows) dl.append(el("dt",{text:a}), el("dd",{text:b}));
  info.append(dl);
  $("#petMenu").hidden = false;
};
const DEMO = [["Ест","eat"],["Играет с мячом","play","ball"],["Танцует","play","dance"],["Радуется","happy"],["Грустит","sad"],["Голоден","hungry"],["Болеет","sick"],["Спит","sleep"],["Спячка","hibernate"]];
for (const [t, st, toy] of DEMO){
  const b = el("button",{type:"button",text:t});
  b.onclick = () => { if (!pet) return; petDemo = {state: st, toy, until: Date.now() + 6000, dur: 6000, food: st === "eat" ? pick(Object.keys(PetEngine.FOOD)) : null}; setLine(localLine(petStatsNow, st)); closeMenu(); showScreen("pet"); };
  $("#pmDemo").append(b);
}
/* preview any age and branch; stays until "Как сейчас" */
const AGES = [["Как сейчас", null], ["Малыш", {stage: "baby", branch: ""}], ["Юный", {stage: "young", branch: "balanced"}], ["Взрослый", {stage: "adult", branch: "balanced"}],
  ...["athlete", "donut", "slim", "lazy", "grump"].map(b => [BRANCH_RU[b][0], {stage: "adult", branch: b, fat: b === "donut" ? 85 : b === "slim" ? 20 : 50, muscle: b === "athlete" ? 80 : 40}])];
AGES.forEach(([t, v], i) => {
  const b = el("button",{type:"button",text:t});
  if (!i) b.classList.add("on");
  b.onclick = () => { petLookDemo = v; $("#pmAge").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); closeMenu(); showScreen("pet"); };
  $("#pmAge").append(b);
});
(() => {
  const b = $("#pmReroll"); let t;
  b.onclick = () => {
    if (!db) return;
    if (!b.classList.contains("arm")){ b.classList.add("arm"); b.textContent = "Точно? Нажми ещё раз"; t = setTimeout(() => { b.classList.remove("arm"); b.textContent = "Переродить зверька"; }, 4000); return; }
    clearTimeout(t); b.classList.remove("arm"); b.textContent = "Переродить зверька";
    closeMenu(); lineKey = ""; hatchPet();
  };
})();

/* ---------- tapping the pet ---------- */
$("#petCv").parentElement.onclick = () => {
  if (!pet){ if (!hatching){ petEvt = {state: "idle", until: Date.now() + 800}; setLine(localLine(petStatsNow || {}, "idle")); } return; }
  const st = petStatsNow ? petState(petStatsNow) : "idle";
  if (st === "sleep" || st === "hibernate"){ setLine(st === "sleep" ? "Хр-р… Не буди, я сплю." : "Хр-р… Запиши еду, и я проснусь."); return; }
  petEvent("happy", 1600);
  requestLine("tap", Date.now() - lineAt > 15000);
};

/* ---------- the animation loop: 6 frames a second, like old consoles ---------- */
(() => {
  const ctx = $("#petCv").getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let f = 0, lastTag = "";
  try { const l = JSON.parse(localStorage.getItem("petLine") || "null"); if (l && l.d === todayKey() && l.t) setLine(l.t); } catch (e) {}
  function tick(){
    const {pet: p, look} = petLook();
    /* size the world to the screen; the ground lies just under the free space between the HUD panels */
    const cv = $("#petCv"), wr = $("#world").getBoundingClientRect(), dpr = Math.min(3, devicePixelRatio || 1);
    if (wr.width && wr.height){
      const S = Math.max(2, Math.floor(Math.min(wr.width, 520) * dpr / 50)), W = Math.ceil(wr.width * dpr / S), H = Math.ceil(wr.height * dpr / S);
      if (cv.width !== W * S || cv.height !== H * S){ cv.width = W * S; cv.height = H * S; cv.style.width = W * S / dpr + "px"; cv.style.height = H * S / dpr + "px"; }
      const sp = $("#petSpace").getBoundingClientRect(), ground = Math.max(32, Math.min(H - 2, Math.round((sp.bottom - wr.top) * dpr / S)));
      PetEngine.draw(ctx, p, look, f, {scale: S, W, H, ground});
    }
    const tag = look.stage === "egg" ? "" : (look.toy === "dance" && look.state === "play" ? "Танцует" : STATE_TAG[look.state] || "");
    if (tag !== lastTag){ const t = $("#sceneTag"); t.hidden = !tag; t.textContent = tag; lastTag = tag; }
    f++;
  }
  tick();
  setInterval(() => { if (!reduce || f % 6 === 0) tick(); else f++; }, 160);
  /* time moves on: hunger, night, hibernation */
  setInterval(() => { if (typeof days !== "undefined") petOnRender(); }, 60000);
})();
chatBarPreview();

/* ---------- chat hints written by the AI: one or two, from the time, the day and the latest messages ---------- */
let aiChips = null, aiChipsKey = "", aiChipsBusy = false;
function chipsKey(){
  const msgs = chatMsgs(cur), last = msgs[msgs.length - 1];
  return [cur, last ? last.id : "-", dayEntries(cur).length, stepsOf(cur), Math.floor(new Date().getHours() / 2)].join("|");
}
function localChips(){
  return cookChipList(dayContext(cur)).slice(0, 2).map(ch => ch.q ? {label: ch.q, send: ch.q} : {label: ch.label, text: ch.fill.replace("  ", " ")});
}
function renderCookChips(){
  const box = $("#cookChips"); box.replaceChildren();
  if (chatBusy || $("#chatSheet").dataset.open !== "true") return;
  const key = chipsKey();
  if (key !== aiChipsKey) loadChips(key);
  if (aiChipsBusy && !aiChips) return;
  for (const ch of aiChips || []){
    const b = el("button",{type:"button",class:"chip" + (ch.text ? " ghost" : ""),text: ch.label});
    b.onclick = () => {
      if (ch.send){ sendChat(ch.send); return; }
      const t = $("#foodText"); t.value = ch.text; autoGrow(); t.focus();
      const i = t.value.indexOf("…"); if (i >= 0) t.setSelectionRange(i, i + 1); else t.setSelectionRange(t.value.length, t.value.length);
    };
    box.append(b);
  }
}
async function loadChips(key){
  aiChipsKey = key; aiChips = null;
  try { const c = JSON.parse(localStorage.getItem("petChips") || "null"); if (c && c.key === key && Array.isArray(c.chips)){ aiChips = c.chips; return; } } catch (e) {}
  if (!sample){ aiChips = localChips(); return; }
  aiChipsBusy = true; renderCookChips();
  const c = dayContext(cur), s = petStatsNow || petStats(), st = pet ? petState(s) : "egg";
  const msgs = chatMsgs(cur).slice(-6).map(m => (m.role === "user" ? "Человек: " : "Помощник: ") + str(m.text, 160) + ((m.actions || []).length ? " [" + m.actions.map(actionSummary).filter(Boolean).join("; ") + "]" : "")).join("\n");
  const prompt = `Ты подбираешь подсказки-кнопки над полем ввода в чате дневника питания. Нажатие кнопки либо сразу отправляет фразу в чат, либо вставляет заготовку, которую человек допишет.
Сейчас ${c.time}, день: ${c.isToday ? "сегодня" : label(cur)}. Съедено ${c.eatenKcal} из ${c.target} ккал, осталось ${c.left}. Белок ${c.p} из ${c.gp} г, жиры ${c.f} из ${c.gf} г.
${c.detail.length ? "Записи дня: " + c.detail.map(x => x.replace(/^\[[^\]]*\]\s*/, "").split(". Блюда")[0]).join("; ") : "Записей за день нет."}
${c.sinceH != null ? `Последний приём ${fmtH(c.sinceH)} назад.` : ""} ${c.sleepH != null ? `До сна ~${fmtH(c.sleepH)}.` : ""} Шаги: ${c.steps ? c.steps : "не записаны"}. Вес последний раз записан: ${Object.keys(weights).sort().pop() || "никогда"}.
Питомец: ${pet ? pet.name + ", " + (STATE_RU[st] || st) : "ещё яйцо"}; здоровье ${s.health}, сытость ${s.food}, настроение ${s.mood}.
Последние сообщения в чате:
${msgs || "(чат пуст)"}
Придумай 1–2 самые полезные подсказки именно сейчас, разные по смыслу и не повторяющие то, что человек уже сделал. Примеры типов: записать приём пищи, который по времени, скорее всего, был; спросить идею на ближайший приём под остаток ккал и белка; записать шаги вечером, если их нет; записать вес, если давно не взвешивался; уточнить запись из чата.
Ответь только JSON: {"chips":[{"label":"текст на кнопке, до 40 символов","send":"фраза, которая уйдёт в чат"} или {"label":"…","text":"заготовка для поля ввода, место для числа отметь символом …"}]}`;
  try {
    const r = await sample.json(prompt, {modelTier:"quick", cache:false});
    const list = (r && Array.isArray(r.chips) ? r.chips : []).slice(0, 2).map(x => {
      const lab = str(x && x.label, 48);
      if (!lab) return null;
      if (x.text) return {label: lab, text: str(x.text, 200)};
      return {label: lab, send: str(x.send, 300) || lab};
    }).filter(Boolean);
    if (aiChipsKey === key){ aiChips = list.length ? list : localChips(); try { localStorage.setItem("petChips", JSON.stringify({key, chips: aiChips})); } catch (e) {} }
  } catch (e) {
    if (aiChipsKey === key) aiChips = localChips();
  } finally { aiChipsBusy = false; if (aiChipsKey === key) renderCookChips(); }
}
