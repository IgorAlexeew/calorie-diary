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
  $("#diaryScreen").scrollTop = 0;
  if (name === "diary") $("#toPet").focus();
}
$("#toDiary").innerHTML = pxIcon("book", 20);
$("#toPet").innerHTML = pxIcon("close", 16);
$("#petMenuBtn").innerHTML = pxIcon("menu", 18);
$("#prev").innerHTML = pxIcon("chevL", 14);
$("#next").innerHTML = pxIcon("chevR", 14);
$("#toDiary").onclick = () => showScreen("diary");
$("#toPet").onclick = () => showScreen("pet");
/* the diary modal closes on its back button, a tap outside it, or Escape */
$("#diaryScreen").addEventListener("click", e => { if (e.target === e.currentTarget) showScreen("pet"); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && $("#screens").dataset.screen === "diary") showScreen("pet"); });

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
  else if (petPending){ const e = petPending; petPending = null; setTimeout(() => petEvent(...e), 250); }
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
  const rows = pet ? [["Имя", pet.name], ["Характер", pet.trait || "—"], ["Если тыкать", TOUCH[petTouch()].ru.split(":")[0]], ["Стадия", `${STAGE_RU[stage]}, дней с записями: ${age}`],
    ["Ветка", br ? `${BRANCH_RU[br][0]}: ${BRANCH_RU[br][1]}` : "появится с 7 дней"], ["Опыт", `${petXp()}, уровень ${petLevel(petXp())}`],
    ["Поколение", String(pet.gen || 1)]] : [["Яйцо", "вылупится после первой записи еды"]];
  const dl = el("dl",{class:"pmInfo"}); for (const [a, b] of rows) dl.append(el("dt",{text:a}), el("dd",{text:b}));
  if (pet && petWords.length) dl.append(el("dt",{text:"Словарик"}), el("dd",{class:"pmWords", text: petWords.map(x => `${x.w} — ${x.m}`).join(", ")}));
  info.append(dl);
  $("#petMenu").hidden = false;
};
/* preview: state, age and time of day combine freely and stay until "Как сейчас" in that row */
function pmRow(box, items, apply){
  items.forEach(([t, v], i) => {
    const b = el("button",{type:"button",text:t});
    if (!i) b.classList.add("on");
    b.onclick = () => { if (!pet) return; apply(v); box.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); closeMenu(); showScreen("pet"); };
    box.append(b);
  });
}
const DEMO = [["Как сейчас",null],["Хохочет",["tickle"]],["Злится",["angry"]],["Смущается",["shy"]],["Ест",["eat"]],["Играет с мячом",["play","ball"]],["Танцует",["play","dance"]],["Радуется",["happy"]],["Грустит",["sad"]],["Голоден",["hungry"]],["Болеет",["sick"]],["Спит",["sleep"]],["Спячка",["hibernate"]]];
pmRow($("#pmDemo"), DEMO, v => {
  if (!v){ petDemo = null; lineKey = ""; petOnRender(); return; }
  const [st, toy] = v;
  petDemo = {state: st, toy, until: Infinity, start: Date.now(), dur: 6000, loop: true, food: st === "eat" ? pick(Object.keys(PetEngine.FOOD)) : null};
  setLine(localLine(petStatsNow, st));
});
pmRow($("#pmTime"), [["Как сейчас", null], ["Утро", "morning"], ["День", "day"], ["Вечер", "evening"], ["Ночь", "night"]], v => { petTimeDemo = v; });
/* the folded HUD panels: one open at a time, remembered between visits */
(() => {
  const pairs = [["#tglFood", "#foodPanel"], ["#tglStats", "#statsPanel"]];
  $("#tglFoodIco").innerHTML = pxIcon("apple", 16); $("#tglFoodIco").style.setProperty("--c", "var(--s-food)");
  const open = id => {
    for (const [b, p] of pairs){ const on = p === id && $(p).hidden; $(p).hidden = !on; $(b).setAttribute("aria-expanded", on); }
    try { localStorage.setItem("petPanel", pairs.some(([, p]) => !$(p).hidden) ? id : ""); } catch (e) {}
  };
  pairs.forEach(([b, p]) => $(b).onclick = () => open(p));
  try { const v = localStorage.getItem("petPanel"); if (v && pairs.some(([, p]) => p === v)) open(v); } catch (e) {}
})();
/* preview any age and branch; stays until "Как сейчас" */
const AGES = [["Как сейчас", null], ["Малыш", {stage: "baby", branch: ""}], ["Юный", {stage: "young", branch: "balanced"}], ["Взрослый", {stage: "adult", branch: "balanced"}],
  ...["athlete", "donut", "slim", "lazy", "grump"].map(b => [BRANCH_RU[b][0], {stage: "adult", branch: b, fat: b === "donut" ? 85 : b === "slim" ? 20 : 50, muscle: b === "athlete" ? 80 : 40}])];
