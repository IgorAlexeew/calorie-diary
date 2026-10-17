/* ---------- the pet: stats from the diary, its state, AI lines, hatching ---------- */
let pet = null, petLoaded = false, hatching = null;
let petDemo = null, petEvt = null, petStatsNow = null, petLookDemo = null;
const STAT_DEFS = [
  {k:"health", label:"Здоровье",   icon:"heart",    c:"var(--s-health)"},
  {k:"shape",  label:"Форма",      icon:"scale",    c:"var(--s-shape)"},
  {k:"muscle", label:"Мышцы",      icon:"dumbbell", c:"var(--s-muscle)"},
  {k:"mood",   label:"Настроение", icon:"smile",    c:"var(--s-mood)"},
  {k:"food",   label:"Сытость",    icon:"apple",    c:"var(--s-food)"}
];
const STAGE_RU = {baby:"Малыш", young:"Юный", adult:"Взрослый"};
const BRANCH_RU = {
  balanced: ["Здоровяк", "калории в норме большую часть недели"],
  athlete:  ["Атлет", "норма, белок от 90 % и много шагов"],
  donut:    ["Пончик", "в среднем перебор калорий больше 10 %"],
  slim:     ["Тростинка", "в среднем недобор больше 25 %"],
  lazy:     ["Лежебока", "в среднем меньше 3000 шагов"],
  grump:    ["Ворчун", "здоровье ниже 40"]
};
const STATE_RU = {idle:"спокоен", play:"играет, потому что ему хорошо", eat:"ест то, что хозяин только что записал", happy:"радуется, его погладили",
  sad:"грустит из-за перебора калорий", hungry:"голоден", sick:"болеет", sleep:"спит", hibernate:"в спячке, потому что три дня не было записей"};
const STATE_TAG = {play:"Играет", eat:"Ест", happy:"Радуется", sad:"Грустит", hungry:"Голоден", sick:"Болеет", sleep:"Спит", hibernate:"Спячка"};
const clamp = (v, a, b) => Math.max(a == null ? 0 : a, Math.min(b == null ? 100 : b, v));
const pick = a => a[Math.floor(Math.random() * a.length)];

