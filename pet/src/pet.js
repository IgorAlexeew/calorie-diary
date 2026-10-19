/* ---------- the pet: stats from the diary, its state, AI lines, hatching ---------- */
let pet = null, petLoaded = false, hatching = null;
let petDemo = null, petEvt = null, petStatsNow = null, petLookDemo = null, petTimeDemo = null, petPokes = 0;
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
  sad:"грустит из-за перебора калорий", tickle:"хохочет от щекотки", angry:"сердится, что его тыкают", shy:"смущается от внимания", hungry:"голоден", sick:"болеет", sleep:"спит", hibernate:"в спячке, потому что три дня не было записей"};
const STATE_TAG = {tickle:"Хохочет", angry:"Злится", shy:"Смущается", play:"Играет", eat:"Ест", happy:"Радуется", sad:"Грустит", hungry:"Голоден", sick:"Болеет", sleep:"Спит", hibernate:"Спячка"};
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
/* where the sun is: the city the owner named in the chat, else the main city of the phone's time zone (no location permission),
   else the time zone's offset as longitude */
const TZ_CITY = {"Europe/Kaliningrad":[54.71,20.51],"Europe/Moscow":[55.75,37.62],"Europe/Simferopol":[44.95,34.1],"Europe/Volgograd":[48.71,44.51],
  "Europe/Kirov":[58.6,49.66],"Europe/Astrakhan":[46.35,48.04],"Europe/Saratov":[51.53,46.03],"Europe/Ulyanovsk":[54.32,48.4],"Europe/Samara":[53.2,50.15],
  "Asia/Yekaterinburg":[56.84,60.6],"Asia/Omsk":[54.99,73.37],"Asia/Novosibirsk":[55.03,82.92],"Asia/Barnaul":[53.35,83.78],"Asia/Tomsk":[56.49,84.95],
  "Asia/Novokuznetsk":[53.76,87.12],"Asia/Krasnoyarsk":[56.01,92.87],"Asia/Irkutsk":[52.29,104.28],"Asia/Chita":[52.03,113.5],"Asia/Yakutsk":[62.03,129.73],
  "Asia/Vladivostok":[43.12,131.89],"Asia/Sakhalin":[46.96,142.73],"Asia/Magadan":[59.56,150.8],"Asia/Kamchatka":[53.02,158.65],
  "Europe/Minsk":[53.9,27.57],"Europe/Kyiv":[50.45,30.52],"Europe/Kiev":[50.45,30.52],"Europe/Chisinau":[47.01,28.86],"Europe/Riga":[56.95,24.11],
  "Europe/Vilnius":[54.69,25.28],"Europe/Tallinn":[59.44,24.75],"Europe/Helsinki":[60.17,24.94],"Europe/Warsaw":[52.23,21.01],"Europe/Berlin":[52.52,13.4],
  "Europe/Prague":[50.08,14.44],"Europe/Vienna":[48.21,16.37],"Europe/Belgrade":[44.79,20.45],"Europe/Istanbul":[41.01,28.98],"Europe/Paris":[48.86,2.35],
  "Europe/Madrid":[40.42,-3.7],"Europe/Rome":[41.9,12.5],"Europe/Amsterdam":[52.37,4.9],"Europe/London":[51.51,-.13],"Europe/Lisbon":[38.72,-9.14],
  "Asia/Tbilisi":[41.72,44.79],"Asia/Yerevan":[40.18,44.51],"Asia/Baku":[40.41,49.87],"Asia/Almaty":[43.24,76.89],"Asia/Astana":[51.17,71.45],
  "Asia/Tashkent":[41.3,69.24],"Asia/Bishkek":[42.87,74.59],"Asia/Dushanbe":[38.56,68.79],"Asia/Dubai":[25.2,55.27],"Asia/Bangkok":[13.76,100.5],
  "Asia/Shanghai":[31.23,121.47],"Asia/Tokyo":[35.68,139.69],"America/New_York":[40.71,-74.01],"America/Chicago":[41.88,-87.63],"America/Los_Angeles":[34.05,-118.24]};
function petPlace(){
  const m = /^(.*);(-?[\d.]+);(-?[\d.]+)$/.exec(settings.place || "");
  if (m) return {name: m[1], lat: +m[2], lon: +m[3]};
  let tz = ""; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
  if (TZ_CITY[tz]) return {name: tz.split("/").pop().replace(/_/g, " "), lat: TZ_CITY[tz][0], lon: TZ_CITY[tz][1], guess: true};
  return {name: "", lat: 52, lon: -new Date().getTimezoneOffset() / 4, guess: true};
}
/* today's sunrise and sunset in local hours (the usual sunrise equation, a minute or two off at most);
   in a polar night or day there is none */