pmRow($("#pmAge"), AGES, v => { petLookDemo = v; });
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
let pokes = [], lastPokeLine = 0;
$("#petCv").parentElement.onclick = () => {
  if (!pet){ if (!hatching){ petEvt = {state: "idle", until: Date.now() + 800}; setLine(localLine(petStatsNow || {}, "idle")); } return; }
  const st = petStatsNow ? petState(petStatsNow) : "idle";
  if (st === "sleep" || st === "hibernate"){
    const now = Date.now();
    if (!sayShown() || now - lastPokeLine > 8000){ lastPokeLine = now; setLine(localLine(petStatsNow, st)); }
    return;
  }
  /* a single tap is a pat; three or more quick taps get the pet's own reaction */
  const now = Date.now();
  pokes = pokes.filter(t => now - t < 2500); pokes.push(now); petPokes = pokes.length;
  /* taps and pokes take the day's AI-written lines, so they cost no request */
  if (pokes.length < 3){ petEvent("happy", 1600); if (!sayShown() || now - lastPokeLine > 8000){ lastPokeLine = now; setLine(localLine(petStatsNow, "happy")); } return; }
  const r = TOUCH[petTouch()];
  petEvent(r.state, 2600);
  if (!lineBusy && now - lastPokeLine > 2500){ lastPokeLine = now; setLine(localLine(petStatsNow, r.state)); }
};

