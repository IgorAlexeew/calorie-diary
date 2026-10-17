/* Pixel pet: a 32×32 sprite assembled from template parts, drawn on a canvas.
   PetEngine.draw(ctx, pet, look, frame) — pet = parts chosen once (by the AI or at random),
   look = what today's stats change (fat, muscle, branch, state). */
(() => {
  const OUT = "#1B1F24";
  const PALETTES = {
    mint:     ["#6CCB9C", "#B7EBCF", "#2F7D5B"],
    peach:    ["#F4A07A", "#FFD6C2", "#B4583A"],
    lavender: ["#A98BE0", "#D9CCF6", "#5B3F98"],
    sky:      ["#6AB3F0", "#C3E2FB", "#2D6BA8"],
    lemon:    ["#EFD15A", "#FAEFB4", "#A68A1E"],
    cherry:   ["#E8657A", "#F8C0CA", "#9C2E42"],
    graphite: ["#8B95A1", "#C9D0D8", "#4A535E"],
    moss:     ["#9DBB5A", "#D6E6AE", "#5A7428"]
  };
  const PARTS = {
    body: ["round", "egg", "pear", "square", "ghost", "blob"],
    ears: ["none", "cat", "bunny", "bear", "antenna", "horns", "sprout"],
    eyes: ["dot", "big", "bead", "sleepy"],
    mouth: ["smile", "cat", "flat", "fang"],
    tail: ["none", "curl", "fluff", "spikes"],
    pattern: ["none", "belly", "spots", "stripes"],
    palette: Object.keys(PALETTES)
  };
  const NAMES = ["Пиксель", "Бублик", "Кекс", "Тофу", "Шпрот", "Мусс", "Байт", "Пельмень", "Чиа", "Кунжут", "Хрум", "Зефир"];
  const rnd = a => a[Math.floor(Math.random() * a.length)];
  function randomPet(){
    const p = {}; for (const k in PARTS) p[k] = rnd(PARTS[k]);
    p.name = rnd(NAMES);
    return p;
  }
  const hash = (x, y) => { let h = x * 374761393 + y * 668265263; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; };
  const gray = c => { const n = parseInt(c.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, v = Math.round(r * .3 + g * .59 + b * .11); const m = (a) => Math.round(a * .45 + v * .55); return "#" + [m(r), m(g), m(b)].map(x => x.toString(16).padStart(2, "0")).join(""); };
  const tint = (c, t) => { const n = parseInt(c.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255, T = [150, 190, 90]; return "#" + [r, g, b].map((x, i) => Math.round(x * .6 + T[i] * .4).toString(16).padStart(2, "0")).join(""); };

  function inside(shape, dx, dy, x){
    switch (shape){
      case "egg": { const k = 1 + 0.28 * Math.max(0, -dy); return (dx * k) ** 2 + dy * dy <= 1; }
      case "pear": { const k = 1 + 0.55 * Math.max(0, -dy); return (dx * k) ** 2 + dy * dy <= 1; }
      case "square": return dx ** 4 + dy ** 4 <= 1;
      case "ghost": return dy < 0 ? dx * dx + dy * dy <= 1 : Math.abs(dx) <= 0.98 && dy <= 0.8 + (x % 3 === 0 ? 0.2 : 0);
      case "blob": { const a = Math.atan2(dy, dx); return dx * dx + dy * dy <= 1 + 0.1 * Math.sin(a * 3 + 1); }
      default: return dx * dx + dy * dy <= 1;
    }
  }

  /* ---------- the pet is assembled from parts ----------
     The body is a silhouette; ears, tail, arms and feet are small pixel templates hooked to anchor points
     found on the body's real outline, so every part stays attached whatever the body's shape and size.
     Animation moves parts, not the picture: the body breathes, ears twitch, the tail wags, arms change pose,
     feet step, eyes blink and change expression, the mouth chews.
     Template letters: m main, l light, d dark, o outline, k eye ink, w white, p pink, r mouth red,
     c horn cream, g leaf, G stem; "." is empty. Left-side parts are drawn and mirrored to the right. */
  const T = {
    ear: {
      cat:     {px: 2, py: 3, rows: ["m...", "mm..", "mlm.", "mmmm"]},
      bunny:   {px: 1, py: 6, rows: [".m.", "mlm", "mlm", "mlm", "mlm", "mmm", "mmm"]},
      bear:    {px: 2, py: 2, rows: [".mm.", "mllm", "mmmm"]},
      horns:   {px: 1, py: 2, rows: ["c.", "cc", ".c"]}
    },
    top: {
      antenna: {px: 0, py: 4, rows: ["ll", "ll", "o.", "o.", "o."]},
      sprout:  {px: 2, py: 3, rows: ["gg.gg", ".gGg.", "..G..", "..G.."]}
    },
    tail: {
      curl:   {px: 0, py: 2, rows: ["..mm", ".m.m", "mm.."]},
      fluff:  {px: 0, py: 2, rows: [".ll.", "mllm", "mmlm", ".mm."]},
      spikes: {px: 0, py: 2, rows: ["..d", ".dm", "mmm"]}
    },
    arm: {
      down:   {px: 0, py: 0, rows: ["m", "m", "m"]},
      downS:  {px: 0, py: 0, rows: ["mm", "mm", "mm"]},
      up:     {px: 0, py: 2, rows: [".m", "mm", "m."]},
      upS:    {px: 0, py: 2, rows: [".mm", "mmm", "mm."]},
      out:    {px: 0, py: 0, rows: ["mm", ".m"]},
      outS:   {px: 0, py: 0, rows: ["mmm", ".mm"]}
    },
    foot: {px: 1, py: 0, rows: ["ddd"]},
    eye: {
      dot:    ["k", "k"],
      big:    ["kw", "kk"],
      bead:   ["wk", "kk"],
      sleepy: ["dd", "kk"],
      closed: ["..", "kk"],
      joy:    [".k.", "k.k"],
      x:      ["k.k", ".k.", "k.k"],
      sad:    ["k..", ".kk"]
    },
    mouth: {
      smile:  ["k..k", ".kk."],
      cat:    ["k.kk.k", ".k..k."],
      flat:   ["kk"],
      fang:   ["k..k", ".kk.", ".w.."],
      frown:  [".kk.", "k..k"],
      open:   [".kk.", "krrk", ".kk."],
      chew:   ["kkkk"]
    }
  };
  const SOLID = "mldcgG";
  function sprite(pet, look, f){
    const G = 32, MIR = x => G - 1 - x;
    const px = Array.from({length: G}, () => Array(G).fill(null));
    const solid = Array.from({length: G}, () => Array(G).fill(false));
    let [main, light, dark] = PALETTES[pet.palette] || PALETTES.mint;
    const st = look.state || "idle", br = look.branch || "", baby = look.stage === "baby";
    if (br === "grump"){ main = gray(main); light = gray(light); dark = gray(dark); }
    if (st === "sick"){ main = tint(main); light = tint(light); }
    const COL = {m: main, l: light, d: dark, o: OUT, k: OUT, w: "#FFFFFF", p: "#F59AB0", r: "#B0303C", c: "#F2E8CF", g: "#6CC24A", G: "#3E8E3A"};
    const put = (x, y, ch, isSolid) => { if (x < 0 || y < 0 || x >= G || y >= G || ch === ".") return; px[y][x] = COL[ch] || ch; if (isSolid) solid[y][x] = true; };
    /* a template placed so that its pivot lands on (ax, ay); mirrored for the right side */
    function stamp(t, ax, ay, mirror, front){
      t.rows.forEach((row, j) => [...row].forEach((ch, i) => {
        if (ch === ".") return;
        const x = mirror ? ax + (t.px - i) : ax + (i - t.px), y = ay + (j - t.py);
        if (!front && solid[y] && solid[y][x] && body[y][x]) return; /* parts behind the body stay behind */
        put(x, y, ch, SOLID.includes(ch));
      }));
    }

    /* motion of the whole pet and of the body alone */
    const fat = look.fat == null ? 50 : look.fat, mus = look.muscle == null ? 40 : look.muscle;
    let jump = 0, sway = 0;
    if (st === "happy") jump = [0, -2, -3, -2, 0, 0][f % 6];
    if (st === "play" && look.toy !== "dance") jump = [0, -1, -2, -1, 0, 0][f % 6];
    if (st === "play" && look.toy === "dance") sway = [-1, -1, 0, 1, 1, 0][f % 6];
    if (st === "sick") sway = [0, 0, 1, 1, 0, 0, -1, -1][f % 8];
    const breathe = (st === "idle" || st === "hungry" || st === "sad") ? (f >> 1) % 2 : st === "sleep" ? (f >> 2) % 2 : 0;

    /* the body silhouette */
    const sc = baby ? 0.8 : 1;
    let rx = (7.5 + (fat - 50) / 50 * 3) * sc, ry = (baby ? 6 : 7.5);
    if (br === "slim") rx = 5.5 * sc;
    if (br === "donut") rx = 10.5 * sc;
    const lying = st === "hibernate";
    if (lying) ry -= 1;
    const bottom = 28 + jump, cx = 16 + sway;
    const cy = bottom - ry + 0.5 + breathe * 0.5;
    const body = Array.from({length: G}, () => Array(G).fill(false));
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++){
      const dx = (x + .5 - cx) / rx, dy = (y + .5 - cy) / ry;
      if (y <= bottom && inside(pet.body, dx, dy, x)) body[y][x] = true;
    }
    const rowsOf = x => { const r = []; for (let y = 0; y < G; y++) if (body[y][x]) r.push(y); return r; };
    const colsOf = y => { const c = []; for (let x = 0; x < G; x++) if (body[y] && body[y][x]) c.push(x); return c; };
    const topAt = x => { const r = rowsOf(x); return r.length ? r[0] : null; };
    const botAt = x => { const r = rowsOf(x); return r.length ? r[r.length - 1] : null; };
    let top = G, bot = 0, left = G, right = 0;
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) if (body[y][x]){ top = Math.min(top, y); bot = Math.max(bot, y); left = Math.min(left, x); right = Math.max(right, x); }
    const cl = Math.floor(cx - .5), cr = MIR(cl) + (cx - 16) * 2; /* the two middle columns */
    const H = bot - top + 1, Wd = right - left + 1;

    /* behind the body: feet, tail, ears */
    if (!lying){
      const fx = Math.max(2, Math.round(Wd * 0.22));
      for (const s of [-1, 1]){
        const x = s < 0 ? cl - fx + 1 : cr + fx - 1;
        const b = botAt(x) == null ? bot : botAt(x);
        const step = look.moving && ((f >> 1) % 2 === (s < 0 ? 0 : 1)) ? -1 : 0;
        stamp(T.foot, x, Math.min(29 + jump, b + 1) + step, s > 0, false);
      }
    }
    if (T.tail[pet.tail]){
      const ty = Math.round(cy + ry * 0.35), cols = colsOf(ty);
      const wag = st === "happy" || st === "play" ? f % 2 : st === "idle" ? (f >> 2) % 2 : 0;
      if (cols.length) stamp(T.tail[pet.tail], cols[cols.length - 1] + 1, ty - wag, false, false);
    }
    const earDef = T.ear[pet.ears];
    if (earDef){
      /* ears sit on the head's own width a few rows down, so narrow tops (pear, egg) keep them apart */
      const tw = colsOf(top + 2).length || Wd;
      const ex = Math.max(2, Math.round(tw * ({bunny: .3, horns: .28, cat: .42, bear: .45}[pet.ears] || .4)));
      for (const s of [-1, 1]){
        const x = s < 0 ? cl - ex + 1 : cr + ex - 1, t = topAt(x);
        if (t == null) continue;
        const twitch = (st === "idle" && s > 0 && f % 24 < 2) || (st === "happy" && f % 2) ? -1 : 0;
        stamp(earDef, x, t + (pet.ears === "bear" || pet.ears === "horns" ? 0 : 1) + twitch + (st === "sad" || st === "sick" ? 1 : 0), s > 0, false);
      }
    }

    /* the body: shading, pattern, highlight */
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++){
      if (!body[y][x]) continue;
      const dx = (x + .5 - cx) / rx, dy = (y + .5 - cy) / ry;
      let c = main;
      if (dx + dy > 1.0) c = dark;
      if (pet.pattern === "belly" && ((dx / .55) ** 2 + ((dy - .4) / .5) ** 2 <= 1)) c = light;
      if (pet.pattern === "spots" && hash(x >> 1, y >> 1) > .82 && dy < .55 && dy > -.7) c = dark;
      if (pet.pattern === "stripes" && dy < -.15 && dy > -.85 && (y - top) % 3 === 1) c = dark;
      px[y][x] = c; solid[y][x] = true;
    }
    if (!lying){ put(cl - Math.round(Wd * .25), top + 2, "w"); put(cl - Math.round(Wd * .25) + 1, top + 2, "l"); }

    /* arms, in front of the body */
    const armY = Math.round(cy + ry * 0.15), cols = colsOf(armY), strong = br === "athlete" || mus > 65;
    if (!lying && cols.length){
      let poseL = "down", poseR = "down", dyL = 0, dyR = 0;
      if (st === "happy" || (st === "play" && look.toy !== "dance") || st === "eat"){ poseL = poseR = "up"; }
      else if (st === "play"){ const a = (f % 6) < 3; poseL = a ? "up" : "down"; poseR = a ? "down" : "up"; }
      else if (st === "hungry"){ poseR = "out"; }
      else if (st === "idle"){ if (f % 40 > 33){ poseR = "up"; } else { dyL = (f >> 2) % 2; dyR = 1 - dyL; } }
      const k = n => T.arm[n + (strong ? "S" : "")];
      stamp(k(poseL), cols[0] - 1, armY + dyL, true, true);
      stamp(k(poseR), cols[cols.length - 1] + 1, armY + dyR, false, true);
    }
    /* things on top of the head */
    if (T.top[pet.ears]){ const t = topAt(cl); if (t != null) stamp(T.top[pet.ears], cl, t - 1, false, true); }

    /* one outline around everything solid */
    const edge = [];
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) if (!solid[y][x] && !px[y][x]){
      if ((y > 0 && solid[y - 1][x]) || (y < G - 1 && solid[y + 1][x]) || (x > 0 && solid[y][x - 1]) || (x < G - 1 && solid[y][x + 1])) edge.push([x, y]);
    }
    edge.forEach(([x, y]) => put(x, y, "o"));

    /* the face, placed from the body's own size */
    const eyeY = top + Math.max(2, Math.round(H * (baby ? 0.42 : 0.36)));
    const gap = Math.max(1, Math.round(Wd * (baby ? 0.12 : 0.1)));
    const blink = (f % 30) === 0;
    let eye = T.eye[pet.eyes] ? pet.eyes : "dot";
    if (st === "sleep" || st === "hibernate" || blink) eye = "closed";
    else if (st === "happy" || st === "play" || (st === "eat" && (f % 4) > 1)) eye = "joy";
    else if (st === "sick") eye = "x";
    else if (st === "sad") eye = "sad";
    else if (br === "lazy") eye = "sleepy";
    const er = T.eye[eye], ew = Math.max(...er.map(r => r.length));
    er.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === ".") return; put(cl - gap - ew + 1 + i, eyeY + j, ch); put(cr + gap + ew - 1 - i, eyeY + j, ch); }));
    const eyeH = er.length;
    if (!(st === "sleep" || st === "hibernate" || st === "sick" || st === "sad")){
      const cy2 = eyeY + eyeH;
      for (const [x, s] of [[cl - gap - ew - 1, -1], [cr + gap + ew + 1, 1]]) if (body[cy2] && body[cy2][x] && body[cy2][x - s]) { put(x, cy2, "p"); }
    }
    let mouth = T.mouth[pet.mouth] ? pet.mouth : "smile";
    if (st === "eat") mouth = (f % 4) < 2 ? "open" : "chew";
    else if (st === "sad" || st === "sick" || br === "grump") mouth = "frown";
    else if (st === "sleep") mouth = "flat";
    if (st !== "hibernate"){
      const mr = T.mouth[mouth], mw = mr[0].length, my = eyeY + eyeH + 1;
      mr.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== ".") put(cl + 1 - mw / 2 + i, my + j, ch); }));
    }

    /* branch and state accessories */
    if (br === "athlete" && !lying){ const y = eyeY - 2; for (let x = 0; x < G; x++) if (body[y] && body[y][x]) put(x, y, "#E0475B"); }
    if (br === "lazy" && st !== "happy" && !lying){ const t = topAt(cl) - 1; [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [1, -1], [2, -1], [3, -1], [2, -2], [3, -3], [4, -3]].forEach(([a, b]) => put(cl - 2 + a, t + b, b === 0 ? "#F2E8CF" : "#5B6CC2")); put(cl + 3, t - 4, "w"); }
    if (br === "donut") [[left - 2, bot - 1], [right + 3, bot - 2], [left - 1, bot + 1]].forEach(([x, y]) => put(x, y, "#C98B4B"));
    if (br === "balanced" && (f % 12) < 6){ put(left - 2, top + 1, "#F5C842"); put(right + 2, top + 4, "#F5C842"); put(left - 2, top, "w"); }
    if (st === "sick"){ const my = eyeY + eyeH + 2; for (let k = 0; k < 4; k++) put(cr + k, my - (k >> 1), k === 3 ? "#E0475B" : "#DDE3EA"); }
    /* hibernation: tucked under a checked blanket up to the nose */
    if (lying) for (let y = eyeY + eyeH + 1; y < G; y++) for (let x = 0; x < G; x++) if (body[y][x]) px[y][x] = y === eyeY + eyeH + 1 ? "#F2E8CF" : ((x >> 1) + (y >> 1)) % 2 ? "#4F63C9" : "#7387E6";
    return px;
  }

  function egg(pet, f, crack){
    const G = 32, px = Array.from({length: G}, () => Array(G).fill(null));
    const [main, light, dark] = PALETTES[pet.palette] || PALETTES.mint;
    const wob = crack > 0 ? [0, 1, 0, -1][f % 4] : 0;
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++){
      const dx = (x + .5 - 16 - wob) / 7, dy = (y + .5 - 20) / 9, k = 1 + .3 * Math.max(0, -dy);
      const r = (dx * k) ** 2 + dy * dy;
      if (r <= 1) px[y][x] = hash(x >> 1, y >> 1) > .8 ? main : (dx + dy > .9 ? "#D8D2C2" : "#F6F1E4");
      else if (r <= 1.28) px[y][x] = OUT;
    }
    if (crack > 0) [[14, 15], [15, 16], [16, 15], [17, 16], [18, 15], [19, 16]].slice(0, 2 + crack * 2).forEach(([x, y]) => px[y][x + wob] = OUT);
    px[13][13 + wob] = "#FFFFFF";
    return px;
  }

  /* little effects drawn in scene space around the pet */
  const ICONS = {
    heart: ["01010", "11111", "11111", "01110", "00100"],
    z: ["111", "001", "010", "100", "111"],
    apple: ["00100", "01110", "11111", "11111", "01110"],
    drop: ["010", "111", "111", "010"],
    star: ["00100", "01110", "11111", "01110", "00100"],
    note: ["00110", "00101", "00100", "11100", "11100"],
    ball: ["0110", "1111", "1111", "0110"]
  };
  function icon(ctx, name, x, y, c, s){ const m = ICONS[name]; ctx.fillStyle = c; m.forEach((row, j) => [...row].forEach((v, i) => { if (v === "1") ctx.fillRect(x + i * s, y + j * s, s, s); })); }

  /* draws a scene: background, ground, pet, effects. Canvas is 48×40 logical px times scale */
  function draw(ctx, pet, look, f, opts){
    opts = opts || {};
    const S = opts.scale || 4, W = 48, H = 40, st = look.state || "idle";
    const night = st === "sleep" || st === "hibernate" || opts.night;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = night ? "#1D2340" : (opts.bg || "#DCE8D5"); ctx.fillRect(0, 0, W * S, H * S);
    if (night) for (const [x, y] of [[5, 4], [14, 9], [38, 6], [43, 14], [26, 3]]) if ((f + x) % 16 > 2){ ctx.fillStyle = "#F4F1D0"; ctx.fillRect(x * S, y * S, S, S); }
    if (!night){ ctx.fillStyle = "rgba(255,255,255,.7)"; const cxp = (f >> 1) % 64 - 10; ctx.fillRect(cxp * S, 5 * S, 7 * S, S); ctx.fillRect((cxp + 1) * S, 4 * S, 4 * S, S); }
    ctx.fillStyle = night ? "#2C3358" : "#B9CDAE"; ctx.fillRect(0, 34 * S, W * S, 6 * S);
    ctx.fillStyle = night ? "#3A4370" : "#A3BC96"; for (let x = 0; x < W; x += 4) ctx.fillRect((x + (x % 8 ? 1 : 0)) * S, 35 * S, S, S);
    /* where the pet stands: wanders a little when idle, chases the ball when playing */
    const place = g => {
      let x = 8, bx = 0, by = 0;
      if (st === "idle" && look.stage !== "egg") x += Math.round(5 * Math.sin(g / 45));
      if (st === "play" && look.toy !== "dance"){
        const t = g % 48, k = t < 24 ? t / 24 : (48 - t) / 24;
        bx = Math.round(6 + k * 34); by = Math.round(31 - Math.abs(Math.sin(t / 48 * Math.PI * 4)) * 12);
        x += Math.max(-6, Math.min(6, Math.round((bx - 24) * 0.3)));
      }
      return [x, bx, by];
    };
    const [ox, bx, byy] = place(f), moving = ox !== place(f - 1)[0] || ox !== place(f + 1)[0];
    const grid = look.stage === "egg" ? egg(pet, f, look.crack || 0) : sprite(pet, {...look, moving}, f);
    const oy = 4;
    grid.forEach((row, y) => row.forEach((c, x) => { if (c){ ctx.fillStyle = c; ctx.fillRect((ox + x) * S, (oy + y) * S, S, S); } }));
    if (st === "sleep" || st === "hibernate") for (let k = 0; k < 2; k++){ const t = (f + k * 8) % 16; icon(ctx, "z", (33 + k * 4 + (t >> 3)) * S, (14 - (t >> 1)) * S, "#F4F1D0", S * (k ? 1 : 0.75) | 0 || 1); }
    if (st === "happy" || (st === "eat" && f % 16 > 10)) for (let k = 0; k < 3; k++){ const t = (f * 2 + k * 7) % 20; icon(ctx, "heart", (10 + k * 13) * S, (16 - t / 2) * S | 0, "#E0475B", S * .6 | 0 || 1); }
    if (st === "eat" && f % 16 <= 10){ const t = f % 16; icon(ctx, "apple", 22 * S, Math.min(13, t * 2) * S, "#E0475B", S * .8 | 0 || 1); }
    if (st === "sad") icon(ctx, "drop", (34 + (f % 2)) * S, 14 * S, "#6AB3F0", S * .7 | 0 || 1);
    if (st === "hungry"){ ctx.fillStyle = "#FFFFFF"; ctx.fillRect(34 * S, 5 * S, 11 * S, 9 * S); ctx.fillRect(32 * S, 13 * S, 2 * S, 2 * S); icon(ctx, "apple", 36 * S, 7 * S, "#E0475B", S); }
    if (st === "play" && look.toy !== "dance"){ icon(ctx, "ball", bx * S, byy * S, "#E0475B", S); ctx.fillStyle = "#FFFFFF"; ctx.fillRect((bx + 1) * S, (byy + 1) * S, S, S); }
    if (st === "play" && look.toy === "dance") for (let k = 0; k < 2; k++){ const t = (f + k * 9) % 18; icon(ctx, "note", (k ? 36 : 6) * S, (18 - (t >> 1)) * S, k ? "#8A63D2" : "#3E8FD8", S * .7 | 0 || 1); }
    if (st === "hibernate"){
      /* winter outside: falling snow and a snowdrift */
      ctx.fillStyle = "#FFFFFF";
      for (let k = 0; k < 14; k++){ const x = (k * 11 + (k % 3) * 5) % 48, y = (f + k * 7) % 34; ctx.fillRect(((x + (y >> 3)) % 48) * S, y * S, S, S); }
      ctx.fillStyle = "#E6EDF7"; ctx.fillRect(0, 33 * S, W * S, 2 * S);
      for (let x = 0; x < W; x += 6) ctx.fillRect(x * S, 32 * S, 3 * S, S);
    }
  }
  window.PetEngine = {PALETTES, PARTS, NAMES, randomPet, draw, sprite};
})();