function dayEntries(k){ return (days[k] && days[k].entries) || []; }
function isLogged(k){ return dayEntries(k).length > 0; }
function lastLoggedKey(){ let best = null; for (const k in days) if (isLogged(k) && (!best || k > best)) best = k; return best; }
function streakDays(){ let k = todayKey(), n = 0; if (!isLogged(k)) k = shift(k, -1); while (isLogged(k) && n < 999){ n++; k = shift(k, -1); } return n; }
/* one finished day, 0..100: calories in the corridor, protein, steps; an empty day is a bad day */
function dayScore(k){
  if (!isLogged(k)) return 25;
  const t = totals(dayEntries(k)), g = targets(k), r = t.kcal / g.kcal, pr = t.p / g.p, st = stepsOf(k);
  let s = r >= .85 && r <= 1.05 ? 60 : r >= .75 && r <= 1.15 ? 40 : 15;
  s += pr >= .8 ? 25 : pr >= .6 ? 12 : 0;
  s += st >= 7000 ? 15 : st >= 4000 ? 8 : 0;
  return clamp(s);
}
function petStats(){
  const today = todayKey(), now = new Date(), hour = now.getHours() + now.getMinutes() / 60;
  const past = []; for (let i = 1; i <= 7; i++) past.push(shift(today, -i));
  const tt = totals(dayEntries(today)), tg = targets(today), tr = tt.kcal / tg.kcal;
  const logged = past.filter(isLogged);
  /* health: last 7 days, recent ones weigh more */
  /* days before the very first record don't count against a new player */
  let first = null; for (const k in days) if (isLogged(k) && (!first || k < first)) first = k;
  let hs = 0, hw = 0; past.forEach((k, i) => { if (!first || k < first) return; const w = 8 - i; hs += dayScore(k) * w; hw += w; });
  let health = hw ? hs / hw : 70;
  if (tr > 1.15) health -= 10;
  /* shape: average intake against the norm; 50 on the fat axis is the middle of the corridor */
  const ratios = logged.map(k => totals(dayEntries(k)).kcal / targets(k).kcal);
  if (hour >= 20 && isLogged(today)) ratios.push(tr);
  const avgR = ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : .95;
  const fat = clamp(50 + (avgR - .95) * 200);
  const shape = clamp(100 - Math.abs(fat - 50) * 2.2);
  /* muscle: protein and steps */
  const prs = logged.map(k => Math.min(1.2, totals(dayEntries(k)).p / targets(k).p));
  const avgP = prs.length ? prs.reduce((a, b) => a + b, 0) / prs.length : .6;
  const stepList = past.map(stepsOf).filter(x => x > 0);
  const avgSteps = stepList.length ? stepList.reduce((a, b) => a + b, 0) / stepList.length : 0;
  const muscle = clamp(avgP * 70 + Math.min(1, avgSteps / 10000) * 30);
  /* mood: the streak and how today goes */
  const streak = streakDays();
  const mood = clamp(Math.min(streak, 7) / 7 * 45 + (isLogged(today) ? 30 : hour < 11 ? 25 : 10) + (tr <= 1.05 ? 25 : tr <= 1.15 ? 10 : 0));
  /* satiety: hours since the last meal, and how much is eaten for this time of day */
  const c = dayContext(today), expected = clamp((hour - 8) / 13, 0, 1);
  let food = c.sinceH == null ? (hour < 9 ? 60 : 20) : clamp(100 - Math.max(0, c.sinceH - 1) * 16);
  if (tr > expected + .25) food = Math.max(food, 85);
  if (tr < expected - .35 && hour >= 13) food = Math.min(food, 35);
  const last = lastLoggedKey();
  return {health: Math.round(clamp(health)), shape: Math.round(shape), muscle: Math.round(muscle), mood: Math.round(mood), food: Math.round(food),
    fat, avgR, avgP, avgSteps, stepDays: stepList.length, streak, idleDays: last ? Math.round(dayNum(today) - dayNum(last)) : null,
    tr, hour, today, eaten: tt.kcal, target: tg.kcal, p: round(tt.p), gp: tg.p, left: tg.kcal - tt.kcal, sinceH: c.sinceH, lastTitle: c.lastTitle};
}
function petAge(){ if (!pet) return 0; let n = 0; const t = todayKey(); for (const k in days) if (k >= pet.born && k <= t && isLogged(k)) n++; return n; }
function petXp(){
  if (!pet) return 0; let xp = 0; const t = todayKey();
  for (const k in days){
    if (k < pet.born || k > t || !isLogged(k)) continue;
    const tot = totals(dayEntries(k)), g = targets(k), r = tot.kcal / g.kcal;
    xp += 10 + (r >= .85 && r <= 1.05 ? 15 : 0) + (tot.p >= g.p * .8 ? 5 : 0);
  }
  return xp;
}
const petLevel = xp => 1 + Math.floor(xp / 80);
const petStage = age => age < 7 ? "baby" : age < 21 ? "young" : "adult";
function petBranch(s, stage){
  if (stage === "baby") return "";
  if (s.health < 40) return "grump";
  if (s.avgR > 1.10) return "donut";
  if (s.avgR < .75) return "slim";
  if (s.avgP >= .9 && s.avgSteps >= 8000) return "athlete";
  if (s.stepDays >= 3 && s.avgSteps < 3000) return "lazy";
  return "balanced";
}
/* asleep from bedtime (midnight if unknown) till 7:00 */
function isNight(hour){
  const bt = /^(\d{1,2}):(\d{2})$/.exec(settings.bedtime || "");
  let b = bt ? +bt[1] + +bt[2] / 60 : 0; if (b < 12) b += 24;
  const h = hour < 12 ? hour + 24 : hour;
  return h >= b && h < 31;
}
function petState(s){
  const now = Date.now();
  if (petDemo && petDemo.until > now) return petDemo.state;
  if (petEvt && petEvt.until > now) return petEvt.state;
  if (s.idleDays != null && s.idleDays >= 3 && !isLogged(s.today)) return "hibernate";
  if (isNight(s.hour)) return "sleep";
  if (s.health < 30) return "sick";
  if (s.food < 25) return "hungry";
  if (s.tr > 1.1) return "sad";
  if (s.mood >= 65 && s.health >= 55) return "play";
  return "idle";
}
function petToy(){ if (petDemo && petDemo.until > Date.now() && petDemo.toy) return petDemo.toy; return Math.floor(Date.now() / 30000) % 2 ? "dance" : "ball"; }
function petEvent(state, ms, food){
  const dur = ms || 4500;
  petEvt = {state, until: Date.now() + dur, dur, food};
  if (state === "eat") setTimeout(() => requestLine("eat", true), 700);
}