function sunTimes(day, lat, lon){
  const rad = Math.PI / 180, noon = new Date(day); noon.setHours(12, 0, 0, 0);
  const n = Math.round(noon / 864e5 + 2440587.5 - 2451545 + .0008), J = n - lon / 360;
  const M = (357.5291 + .98560028 * J) % 360, C = 1.9148 * Math.sin(M * rad) + .02 * Math.sin(2 * M * rad) + .0003 * Math.sin(3 * M * rad);
  const L = (M + C + 282.9372) % 360, T = 2451545 + J + .0053 * Math.sin(M * rad) - .0069 * Math.sin(2 * L * rad);
  const sd = Math.sin(L * rad) * Math.sin(23.4397 * rad), cd = Math.cos(Math.asin(sd));
  const w = (Math.sin(-.833 * rad) - Math.sin(lat * rad) * sd) / (Math.cos(lat * rad) * cd);
  if (w > 1) return {rise: 12, set: 12, polar: "night"};
  if (w < -1) return {rise: 0, set: 24, polar: "day"};
  const o = Math.acos(w) / rad / 360, at = j => { const d = new Date((j - 2440587.5) * 864e5); return d.getHours() + d.getMinutes() / 60; };
  return {rise: at(T - o), set: at(T + o)};
}
let sunCache = null;
function sunToday(){
  const p = petPlace(), k = todayKey() + p.lat + p.lon;
  if (!sunCache || sunCache.k !== k) sunCache = {k, place: p, ...sunTimes(new Date(), p.lat, p.lon)};
  return sunCache;
}
function bedHour(){
  const bt = /^(\d{1,2}):(\d{2})$/.exec(settings.bedtime || "");
  let b = bt ? +bt[1] + +bt[2] / 60 : 0; if (b < 12) b += 24;
  return b;
}
/* time of day follows the sun: the pet sleeps from bedtime (midnight if unknown) till sunrise, but wakes no earlier than 5 and no
   later than 9; morning is the first two and a half hours after that, evening starts an hour before sunset (or three hours before
   bedtime, if that is earlier, but not before 15:00); the menu can preview any of them */
function petTod(s){
  if (petTimeDemo) return petTimeDemo;
  if (s.hour == null) return "day";
  if (isNight(s.hour)) return "night";
  const sun = sunToday(), wake = Math.min(9, Math.max(5, sun.rise)), b = bedHour();
  const h = s.hour < wake ? s.hour + 24 : s.hour;
  if (h < wake + 2.5) return "morning";
  return h >= Math.max(15, Math.min(sun.set - 1, b - 3)) ? "evening" : "day";
}
function isNight(hour){
  const wake = Math.min(9, Math.max(5, sunToday().rise)), h = hour < 12 ? hour + 24 : hour;
  return h >= bedHour() && h < wake + 24;
}
/* how dark the sky is, 0 day … .5 the sun on the horizon … 1 night, from the real sun: it brightens and darkens over the
   three quarters of an hour either side of sunrise and sunset; dawn is the morning half of the day */
function petSky(s){
  if (petTimeDemo) return {sky: {morning: .5, day: 0, evening: .5, night: 1}[petTimeDemo], dawn: petTimeDemo === "morning"};
  if (s.hour == null) return {sky: 0, dawn: false};
  const sun = sunToday(), h = s.hour, dawn = h < (sun.rise + sun.set) / 2;
  if (sun.polar) return {sky: sun.polar === "night" ? (Math.abs(h - 12) < 2 ? .75 : 1) : 0, dawn};
  const ramp = x => Math.min(1, Math.max(0, (x + .75) / 1.5));
  return {sky: dawn ? 1 - ramp(h - sun.rise) : ramp(h - sun.set), dawn};
}
const TOD_RU = {morning: "утро", day: "день", evening: "вечер", night: "ночь"};
function petNight(s){ return petTod(s) === "night"; }
/* base: the lasting state, without short events (eating, a pat, a poke) and the menu demo */
function petState(s, base){
  const now = Date.now();
  if (!base && petDemo && petDemo.until > now) return petDemo.state;
  if (!base && petEvt && petEvt.until > now) return petEvt.state;
  if (s.idleDays != null && s.idleDays >= 3 && !isLogged(s.today)) return "hibernate";
  /* being sick or hungry keeps the pet awake at night; sick at night is drawn tucked in bed */
  if (s.health < 30) return "sick";
  if (s.food < 25) return "hungry";
  if (petNight(s)) return "sleep";
  if (s.tr > 1.1) return "sad";
  if (s.mood >= 65 && s.health >= 55) return "play";
  return "idle";
}
function petToy(){ if (petDemo && petDemo.until > Date.now() && petDemo.toy) return petDemo.toy; return Math.floor(Date.now() / 30000) % 2 ? "dance" : "ball"; }
/* a meal logged while the chat is open waits until the chat is closed, so the eating can be seen */
let petPending = null;
function petEvent(state, ms, food){
  if (state === "eat" && $("#chatSheet").dataset.open === "true"){ petPending = [state, ms, food]; return; }
  const dur = ms || 4500;
  petEvt = {state, until: Date.now() + dur, dur, food};
  /* the eating line comes with the chat answer ({"pet":…}, see chatRules); till then, one of the day's lines */
  if (state === "eat" && Date.now() - lineAt > 60000) setLine(localLine(petStatsNow || petStats(), "eat"));
}

