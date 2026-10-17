const $ = s => document.querySelector(s);
const MEALS = ["Завтрак","Обед","Перекус","Ужин"];
let db = null, sample = null, ready = false;
let days = {}, settings = {target:1800, protein:140, goal:80}, weights = {};
const pad = n => String(n).padStart(2,"0");
const key = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const todayKey = () => key(new Date());
const shift = (k,n) => { const [y,m,d] = k.split("-").map(Number); return key(new Date(y,m-1,d+n)); };
let cur = todayKey();

function label(k){
  if (k === todayKey()) return "Сегодня";
  if (k === shift(todayKey(),-1)) return "Вчера";
  const [y,m,d] = k.split("-").map(Number);
  return new Date(y,m-1,d).toLocaleDateString("ru-RU",{weekday:"short",day:"numeric",month:"short"});
}
function el(tag, attrs, ...kids){
  const e = document.createElement(tag);
  for (const [a,v] of Object.entries(attrs||{})) { if (a === "text") e.textContent = v; else if (a === "class") e.className = v; else e.setAttribute(a,v); }
  for (const k of kids) if (k != null) e.append(k);
  return e;
}
const round = n => Math.round(Number(n)||0);
function totals(entries){
  return (entries||[]).reduce((t,e)=>({kcal:t.kcal+round(e.kcal),p:t.p+(+e.p||0),f:t.f+(+e.f||0),c:t.c+(+e.c||0)}),{kcal:0,p:0,f:0,c:0});
}
function targets(dk){
  const kcal = (+settings.target || 1800) + stepsBonus(dk || cur), p = +settings.protein || 140;
  const f = Math.round(kcal*0.3/9);
  const c = Math.max(0, Math.round((kcal - p*4 - f*9)/4));
  return {kcal,p,f,c};
}
function defaultMeal(){ const h = new Date().getHours(); return h < 11 ? 0 : h < 16 ? 1 : h < 19 ? 2 : 3; }

/* writes: one at a time */
let queue = Promise.resolve();
function enqueue(fn){ queue = queue.then(fn).catch(e => setStatus(dbErr(e), true)); return queue; }
function dbErr(e){
  if (e && e.code === "quota_exceeded") return "Хранилище заполнено. Удали старые записи.";
  if (e && (e.code === "invalid_argument")) return "Сохранять записи может только владелец дневника.";
  return "Не удалось сохранить. Проверь соединение и попробуй ещё раз.";
}
function saveDay(k, entries){
  days[k] = {entries};
  render();
  return enqueue(() => db.collection("days").doc(k).set({entries}));
}

function setStatus(t, err){ const s = $("#status"); s.textContent = t || ""; s.className = "status" + (err ? " err" : ""); }

/* rendering */
function render(){
  $("#dateLabel").textContent = label(cur);
  $("#next").disabled = cur >= todayKey();
  const entries = (days[cur] && days[cur].entries) || [];
  const t = totals(entries), g = targets();
  $("#eaten").textContent = t.kcal;
  $("#ofTarget").textContent = `из ${g.kcal} ккал`;
  drawRing(t.kcal / g.kcal);
  const st = stepsOf(cur), sl = $("#stepsLine");
  sl.hidden = !st; sl.textContent = st ? `Шаги ${fmtInt(st)} · +${stepsBonus(cur)} ккал к норме` : "";
  const left = g.kcal - t.kcal, lf = $("#left");
  lf.textContent = left >= 0 ? `Осталось ${left} ккал` : `Перебор на ${-left} ккал`;
  lf.className = "left num " + (left < 0 ? "over" : "ok");
  for (const [k,id] of [["p","p"],["f","f"],["c","c"]]){
    const fr = t[k]/g[k] || 0, b = $("#"+id+"Bar");
    b.style.width = Math.min(100, fr*100) + "%";
    b.style.background = fr <= 1 || k === "p" ? mixc(BLUE, GREEN, fr) : mixc(YELLOW, RED, (fr-1)/0.3);
    $("#"+id+"Val").textContent = `${round(t[k])} / ${g[k]} г`;
  }
  renderLog(entries);
  renderWeek();
  renderWeights();
  renderPace();
  if (typeof renderCookCtx === "function"){ renderCookCtx(); renderCookChips(); }
  petOnRender();
}

/* ring: gradient along the arc, overflow as a second lap with a concave start */
const BLUE=[55,138,221], GREEN=[46,158,91], YELLOW=[239,180,40], RED=[226,60,60];
const mixc=(a,b,t)=>{t=Math.max(0,Math.min(1,t||0));return `rgb(${a.map((v,i)=>Math.round(v+(b[i]-v)*t)).join(",")})`;};
function ringPt(c,r,t){const a=-Math.PI/2+t*2*Math.PI;return [c+r*Math.cos(a),c+r*Math.sin(a)];}
function ringArc(c,r,w,t1,colorAt){
  let out=""; const segs=Math.max(1,Math.ceil(t1*120));
  for(let i=0;i<segs;i++){
    const a=i/segs*t1, b=Math.min(t1,(i+1)/segs*t1+0.002);
    const [x0,y0]=ringPt(c,r,a),[x1,y1]=ringPt(c,r,b);
    out+=`<path d="M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}" fill="none" stroke="${colorAt((a+b)/2)}" stroke-width="${w}"/>`;
  }
  return out;
}
function drawRing(ratio){
  const c=60,r=52,w=10, f=Math.max(0,Math.min(ratio,1)), over=ratio>1?Math.min(ratio-1,1):0;
  const g=t=>mixc(BLUE,GREEN,t), rd=t=>mixc(YELLOW,RED,t/0.3);
  const [sx,sy]=ringPt(c,r,0);
  let s=`<defs><mask id="ovMask" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120"><rect width="120" height="120" fill="#fff"/><circle cx="${sx}" cy="${sy}" r="${w/2}" fill="#000"/></mask></defs>`;
  s+=`<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${w}"/>`;
  if(f>0){
    const [ex,ey]=ringPt(c,r,f);
    s+=`<circle cx="${sx}" cy="${sy}" r="${w/2}" fill="${g(0)}"/>`+ringArc(c,r,w,f,g)+`<circle cx="${ex}" cy="${ey}" r="${w/2}" fill="${g(f)}"/>`;
  }
  if(over>0){
    const [ex,ey]=ringPt(c,r,over);
    s+=`<g mask="url(#ovMask)">${ringArc(c,r,w,over,rd)}<circle cx="${ex}" cy="${ey}" r="${w/2}" fill="${rd(over)}"/></g>`;
  }
  $("#ringSvg").innerHTML=s;
}

/* pace and forecast */
const dayNum = k => { const [y,m,d] = k.split("-").map(Number); return Date.UTC(y,m-1,d)/864e5; };
function slope(pts){
  const n=pts.length; if(n<2) return null;
  const mx=pts.reduce((s,p)=>s+p.t,0)/n, my=pts.reduce((s,p)=>s+p.w,0)/n;
  let num=0,den=0; for(const p of pts){num+=(p.t-mx)*(p.w-my);den+=(p.t-mx)**2;}
  return den ? num/den : null;
}
const fmtKg = v => (v>0?"+":v<0?"−":"")+Math.abs(v).toFixed(1).replace(".",",");
function renderPace(){
  const pts = Object.entries(weights).filter(([,v])=>+v>0).map(([k,v])=>({k,t:dayNum(k),w:+v})).sort((a,b)=>a.t-b.t);
  const last = pts.length ? pts[pts.length-1] : null;
  const curW = last ? last.w : 100;
  const goal = +settings.goal || 80;
  /* by weigh-ins: trend over the last 4 weeks */
  let wRate = null;
  const pW = $("#paceW"), pK = $("#paceK"), trend = $("#paceTrend");
  if (last){
    const recent = pts.filter(p => p.t >= last.t - 28);
    if (recent.length >= 2 && recent[recent.length-1].t - recent[0].t >= 6) wRate = slope(recent)*7;
  }
  pW.textContent = wRate == null ? "—" : fmtKg(wRate) + " кг/нед";
  pW.className = "paceBig num" + (wRate == null ? "" : wRate < -0.05 ? " down" : wRate > 0.05 ? " up" : "");
  /* by calories: last 14 finished days with entries */
  const tdee = 1.2 * (10*curW + 6.25*172 - 5*25 + 5);
  const today = todayKey(), logged = [];
  for (let i=1;i<=14;i++){ const k=shift(today,-i), e=days[k]&&days[k].entries; if(e&&e.length) logged.push(totals(e).kcal); }
  let kRate = null, avg = null;
  if (logged.length >= 3){ avg = logged.reduce((a,b)=>a+b,0)/logged.length; kRate = -(tdee-avg)*7/7700; }
  pK.textContent = kRate == null ? "—" : fmtKg(kRate) + " кг/нед";
  pK.className = "paceBig num" + (kRate == null ? "" : kRate < -0.05 ? " down" : kRate > 0.05 ? " up" : "");
  $("#paceKNote").textContent = avg == null ? "по калориям, нужно 3+ дня записей" : `по калориям: в среднем ${Math.round(avg)} из ~${Math.round(tdee/10)*10} ккал расхода`;
  /* how the pace changes */
  let tr = "";
  if (last){
    const a = pts.filter(p => p.t > last.t-14), b = pts.filter(p => p.t <= last.t-14 && p.t > last.t-28);
    const sa = slope(a), sb = slope(b);
    if (sa != null && sb != null && a[a.length-1].t-a[0].t >= 6 && b[b.length-1].t-b[0].t >= 6){
      const d = (sa - sb)*7;
      tr = Math.abs(d) < 0.15 ? "Темп стабильный по сравнению с прошлыми двумя неделями." : d < 0 ? `Темп ускорился на ${Math.abs(d).toFixed(1).replace(".",",")} кг/нед по сравнению с прошлыми двумя неделями.` : `Темп замедлился на ${d.toFixed(1).replace(".",",")} кг/нед по сравнению с прошлыми двумя неделями.`;
    } else if (pts.length < 2) tr = "Записывай вес раз в неделю, утром натощак. После двух взвешиваний с разницей от недели здесь появится реальный темп.";
    else tr = "Сравнение темпа появится, когда наберётся около месяца взвешиваний.";
    if (pts.length >= 2 && last.t - pts[0].t <= 21) tr += " В первые 2–3 недели часть снижения — вода, поэтому темп сейчас выше реального.";
  } else tr = "Записывай вес раз в неделю, утром натощак. После двух взвешиваний с разницей от недели здесь появится реальный темп.";
  trend.textContent = tr;
  /* forecast */
  const rate = wRate != null && wRate < -0.05 ? wRate : kRate != null && kRate < -0.05 ? kRate : null;
  const fc = $("#forecast"); fc.replaceChildren();
  if (curW <= goal) fc.append("Цель достигнута. Самое время пересчитать норму на поддержание.");
  else if (rate == null) fc.append(`До цели ${goal} кг: прогноз появится, когда будут данные о темпе.`);
  else {
    const weeks = (curW - goal) / -rate;
    const d = new Date(); d.setDate(d.getDate() + Math.round(weeks*7));
    const when = d.toLocaleDateString("ru-RU",{month:"long",year:"numeric"});
    fc.append(`До цели ${goal} кг осталось ${(curW-goal).toFixed(1).replace(".",",")} кг. При таком темпе это `, el("b",{text:`~${Math.round(weeks)} нед.`}), `, примерно `, el("b",{text:when}), ".");
    if (rate === kRate && rate !== wRate) fc.append(" Прогноз по калориям, по взвешиваниям он будет точнее.");
  }
  /* short pace line in the top summary */
  const sp = $("#sumPace"); sp.replaceChildren();
  const shown = wRate != null ? wRate : kRate;
  if (shown == null) sp.append("Темп появится после взвешиваний или 3 дней записей");
  else {
    sp.append("Темп ", el("b",{class: shown < -0.05 ? "down" : shown > 0.05 ? "up" : "", text: fmtKg(shown) + " кг/нед"}), wRate == null ? " по калориям" : "");
    if (rate != null && curW > goal){
      const d = new Date(); d.setDate(d.getDate() + Math.round((curW-goal)/-rate*7));
      sp.append(` · цель ${goal} кг к ${d.toLocaleDateString("ru-RU",{month:"short",year:"numeric"})}`);
    }
  }
  renderWChart(pts, goal);
}
function renderWChart(pts, goal){
  const box = $("#wChart");
  if (pts.length < 2){ box.replaceChildren(); return; }
  const W=560,H=150,l=36,r=10,t=12,b=22, ns="http://www.w3.org/2000/svg";
  const t0=pts[0].t, t1=Math.max(pts[pts.length-1].t, t0+7);
  const ws=pts.map(p=>p.w).concat(goal), lo=Math.floor(Math.min(...ws)-1), hi=Math.ceil(Math.max(...ws)+1);
  const x=v=>l+(W-l-r)*(v-t0)/(t1-t0), y=v=>t+(H-t-b)*(1-(v-lo)/(hi-lo));
  const svg=document.createElementNS(ns,"svg"); svg.setAttribute("viewBox",`0 0 ${W} ${H}`); svg.setAttribute("role","img"); svg.setAttribute("aria-label","График веса");
  const mk=(n,a,txt)=>{const e=document.createElementNS(ns,n);for(const[k,v]of Object.entries(a))e.setAttribute(k,v);if(txt!=null)e.textContent=txt;svg.append(e);return e;};
  const fnt={"font-size":11,fill:"var(--muted)","font-family":"Onest, sans-serif"};
  for (const v of [lo, Math.round((lo+hi)/2), hi]){ mk("line",{x1:l,x2:W-r,y1:y(v),y2:y(v),stroke:"var(--line)"}); mk("text",{x:l-6,y:y(v)+4,"text-anchor":"end",...fnt},v); }
  if (goal>=lo && goal<=hi){ mk("line",{x1:l,x2:W-r,y1:y(goal),y2:y(goal),stroke:"var(--ok)","stroke-dasharray":"4 4"}); mk("text",{x:W-r,y:y(goal)-5,"text-anchor":"end",...fnt},"цель "+goal); }
  mk("polyline",{points:pts.map(p=>`${x(p.t)},${y(p.w)}`).join(" "),fill:"none",stroke:"var(--accent)","stroke-width":2,"stroke-linejoin":"round"});
  pts.forEach((p,i)=>mk("circle",{cx:x(p.t),cy:y(p.w),r:i===pts.length-1?4:2.5,fill:"var(--accent)"}));
  const fd=k=>{const[yy,mm,dd]=k.split("-").map(Number);return new Date(yy,mm-1,dd).toLocaleDateString("ru-RU",{day:"numeric",month:"short"});};
  mk("text",{x:l,y:H-6,...fnt},fd(pts[0].k)); mk("text",{x:W-r,y:H-6,"text-anchor":"end",...fnt},fd(pts[pts.length-1].k));
  box.replaceChildren(svg);
}