/* ---------- lines written by the AI ---------- */
let lineAt = 0, lineBusy = false, lineKey = "";
function setLine(t, loading){
  $("#petSayText").textContent = t;
  $("#petSay").classList.toggle("loading", !!loading);
  if (!loading) try { localStorage.setItem("petLine", JSON.stringify({t, d: todayKey()})); } catch (e) {}
}
function localLine(s, st){
  if (!pet) return hatching ? "Тук-тук… Кто-то вылупляется!" : "Запиши первую еду в чат, и я вылуплюсь.";
  switch (st){
    case "hibernate": return "Хр-р… Запиши еду, и я проснусь.";
    case "sleep": return "Хр-р… До завтра.";
    case "eat": return "Хрум-хрум! Спасибо!";
    case "hungry": return "Где моя еда? Я голоден.";
    case "sad": return `Перебор на ${-s.left} ккал. Живот тяжёлый…`;
    case "sick": return "Мне нехорошо. Давай поедим по норме?";
    case "play": return "Играю! Мне сегодня хорошо.";
    default: return s.left > 0 ? `До нормы ещё ${s.left} ккал.` : "На сегодня хватит еды.";
  }
}
async function requestLine(reason, force){
  if (!pet || !sample || lineBusy || !petStatsNow) return;
  if (petDemo && petDemo.until > Date.now()) return;
  if (!force && Date.now() - lineAt < 90000) return;
  lineBusy = true; lineAt = Date.now();
  const s = petStatsNow, st = petState(s), stage = petStage(petAge()), br = petBranch(s, stage);
  const why = {eat:"хозяин только что записал еду", tap:"хозяин тебя погладил", state:"твоё состояние изменилось", open:"хозяин открыл приложение", hatch:"ты только что вылупился"}[reason] || "просто так";
  const prompt = `Ты — ${pet.name}, 8-битный питомец в дневнике питания хозяина. Характер: ${pet.trait || "добрый и любопытный"}. Стадия: ${STAGE_RU[stage]}${br ? ", ветка развития «" + BRANCH_RU[br][0] + "»" : ""}.
Сейчас ${new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}. Ты ${STATE_RU[st] || "спокоен"}.
Шкалы от 0 до 100: здоровье ${s.health}, форма ${s.shape}, мышцы ${s.muscle}, настроение ${s.mood}, сытость ${s.food}.
Сегодня хозяин съел ${s.eaten} из ${s.target} ккал, белок ${s.p} из ${s.gp} г${s.lastTitle ? `, последняя еда — «${s.lastTitle}» ${fmtH(s.sinceH)} назад` : ", еды сегодня ещё не было"}. Дней подряд с записями: ${s.streak}.
Повод для реплики: ${why}.
Напиши одну реплику питомца хозяину от первого лица, по-русски, не длиннее 90 символов. Живо, с характером, по-доброму, с одной конкретной деталью из дня (сколько осталось, чего не хватает, что было вкусно). Без эмодзи, кавычек и хэштегов. Ответь только репликой.`;
  setLine($("#petSayText").textContent, true);
  try {
    const r = await sample(prompt, {modelTier:"quick", cache:false});
    const t = str(r && r.text, 160).replace(/^["«„]+|["»“]+$/g, "").split("\n")[0].trim();
    setLine(t || localLine(s, st));
  } catch (e) {
    setLine(localLine(s, st));
  } finally { lineBusy = false; }
}