/* the pet listens while the voice button is held: the Android app (native.js) calls
   __petListen(true, level 0..1) while recording and __petListen(false) on release */
let petListening = null;
window.__petListen = (on, level) => {
  const box = $("#petSayText");
  if (on){
    if (!petListening){ sayStop(); petListening = {saved: Array.from(box.childNodes, n => n.cloneNode(true)), level: 0}; }
    petListening.level = level || 0;
    const n = 1 + Math.round(petListening.level * 4);
    box.replaceChildren(el("span",{class:"fx", text: "(" + "•".repeat(n) + ")"}));
    $("#petSay").classList.add("show");
  } else if (petListening){ box.replaceChildren(...petListening.saved); petListening = null; $("#petSay").classList.remove("show"); }
};

/* ---------- lines written by the AI ----------
   The bubble is not always there: it pops up when the pet has something to say (a tap, a meal, the app opened,
   the state changed, now and then by itself, see the chatter timer in tail.js), types the line letter by letter
   like the chat's AI answers, stays long enough to read and hides again. While the AI writes, it shows thinking dots. */
let lineAt = 0, lineBusy = false, lineKey = "", sayAt = 0;
let sayTyping = null, sayHide = null;
function sayStop(){ clearInterval(sayTyping); clearTimeout(sayHide); sayTyping = sayHide = null; }
function sayShown(){ return $("#petSay").classList.contains("show"); }
function setLine(t, loading, quiet){
  /* sounds in brackets are heard, not said: shown paler */
  const box = $("#petSayText"), bub = $("#petSay");
  sayStop();
  if (!loading) try { localStorage.setItem("petLine", JSON.stringify({t, d: todayKey(), at: Date.now(), st: pet && petStatsNow ? petState(petStatsNow, true) : ""})); } catch (e) {}
  if (petListening){ petListening.saved = [document.createTextNode(String(t))]; return; }
  const parts = String(t).split(/(\([^)]*\))/).filter(Boolean).map(x => ({fx: x[0] === "(", text: x}));
  /* the letters not typed yet are there but invisible, so the bubble has its final size from the first letter */
  const fill = n => {
    box.textContent = ""; let k = n;
    const rest = el("span",{class:"untyped"});
    for (const p of parts){
      const x = p.text.slice(0, Math.max(0, k)), y = p.text.slice(x.length); k -= p.text.length;
      if (x) box.append(p.fx ? el("span",{class:"fx", text: x}) : document.createTextNode(x));
      if (y) rest.append(y);
    }
    if (rest.textContent) box.append(rest);
  };
  bub.classList.toggle("loading", !!loading);
  if (quiet){ fill(Infinity); return; }
  sayAt = Date.now();
  bub.classList.add("show");
  if (loading){ box.replaceChildren(el("span",{class:"dots"})); return; }
  const all = parts.reduce((a, p) => a + p.text.length, 0);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches){ fill(all); }
  else { let n = 0; fill(0); sayTyping = setInterval(() => { n = Math.min(all, n + 1); fill(n); if (n >= all){ clearInterval(sayTyping); sayTyping = null; } }, 45); }
  sayHide = setTimeout(() => { if (!petListening) bub.classList.remove("show"); }, all * 45 + Math.min(9000, 3500 + all * 60));
}
/* how the pet takes being poked again and again: set at hatching, so the AI knows how to react */
const TOUCH = {
  ticklish: {state: "tickle", ru: "боится щекотки: от частых тычков хохочет и извивается"},
  grumpy:   {state: "angry",  ru: "не любит, когда тыкают: от частых тычков сердится и ворчит"},
  shy:      {state: "shy",    ru: "стеснительный: от частых тычков краснеет и прячет лицо"},
  cuddly:   {state: "happy",  ru: "обожает ласку: чем больше тыкают, тем больше радуется"}
};
function petTouch(){
  if (pet && TOUCH[pet.touch]) return pet.touch;
  const k = Object.keys(TOUCH), n = [...String(pet && pet.name || "")].reduce((a, c) => a + c.charCodeAt(0), 0);
  return k[n % k.length];
}
/* how the pet talks, like a small child: a baby mangles what is hard to say (р→л, ш→с, «вылез» → «вы-ес»), a young one only a little, an adult speaks plainly with a sound.
   Grown-up diet words (норма, калории, белок) are never in its mouth: it says ням-ням, мясико, пузико instead */