/* ---------- the animation loop: 6 frames a second, like old consoles ---------- */
(() => {
  const ctx = $("#petCv").getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let f = 0, lastTag = "", skyT = null;
  try { const l = JSON.parse(localStorage.getItem("petLine") || "null"); if (l && l.d === todayKey() && l.t) setLine(l.t, false, true); } catch (e) {}
  /* the top row of the pet's head when standing still, cached per look */
  let headKey = "", headVal = 4;
  function headRow(p, look){
    const key = JSON.stringify([p, look.stage, look.branch, look.fat > 70, look.fat < 30]);
    if (key !== headKey){
      headKey = key;
      if (look.stage === "egg") headVal = 10;
      else { const g = PetEngine.sprite(p, {...look, state: "idle", moving: false}, 1); headVal = g.findIndex(r => r.some(Boolean)); if (headVal < 0) headVal = 4; }
    }
    return headVal;
  }
  /* which food the line is about: the pet's own words first, then the food names */
  function sayFood(t){
    const s = String(t || "").toLowerCase();
    if (/мясик|мяс/.test(s)) return "meat"; if (/яйк|яйц/.test(s)) return "egg"; if (/сятк|сладк|слатк/.test(s)) return "cake";
    if (/ягодк|ягод/.test(s)) return "berry"; if (/фьукт|флукт|фрукт|ябвок|ябл/.test(s)) return "apple";
    const n = PetEngine.foodFor(s); return n === "bowl" && !/кас|каш/.test(s) ? null : n;
  }
  let sayIcoKey = "";
  function sayFoodIcon(name){
    const c = $("#petSayIco"); if ((name || "") === sayIcoKey) return;
    sayIcoKey = name || ""; c.hidden = !name; if (!name) return;
    const x = c.getContext("2d"); x.clearRect(0, 0, 40, 40); PetEngine.drawFood(x, name, 1, 1, 4, 0);
  }
  function tick(){
    const {pet: p, look} = petLook();
    /* size the world to the screen; the ground lies just under the free space between the HUD panels */
    const cv = $("#petCv"), wr = $("#world").getBoundingClientRect(), dpr = Math.min(3, devicePixelRatio || 1);
    if (wr.width && wr.height){
      const S = Math.max(2, Math.floor(Math.min(wr.width, 520) * dpr / 50)), W = Math.ceil(wr.width * dpr / S), H = Math.ceil(wr.height * dpr / S);
      if (cv.width !== W * S || cv.height !== H * S){ cv.width = W * S; cv.height = H * S; cv.style.width = W * S / dpr + "px"; cv.style.height = H * S / dpr + "px"; }
      /* the pet stands a little below the top block, never lower than the free space */
      const sp = $("#petSpace").getBoundingClientRect(), toLog = y => Math.round((y - wr.top) * dpr / S);
      /* room for a two-line bubble is kept above the head whether the pet talks or not, so the pet does not jump */
      const say = $("#petSay"), sayH = 92, head = headRow(p, look);
      /* room above the head for the speech bubble, then the pet, then the ground */
      const ground = Math.max(32, Math.min(H - 2, toLog(sp.bottom), toLog(sp.top) + Math.ceil(sayH * dpr / S) + 34 - head + 2));
      const skyTop = toLog($(".topCard").getBoundingClientRect().bottom);
      /* day and night swap through a sunset, one step every few frames */
      const want = {morning: .5, day: 0, evening: .5, night: 1}[look.tod] ?? (look.night ? 1 : 0);
      if (skyT === null) skyT = want; else if (skyT !== want) skyT = want > skyT ? Math.min(want, skyT + 1 / 64) : Math.max(want, skyT - 1 / 64);
      const at = PetEngine.draw(ctx, p, look, f, {scale: S, W, H, ground, skyTop, sky: skyT, dawn: look.tod === "morning", noThought: true});
      /* a hungry pet shows what it wants inside its own speech bubble, one component with the words */
      sayFoodIcon(look.state === "hungry" ? sayFood($("#petSayText").textContent) || look.food || "apple" : null);
      /* the bubble sits up and to the side of the head, on the side with more room, its tail coming out of its side towards the mouth;
         with no room at either side it sits over the head and the tail comes out of its bottom. It follows the pet as it walks and hops */
      const hr = $("#hud").getBoundingClientRect(), k = S / dpr, ox0 = wr.left - hr.left;
      const headY = at ? wr.top + at.y * k - hr.top : wr.top + (ground - 30 + head) * k - hr.top;
      const cx = at ? ox0 + (at.x + .5) * k : ox0 + (Math.floor((W - 48) / 2) + 24) * k;
      const hw = at && at.l != null ? (at.r - at.l) * k / 2 : 12 * k, tipX = hw * .45;
      const roomR = hr.width - 12 - (cx + tipX + 21), roomL = cx - tipX - 21 - 12, MIN = 150;
      const side = Math.max(roomR, roomL) >= MIN;
      /* where both sides fit, it stays where it was, so it does not jump from side to side as the pet walks */
      const right = roomR >= MIN && roomL >= MIN ? !say.classList.contains("sideL") : roomR >= roomL;
      say.classList.toggle("sideL", !right); say.classList.toggle("above", !side);
      say.style.maxWidth = Math.round(side ? Math.min(300, right ? roomR : roomL) : Math.min(300, hr.width - 24)) + "px";
      const bw = say.offsetWidth, bh = say.offsetHeight;
      let left, top;
      if (side){
        left = right ? cx + tipX + 21 : cx - tipX - 21 - bw;
        top = headY - 10 - bh;
      } else {
        left = Math.max(12, Math.min(hr.width - 12 - bw, cx - bw / 2));
        /* the tip lands just above the head, a little to the side of the middle, pointing down to the mouth */
        const tl = right ? cx + tipX * .5 - left - 5 : cx - tipX * .5 - left - 25;
        say.style.setProperty("--tl", Math.round(Math.max(0, Math.min(bw - 30, tl))) + "px");
        top = headY - 18 - bh;
      }
      top = Math.max(sp.top - hr.top, top);
      say.style.top = Math.round(top) + "px"; say.style.left = Math.round(left) + "px";
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

/* ---------- when the pet talks by itself ----------
   Besides answering taps, meals and changes of state, the pet says something now and then while its screen is open:
   every 2–5 minutes a line from the day's AI-written set, at most every 15 minutes a fresh AI line about the moment
   (meal time and nothing logged for hours, late night, or just how it feels). Asleep, it mumbles half as often. */
(() => {
  let next = Date.now() + 2500;
  const gap = () => (120 + Math.random() * 180) * 1000;
  setInterval(() => {
    const now = Date.now();
    if (now - sayAt < 20000 && sayAt) next = Math.max(next, sayAt + gap());
    if (now < next || document.hidden || petListening || sayShown() || lineBusy) return;
    if ($("#screens").dataset.screen !== "pet" || $("#chatSheet").dataset.open === "true" || !$("#petMenu").hidden) return;
    next = now + gap();
    const s = petStatsNow || {};
    if (!pet){ if (!hatching) setLine(localLine(s, "idle")); return; }
    if (petDemo){ setLine(localLine(s, petDemo.state)); return; }
    const st = petState(s), h = new Date().getHours(), asleep = st === "sleep" || st === "hibernate";
    if (asleep && Math.random() < .5) return;
    if (sample && now - lineAt > 15 * 60000){
      const meal = (h >= 8 && h < 10) || (h >= 13 && h < 15) || (h >= 18 && h < 20);
      requestLine(asleep ? "timer" : meal && !(s.sinceH < 3) ? "meal" : h >= 23 || h < 5 ? "late" : "timer", true);
    } else setLine(localLine(s, st));
  }, 4000);
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