const ICON_TRASH = pxIcon("trash", 16);
const ICON_EDIT = pxIcon("edit", 16);
const ICON_CLIP = pxIcon("camera", 18);
const ICON_CHEV = pxIcon("chevDown", 12);
/* composition of one product: its weight is 100%, split into protein, fat, carbs and the rest (water, fibre) */
function macroParts(it){
  const p = Math.max(0, +it.p || 0), f = Math.max(0, +it.f || 0), c = Math.max(0, +it.c || 0);
  const sum = p + f + c, total = Math.max(+it.grams || 0, sum);
  return {p, f, c, rest: Math.max(0, total - sum), total};
}
function miniBar(it){
  const m = macroParts(it);
  if (!m.total) return null;
  const desc = `Белки ${round(m.p)} г, жиры ${round(m.f)} г, углеводы ${round(m.c)} г, прочее ${round(m.rest)} г`;
  const b = el("button",{type:"button",class:"mbar","aria-label":"Состав: " + desc});
  for (const [cls, v] of [["mp",m.p],["mf",m.f],["mc",m.c],["mo",m.rest]]){
    if (v <= 0) continue;
    const seg = el("span",{class:"mseg " + cls}); seg.style.flexGrow = String(v / m.total); b.append(seg);
  }
  return b;
}
/* a row's composition bar and its kcal button, both opening the same tooltip */
function barAndKcal(obj, name, cls){
  const kb = kcalBtn(obj, name, cls), bar = miniBar(obj);
  if (bar) bar.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); showTip(kb, obj, name); };
  return [bar || el("span",{}), kb];
}
function kcalBtn(obj, name, cls){
  const b = el("button",{type:"button",class:"kcalBtn num" + (cls ? " " + cls : ""),"aria-haspopup":"dialog","aria-label":`${round(obj.kcal)} ккал, показать состав`, text: round(obj.kcal) + " ккал"});
  b.onclick = ev => { ev.preventDefault(); ev.stopPropagation(); showTip(b, obj, name); };
  return b;
}
let tipEl = null, tipFor = null;
function hideTip(){ if (tipEl){ tipEl.remove(); tipEl = null; } if (tipFor){ tipFor.classList.remove("on"); tipFor = null; } }
function showTip(anchor, obj, name){
  if (tipFor === anchor){ hideTip(); return; }
  hideTip();
  const m = macroParts(obj), kc = round(obj.kcal);
  const tip = el("div",{class:"tip",role:"dialog","aria-label":"Состав: " + name});
  tip.append(el("div",{class:"tipHead"}, el("span",{class:"tipName",text:name}), el("span",{class:"num",text: kc + " ккал"})));
  if (m.total){
    const bar = el("div",{class:"tipBar"});
    for (const [cls, v] of [["mp",m.p],["mf",m.f],["mc",m.c],["mo",m.rest]]){ if (v <= 0) continue; const seg = el("span",{class:cls}); seg.style.flexGrow = String(v / m.total); bar.append(seg); }
    tip.append(bar, el("p",{class:"tipSub",text: `Вес ~${round(m.total)} г, полоска делит его по составу`}));
  }
  const rows = el("div",{class:"tipRows num"});
  const kp = m.p*4, kf = m.f*9, kcb = m.c*4, ksum = kp + kf + kcb || 1;
  for (const [cls, lab, g, k] of [["mp","Белки",m.p,kp],["mf","Жиры",m.f,kf],["mc","Углеводы",m.c,kcb]]){
    rows.append(el("span",{class:"tipLab"}, el("i",{class:cls}), lab), el("span",{text: round(g) + " г"}), el("span",{class:"tipK",text: `${Math.round(k/ksum*100)}% ккал`}));
  }
  if (m.rest > 0) rows.append(el("span",{class:"tipLab"}, el("i",{class:"mo"}), "Прочее"), el("span",{text: round(m.rest) + " г"}), el("span",{class:"tipK",text:"вода, клетчатка"}));
  tip.append(rows);
  document.body.append(tip);
  const r = anchor.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
  let left = r.right - w; left = Math.max(12, Math.min(left, document.documentElement.clientWidth - w - 12));
  let top = r.bottom + 6; if (top + h > window.innerHeight - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
  tip.style.left = (left + window.scrollX) + "px"; tip.style.top = (top + window.scrollY) + "px";
  tipEl = tip; tipFor = anchor; anchor.classList.add("on");
}
document.addEventListener("click", e => { if (tipEl && !tipEl.contains(e.target)) hideTip(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") hideTip(); });
window.addEventListener("resize", hideTip);
function iconBtn(cls, svg, label){ const b = el("button",{type:"button",class:"iconBtn " + cls,"aria-label":label,title:label}); b.innerHTML = svg; return b; }

const expanded = new Set(), openDishes = new Set();
let edit = null; /* {id, day, el, text, picker, meal, busy} */

function renderLog(entries){
  const log = $("#log");
  const keepEditor = edit && edit.el ? edit.el : null;
  log.replaceChildren();
  if (!ready){ log.append(el("p",{class:"empty",text:"Загружаю записи…"})); return; }
  if (edit && (edit.day !== cur || !entries.some(e => e.id === edit.id))) closeEditor(true);
  if (!entries.length){ log.append(el("p",{class:"empty",text: cur === todayKey() ? "За сегодня пока пусто. Опиши, что съел, в поле выше." : "В этот день записей нет."})); return; }
  for (let m = 0; m < 4; m++){
    const list = entries.filter(e => (+e.meal||0) === m);
    if (!list.length) continue;
    const box = el("div",{class:"meal"}, el("div",{class:"mealhead"}, el("span",{text:MEALS[m]}), el("span",{class:"num",text: totals(list).kcal + " ккал"})));
    for (const e of list){
      if (edit && edit.id === e.id){ box.append(keepEditor || buildEditor(e)); continue; }
      box.append(entryView(e, entries));
    }
    log.append(box);
  }
}

function entryView(e, entries){
  const itemLi = it => el("li",{class:"ing"}, el("span",{class:"ingName",text: `${it.name}${it.grams ? ", ~" + round(it.grams) + " г" : ""}`}), ...barAndKcal(it, it.name));
  let items;
  if (Array.isArray(e.dishes) && e.dishes.length){
    items = el("div",{class:"tree"});
    e.dishes.forEach((d, i) => {
      const key = e.id + ":" + i, sub = d.items || [];
      const dt = totals(sub);
      if (sub.length === 1 && sub[0].name === d.name){
        const lu = el("ul",{class:"items leafList"}); lu.append(itemLi(sub[0]));
        items.append(lu);
        return;
      }
      const det = el("details",{class:"dish"});
      if (openDishes.has(key)) det.open = true;
      const chev = el("span",{class:"chev"}); chev.innerHTML = ICON_CHEV;
      const dObj = {...dt, grams: sub.reduce((s,it) => s + (+it.grams || 0), 0)};
      det.append(el("summary",{}, el("span",{class:"dishName"}, chev, el("span",{text: d.name})), ...barAndKcal(dObj, d.name)));
      const ul = el("ul",{class:"items"}); sub.forEach(it => ul.append(itemLi(it)));
      det.append(ul);
      det.addEventListener("toggle", () => { if (det.open) openDishes.add(key); else openDishes.delete(key); });
      items.append(det);
    });
  } else {
    items = el("ul",{class:"items"});
    (e.items||[]).forEach(it => items.append(itemLi(it)));
  }
  const title = e.title || e.text;
  const nPhotos = Array.isArray(e.photos) ? e.photos.length : 0;
  let req = null;
  if ((e.title && e.text && e.text !== e.title) || nPhotos){
    req = el("details",{class:"req"});
    if (expanded.has(e.id)) req.open = true;
    const sum = el("summary",{});
    const lab = el("span",{text: req.open ? "Свернуть запрос" : "Развернуть запрос"});
    const chev = el("span",{class:"chev"}); chev.innerHTML = ICON_CHEV;
    sum.append(lab, chev);
    req.append(sum);
    if (e.text && e.text !== title || e.title) req.append(el("p",{class:"reqText",text: e.text || "Без текста"}));
    if (nPhotos) req.append(el("p",{class:"reqPhotos",text: `Прикреплено фото: ${nPhotos}`}));
    req.addEventListener("toggle", () => { if (req.open) expanded.add(e.id); else expanded.delete(e.id); lab.textContent = req.open ? "Свернуть запрос" : "Развернуть запрос"; });
  }
  const editB = iconBtn("", ICON_EDIT, "Изменить");
  editB.onclick = () => openEditor(e);
  const del = iconBtn("danger", ICON_TRASH, "Удалить");
  const delLab = el("span",{class:"armLabel",text:"Удалить?"});
  let timer;
  del.onclick = () => {
    if (!del.classList.contains("arm")){
      del.classList.add("arm"); del.prepend(delLab); del.setAttribute("aria-label","Нажми ещё раз, чтобы удалить");
      timer = setTimeout(()=>{ del.classList.remove("arm"); delLab.remove(); del.setAttribute("aria-label","Удалить"); }, 3000);
      return;
    }
    clearTimeout(timer);
    for (const pid of (e.photos||[])) enqueue(() => db.collection("photos").doc(pid).delete());
    saveDay(cur, entries.filter(x => x.id !== e.id));
  };
  return el("div",{class:"entry"},
    el("div",{class:"entryhead"}, el("span",{class:"entrytext",text:title}), ...barAndKcal({kcal:e.kcal, p:e.p, f:e.f, c:e.c, grams:(e.items||[]).reduce((s,it) => s + (+it.grams || 0), 0)}, title, "entrykcal")),
    items,
    req,
    el("div",{class:"entryfoot"}, el("span",{class:"entryNote",text: e.note || ""}), el("span",{class:"acts"}, editB, del))
  );
}

function openEditor(e){
  if (edit) closeEditor(true);
  edit = {id:e.id, day:cur, el:null, text:e.text || "", meal:+e.meal||0, busy:false, picker:null};
  edit.picker = makePicker(() => edit && edit.thumbsEl && fillThumbs(edit.thumbsEl, edit.picker, edit.countEl));
  render();
  const ids = Array.isArray(e.photos) ? e.photos : [];
  if (ids.length && db){
    const mine = edit;
    edit.statusEl.textContent = "Загружаю фото…";
    Promise.all(ids.map(id => db.collection("photos").doc(id).get().then(s => s.exists && s.data().data ? {id, data:s.data().data} : null).catch(() => null)))
      .then(list => {
        if (edit !== mine) return;
        for (const p of list) if (p) mine.picker.addStored(p.id, dataUrlToBlob(p.data));
        const missing = list.filter(x => !x).length;
        mine.statusEl.textContent = missing ? `Не удалось загрузить фото: ${missing}.` : "";
      });
  }
  setTimeout(() => edit && edit.ta && (edit.ta.focus(), autoGrowEl(edit.ta)), 0);
}
function closeEditor(silent){
  if (!edit) return;
  if (edit.picker) edit.picker.clear();
  edit = null;
  if (!silent) render();
}
function buildEditor(e){
  const ta = el("textarea",{"aria-label":"Описание приёма пищи",placeholder:"Опиши, что съел, или допиши уточнение"});
  ta.value = edit.text;
  ta.addEventListener("input", () => { edit.text = ta.value; autoGrowEl(ta); });
  const thumbs = el("div",{class:"thumbs"}); thumbs.hidden = true;
  const count = el("span",{class:"hint"});
  const file = el("input",{type:"file",multiple:"",hidden:""});
  file.accept = (photoTypes || ["image/*"]).join(",");
  const attach = el("button",{type:"button",class:"attach","aria-label":"Прикрепить фото"}); attach.innerHTML = ICON_CLIP + "<span>Фото</span>";
  attach.hidden = !photoMax;
  attach.onclick = () => file.click();
  file.addEventListener("change", () => { const msg = edit.picker.add(Array.from(file.files||[])); file.value = ""; if (msg) status.textContent = msg; });
  ta.addEventListener("paste", ev => { const fs = Array.from((ev.clipboardData && ev.clipboardData.files) || []).filter(f => f.type.startsWith("image/")); if (fs.length && photoMax){ ev.preventDefault(); const msg = edit.picker.add(fs); if (msg) status.textContent = msg; } });
  const comp = el("div",{class:"composer"}, ta, thumbs, el("div",{class:"composerFoot"}, attach, count), file);
  wireDrop(comp, fs => edit.picker.add(fs));
  const sel = el("select",{"aria-label":"Приём пищи"});
  MEALS.forEach((m,i) => sel.append(el("option",{value:String(i),text:m})));
  sel.value = String(edit.meal);
  sel.onchange = () => { edit.meal = +sel.value; };
  const save = el("button",{type:"button",class:"primary",text:"Пересчитать"});
  const cancel = el("button",{type:"button",class:"small",text:"Отмена"});
  cancel.onclick = () => closeEditor(false);
  const status = el("p",{class:"status",role:"status"});
  save.onclick = () => saveEdit(e, save, status);
  const box = el("div",{class:"entry editing"},
    el("p",{class:"editHint",text:"Измени описание, добавь уточнение или поменяй фото. Claude пересчитает запись с учётом прошлой оценки."}),
    comp, el("div",{class:"row"}, sel, save, cancel), status);
  Object.assign(edit, {el:box, ta, thumbsEl:thumbs, countEl:count, statusEl:status});
  fillThumbs(thumbs, edit.picker, count);
  return box;
}
async function saveEdit(e, btn, status){
  if (!edit || edit.busy) return;
  const text = edit.text.trim(), items = edit.picker.items.slice();
  if (!text && !items.length){ status.textContent = "Опиши еду или приложи фото."; status.className = "status err"; return; }
  if (!sample || !db){ status.textContent = "Эта функция работает только внутри Claude."; status.className = "status err"; return; }
  const mine = edit; mine.busy = true; btn.disabled = true; btn.textContent = "Считаю…";
  status.className = "status"; status.textContent = "Claude пересчитывает запись, обычно это 5–30 секунд.";
  try {
    const prepared = await preparePhotos(items);
    const r = await estimate(text, prepared.length ? prepared.map(p => p.blob) : null, e);
    const ids = await storePhotos(prepared);
    const kept = new Set(ids);
    for (const pid of (e.photos||[])) if (!kept.has(pid)) enqueue(() => db.collection("photos").doc(pid).delete());
    const t = totals(r.items);
    const updated = {...e, text: text || ("По фото: " + r.items.map(i => i.name).join(", ")), title: r.title, meal: mine.meal, items: r.items, dishes: r.dishes, note: r.note, photos: ids, photo: ids.length > 0, kcal: t.kcal, p: t.p, f: t.f, c: t.c, edited: new Date().toISOString()};
    const day = mine.day;
    const list = ((days[day] && days[day].entries) || []).map(x => x.id === e.id ? updated : x);
    if (edit === mine) closeEditor(true);
    await saveDay(day, list);
    setStatus(`Запись обновлена: ${t.kcal} ккал.`);
  } catch (err) {
    if (edit === mine){ mine.busy = false; btn.disabled = false; btn.textContent = "Пересчитать"; status.className = "status err"; status.textContent = err && err.code ? sampleErr(err) : dbErr(err); }
  }
}

function renderWeek(){
  const W = 560, H = 170, top = 18, bottom = 28, left = 8, right = 62;
  const keys = []; for (let i = 6; i >= 0; i--) keys.push(shift(cur,-i));
  const vals = keys.map(k => totals(days[k] && days[k].entries).kcal);
  const g = +settings.target || 1800;
  const max = Math.max(g * 1.25, ...vals);
  const y = v => top + (H - top - bottom) * (1 - v / max);
  const bw = (W - left - right) / 7;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns,"svg");
  svg.setAttribute("viewBox",`0 0 ${W} ${H}`); svg.setAttribute("role","img");
  svg.setAttribute("aria-label","Калории за последние 7 дней");
  const mk = (t,a) => { const e = document.createElementNS(ns,t); for (const [k,v] of Object.entries(a)) e.setAttribute(k,v); svg.append(e); return e; };
  /* one shared vertical gradient, same logic as the ring: blue → green up to the norm, yellow → red above it */
  const base = H - bottom, yTop = y(g * 1.3), normOff = (base - y(g)) / (base - yTop);
  const defs = mk("defs",{}), grad = document.createElementNS(ns,"linearGradient");
  for (const [k2,v2] of Object.entries({id:"wkGrad", gradientUnits:"userSpaceOnUse", x1:0, x2:0, y1:base, y2:yTop})) grad.setAttribute(k2,v2);
  for (const [off, col] of [[0, mixc(BLUE,GREEN,0)], [normOff, mixc(BLUE,GREEN,1)], [normOff, mixc(YELLOW,RED,0)], [1, mixc(YELLOW,RED,1)]]){
    const st = document.createElementNS(ns,"stop"); st.setAttribute("offset", String(off)); st.setAttribute("stop-color", col); grad.append(st);
  }
  defs.append(grad);
  keys.forEach((k,i) => {
    const v = vals[i], x = left + i*bw + bw*0.2, w = bw*0.6;
    const solid = k === cur, bh = Math.max(0, H - bottom - y(v));
    mk("rect",{x, y: y(Math.max(v,0)), width:w, height: bh, rx:0, fill: "url(#wkGrad)", "fill-opacity": solid ? 1 : 0.6});
    if (v > 0){
      const inside = bh >= 24;
      const t = mk("text",{x: x + w/2, y: inside ? y(v) + 16 : y(v) - 5, "text-anchor":"middle", "font-size": inside ? 12 : 11, "font-weight": inside ? 700 : 400,
        fill: inside ? "#fff" : "var(--muted)", "font-family":"Onest, sans-serif"});      t.textContent = v;
    }
    const [yy,mm,dd] = k.split("-").map(Number);
    const wd = new Date(yy,mm-1,dd).toLocaleDateString("ru-RU",{weekday:"short"});
    mk("text",{x: x + w/2, y: H - 9, "text-anchor":"middle", "font-size":12, fill: k === cur ? "var(--fg)" : "var(--muted)", "font-weight": k === cur ? 600 : 400, "font-family":"Onest, sans-serif"}).textContent = wd;
  });
  mk("line",{x1:left, x2:W-right, y1:y(g), y2:y(g), stroke:"var(--fg)", "stroke-width":1, "stroke-dasharray":"4 4", opacity:.5});
  mk("text",{x:W-right+8, y:y(g)-3, "text-anchor":"start", "font-size":11, fill:"var(--muted)", "font-family":"Onest, sans-serif"}).textContent = "норма";
  mk("text",{x:W-right+8, y:y(g)+11, "text-anchor":"start", "font-size":11, "font-weight":600, fill:"var(--muted)", "font-family":"Onest, sans-serif"}).textContent = g;
  $("#week").replaceChildren(svg);
}

function renderWeights(){
  const list = Object.entries(weights).filter(([,v]) => +v > 0).sort((a,b) => a[0] < b[0] ? 1 : -1);
  const ul = $("#weightList"); ul.replaceChildren();
  for (const [k,v] of list.slice(0,6)) ul.append(el("li",{}, el("span",{text:label(k)}), el("span",{class:"num",text:(+v).toFixed(1) + " кг"})));
  const s = $("#weightSummary");
  if (list.length >= 2){
    const diff = +list[0][1] - +list[list.length-1][1];
    s.textContent = `С первого взвешивания: ${diff > 0 ? "+" : ""}${diff.toFixed(1)} кг`;
  } else s.textContent = "Взвешивайся раз в неделю утром натощак.";
  if (document.activeElement !== $("#tKcal")) $("#tKcal").value = targets().kcal;
  if (document.activeElement !== $("#tProt")) $("#tProt").value = targets().p;
  if (document.activeElement !== $("#tGoal")) $("#tGoal").value = +settings.goal || 80;
}

/* estimating */
async function estimate(text, photos, prev){
  const n = photos ? photos.length : 0;
  let prompt = `Ты помогаешь вести дневник питания. Оцени калорийность и БЖУ еды по ${n ? "фото и описанию" : "описанию"} человека.`;
  if (n) prompt += `\nНа приложенных фото (${n} шт.) еда, которую человек съел за один приём. Фото могут показывать одно блюдо с разных сторон или разные блюда: не считай одно и то же дважды. Определи блюда и оцени вес порций по размеру тарелки и приборов. Текст описания уточняет фото и важнее его.`;
  if (prev && Array.isArray(prev.items) && prev.items.length){
    const prevLines = Array.isArray(prev.dishes) && prev.dishes.length
      ? prev.dishes.map(d => `- ${d.name}:\n` + (d.items||[]).map(i => `  - ${i.name}: ~${round(i.grams)} г, ${round(i.kcal)} ккал`).join("\n")).join("\n")
      : prev.items.map(i => `- ${i.name}: ~${round(i.grams)} г, ${round(i.kcal)} ккал`).join("\n");
    prompt += `\nЭто исправление уже записанного приёма пищи. Прошлая оценка была такой:\n` + prevLines +
      `\nНиже новое описание человека. Оно главнее прошлой оценки: учти все уточнения (вес, состав, способ приготовления, что добавить или убрать). Позиции, которые человек не трогал, оставь как были.`;
  }
  prompt += `
Правила:
- Если вес не указан, бери стандартные порции и типичные продукты из российских магазинов (ломтик нарезного батона ~28 г, ломтик сыра ~20 г, столовая ложка соуса ~15 г, стакан 250 мл, тарелка гарнира ~200 г готового).
- Сгруппируй еду по блюдам (бутерброд, салат, суп, напиток), а каждое блюдо разложи на ингредиенты с их весом. Объединяй блюда в одно с пометкой количества («Бутерброды с сыром, 2 шт.») только когда они полностью одинаковы по составу. Если хоть один ингредиент отличается (разная колбаса, разный соус, один с сыром, другой без), это отдельные блюда, и у каждого свои ингредиенты: общий хлеб, сыр или соус раздели между ними. Название блюда должно отличать его от соседних, например «Бутерброд с пепперони» и «Бутерброд с сальчичоном». Простой продукт без состава (яблоко, банан) — это блюдо из одного ингредиента.
- Если продукт сладкий, жирный или жареный, учти это. Масло для жарки, соусы и сахар — отдельные ингредиенты.
- Оценивай реалистично, без занижения.
Описание: """${text ? text.slice(0,2000) : "(нет, только фото)"}"""
Ответь только JSON такого вида:
{"title":"короткое название приёма пищи по-русски, 2–5 слов, например «Гречка с котлетой и чай»","dishes":[{"name":"название блюда","items":[{"name":"ингредиент","grams":150,"kcal":120,"p":5,"f":4,"c":15}]}],"note":"одно короткое пояснение о допущениях или пустая строка"}
Все числа целые.`;
  const opts = {modelTier:"default", cache:false};
  if (n) opts.images = photos;
  const r = await sample.json(prompt, opts);
  const cleanItem = i => ({name: String((i && i.name) || "Продукт").slice(0,80), grams: round(i && i.grams), kcal: round(i && i.kcal), p: round(i && i.p), f: round(i && i.f), c: round(i && i.c)});
  let dishes = (r && Array.isArray(r.dishes) ? r.dishes : []).map(d => ({
    name: String((d && d.name) || "Блюдо").slice(0,80),
    items: (d && Array.isArray(d.items) ? d.items : []).map(cleanItem).filter(i => i.kcal >= 0)
  })).filter(d => d.items.length);
  if (!dishes.length && r && Array.isArray(r.items)) dishes = r.items.map(cleanItem).filter(i => i.kcal >= 0).map(i => ({name: i.name, items: [i]}));
  const items = dishes.flatMap(d => d.items);
  if (!items.length) throw {code:"invalid_json"};
  const title = String((r && r.title) || items.map(i => i.name).slice(0,3).join(", ")).replace(/[«»"]/g,"").slice(0,80);
  return {items, dishes, title, note: String(r.note || "").slice(0,140)};
}
function sampleErr(e){
  switch (e && e.code){
    case "not_granted": case "sampling_disabled": case "not_declared": case "capability_disabled": case "capability_removed":
      return "Странице не разрешено обращаться к Claude. Разреши доступ в меню разрешений этой страницы.";
    case "rate_limited": return "Слишком много запросов. Подожди немного и попробуй снова.";
    case "session_expired": return "Нужно заново войти в Claude.";
    case "invalid_json": case "empty_completion": return "Не получилось разобрать ответ. Попробуй описать еду чуть подробнее.";
    case "refused": return "Claude не стал отвечать на это описание. Переформулируй.";
    case "image_rejected": return "Это фото не подходит. Выбери JPEG или PNG поменьше.";
    case "images_unavailable": return "Фото здесь не поддерживаются. Опиши еду текстом.";
    default: return "Не удалось связаться с Claude. Попробуй ещё раз.";
  }
}

/* photos: picking, compressing, storing */
let photoMax = 0, photoTypes = null;
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
function makePicker(onChange){
  const p = {items: []};
  p.add = list => {
    if (!photoMax) return "";
    let skipped = 0;
    for (const f of list){
      if (!f || !f.type || !f.type.startsWith("image/") || (photoTypes && !photoTypes.includes(f.type))){ skipped++; continue; }
      if (p.items.length >= photoMax){ skipped++; continue; }
      p.items.push({blob:f, url:URL.createObjectURL(f)});
    }
    onChange();
    return skipped ? (p.items.length >= photoMax ? `Можно прикрепить не больше ${photoMax} фото.` : "Часть файлов не подошла: нужны JPEG, PNG, WebP или GIF.") : "";
  };
  p.addStored = (id, blob) => { p.items.push({blob, url:URL.createObjectURL(blob), storedId:id}); onChange(); };
  p.remove = it => { URL.revokeObjectURL(it.url); p.items = p.items.filter(x => x !== it); onChange(); };
  p.clear = () => { for (const it of p.items) URL.revokeObjectURL(it.url); p.items = []; onChange(); };
  return p;
}
function fillThumbs(box, picker, countEl){
  box.replaceChildren();
  for (const it of picker.items){
    const rm = el("button",{type:"button","aria-label":"Убрать фото",text:"×"});
    rm.onclick = () => picker.remove(it);
    const img = el("img",{alt:"Прикреплённое фото еды"}); img.src = it.url;
    box.append(el("div",{class:"thumb"}, img, rm));
  }
  box.hidden = !picker.items.length;
  if (countEl) countEl.textContent = picker.items.length ? `${picker.items.length} из ${photoMax}` : "";
}
function wireDrop(node, add){
  node.addEventListener("dragover", e => { if (photoMax){ e.preventDefault(); node.classList.add("drag"); } });
  node.addEventListener("dragleave", () => node.classList.remove("drag"));
  node.addEventListener("drop", e => { node.classList.remove("drag"); if (!photoMax) return; e.preventDefault(); const msg = add(Array.from(e.dataTransfer.files || [])); if (msg) setStatus(msg, true); });
}
function dataUrlToBlob(u){
  const [head, b64] = u.split(","); const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
  const bin = atob(b64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], {type:mime});
}
function loadImage(blob){
  return new Promise((res, rej) => { const u = URL.createObjectURL(blob), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error("decode")); }; im.src = u; });
}
async function compress(blob){
  const im = await loadImage(blob);
  for (const [side, q] of [[1000,0.72],[800,0.6],[640,0.5]]){
    const k = Math.min(1, side / Math.max(im.naturalWidth, im.naturalHeight));
    const cv = document.createElement("canvas");
    cv.width = Math.round(im.naturalWidth*k); cv.height = Math.round(im.naturalHeight*k);
    cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
    const data = cv.toDataURL("image/jpeg", q);
    if (data.length < 230000) return data;
  }
  return null;
}
/* stored photos are kept as they are; new ones are shrunk so they fit in the diary */
async function preparePhotos(items){
  const out = [];
  for (const it of items){
    if (it.storedId){ out.push({blob: it.blob, storedId: it.storedId}); continue; }
    let data = null;
    try { data = await compress(it.blob); } catch (e) {}
    out.push(data ? {blob: dataUrlToBlob(data), data} : {blob: it.blob});
  }
  return out;
}
async function storePhotos(prepared){
  const ids = [];
  for (const p of prepared){
    if (p.storedId){ ids.push(p.storedId); continue; }
    if (!p.data) continue;
    const id = newId();
    await enqueue(() => db.collection("photos").doc(id).set({data: p.data, created: new Date().toISOString()}));
    ids.push(id);
  }
  return ids;
}

const mainPicker = makePicker(() => fillThumbs($("#thumbs"), mainPicker, $("#photoCount")));
function clearPhoto(){ mainPicker.clear(); $("#photoIn").value = ""; }


$("#attachBtn").onclick = () => $("#photoIn").click();
function autoGrowEl(t){
  t.style.height = "auto";
  const h = Math.min(t.scrollHeight, 320); t.style.height = h + "px";
  t.style.overflowY = t.scrollHeight > 320 ? "auto" : "hidden";
}
function autoGrow(){ autoGrowEl($("#foodText")); }
$("#foodText").addEventListener("input", autoGrow);
$("#composer").addEventListener("click", e => { if (e.target === e.currentTarget || e.target.classList.contains("composerFoot")) $("#foodText").focus(); });
$("#photoIn").addEventListener("change", () => { const msg = mainPicker.add(Array.from($("#photoIn").files || [])); $("#photoIn").value = ""; if (msg) setStatus(msg, true); });
$("#foodText").addEventListener("paste", e => {
  const files = Array.from((e.clipboardData && e.clipboardData.files) || []).filter(f => f.type.startsWith("image/"));
  if (files.length && photoMax){ e.preventDefault(); const msg = mainPicker.add(files); if (msg) setStatus(msg, true); }
});
wireDrop($("#composer"), fs => mainPicker.add(fs));

/* ---------- one chat for everything: food, questions, steps, weight, bedtime ---------- */
let activity = {}, chats = {};
const ICON_SEND = pxIcon("send", 18);
const ICON_STOP = pxIcon("stop", 14);
const str = (v, n) => String(v == null ? "" : v).trim().slice(0, n || 200);
const fmtInt = n => round(n).toLocaleString("ru-RU");

function latestWeight(dk){
  const l = Object.entries(weights).filter(([k,v]) => +v > 0 && k <= dk).sort((a,b) => a[0] < b[0] ? 1 : -1);
  return l.length ? +l[0][1] : 100;
}
function stepsOf(dk){ return Math.max(0, round(activity[dk] && activity[dk].steps)); }
/* about 0.5 kcal per kg per 1000 steps; only half is added to the budget because trackers overestimate */
function stepsBonus(dk){ return Math.round(stepsOf(dk) * 0.0005 * latestWeight(dk) * 0.5 / 10) * 10; }

function cleanItem(i){ return {name: str(i && i.name, 80) || "Продукт", grams: round(i && i.grams), kcal: Math.max(0, round(i && i.kcal)), p: Math.max(0, round(i && i.p)), f: Math.max(0, round(i && i.f)), c: Math.max(0, round(i && i.c))}; }
function cleanDishes(arr){
  return (Array.isArray(arr) ? arr : []).map(d => ({name: str(d && d.name, 80) || "Блюдо", items: (d && Array.isArray(d.items) ? d.items : []).map(cleanItem)})).filter(d => d.items.length);
}
const clampMeal = m => { const n = Math.round(+m); return n >= 0 && n <= 3 ? n : defaultMeal(); };
const sumGrams = items => items.reduce((s,it) => s + (+it.grams || 0), 0);

function dayContext(dk){
  const entries = (days[dk] && days[dk].entries) || [];
  const t = totals(entries), g = targets(dk), now = new Date(), isToday = dk === todayKey();
  const hm = d => d.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
  const timed = entries.map(e => ({e, d: e.time ? new Date(e.time) : null})).sort((x,y) => (x.d||0) - (y.d||0));
  const lastT = timed.filter(x => x.d && !isNaN(x.d)).pop() || null;
  const sinceH = isToday && lastT ? (now - lastT.d) / 36e5 : null;
  const detail = timed.map(({e,d}) => {
    const dishes = Array.isArray(e.dishes) && e.dishes.length ? e.dishes : [{name: e.title || e.text, items: e.items || []}];
    return `[${e.id}] ${d && !isNaN(d) ? hm(d) : "--:--"} ${MEALS[+e.meal||0].toLowerCase()} — ${e.title || e.text}, ${round(e.kcal)} ккал. Блюда: ` +
      dishes.map(ds => `${ds.name} (${(ds.items||[]).map(i => `${i.name} ${round(i.grams)} г ${round(i.kcal)} ккал Б${round(i.p)} Ж${round(i.f)} У${round(i.c)}`).join("; ")})`).join("; ");
  });
  const hour = now.getHours() + now.getMinutes()/60;
  const bt = /^(\d{1,2}):(\d{2})$/.exec(settings.bedtime || "");
  let sleepH = null;
  if (bt && isToday){ let b = +bt[1] + +bt[2]/60; if (b < 12) b += 24; sleepH = Math.max(0, b - hour); }
  const mealsLeft = !isToday ? 1 : hour < 11 ? 3 : hour < 15 ? 2 : hour < 20 ? 1.5 : 1;
  return {dk, isToday, left: g.kcal - t.kcal, pLeft: Math.max(0, g.p - round(t.p)), fLeft: g.f - round(t.f),
    p: round(t.p), f: round(t.f), c: round(t.c), gp: g.p, gf: g.f, gc: g.c, eatenKcal: t.kcal, target: g.kcal, base: +settings.target || 1800,
    detail, count: entries.length, next: MEALS[defaultMeal()], time: hm(now), hour, sinceH,
    lastTitle: lastT ? (lastT.e.title || lastT.e.text) : null, lastKcal: lastT ? round(lastT.e.kcal) : 0,
    sleepH, mealsLeft, perMeal: Math.max(0, Math.round((g.kcal - t.kcal) / mealsLeft / 10) * 10),
    steps: stepsOf(dk), bonus: stepsBonus(dk), weight: latestWeight(dk)};
}
const fmtH = h => h < 1 ? `${Math.max(1, Math.round(h*60))} мин` : `${(Math.round(h*2)/2).toString().replace(".",",")} ч`;
function renderCookCtx(){
  const c = dayContext(cur);
  if (!c.isToday){ $("#cookCtx").textContent = `${label(cur)}: можно дописать или поправить записи этого дня.`; return; }
  const since = (c.sinceH != null ? ` Последний приём ${fmtH(c.sinceH)} назад.` : "") + (c.sleepH != null && c.hour >= 16 ? ` До сна ~${fmtH(c.sleepH)}.` : "");
  $("#cookCtx").textContent = c.left >= 0 ? `Осталось ${c.left} ккал.${since}` : `Перебор ${-c.left} ккал.${since}`;
}
function cookChipList(c){
  const out = [];
  if (c.isToday){
    if (c.left <= 100) out.push({q:"Чем заглушить голод почти без калорий"});
    else if (c.sinceH != null && c.sinceH >= 4) out.push({q:`Давно не ел — что-нибудь сытное на ~${Math.min(c.left, Math.max(300, c.perMeal))} ккал`});
    else out.push({q:`${c.next}: что съесть на ~${Math.min(c.left, Math.max(250, c.perMeal))} ккал?`});
    if (c.hour >= 19 && c.left > 100) out.push({q:"Что съесть вечером, чтобы не проголодаться до сна"});
    if (c.pLeft >= 40 && c.left > 150) out.push({q:`Как добрать ещё ~${c.pLeft} г белка?`});
  }
  out.push({fill:"Прошёл  шагов", caret:7, label:"Записать шаги"});
  out.push({fill:"Вешу  кг", caret:5, label:"Записать вес"});
  return out.slice(0, 5);
}
function renderCookChips(){
  const box = $("#cookChips"); box.replaceChildren();
  if (chatBusy) return;
  for (const ch of cookChipList(dayContext(cur))){
    const b = el("button",{type:"button",class:"chip" + (ch.fill ? " ghost" : ""),text: ch.label || ch.q});
    b.onclick = () => {
      if (ch.q){ sendChat(ch.q); return; }
      const t = $("#foodText"); t.value = ch.fill; autoGrow(); t.focus(); t.setSelectionRange(ch.caret, ch.caret);
    };
    box.append(b);
  }
}

function chatRules(dk){
  const c = dayContext(dk);
  const state = [];
  if (c.isToday){
    if (c.sinceH == null) state.push("сегодня с едой ещё ничего не записано");
    else if (c.sinceH >= 5) state.push(`последний приём ${fmtH(c.sinceH)} назад — скорее всего, человек уже ощутимо голоден`);
    else if (c.sinceH >= 3) state.push(`последний приём ${fmtH(c.sinceH)} назад — лёгкий голод вероятен`);
    else state.push(`последний приём ${fmtH(c.sinceH)} назад (${c.lastTitle}, ${c.lastKcal} ккал) — сильного голода, скорее всего, нет`);
    if (c.sleepH != null) state.push(`до сна примерно ${fmtH(c.sleepH)} (ложится около ${settings.bedtime}, сам говорил)`);
    else if (c.hour >= 17) state.push("во сколько человек ложится спать, неизвестно");
  } else state.push(`человек правит прошлый день (${label(dk)}), время и голод сейчас не важны`);
  if (c.fLeft <= 10) state.push(`жиры почти исчерпаны: ${c.f} из ${c.gf} г`);
  if (c.pLeft >= 40) state.push(`белка не хватает: ${c.p} из ${c.gp} г`);
  if (c.left < 0) state.push(`норма уже превышена на ${-c.left} ккал`);
  return `Ты помощник внутри дневника питания и общаешься как в чате. Человек пишет что угодно: что съел или выпил, вопрос про еду, шаги, вес, время сна, исправление записи. Ты не только отвечаешь, но и выполняешь действия: страница сама применит их к дневнику.
Человек: мужчина 25 лет, рост 172 см, вес около ${String(c.weight).replace(".",",")} кг, худеет с дефицитом калорий. Базовая норма ${c.base} ккал${c.bonus ? `, плюс ${c.bonus} ккал за шаги, итого ${c.target}` : ""}.
День: ${c.isToday ? "сегодня" : label(dk)}, сейчас ${c.time}.
Записи этого дня (в квадратных скобках id записи):
${c.detail.length ? c.detail.map(x => "- " + x).join("\n") : "- пока нет"}
Итог: ${c.eatenKcal} ккал. БЖУ: белки ${c.p}/${c.gp} г, жиры ${c.f}/${c.gf} г, углеводы ${c.c}/${c.gc} г. Осталось ${c.left} ккал${c.isToday ? `, впереди примерно ${String(c.mealsLeft).replace(".",",")} приёма, ~${c.perMeal} ккал на приём` : ""}.
Шаги за день: ${c.steps ? fmtInt(c.steps) : "не записаны"}.
Вероятное состояние: ${state.join("; ")}.

Действия, которые ты можешь вернуть в "actions" (можно несколько, в любом сочетании):
- add_meal — человек съел или выпил что-то. Разбери еду на блюда, а блюда на ингредиенты с весом и КБЖУ. Объединяй блюда («Бутерброды с сыром, 2 шт.») только если они полностью одинаковы по составу, иначе это разные блюда, а общий хлеб, сыр, соус дели между ними. Простой продукт — блюдо из одного ингредиента. Масло, соусы и сахар — отдельные ингредиенты. Если вес не указан, бери стандартные порции и продукты из российских магазинов (ломтик нарезного батона ~28 г, ломтик сыра ~20 г, ст. л. соуса ~15 г, стакан 250 мл, тарелка гарнира ~200 г готового). Оценивай реалистично, без занижения. meal: 0 завтрак, 1 обед, 2 перекус, 3 ужин — по словам человека, иначе по времени. title — 2–5 слов. Если приложены фото, это еда этого приёма: определи блюда и вес по фото, не считай одно и то же дважды; текст важнее фото.
- edit_meal — уточнение уже записанного («котлета была 150 г», «сахара не было», «это был ужин»). Укажи id записи и полный новый состав всей записи. То, что человек не трогал, оставь как было.
- delete_meal — «удали», «этого не ел». Укажи id.
- steps — шаги за день итогом. Если человек говорит «ещё N шагов», верни прежние + N.
- weight — вес в кг.
- bedtime — во сколько ложится спать, ЧЧ:ММ.
- recipes — если человек просит идею, рецепт или спрашивает, что поесть. 1–3 рецепта на одну порцию с весом и КБЖУ ингредиентов, шагами и коротким поисковым запросом по-русски. В первую очередь русская и домашняя кухня, обычные продукты. Подбирай под состояние: если давно не ел или впереди долгий вечер — сытное, белковое, объёмное, с клетчаткой; ближе ко сну — лёгкое, но сытное; если калорий мало — объёмное низкокалорийное или раздели на два приёма; если жиров много — без масла, майонеза, сыра, колбасы. Время сна не придумывай: если оно неизвестно и важно для совета, коротко спроси в тексте и дай совет с оговоркой.
Если непонятно, съел человек или только собирается, или какую запись править, ничего не записывай, а коротко спроси в тексте.

Формат ответа: несколько строк, в каждой ровно один JSON-объект. Без markdown, без \`\`\`, без текста вне JSON. Порядок:
1. Перед каждым шагом работы — строка {"status":"что делаешь сейчас, 2–6 слов"}, например {"status":"Разбираю сообщение"}, {"status":"Считаю калории борща"}, {"status":"Смотрю, сколько осталось на вечер"}, {"status":"Подбираю рецепты"}. Обычно 2–4 статуса.
2. Каждое действие — отдельной строкой {"action":{…}}, сразу как оно готово.
3. Последней строкой — {"text":"…"}: 1–3 предложения по-русски, что сделал и, если уместно, короткий совет с учётом состояния. Цифры из карточек действий не повторяй. Не придумывай ссылки.
Форматы действий:
{"type":"add_meal","meal":1,"title":"…","note":"короткое пояснение о допущениях или пустая строка","dishes":[{"name":"…","items":[{"name":"…","grams":150,"kcal":120,"p":5,"f":4,"c":15}]}]}
{"type":"edit_meal","id":"…","meal":1,"title":"…","note":"…","dishes":[…]}
{"type":"delete_meal","id":"…"}
{"type":"steps","steps":9000}
{"type":"weight","kg":99.4}
{"type":"bedtime","time":"01:00"}
{"type":"recipes","items":[{"title":"…","why":"почему подходит сейчас, до 12 слов","time":20,"ingredients":[{"name":"…","grams":150,"kcal":165,"p":35,"f":3,"c":0}],"steps":["…"],"search":"…"}]}
Если действий нет, пиши только status и text. Каждый объект, даже большой рецепт, пиши целиком в одну строку, без переносов внутри. Числа целые, кроме веса.`;
}

/* ---------- applying and undoing actions ---------- */
async function applyActions(dk, acts, photoIds, userText){
  let entries = ((days[dk] && days[dk].entries) || []).slice();
  let changed = false, photosUsed = false;
  const out = [], iso = new Date().toISOString();
  for (const a of acts.slice(0, 8)){
    const type = str(a && a.type, 20);
    if (type === "add_meal"){
      const dishes = cleanDishes(a.dishes), items = dishes.flatMap(d => d.items);
      if (!items.length) continue;
      const t = totals(items), ph = !photosUsed && photoIds.length ? photoIds : [];
      photosUsed = photosUsed || ph.length > 0;
      const entry = {id:newId(), text: userText || ("По фото: " + dishes.map(d => d.name).join(", ")), title: str(a.title, 80) || dishes[0].name, meal: clampMeal(a.meal), time: iso,
        dishes, items, note: str(a.note, 160), photos: ph, photo: ph.length > 0, kcal: t.kcal, p: t.p, f: t.f, c: t.c};
      entries.push(entry); changed = true; petEvent("eat");
      out.push({type, state:"done", entryId: entry.id, title: entry.title, meal: entry.meal, kcal: t.kcal, p: t.p, f: t.f, c: t.c, grams: sumGrams(items), dishes: dishes.map(d => d.name)});
    } else if (type === "edit_meal"){
      const idx = entries.findIndex(e => e.id === str(a.id, 60));
      if (idx < 0) continue;
      const prev = entries[idx], dishes = cleanDishes(a.dishes), items = dishes.flatMap(d => d.items);
      if (!items.length) continue;
      const t = totals(items);
      const upd = {...prev, title: str(a.title, 80) || prev.title, meal: a.meal == null ? prev.meal : clampMeal(a.meal), dishes, items, note: str(a.note, 160) || prev.note || "",
        kcal: t.kcal, p: t.p, f: t.f, c: t.c, edited: iso};
      entries[idx] = upd; changed = true;
      out.push({type, state:"done", entryId: prev.id, prev, title: upd.title, meal: upd.meal, kcal: t.kcal, p: t.p, f: t.f, c: t.c, grams: sumGrams(items), prevKcal: round(prev.kcal)});
    } else if (type === "delete_meal"){
      const idx = entries.findIndex(e => e.id === str(a.id, 60));
      if (idx < 0) continue;
      const prev = entries[idx]; entries.splice(idx, 1); changed = true;
      out.push({type, state:"done", prev, title: prev.title || prev.text, kcal: round(prev.kcal)});
    } else if (type === "steps"){
      const n = round(a.steps);
      if (!(n >= 0 && n < 150000)) continue;
      const prevSteps = stepsOf(dk);
      activity = {...activity, [dk]: {steps: n}};
      enqueue(() => db.collection("activity").doc(dk).set({steps: n}));
      out.push({type, state:"done", steps: n, prevSteps, bonus: stepsBonus(dk)});
    } else if (type === "weight"){
      const kg = Math.round(parseFloat(String(a.kg).replace(",", ".")) * 10) / 10;
      if (!(kg > 30 && kg < 300)) continue;
      const prevW = weights[dk] == null ? null : weights[dk];
      weights = {...weights, [dk]: kg};
      enqueue(() => db.collection("meta").doc("weights").set({byDate: weights}));
      out.push({type, state:"done", kg, prevW});
    } else if (type === "bedtime"){
      const tm = str(a.time, 5);
      if (!/^\d{1,2}:\d{2}$/.test(tm)) continue;
      const prevB = settings.bedtime || "";
      settings = {...settings, bedtime: tm};
      enqueue(() => db.collection("meta").doc("settings").set(settings));
      out.push({type, state:"done", time: tm, prevB});
    } else if (type === "recipes"){
      const items = Array.isArray(a.items) ? a.items.slice(0, 3) : [];
      if (items.length) out.push({type, state:"info", items});
    }
  }
  if (changed) await saveDay(dk, entries); else render();
  return out;
}
async function undoAction(dk, mi, ai){
  const msgs = chatMsgs(dk).map(m => ({...m, actions: Array.isArray(m.actions) ? m.actions.map(x => ({...x})) : m.actions}));
  const a = msgs[mi] && msgs[mi].actions && msgs[mi].actions[ai];
  if (!a || a.state !== "done") return;
  let entries = ((days[dk] && days[dk].entries) || []).slice();
  if (a.type === "add_meal"){ entries = entries.filter(e => e.id !== a.entryId); await saveDay(dk, entries); }
  else if (a.type === "edit_meal"){ entries = entries.map(e => e.id === a.entryId ? a.prev : e); await saveDay(dk, entries); }
  else if (a.type === "delete_meal"){ entries.push(a.prev); await saveDay(dk, entries); }
  else if (a.type === "steps"){ activity = {...activity, [dk]: {steps: a.prevSteps || 0}}; enqueue(() => db.collection("activity").doc(dk).set({steps: a.prevSteps || 0})); render(); }
  else if (a.type === "weight"){ const w = {...weights}; if (a.prevW == null) delete w[dk]; else w[dk] = a.prevW; weights = w; enqueue(() => db.collection("meta").doc("weights").set({byDate: weights})); render(); }
  else if (a.type === "bedtime"){ settings = {...settings, bedtime: a.prevB || ""}; enqueue(() => db.collection("meta").doc("settings").set(settings)); render(); }
  a.state = "undone";
  await saveChat(dk, msgs);
}

/* ---------- chat storage and rendering ---------- */
let chatBusy = false, chatCtl = null, pendingDay = null, thinkStart = 0, thinkTimer = null;
const recorded = new Set();
function chatMsgs(dk){ return (chats[dk] && Array.isArray(chats[dk].msgs)) ? chats[dk].msgs : []; }
function saveChat(dk, msgs){
  msgs = msgs.slice(-40);
  chats = {...chats, [dk]: {msgs}};
  renderChat();
  if (!db) return Promise.resolve();
  return enqueue(() => db.collection("chat").doc(dk).set({msgs}));
}
function actionSummary(a){
  if (a.type === "add_meal") return `записал «${a.title}», ${a.kcal} ккал`;
  if (a.type === "edit_meal") return `исправил «${a.title}»: ${a.prevKcal} → ${a.kcal} ккал`;
  if (a.type === "delete_meal") return `удалил «${a.title}»`;
  if (a.type === "steps") return `шаги: ${a.steps}`;
  if (a.type === "weight") return `вес: ${a.kg} кг`;
  if (a.type === "bedtime") return `время сна: ${a.time}`;
  if (a.type === "recipes") return "предложил рецепты: " + a.items.map(x => x.title).join("; ");
  return "";
}
function historyTurns(msgs){
  return msgs.slice(-10).map(m => {
    if (m.role === "user") return {role:"user", content: (m.text || "(только фото)") + (m.photos ? ` (приложено фото: ${m.photos})` : "")};
    const acts = (m.actions || []).map(a => actionSummary(a) + (a.state === "undone" ? " (человек отменил)" : "")).filter(Boolean);
    return {role:"assistant", content: (m.text || "…") + (acts.length ? "\n[" + acts.join("; ") + "]" : "")};
  }).filter(t => t.content);
}
function setSendState(){
  const b = $("#addBtn");
  b.innerHTML = chatBusy ? ICON_STOP : ICON_SEND;
  b.setAttribute("aria-label", chatBusy ? "Остановить" : "Отправить");
  b.classList.toggle("stop", chatBusy);
  renderCookChips();
  chatBarPreview();
}
function stepLi(st){ return el("li",{class:"stepLine " + (st.done ? "done" : "now")}, el("span",{class:"tick","aria-hidden":"true"}), el("span",{text: st.t})); }
/* one assistant turn: header, then steps and action cards in the order they happened, then the reply text */
function aiBlockEl(m, mi, dk, isLive){
  const wrap = el("div",{class:"aiMsg" + (m.error ? " err" : "") + (isLive ? " live" : ""), id: isLive ? "liveBlock" : null});
  const tl = Array.isArray(m.timeline) ? m.timeline
    : [...(m.steps || []).map(t => ({k:"s", t, done:true})), ...(m.actions || []).map((x, i) => ({k:"a", i}))];
  if (isLive){
    const sec = el("span",{class:"thinkSec num",id:"thinkSec",text: Math.floor((Date.now() - thinkStart)/1000) + " с"});
    wrap.append(el("div",{class:"turnHead"}, el("span",{class:"shimmer",text:"Думаю"}), sec));
  } else if (m.secs){
    const nSteps = tl.filter(x => x.k === "s").length;
    const head = el("button",{type:"button",class:"turnHead done","aria-expanded":"true"},
      el("span",{text:`Готово за ${m.secs} с`}), nSteps ? el("span",{class:"chev"}) : null);
    if (nSteps){ head.lastChild.innerHTML = ICON_CHEV; head.onclick = () => { const c = wrap.classList.toggle("collapsed"); head.setAttribute("aria-expanded", String(!c)); }; }
    wrap.append(head);
  }
  let ul = null;
  for (const x of tl){
    if (x.k === "s"){
      if (!ul){ ul = el("ul",{class:"trace"}); wrap.append(ul); }
      ul.append(stepLi({t: x.t, done: isLive ? !!x.done : true}));
    } else if (x.k === "a"){
      ul = null;
      const a = (m.actions || [])[x.i];
      if (a){ const c = actCard(dk, isLive ? -1 : mi, x.i, a); if (c) wrap.append(c); }
    }
  }
  const txt = isLive ? (m.textShown || "") : (m.text || "");
  if (txt || isLive) wrap.append(el("p",{class:"aiText" + (isLive ? " typing" : ""), id: isLive ? "liveText" : null, text: txt}));
  return wrap;
}
function liveView(){ return live ? {timeline: live.timeline, actions: live.results, textShown: live.textShown, error:false} : null; }
function updateLive(){
  const feed = $("#feed"), old = document.getElementById("liveBlock");
  if (!live || live.dk !== cur || !old){ renderChat(); return; }
  const stick = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
  old.replaceWith(aiBlockEl(liveView(), -1, live.dk, true));
  if (stick) feed.scrollTop = feed.scrollHeight;
}
function actCard(dk, mi, ai, a){
  const canUndo = mi >= 0 && a.state === "done" && a.type !== "recipes";
  const labels = {add_meal: "Записано · " + MEALS[clampMeal(a.meal)].toLowerCase(), edit_meal: "Исправлено", delete_meal: "Удалено", steps: "Шаги", weight: "Вес", bedtime: "Время сна"};
  let body;
  if (a.type === "add_meal" || a.type === "edit_meal" || a.type === "delete_meal"){
    const obj = {kcal: a.kcal, p: a.p != null ? a.p : (a.prev && a.prev.p), f: a.f != null ? a.f : (a.prev && a.prev.f), c: a.c != null ? a.c : (a.prev && a.prev.c), grams: a.grams || (a.prev ? sumGrams(a.prev.items || []) : 0)};
    body = el("div",{class:"actRow"}, el("span",{class:"actTitle",text: a.title}), ...barAndKcal(obj, a.title));
    const sub = a.type === "edit_meal" ? `было ${a.prevKcal} ккал` : a.type === "add_meal" && a.dishes && a.dishes.length ? a.dishes.join(" · ") : "";
    if (sub) body = el("div",{}, body, el("p",{class:"actSub",text: sub}));
  } else if (a.type === "steps"){
    body = el("div",{class:"actRow"}, el("span",{class:"actTitle num",text: fmtInt(a.steps) + " шагов"}), el("span",{class:"actSub num",text: (b => b ? `+${b} ккал к норме` : "без прибавки к норме")(stepsOf(dk) === a.steps ? stepsBonus(dk) : a.bonus)}));
  } else if (a.type === "weight"){
    body = el("div",{class:"actRow"}, el("span",{class:"actTitle num",text: String(a.kg).replace(".",",") + " кг"}), el("span",{class:"actSub",text: a.prevW != null ? `было ${String(a.prevW).replace(".",",")} кг` : ""}));
  } else if (a.type === "bedtime"){
    body = el("div",{class:"actRow"}, el("span",{class:"actTitle num",text: "Ложусь в " + a.time}), el("span",{class:"actSub",text:"учту в советах"}));
  } else if (a.type === "recipes"){
    const box = el("div",{class:"recipes"});
    a.items.forEach((r, k) => box.append(recipeCard(r, dk, `${mi >= 0 && chatMsgs(dk)[mi] ? chatMsgs(dk)[mi].id : "live"}:${k}`)));
    return box;
  } else return null;
  const head = el("div",{class:"actHead"}, el("span",{class:"actDot","aria-hidden":"true"}), el("span",{class:"actLabel",text: a.state === "undone" ? "Отменено" : a.state === "error" ? "Не получилось" : (labels[a.type] || "")}));
  if (canUndo){
    const u = el("button",{type:"button",class:"undo",text:"Отменить"});
    u.onclick = () => { u.disabled = true; undoAction(dk, mi, ai); };
    head.append(u);
  }
  return el("div",{class:"act " + a.type,"data-state": a.state}, head, body);
}
function recipeCard(r, dk, key){
  const items = (Array.isArray(r.ingredients) ? r.ingredients : []).map(cleanItem);
  const t = totals(items), title = str(r.title, 80) || "Рецепт";
  const steps = (Array.isArray(r.steps) ? r.steps : []).map(x => str(x, 400)).filter(Boolean).slice(0,12);
  const q = str(r.search, 120) || title + " рецепт";
  const ing = el("ul",{class:"items"});
  for (const it of items) ing.append(el("li",{class:"ing"}, el("span",{class:"ingName",text:`${it.name}, ~${it.grams} г`}), ...barAndKcal(it, it.name)));
  const ol = el("ol",{}); steps.forEach(s => ol.append(el("li",{text:s})));
  const det = el("details",{class:"req"});
  const lab = el("span",{text:"Ингредиенты и шаги"}), chev = el("span",{class:"chev"}); chev.innerHTML = ICON_CHEV;
  det.append(el("summary",{}, lab, chev), ing, steps.length ? ol : null);
  det.addEventListener("toggle", () => { lab.textContent = det.open ? "Свернуть" : "Ингредиенты и шаги"; });
  const yt = el("a",{href:"https://www.youtube.com/results?search_query=" + encodeURIComponent(q), target:"_blank", rel:"noopener", text:"Видео на YouTube"});
  const ya = el("a",{href:"https://yandex.ru/search/?text=" + encodeURIComponent(q), target:"_blank", rel:"noopener", text:"Рецепты в Яндексе"});
  const add = el("button",{type:"button",class:"small",text: recorded.has(key) ? "Записано" : "Записать в дневник"});
  if (recorded.has(key)) add.disabled = true;
  add.onclick = async () => {
    if (!db || !items.length) return;
    add.disabled = true; recorded.add(key);
    const entry = {id:newId(), text:"Рецепт из чата: " + title, title, photos:[], photo:false, meal: defaultMeal(), time:new Date().toISOString(),
      dishes:[{name:title, items}], items, note:"по рецепту, одна порция", kcal:t.kcal, p:t.p, f:t.f, c:t.c};
    await saveDay(dk, ((days[dk] && days[dk].entries) || []).concat(entry));
    add.textContent = "Записано";
  };
  return el("div",{class:"recipe"},
    el("div",{class:"recipeHead"}, el("span",{class:"recipeTitle",text:title}), ...barAndKcal({...t, grams: sumGrams(items)}, title, "entrykcal")),
    r.why ? el("span",{class:"recipeWhy",text: str(r.why, 120)}) : null,
    el("span",{class:"recipeMeta num",text:`${r.time ? "~" + round(r.time) + " мин · " : ""}1 порция`}),
    det, el("div",{class:"recipeLinks"}, yt, ya, add));
}
let chatShownFor = null;
function renderChat(){
  const feed = $("#feed");
  const stick = chatShownFor !== cur || feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60;
  feed.replaceChildren();
  const msgs = chatMsgs(cur);
  if (!msgs.length && pendingDay !== cur){
    feed.append(el("div",{class:"feedEmpty"},
      el("p",{text:"Пиши как другу: что съел, что хочешь поесть, сколько прошёл. Например:"}),
      el("ul",{}, el("li",{text:"«Съел тарелку борща со сметаной и два куска чёрного хлеба»"}), el("li",{text:"«Что приготовить на ужин из курицы?»"}), el("li",{text:"«Прошёл 8 тысяч шагов, вешу 99,6»"}), el("li",{text:"«Котлета была граммов 150»"}))));
  }
  msgs.forEach((m, mi) => {
    if (m.role === "user"){
      feed.append(el("div",{class:"msg me"}, m.voice ? pxEl("mic", 14, "msgMic") : null, m.text || null, m.photos ? el("span",{class:"msgPh",text:`Фото: ${m.photos}`}) : null));
    } else feed.append(aiBlockEl(m, mi, cur, false));
  });
  if (pendingDay === cur && live) feed.append(aiBlockEl(liveView(), -1, cur, true));
  chatShownFor = cur;
  const cb = $("#clearChat"); cb.hidden = !msgs.length || chatBusy; cb.classList.remove("arm"); cb.textContent = "Очистить чат";
  if (stick) feed.scrollTop = feed.scrollHeight;
  chatBarPreview();
}
let live = null; /* {dk, timeline:[{k:"s",t,done}|{k:"a",i}], results:[], textTarget, textShown} */
let typeTimer = null;
/* every top-level {...} in a text, tolerant of line breaks and stray characters around them */
function scanObjects(txt){
  const out = []; let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < txt.length; i++){
    const ch = txt[i];
    if (inStr){ if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"'){ if (depth > 0) inStr = true; continue; }
    if (ch === "{"){ if (depth === 0) start = i; depth++; }
    else if (ch === "}" && depth > 0){ depth--; if (depth === 0 && start >= 0){ try { out.push(JSON.parse(txt.slice(start, i + 1))); } catch (e) {} start = -1; } }
  }
  return out;
}
function liveStep(t, replaceThinking){
  if (!live) return;
  if (replaceThinking){ const i = live.timeline.findIndex(x => x.k === "s" && x.t === "Claude думает"); if (i >= 0) live.timeline.splice(i, 1); }
  live.timeline.forEach(x => { if (x.k === "s") x.done = true; });
  live.timeline.push({k:"s", t, done:false});
  updateLive();
}
function liveResult(res){
  if (!live) return;
  live.timeline.forEach(x => { if (x.k === "s") x.done = true; });
  for (const r of res){ live.results.push(r); live.timeline.push({k:"a", i: live.results.length - 1}); }
  updateLive();
}
/* type the reply out smoothly, catching up with what has already arrived */
function typeTick(){
  if (!live) return;
  const tgt = live.textTarget, cur0 = live.textShown;
  if (cur0.length < tgt.length){
    const step = Math.max(1, Math.ceil((tgt.length - cur0.length) / 12));
    live.textShown = tgt.slice(0, cur0.length + step);
    const p = document.getElementById("liveText");
    if (p){ p.textContent = live.textShown; const feed = $("#feed"); if (feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80) feed.scrollTop = feed.scrollHeight; }
  }
}
const partialText = buf => {
  const mm = /^\s*\{\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(buf);
  if (!mm) return null;
  let raw = mm[1]; if (/\\$/.test(raw) && !/\\\\$/.test(raw)) raw = raw.slice(0, -1);
  try { return JSON.parse('"' + raw + '"'); } catch (e) { return null; }
};
async function sendChat(text, voice){
  text = str(text, 2000);
  const items = mainPicker.items.slice();
  if (chatBusy || (!text && !items.length)) return;
  if (!sample || !db){ setStatus("Чат работает только внутри Claude.", true); return; }
  setStatus("");
  const dk = cur, history = chatMsgs(dk);
  const userMsg = {id:newId(), role:"user", text, photos: items.length, voice: !!voice, time:new Date().toISOString()};
  $("#foodText").value = ""; autoGrow();
  mainPicker.items = []; fillThumbs($("#thumbs"), mainPicker, $("#photoCount"));
  chatBusy = true; pendingDay = dk; thinkStart = Date.now();
  live = {dk, timeline:[], results:[], textTarget:"", textShown:""};
  setSendState();
  thinkTimer = setInterval(() => { const s = document.getElementById("thinkSec"); if (s) s.textContent = Math.floor((Date.now() - thinkStart)/1000) + " с"; }, 1000);
  typeTimer = setInterval(typeTick, 30);
  saveChat(dk, history.concat(userMsg));
  let finalText = "", failed = null;
  try {
    liveStep("Смотрю записи за день");
    let prepared = [];
    if (items.length){ liveStep(`Готовлю фото (${items.length})`); prepared = await preparePhotos(items); }
    liveStep("Claude думает");
    chatCtl = new AbortController();
    const input = [{role:"user", content: chatRules(dk)}, ...historyTurns(history),
      {role:"user", content: (text || "(только фото, без текста)") + (items.length ? `\n(приложено фото: ${items.length})` : "")}];
    const opts = {modelTier:"default", cache:false, signal: chatCtl.signal};
    if (prepared.length) opts.images = prepared.map(p => p.blob);
    let buf = "", full = "", chain = Promise.resolve(), photoIds = null, firstStatus = true;
    const seen = new Set();
    const handle = line => {
      line = line.trim().replace(/^```(json)?/,"").replace(/```$/,"").trim();
      if (!line || line[0] !== "{") return;
      let o; try { o = JSON.parse(line); } catch (e) { return; }
      handleObj(o);
    };
    const handleObj = o => {
      if (!o || typeof o !== "object") return;
      const key = JSON.stringify(o);
      if (seen.has(key)) return;
      seen.add(key);
      if (o.status){ chain = chain.then(() => { liveStep(str(o.status, 60), firstStatus); firstStatus = false; }); }
      if (o.action){
        const a = o.action;
        chain = chain.then(async () => {
          let ids = [];
          if (a && a.type === "add_meal" && prepared.length && photoIds === null){ photoIds = await storePhotos(prepared); ids = photoIds; }
          liveResult(await applyActions(dk, [a], ids, text));
        });
      }
      if (o.text != null){ finalText = str(o.text, 1200); chain = chain.then(() => { if (live){ live.timeline.forEach(x => { if (x.k === "s") x.done = true; }); live.textTarget = finalText; } }); }
    };
    await sample(input, {...opts, onText: ({text: whole, delta}) => {
      full = whole;
      const lines = (buf + delta).split("\n"); buf = lines.pop(); lines.forEach(handle);
      const pt = partialText(buf);
      if (pt != null) chain = chain.then(() => { if (live && pt.length > live.textTarget.length){ live.timeline.forEach(x => { if (x.k === "s") x.done = true; }); live.textTarget = pt; if (!document.getElementById("liveText")) updateLive(); } });
    }});
    handle(buf);
    /* objects the model spread over several lines are missed line by line: scan the whole reply once more */
    for (const o of scanObjects(full)) handleObj(o);
    await chain;
    /* let the typing finish (at most ~2 s) */
    const until = Date.now() + 2500;
    while (live && live.textShown.length < live.textTarget.length && Date.now() < until) await new Promise(r => setTimeout(r, 40));
  } catch (e) {
    failed = e;
  } finally {
    for (const it of items) URL.revokeObjectURL(it.url);
  }
  const results = live ? live.results : [];
  const timeline = live ? live.timeline.filter(x => !(x.k === "s" && x.t === "Claude думает")).map(x => x.k === "s" ? {k:"s", t:x.t} : x) : [];
  const secs = Math.max(1, Math.round((Date.now() - thinkStart)/1000));
  const msg = failed
    ? {id:newId(), role:"ai", error: !(failed && failed.code === "cancelled"), text: (finalText ? finalText + "\n" : "") + (failed && failed.code === "cancelled" ? "Остановлено." : (failed && failed.code ? sampleErr(failed) : dbErr(failed))), actions: results, timeline, secs, time:new Date().toISOString()}
    : {id:newId(), role:"ai", text: finalText || (results.length ? "Готово." : "Не совсем понял. Уточни, пожалуйста."), actions: results, timeline, secs, time:new Date().toISOString()};
  clearInterval(thinkTimer); clearInterval(typeTimer);
  chatBusy = false; chatCtl = null; pendingDay = null; live = null; setSendState();
  await saveChat(dk, chatMsgs(dk).concat(msg));
}
$("#addForm").addEventListener("submit", ev => {
  ev.preventDefault();
  if (chatBusy){ if (chatCtl) chatCtl.abort(); return; }
  sendChat($("#foodText").value);
});
$("#foodText").addEventListener("keydown", ev => {
  if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing){ ev.preventDefault(); if (!chatBusy) sendChat($("#foodText").value); }
});
setSendState();
(() => {
  const cb = $("#clearChat"); let t;
  cb.onclick = () => {
    if (chatBusy) return;
    if (!cb.classList.contains("arm")){ cb.classList.add("arm"); cb.textContent = "Точно очистить? Записи в дневнике останутся"; t = setTimeout(() => { cb.classList.remove("arm"); cb.textContent = "Очистить чат"; }, 4000); return; }
    clearTimeout(t); recorded.clear(); saveChat(cur, []);
  };
})();

$("#weightForm").addEventListener("submit", ev => {
  ev.preventDefault();
  const v = parseFloat(String($("#weightIn").value).replace(",","."));
  if (!(v > 30 && v < 300) || !db) return;
  weights = {...weights, [cur]: Math.round(v*10)/10};
  $("#weightIn").value = "";
  render();
  enqueue(() => db.collection("meta").doc("weights").set({byDate: weights}));
});
let setTimer;
function onSetting(){
  clearTimeout(setTimer);
  setTimer = setTimeout(() => {
    const kcal = Math.min(4000, Math.max(1200, +$("#tKcal").value || 1800));
    const protein = Math.min(300, Math.max(40, +$("#tProt").value || 140));
    const goal = Math.min(200, Math.max(40, +$("#tGoal").value || 80));
    if (kcal === +settings.target && protein === +settings.protein && goal === +settings.goal) return;
    settings = {target:kcal, protein, goal, bedtime: settings.bedtime || ""};
    render();
    if (db) enqueue(() => db.collection("meta").doc("settings").set(settings));
  }, 700);
}
$("#tKcal").addEventListener("input", onSetting);
$("#tProt").addEventListener("input", onSetting);
$("#tGoal").addEventListener("input", onSetting);
$("#prev").onclick = () => { cur = shift(cur,-1); render(); renderChat(); };
$("#next").onclick = () => { if (cur < todayKey()){ cur = shift(cur,1); render(); renderChat(); } };
render();

(async () => {
  if (!window.claude || !window.claude.use){ showNotice(); return; }
  const [d, s] = await Promise.all([claude.use("db"), claude.use("sample")]);
  db = d; sample = s;
  if (!db){ showNotice(); return; }
  if (!sample){ $("#addBtn").disabled = true; setStatus("Оценка калорий недоступна в этом окне. Открой дневник в Claude.", true); }
  else sample.limits().then(l => {
    if (l && l.images){ photoMax = l.images.maxCount || 1; photoTypes = l.images.mediaTypes; $("#attachBtn").hidden = false; $("#photoIn").accept = photoTypes.join(","); }
  }).catch(() => {});
  db.collection("days").onSnapshot(snap => {
    const next = {};
    for (const doc of snap.docs){ const b = doc.data(); next[doc.id] = {entries: Array.isArray(b && b.entries) ? b.entries : []}; }
    days = next; ready = true; render();
  }, () => { ready = true; render(); });
  db.collection("activity").onSnapshot(snap => {
    const next = {}; for (const d of snap.docs){ const b = d.data() || {}; next[d.id] = {steps: +b.steps || 0}; }
    activity = next; render();
  });
  db.collection("chat").onSnapshot(snap => {
    const next = {}; for (const d of snap.docs){ const b = d.data() || {}; next[d.id] = {msgs: Array.isArray(b.msgs) ? b.msgs : []}; }
    chats = next; renderChat();
  });
  petBoot();
  db.collection("meta").onSnapshot(snap => {
    for (const doc of snap.docs){
      const b = doc.data() || {};
      if (doc.id === "settings") settings = {target: +b.target || 1800, protein: +b.protein || 140, goal: +b.goal || 80, bedtime: String(b.bedtime || "")};
      if (doc.id === "weights") weights = b.byDate || {};
    }
    render();
  });
})();
function showNotice(){
  const n = $("#notice"); n.hidden = false;
  n.textContent = "Записи хранятся в Claude. Открой этот дневник по ссылке из Claude, войдя в свой аккаунт.";
  ready = true; render();
}