const VOCAB = "еда — ням-ням; болит — бо-бо; спать — бай-бай; плохо — кака; нельзя — ай-ай; живот — пузико; мясо, яйца, творог — мясико, яйко, сила; сладкое — сятко; много — многа; вкусно — куфна; спасибо — пасиба; привет — пливет; хочу — хосю; вылез — вы-ес; проснусь — пласнусь; щекотно — сикотна";
const SPEECH = {
  baby: {max: 32, rule: `Ты совсем малыш и говоришь как ребёнок, который только учится говорить: 2–4 слова. Коверкаешь всё, что трудно выговорить: Р говоришь как Л, Ш, Ж, Щ — как С и З, сложные стыки согласных упрощаешь («спасибо» — «пасиба», «вкусно» — «куфна», «вылез» — «вы-ес»), длинные слова обрезаешь. Путаешь порядок и формы слов, о себе говоришь «моя» или по имени. Детские слова: ${VOCAB}. Вставляешь странные звуки, но и в них не выговариваешь Р и Ш: уа, агу, иии, пип, мул-мул, фыл, хнык, бзз, ку, мо, фа. Звуки не из речи — урчание живота, хруст, храп, стук, чавканье — пиши в скобках, это не твои слова, а то, что слышно: (урчит живот), (хрум-хрум), (хр-р), (тук-тук). Смысл должен легко угадываться. Примеры: «(урчит живот) Уа… кусать хосю!», «Уф… пузико бо-бо. Многа ням.», «Сятко многа — кака. Фыл.», «Мясика мало… сила нету-ку.», «Иии! Сикотна! Хи-хи-ку!», «(хр-р) Бай-бай… не буди-и.»`},
  young: {max: 50, rule: `Ты подросток: говоришь почти правильно, короткая фраза до 6 слов. Р уже выговариваешь, но иногда Ш и Ж говоришь как С и З, путаешь порядок слов или окончание, в конце можешь добавить звук (мур, ку, мо, фа). Иногда детские слова: ням, пузико, мясико, бо-бо. Звуки не из речи (урчит живот, хруст, храп) пиши в скобках: (хрум-хрум). Примеры: «Кусать хочу, где ням?», «Мясика мало сегодня, ку.», «Вкусно было, мур!», «Пузико тяжёлое… многовато ням.»`},
  adult: {max: 80, rule: "Ты взрослый и говоришь понятно: одна фраза до 10 слов, со звериным звуком в начале (пур, мур, фыр). Звуки не из речи (урчит живот, хруст, храп) пиши в скобках: (хрум-хрум). Говоришь простыми живыми словами, как зверёк, а не как диетолог. Примеры: «Пур… Ещё можно перекусить, но без сладкого.», «Мур! Мяса бы сегодня побольше.», «Фыр, тяжело в животе. Хватит на сегодня.»"}
};
/* the pet's own little dictionary: words the AI made up or mangled in its lines, with what they mean;
   kept with the pet and given back to the AI, so the pet says the same thing the same way */