/* ---------- hatching: the AI picks parts from the templates ---------- */
/* parts are rolled by chance (the AI kept choosing the same green sprout); the AI names the pet and gives it a character */
async function genPetAI(parts){
  if (!sample) return null;
  const prompt = `Ты придумываешь характер 8-битному питомцу из игры-дневника питания. Детали уже выпали случайно:
тело ${parts.body}, уши или макушка ${parts.ears}, глаза ${parts.eyes}, рот ${parts.mouth}, хвост ${parts.tail}, узор ${parts.pattern}, цвет ${parts.palette}.
Придумай имя, которое подходит к этому облику, характер и первую фразу. Случайное число для разнообразия: ${Math.floor(Math.random() * 1e6)}.
Ответь только JSON: {"name":"короткое русское имя, одно слово до 10 букв, можно съедобное","trait":"характер, 3–6 слов","greeting":"первая фраза хозяину, до 80 символов"}`;
  const r = await sample.json(prompt, {modelTier:"quick", cache:false});
  return r && typeof r === "object" ? cleanPet({...parts, name: r.name, trait: r.trait, greeting: r.greeting}) : null;
}
function cleanPet(r){
  const P = PetEngine.PARTS, out = {};
  for (const k in P) out[k] = P[k].includes(r && r[k]) ? r[k] : pick(P[k]);
  out.name = str(r && r.name, 14).replace(/[^\p{L}\- ]/gu, "").trim() || pick(PetEngine.NAMES);
  out.trait = str(r && r.trait, 60);
  out.greeting = str(r && r.greeting, 120);
  out.born = /^\d{4}-\d{2}-\d{2}$/.test(r && r.born) ? r.born : todayKey();
  out.gen = Math.max(1, round(r && r.gen) || 1);
  return out;
}
async function hatchPet(){
  if (hatching || !db) return;
  const gen = (pet && pet.gen || 0) + 1;
  hatching = {start: Date.now(), palette: pick(PetEngine.PARTS.palette)};
  pet = null; petOnRender();
  const parts = PetEngine.randomPet(); delete parts.name; parts.palette = hatching.palette;
  let p = null;
  try { p = await genPetAI(parts); } catch (e) {}
  if (!p) p = cleanPet({...parts, trait: pick(["любопытный, обожает хрустящее", "соня и сладкоежка", "бодрый, любит овощи", "ворчит, но добрый"])});
  const wait = hatching.start + 2800 - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  /* credit the last two weeks so a diary with history doesn't start from zero */
  let born = todayKey(); for (let i = 1; i <= 14; i++){ const k = shift(todayKey(), -i); if (isLogged(k)) born = k; }
  pet = {...p, born, gen, created: new Date().toISOString()};
  hatching = null;
  petEvent("happy", 3000);
  setLine(p.greeting || `Привет! Я ${p.name}. Покормишь?`);
  lineAt = Date.now();
  petOnRender();
  enqueue(() => db.collection("pet").doc("current").set(pet));
}
function petBoot(){
  db.collection("pet").onSnapshot(snap => {
    const d = snap.docs.find(x => x.id === "current");
    if (!hatching) pet = d && d.data() ? cleanPet(d.data()) : null;
    petLoaded = true; petOnRender();
  }, () => { petLoaded = true; petOnRender(); });
}