let petWords = [];
function speechRule(stage){
  const mine = petWords.slice(-30).map(x => `${x.w} — ${x.m}`).join("; ");
  return SPEECH[stage].rule + (mine ? ` Твой словарик — словечки, которые ты уже говорил, используй их, а не придумывай заново: ${mine}.` : "");
}
function learnWords(list){
  if (!pet || !Array.isArray(list)) return;
  const have = new Set(petWords.map(x => x.w.toLowerCase())), add = [];
  for (const x of list.slice(0, 4)){
    const w = str(x && x.w, 24).replace(/[«»"]/g, "").trim().toLowerCase(), m = str(x && x.m, 40).replace(/[«»"]/g, "").trim();
    if (!w || !m || have.has(w) || BAN.adult.test(w) || /\d/.test(w)) continue;
    have.add(w); add.push({w, m});
  }
  if (!add.length) return;
  petWords = [...petWords, ...add].slice(-60);
  const doc = {name: pet.name, born: pet.born, list: petWords};
  if (db) enqueue(() => db.collection("pet").doc("words").set(doc));
}
/* words a pet or a child would not say; a line with them is thrown away */
const BAN = {baby: /норм|калор|ккал|белк|белок|бжу|углевод|жир[аоыу]|дефицит|рацион|порци|грамм|\d/i, young: /норм|калор|ккал|белк|белок|бжу|углевод|дефицит|рацион|порци|грамм|\d/i, adult: /норм|калор|ккал|бжу|углевод|дефицит|рацион/i};
/* the mangling itself, so the baby always sounds like a baby even when the AI writes too correctly; same word, same mangling */
/* sounds in brackets are not speech (a rumbling tummy, a knock, snoring) and are left as they are */
function babify(t, stage){
  if (stage === "adult") return t;
  return t.split(/(\([^)]*\))/).map(part => part[0] === "(" ? part : part.replace(/[А-Яа-яЁё]+/g, w => {
    if ((stage !== "baby" && w.length < 3) || (pet && w.toLowerCase() === String(pet.name).toLowerCase())) return w;
    const h = [...w.toLowerCase()].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 1000, 7);
    let x = w.toLowerCase();
    if (stage === "baby"){
      if (w.length > 2 && h % 10 >= 8) return w;
      x = x.replace(/^здр/, "др").replace(/^сп/, "п").replace(/^ст/, "т").replace(/^вк/, "к").replace(/^пр/, "пл").replace(/р/g, "л").replace(/[шщ]/g, "с").replace(/ж/g, "з").replace(/ч([уаоюя])/g, (m, v) => "т" + ({у:"ю", а:"я", о:"ё"}[v] || v));
    } else {
      if (h % 10 >= 3) return w;
      x = x.replace(/ш/g, "с").replace(/ж/g, "з");
    }
    return w[0] === w[0].toUpperCase() ? x[0].toUpperCase() + x.slice(1) : x;
  })).join("");
}
/* a line from the AI, made the pet's own: trimmed, checked for grown-up words, mangled for its age */
function petSpeak(t, stage, max){
  t = str(t, max + 30).replace(/^["«„]+|["»“]+$/g, "").split("\n")[0].trim();
  if (!t || BAN[stage].test(t)) return "";
  return babify(t, stage);
}
/* what the pet knows about the day, said in its own words, without numbers or diet terms */
function petFacts(s){
  const eat = !s.eaten ? "хозяин сегодня ещё ничего не ел" : s.left < -150 ? "хозяин сегодня съел больше, чем надо, перебор" : s.left < 150 ? "хозяин сегодня поел как раз сколько надо, больше не нужно" : s.left > s.target * 0.5 ? "хозяин сегодня ел мало, можно ещё хорошо поесть" : "хозяин ещё может немного поесть";
  const prot = s.eaten && s.p < s.gp * 0.6 ? "; мяса, яиц, творога (сытной еды для силы) сегодня мало" : "";
  return eat + prot + (s.lastTitle ? `; последняя еда — «${s.lastTitle}», ${fmtH(s.sinceH)} назад` : "");
}
function localLine(s, st){
  const slow = a => a[Math.floor(Date.now() / 30000) % a.length];
  if (!pet && !hatching && eggPack && eggPack.d === todayKey() && eggPack.lines.length) return eggPack.lines[Math.floor(Math.random() * eggPack.lines.length)];
  if (!pet) return hatching ? slow(["(крак-крак) Уа! Моя тут-ку!", "(хрусь) Мо… узе скоро-фа!", "(крак) Пливет-мо?"])
    : slow(["(тук-тук) Ням-ням дась? Вы-упка-мо!", "(тук… тук) Ням дай — моя вы-ес-ку.", "(хрусь) Ням зду моя, мо-мо…"]);
  const stage = petStage(petAge()), baby = stage === "baby";
  if (st === "sick" && s.hour != null && petNight(s)) st = "sickbed";
  const L = {
    baby: {sickbed: "(кхе-кхе) Бо-бо… бай-бай…", hibernate: "(хр-р) Ням… ням… пласнусь-мо…", sleep: "(хр-р) Ням… куфное ябвотько…", eat: "(хрум-хрум) Ням! Куфна-а. Пасиба, мо!", hungry: "(урчит живот) Уа… кусать хосю!", sad: "Уф… пузико бо-бо. Многа ням.",
      sick: "Хнык… моя бо-бо…", play: "Иии! Мятик! Игать-ку!", idle: s.left > 0 ? "Ням есё мозна? Мо?" : "Хватит ням. Фа-фа."},
    young: {sickbed: "(кхе) Болею… сплю… ням потом…", hibernate: "(хр-р) Ням… проснусь… потом…", sleep: "(хр-р) Вкусное яблочко… мур…", eat: "(хрум-хрум) Вкусно, спасибо!", hungry: "(урчит живот) Ням где? Голодный я, ку.", sad: "Пузико тяжёлое… многовато ням.",
      sick: "Плохо мне, бо-бо. Полегче ешь?", play: "Играю! Хоросо сегодня, мур!", idle: s.left > 0 ? "Ещё поесть можно, ням." : "Хватит еды сегодня, пур."},
    adult: {sickbed: "(кхе-кхе) Полежу… под одеялком…", hibernate: "(хр-р) Запиши еду… и я проснусь…", sleep: "(хр-р) Ммм… тёплый суп… пур…", eat: "(хрум-хрум) Спасибо, вкусно!", hungry: "(урчит живот) Пур… Где моя еда?", sad: "Фыр, тяжело в животе. Хватит на сегодня.",
      sick: "Мур… Мне нехорошо. Давай полегче?", play: "Играю! Мне сегодня хорошо.", idle: s.left > 0 ? "Пур… Ещё можно перекусить." : "Мур. На сегодня хватит еды."}
  }[stage] || {};
  const R = baby ? {tickle: "Иии! Сикотна! Хи-хи-ку!", angry: "Фыл! Не тыкай! Бзз!", shy: "Ой… агу… стисняюсь…", happy: "Мул-мул… есё, есё!"}
    : stage === "young" ? {tickle: "Ха-ха! Щекотно, хватит, ку!", angry: "Фыр! Не тыкай меня.", shy: "Ой… ну ты чего… смусаюсь.", happy: "Мур! Ещё погладь, ку."}
    : {tickle: "Ха-ха! Щекотно, хватит!", angry: "Фр! Перестань тыкать.", shy: "Ой… ну ты чего… смущаюсь.", happy: "Мур-р… Приятно."};
  const pk = linePack && linePack.stage === stage && linePack.name === pet.name && linePack.lines[st];
  if (pk && pk.length) return pk[Math.floor(Math.random() * pk.length)];
  return R[st] || L[st] || L.idle;
}
/* ready-made lines for instant moments (taps, pokes, sleep, demo) are written by the AI too, in the pet's own voice,
   so they don't sound too correct next to the live ones; the fixed lines above are only a fallback */
const PACK_STATES = {idle:"спокоен, всё нормально", hungry:"голоден", eat:"ест вкусное", sad:"переел, живот тяжёлый", sick:"плохо себя чувствует, хозяин ест не по норме", play:"играет, ему хорошо",
  sickbed:"болеет и ночью лежит в кровати под одеялом с градусником, сонно бормочет и покашливает, кашель в скобках", sleep:"спит и бормочет во сне: сонные обрывки слов про еду или сны, многоточия, храп в скобках, к хозяину не обращается", hibernate:"в глубокой спячке, хозяин давно не записывал еду: бормочет сквозь сон, что проснётся от ням, храп в скобках", tickle:"хозяин часто тыкает, а ему щекотно", angry:"хозяин часто тыкает, а он злится", shy:"хозяин часто тыкает, а он смущается", happy:"хозяин гладит, ему приятно"};
let linePack = null, packBusy = false;
try { linePack = JSON.parse(localStorage.getItem("petLinePack5") || "null"); } catch (e) {}
/* the egg's knocks from inside are written by the AI too, once a day */
let eggPack = null;
try { eggPack = JSON.parse(localStorage.getItem("petEggPack") || "null"); } catch (e) {}
async function refreshEggPack(){
  if (pet || hatching || !sample || packBusy || (eggPack && eggPack.d === todayKey())) return;
  packBusy = true;
  const prompt = `Ты — ещё не вылупившийся малыш внутри яйца в игре-дневнике питания. Ты вылупишься, когда хозяин запишет первую еду. Как ты говоришь: ${SPEECH.baby.rule}
Напиши 6 разных коротких реплик из яйца хозяину, не длиннее ${SPEECH.baby.max} символов: стучишься изнутри, просишь ням, чтобы вылупиться, ворочаешься, отвечаешь на постукивание по скорлупе. Стук и хруст скорлупы пиши в скобках: (тук-тук), (хрусь). Без цифр, эмодзи и кавычек.
Ответь только JSON: {"lines":["…","…"]}`;
  try {
    const r = await sample.json(prompt, {modelTier:"quick", cache:false});
    const ok = (Array.isArray(r && r.lines) ? r.lines : []).map(x => petSpeak(x, "baby", SPEECH.baby.max)).filter(Boolean).slice(0, 8);
    if (ok.length >= 3){ eggPack = {d: todayKey(), lines: ok}; try { localStorage.setItem("petEggPack", JSON.stringify(eggPack)); } catch (e) {} }
  } catch (e) {} finally { packBusy = false; }
}
async function refreshLinePack(){
  if (!pet){ refreshEggPack(); return; }
  if (!sample || packBusy) return;
  const stage = petStage(petAge());
  if (linePack && linePack.stage === stage && linePack.name === pet.name && linePack.d === todayKey()) return;
  packBusy = true;
  const prompt = `Ты — ${pet.name}, 8-битный питомец в дневнике питания хозяина. Характер: ${pet.trait || "добрый и любопытный"}. Если часто тыкать: ${TOUCH[petTouch()].ru}. Стадия: ${STAGE_RU[stage]}.
Как ты говоришь: ${speechRule(stage)}
Напиши заготовки реплик хозяину для разных ситуаций, по 3 разные реплики на каждую, каждая не длиннее ${SPEECH[stage].max} символов. Строго в своей манере речи, без цифр, без эмодзи и кавычек. Никогда не говори взрослых слов про диету: норма, калории, белок, жиры, углеводы, порция. Ситуации:
${Object.entries(PACK_STATES).map(([k, v]) => `- ${k}: ${v}`).join("\n")}
Ещё добавь ключ words: 2–4 словечка, которые ты придумал или исковеркал в этих репликах и которых нет в словарике, с их значением.
Ответь только JSON-объектом вида {"idle":["…","…","…"], "hungry":[…], …, "words":[{"w":"словечко","m":"что значит, 1–3 слова"}]} со всеми ключами выше.`;
  try {
    const r = await sample.json(prompt, {modelTier:"quick", cache:false});
    const lines = {};
    for (const k in PACK_STATES){
      const a = Array.isArray(r && r[k]) ? r[k] : [];
      const ok = a.map(x => petSpeak(x, stage, SPEECH[stage].max)).filter(Boolean).slice(0, 4);
      if (ok.length) lines[k] = ok;
    }
    if (Object.keys(lines).length >= 6){
      learnWords(r.words);
      linePack = {stage, name: pet.name, d: todayKey(), lines};
      try { localStorage.setItem("petLinePack5", JSON.stringify(linePack)); } catch (e) {}
    }
  } catch (e) {} finally { packBusy = false; }
}
/* the chat model writes the pet's line about a meal in the same answer, so eating costs no extra request */
function petChatRules(){
  if (!pet) return "";
  const stage = petStage(petAge());
  return `\nВ приложении живёт зверёк-питомец ${pet.name} (${STAGE_RU[stage]}, характер: ${pet.trait || "добрый"}). Если ты записал еду (add_meal или edit_meal), перед строкой text добавь строку {"pet":"реплика зверька хозяину про эту еду"}. Как говорит зверёк: ${speechRule(stage)} Не длиннее ${SPEECH[stage].max} символов, без цифр и без слов про диету (норма, калории, белок).`;
}
function petChatLine(t){
  if (!pet) return;
  const stage = petStage(petAge()), line = petSpeak(t, stage, SPEECH[stage].max);
  if (line){ setLine(line); lineAt = Date.now(); }
}
async function requestLine(reason, force){
  if (!pet || !sample || lineBusy || !petStatsNow) return;
  if (petDemo && petDemo.until > Date.now()) return;
  if (!force && Date.now() - lineAt < 90000) return;
  lineBusy = true; lineAt = Date.now();
  const s = petStatsNow, st = petState(s), stage = petStage(petAge()), br = petBranch(s, stage);
  const why = {poke: `хозяин тыкает в тебя уже ${petPokes} раз подряд, а ты ${TOUCH[petTouch()].ru}`, eat:"хозяин только что записал еду", tap:"хозяин тебя погладил", state:"твоё состояние изменилось", open:"хозяин открыл приложение", hatch:"ты только что вылупился", wake:"ты спишь, а хозяин тыкает в тебя и будит: ответь сонно, сквозь сон, со звуком храпа",
    timer:"хозяин давно молчит, а ты просто хочешь что-то сказать: про своё самочувствие, про время суток, про игру или про еду", meal:"сейчас время поесть, а хозяин давно ничего не записывал: напомни про ням по-своему",
    morning:"хозяин впервые за день открыл приложение: поздоровайся по-утреннему", late:"уже поздно, а хозяин не спит: скажи сонно, что пора бай-бай"}[reason] || "просто так";
  const prompt = `Ты — ${pet.name}, 8-битный питомец в дневнике питания хозяина. Характер: ${pet.trait || "добрый и любопытный"}. Стадия: ${STAGE_RU[stage]}${br ? ", ветка развития «" + BRANCH_RU[br][0] + "»" : ""}.
Сейчас ${new Date().toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}, ${TOD_RU[petTod(s)]}. Ты ${STATE_RU[st] || "спокоен"}.
Как ты себя чувствуешь: здоровье ${s.health > 60 ? "хорошее" : s.health > 30 ? "так себе" : "плохое"}, настроение ${s.mood > 60 ? "хорошее" : s.mood > 30 ? "среднее" : "плохое"}, сытость ${s.food > 60 ? "сыт" : s.food > 30 ? "немного голоден" : "голоден"}.
Что ты знаешь про день: ${petFacts(s)}. Дней подряд с записями: ${s.streak}.
Повод для реплики: ${why}.${st === "sleep" || st === "hibernate" || (st === "sick" && petNight(s)) ? "\nТы сейчас спишь, поэтому реплика — бормотание во сне: сонные обрывки слов про еду или сны, многоточия, храп или сопение в скобках, например «(хр-р) Ням… куфное ябвотько…». Не обращайся к хозяину и ни о чём не проси." : ""}
Как ты говоришь: ${speechRule(stage)}
Напиши одну реплику питомца хозяину, по-русски, не длиннее ${SPEECH[stage].max} символов. Живо, с характером, по-доброму, по поводу и по тому, что важно сейчас (голоден, переел, мало сытной еды, вкусно). Никогда не говори взрослых слов про диету: норма, калории, ккал, белок, БЖУ, порция, и без цифр. Без эмодзи, кавычек и хэштегов. Если в реплике ты придумал или исковеркал новое словечко, которого нет в словарике, верни его в words с тем, что оно значит.
Ответь только JSON: {"line":"реплика","words":[{"w":"словечко","m":"что значит, 1–3 слова"}]} (words можно пустым).`;
  setLine("", true);
  try {
    const r = await sample.json(prompt, {modelTier:"quick", cache:false});
    const t = petSpeak(r && r.line, stage, SPEECH[stage].max);
    if (t) learnWords(r.words);
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
Ответь только JSON: {"name":"короткое русское имя, одно слово до 10 букв, можно съедобное","trait":"характер, 3–6 слов","touch":"как реагирует, если его часто тыкать: ticklish (щекотно), grumpy (сердится), shy (смущается) или cuddly (радуется); подбери под характер","greeting":"первая фраза хозяину, как говорит только что вылупившийся малыш: 2–4 слова, коверкает слова как ребёнок (Р как Л, Ш как С), звук вроде уа, агу, пип. Пример: (крак) Уа! Я вы-ес! Пливет-мо!"}`;
  const r = await sample.json(prompt, {modelTier:"quick", cache:false});
  return r && typeof r === "object" ? cleanPet({...parts, name: r.name, trait: r.trait, greeting: r.greeting, touch: r.touch}) : null;
}
function cleanPet(r){
  const P = PetEngine.PARTS, out = {};
  for (const k in P) out[k] = P[k].includes(r && r[k]) ? r[k] : pick(P[k]);
  out.name = str(r && r.name, 14).replace(/[^\p{L}\- ]/gu, "").trim() || pick(PetEngine.NAMES);
  out.trait = str(r && r.trait, 60);
  out.touch = TOUCH[r && r.touch] ? r.touch : pick(Object.keys(TOUCH));
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
  setLine(babify(p.greeting || `Уа! ${p.name} моя. Ням дась?`, "baby"));
  lineAt = Date.now();
  petOnRender();
  enqueue(() => db.collection("pet").doc("current").set(pet));
}
function petBoot(){
  db.collection("pet").onSnapshot(snap => {
    const d = snap.docs.find(x => x.id === "current");
    if (!hatching) pet = d && d.data() ? cleanPet(d.data()) : null;
    const w = snap.docs.find(x => x.id === "words"), wd = w && w.data();
    petWords = pet && wd && wd.name === pet.name && wd.born === pet.born && Array.isArray(wd.list) ? wd.list.filter(x => x && x.w && x.m) : [];
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
  $("#dTotal").textContent = `${dt.kcal} из ${dg.kcal} ккал`;
  /* hatch when there is something to hatch for */
  if (petLoaded && ready && !pet && !hatching && db){
    let recent = false; for (let i = 0; i <= 3; i++) if (isLogged(shift(todayKey(), -i))) recent = true;
    if (recent) hatchPet();
  }
  /* a new AI line only when the lasting state changes (short events don't count), and not more than once in 5 minutes;
     on opening, a line said in the last 45 minutes is kept; in between, the day's AI-written lines are used */
  const st = petState(s), key = petState(s, true);
  if (pet && key !== lineKey){
    const first = !lineKey; lineKey = key;
    let saved = null; try { saved = JSON.parse(localStorage.getItem("petLine") || "null"); } catch (e) {}
    const fresh = saved && saved.at && saved.st === key && Date.now() - saved.at < 45 * 60000;
    if (first ? !fresh : Date.now() - lineAt > 5 * 60000){ if (sample) requestLine(first ? (!(saved && saved.d === todayKey()) && new Date().getHours() < 12 ? "morning" : "open") : "state", true); else setLine(localLine(s, key)); }
    else if (first || !(petEvt && petEvt.until > Date.now())) setLine(localLine(s, key));
  }
  refreshLinePack();
}
function petLook(){
  const s = petStatsNow || {fat: 50, muscle: 45};
  if (!pet){
    const crack = hatching ? Math.min(3, Math.floor((Date.now() - hatching.start) / 700)) : (petEvt && petEvt.until > Date.now() ? 1 : 0);
    return {pet: {palette: hatching ? hatching.palette : "mint"}, look: {stage: "egg", crack, state: "idle"}};
  }
  const st = petStatsNow ? petState(s) : "idle", stage = petStage(petAge());
  const look = {state: st, fat: s.fat, muscle: s.muscle, branch: petBranch(s, stage), stage, toy: petToy(), tod: petTod(s), night: petTod(s) === "night", ...petSky(s)};
  const now = Date.now(), ev = petDemo && petDemo.until > now ? petDemo : petEvt && petEvt.until > now ? petEvt : null;
  /* a menu preview eats in a loop; a real meal once */
  if (ev && ev.food){ look.food = ev.food; look.eatT = ev.loop ? ((now - ev.start) % ev.dur) / ev.dur : 1 - (ev.until - now) / (ev.dur || 4500); }
  if (petLookDemo) Object.assign(look, petLookDemo);
  if (petListening){ look.state = "listen"; look.listen = petListening.level; }
  return {pet, look};
}