/* ---------- drawing the pet screen ---------- */
function segs(box, n, filled, over){
  if (box.children.length !== n){ box.replaceChildren(); for (let i = 0; i < n; i++) box.append(document.createElement("i")); }
  [...box.children].forEach((x, i) => { x.className = i >= n - over ? "o" : i < filled ? "f" : ""; });
}
function petOnRender(){
  if (typeof days === "undefined") return;
  const s = petStatsNow = petStats();
  /* stats */
  const box = $("#petStats");
  if (!box.children.length) for (const d of STAT_DEFS){
    const ic = el("span",{class:"ico"}); ic.innerHTML = pxIcon(d.icon, 16); ic.style.setProperty("--c", d.c);
    const seg = el("div",{class:"seg", id:"st-" + d.k}); seg.style.setProperty("--c", d.c);
    box.append(el("div",{class:"st"}, ic, el("span",{text: d.label}), el("span",{class:"val num", id:"sv-" + d.k}), seg));
  }
  for (const d of STAT_DEFS){ segs($("#st-" + d.k), 10, Math.round(s[d.k] / 10), 0); $("#sv-" + d.k).textContent = s[d.k]; $("#st-" + d.k).setAttribute("aria-label", `${d.label}: ${s[d.k]} из 100`); }
  /* the two fold buttons say the essentials while folded */
  $("#tglFoodLab").textContent = `${s.eaten} / ${s.target} ккал`;
  const low = STAT_DEFS.reduce((a, d) => s[d.k] < s[a.k] ? d : a, STAT_DEFS[0]);
  $("#tglStatsLab").textContent = `${low.label} ${s[low.k]}`;
  const si = $("#tglStatsIco"); si.innerHTML = pxIcon(low.icon, 16); si.style.setProperty("--c", low.c);
  /* header */
  const age = petAge(), stage = petStage(age), br = petBranch(s, stage), xp = petXp();
  $("#petName").textContent = pet ? pet.name : hatching ? "Яйцо" : "Яйцо";
  $("#petStage").textContent = pet ? `${STAGE_RU[stage]}${br ? " · " + BRANCH_RU[br][0] : ""} · ур. ${petLevel(xp)}` : hatching ? "вылупляется…" : "ждёт первой записи";
  const stk = $("#streak"); stk.hidden = !s.streak; stk.innerHTML = pxIcon("fire", 16) + s.streak; stk.title = `Дней подряд с записями: ${s.streak}`;
  /* goal weight */
  const ws = Object.entries(weights).filter(([, v]) => +v > 0).sort((a, b) => a[0] < b[0] ? -1 : 1), goal = +settings.goal || 80;
  const gl = $("#goalLine");
  if (ws.length){
    const start = +ws[0][1], curW = +ws[ws.length - 1][1];
    gl.hidden = false;
    if (curW <= goal){ $("#goalLab").textContent = "Цель взята!"; segs($("#goalSeg"), 20, 20, 0); }
    else {
      const fr = start > goal ? clamp((start - curW) / (start - goal), 0, 1) : 0;
      $("#goalLab").textContent = `До ${goal} кг: ${(curW - goal).toFixed(1).replace(".", ",")}`;
      segs($("#goalSeg"), 20, Math.round(fr * 20), 0);
    }
  } else gl.hidden = true;
  /* diary screen: the day's total */
  const dt = totals(dayEntries(cur)), dg = targets(cur);
  $("#dTotal").textContent = `${label(cur)}: ${dt.kcal} из ${dg.kcal} ккал`;
  /* hatch when there is something to hatch for */
  if (petLoaded && ready && !pet && !hatching && db){
    let recent = false; for (let i = 0; i <= 3; i++) if (isLogged(shift(todayKey(), -i))) recent = true;
    if (recent) hatchPet();
  }
  /* a new line when the state really changes */
  const st = petState(s);
  const key = [st, Math.round(s.health / 25), Math.round(s.food / 34), s.eaten > 0].join("|");
  if (pet && key !== lineKey){
    const first = !lineKey; lineKey = key;
    if (st !== "eat" && st !== "happy") requestLine(first ? "open" : "state", first || Date.now() - lineAt > 20000);
  }
  if (!pet) setLine(localLine(s, st));
}
function petLook(){
  const s = petStatsNow || {fat: 50, muscle: 45};
  if (!pet){
    const crack = hatching ? Math.min(3, Math.floor((Date.now() - hatching.start) / 700)) : (petEvt && petEvt.until > Date.now() ? 1 : 0);
    return {pet: {palette: hatching ? hatching.palette : "mint"}, look: {stage: "egg", crack, state: "idle"}};
  }
  const st = petStatsNow ? petState(s) : "idle", stage = petStage(petAge());
  const look = {state: st, fat: s.fat, muscle: s.muscle, branch: petBranch(s, stage), stage, toy: petToy()};
  const now = Date.now(), ev = petDemo && petDemo.until > now ? petDemo : petEvt && petEvt.until > now ? petEvt : null;
  if (ev && ev.food){ look.food = ev.food; look.eatT = 1 - (ev.until - now) / (ev.dur || 4500); }
  if (petLookDemo) Object.assign(look, petLookDemo);
  return {pet, look};
}
