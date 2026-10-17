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

  /* ---------- the pet is a baby drawing that grows ----------
     Every body starts as a hand-made baby silhouette: a list of half-widths, one per row, always symmetric.
     Growing up never shrinks anything: rows are added in the middle and the sides widen (fat widens the belly).
     Parts hook onto that silhouette: ears and the tail behind it, arms at the shoulders and feet under the belly
     drawn in front with their own outline so they read as limbs, the face at a fixed spot on the head.
     Animation moves the parts: the body breathes (one middle row in and out), arms swing in turns, feet step,
     the tail wags, ears twitch, leaves flutter, eyes blink, the mouth chews, a sleep bubble grows and pops.
     Template letters: m main, l light, d dark, o outline, k eye ink, w white, r mouth red,
     c horn cream, g leaf, G stem; "." is empty. Templates are drawn for the left side and mirrored. */
  const BODY = {
    round:  [2, 4, 5, 5, 6, 6, 6, 6, 6, 5, 4],
    egg:    [2, 3, 4, 4, 5, 5, 6, 6, 6, 5, 4],
    pear:   [3, 4, 4, 5, 5, 6, 6, 7, 7, 7, 6],
    square: [5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5],
    ghost:  [2, 4, 5, 5, 6, 6, 6, 6, 6, 6, 6],
    blob:   [3, 5, 6, 6, 7, 7, 7, 7, 7, 6, 5]
  };
  const T = {
    ear: {
      cat:   {px: 0, py: 3, rows: ["m..", "mm.", "mlm", "mmm"]},
      bunny: {px: 1, py: 5, rows: [".m.", "mlm", "mlm", "mlm", "mlm", "mmm"]},
      bear:  {px: 1, py: 2, rows: [".m.", "mlm", "mmm"]},
      horns: {px: 1, py: 2, rows: ["c.", "cc", ".c"]}
    },
    top: {
      antenna: [["ll", "ll", "oo", "oo"], ["ll", "ll", "oo", "oo"]],
      sprout:  [["gg..gg", ".gggg.", "..GG..", "..GG.."], [".g..g.", "gggggg", "..GG..", "..GG.."]]
    },
    tail: {
      curl:   [{px: 0, py: 3, rows: ["..mm", "...m", "...m", "mmm."]}, {px: 0, py: 2, rows: ["...mm", "....m", "mmmm."]}],
      fluff:  [{px: 0, py: 3, rows: ["..ll", ".lll", "mml.", "mm.."]}, {px: 0, py: 2, rows: ["..lll", "mmlll", "mmm.."]}],
      spikes: [{px: 0, py: 3, rows: ["...d", "..dm", ".dm.", "mm.."]}, {px: 0, py: 2, rows: ["...dd", ".ddm.", "mmm.."]}]
    },
    arm: {
      down:  {px: 1, py: 0, rows: ["mm", "mm", "mm"]},
      swing: {px: 1, py: -1, rows: ["mm", "mm", "mm"]},
      up:    {px: 2, py: 2, rows: ["mm.", "mm.", ".mm"]},
      out:   {px: 2, py: 0, rows: ["mmm", "mmm"]},
      belly: {px: 0, py: 0, rows: ["mm.", ".mm"]}
    },
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
  /* the silhouette for today: the baby profile grown by stage, fat and branch */
  function grow(shape, stage, fat, br, squash){
    let hw = (BODY[shape] || BODY.round).slice();
    const mid = Math.floor(hw.length * .55);
    const add = stage === "adult" ? 3 : stage === "young" ? 2 : 0;
    for (let k = 0; k < add; k++) hw.splice(mid, 0, hw[mid]);
    const up = stage === "adult" ? 2 : stage === "young" ? 1 : 0;
    const belly = Math.max(-1, Math.min(2, Math.round((fat - 50) / 25))) + (br === "donut" ? 2 : 0) - (br === "slim" ? 1 : 0);
    hw = hw.map((w, i) => {
      let v = w + (i > 0 ? up : 0);
      if (i >= hw.length * .4) v += belly;
      return Math.max(2, v);
    });
    if (squash){ hw.splice(mid, 1); hw = hw.map((w, i) => i >= mid - 1 ? w + 1 : w); }
    return hw;
  }
  function sprite(pet, look, f){
    const G = 32, MIR = x => G - 1 - x;
    const px = Array.from({length: G}, () => Array(G).fill(null));
    const solid = Array.from({length: G}, () => Array(G).fill(false));
    const part = Array.from({length: G}, () => Array(G).fill(false));
    let [main, light, dark] = PALETTES[pet.palette] || PALETTES.mint;
    const st = look.state || "idle", br = look.branch || "", stage = look.stage || "baby", baby = stage === "baby";
    if (br === "grump"){ main = gray(main); light = gray(light); dark = gray(dark); }
    if (st === "sick"){ main = tint(main); light = tint(light); }
    const COL = {m: main, l: light, d: dark, o: OUT, k: OUT, w: "#FFFFFF", r: "#B0303C", c: "#F2E8CF", g: "#6CC24A", G: "#3E8E3A"};
    const inG = (x, y) => x >= 0 && y >= 0 && x < G && y < G;
    const put = (x, y, ch, isSolid) => { if (!inG(x, y) || ch === ".") return; px[y][x] = COL[ch] || ch; if (isSolid) solid[y][x] = true; };
    /* a template with its pivot on (ax, ay); mirror draws the right-side copy */
    function cells(t, ax, ay, mirror){
      const out = [];
      t.rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== ".") out.push([mirror ? ax + (t.px - i) : ax + (i - t.px), ay + (j - t.py), ch]); }));
      return out;
    }
    const behind = c => c.forEach(([x, y, ch]) => put(x, y, ch, true));
    /* a limb in front of the body: its own outline keeps it readable over the belly */
    function limb(c, overBody){
      c.forEach(([x, y, ch]) => { if (inG(x, y)){ put(x, y, ch, true); part[y][x] = true; } });
      c.forEach(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([a, b]) => {
        const X = x + a, Y = y + b;
        if (!inG(X, Y) || part[Y][X]) return;
        if (!overBody && body[Y][X]) return;
        px[Y][X] = OUT;
      }));
    }

    /* motion */
    const fat = look.fat == null ? 50 : look.fat, mus = look.muscle == null ? 40 : look.muscle;
    let jump = 0, sway = 0, squash = false;
    if (st === "happy"){ jump = [0, -2, -3, -2, 0, 0][f % 6]; squash = f % 6 === 4; }
    if (st === "play" && look.toy !== "dance"){ jump = [0, -1, -2, -1, 0, 0][f % 6]; squash = f % 6 === 4; }
    if (st === "play" && look.toy === "dance") sway = [-1, -1, 0, 1, 1, 0][f % 6];
    if (st === "sick") sway = [0, 0, 1, 1, 0, 0, -1, -1][f % 8];
    if (["idle", "hungry", "sad", "sick"].includes(st)) squash = (f >> 2) % 2 === 1;
    if (st === "sleep" || st === "hibernate") squash = (f >> 3) % 2 === 1;
    const lying = st === "hibernate";

    /* the body */
    const hw = grow(pet.body, stage, fat, br, squash), H = hw.length;
    const footH = baby ? 1 : 2;
    const bot = 28 - footH + jump - (lying ? -footH : 0), top = bot - H + 1;
    const body = Array.from({length: G}, () => Array(G).fill(false));
    const L = (i) => 16 - hw[i] + sway, R = (i) => 15 + hw[i] + sway; /* first and last column of a row */
    for (let i = 0; i < H; i++){
      const y = top + i; if (y < 0 || y >= G) continue;
      for (let x = L(i); x <= R(i); x++){
        if (pet.body === "ghost" && i === H - 1 && (x - sway) % 3 === 0) continue;
        if (inG(x, y)) body[y][x] = true;
      }
    }
    const rowAt = r => Math.max(0, Math.min(H - 1, Math.round(r)));

    /* behind the body: tail and ears */
    if (T.tail[pet.tail]){
      const i = H - 2, wag = st === "happy" || st === "play" ? f % 2 : (st === "idle" || st === "eat") ? (f >> 2) % 2 : 0;
      behind(cells(T.tail[pet.tail][wag], R(i), top + i, false));
    }
    const ear = T.ear[pet.ears];
    if (ear){
      /* each ear stands on the head surface at a fixed distance from the middle, so they never fuse */
      const w = ear.rows[0].length, d = {bunny: 2, horns: 2, cat: Math.max(2, hw[1] - 2), bear: Math.max(2, hw[1] - 2)}[pet.ears];
      for (const s of [-1, 1]){
        const twitch = (st === "idle" && s > 0 && f % 24 < 2) || ((st === "happy" || st === "play") && f % 2) ? -1 : 0;
        const droop = st === "sad" || st === "sick" || lying ? 1 : 0;
        const inner = 15 - d + sway, x = s < 0 ? inner - (w - 1 - ear.px) : MIR(inner - (w - 1 - ear.px)) + 2 * sway;
        let ty = top; while (ty < bot && !body[ty][Math.max(0, Math.min(G - 1, x))]) ty++;
        behind(cells(ear, x, ty + twitch + droop, s > 0));
      }
    }

    /* the body itself: shading on the lower right, pattern, highlight */
    for (let i = 0; i < H; i++){
      const y = top + i;
      for (let x = L(i); x <= R(i); x++){
        if (!inG(x, y) || !body[y][x]) continue;
        const fx = (x - sway + .5 - 16) / hw[i];
        let c = main;
        if ((x === R(i) && i > H * .3) || (i === H - 1 && fx > -.2)) c = dark;
        if (pet.pattern === "belly" && i >= H * .55 && i < H - 1 && Math.abs(fx) < .55) c = light;
        if (pet.pattern === "spots" && i > 1 && i < H - 1 && Math.abs(fx) > .45 && hash(x - sway >> 1, i >> 1) > .7) c = dark;
        if (pet.pattern === "stripes" && i > 1 && i < H - 2 && i % 2 === 0 && Math.abs(fx) > .7) c = dark;
        px[y][x] = c; solid[y][x] = true;
      }
    }
    if (!lying && hw[1] >= 3){ put(L(1) + 1, top + 1, "w"); if (hw[2] >= 4) put(L(2) + 1, top + 2, "l"); }

    /* on top of the head */
    const topT = T.top[pet.ears];
    if (topT){
      const rows = topT[(st === "idle" || st === "happy" || st === "play") && (f >> 2) % 2 ? 1 : 0];
      const w = rows[0].length;
      rows.forEach((row, j) => [...row].forEach((ch, k) => put(16 - w / 2 + k + sway, top - rows.length + j, ch, true)));
    }

    /* one outline around everything so far */
    const edge = [];
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) if (!solid[y][x] && !px[y][x]){
      if ((y > 0 && solid[y - 1][x]) || (y < G - 1 && solid[y + 1][x]) || (x > 0 && solid[y][x - 1]) || (x < G - 1 && solid[y][x + 1])) edge.push([x, y]);
    }
    edge.forEach(([x, y]) => put(x, y, "o"));

    /* feet under the belly, arms at the shoulders */
    if (!lying){
      const hb = hw[H - 1], fw = baby ? 2 : 3, gap = Math.max(1, Math.round(hb * .3));
      const walk = look.moving || st === "play";
      for (const s of [-1, 1]){
        const lift = (walk && ((f >> 1) % 2 === (s < 0 ? 0 : 1))) || (jump < -1) ? -1 : 0;
        const c = [];
        for (let k = 0; k < fw; k++) for (let j = 0; j < footH; j++){
          const x = 15 - gap - k + sway; c.push([s < 0 ? x : MIR(x) + 2 * sway, bot + 1 + j + lift, "d"]);
        }
        limb(c, false);
      }
      const si = rowAt(H * .55), strong = br === "athlete" || mus > 65;
      let pl = "down", pr = "down";
      const alt = (f >> 2) % 2;
      if (st === "happy" || st === "eat" || (st === "play" && look.toy !== "dance")){ pl = pr = "up"; }
      else if (st === "play"){ const a = (f % 6) < 3; pl = a ? "up" : "down"; pr = a ? "down" : "up"; }
      else if (st === "hungry"){ pl = "belly"; pr = alt ? "out" : "down"; }
      else if (st === "idle"){ if (f % 40 > 33) pr = (f >> 1) % 2 ? "up" : "out"; else { pl = alt ? "swing" : "down"; pr = alt ? "down" : "swing"; } }
      for (const s of [-1, 1]){
        const pose = s < 0 ? pl : pr, x = s < 0 ? L(si) : R(si);
        const t = T.arm[pose], short = baby && (pose === "down" || pose === "swing");
        let c = cells(short ? {...t, rows: t.rows.slice(1)} : t, x, top + si, s > 0);
        if (strong) c = c.concat(c.map(([a, b, ch]) => [a - s, b, ch]));
        limb(c, true);
      }
    }

    /* the face sits at a fixed spot on the head */
    const ei = rowAt(baby ? 4 : 4 + Math.floor((H - 11) / 3)), eyeY = top + ei;
    const blink = (f % 30) === 0;
    let eye = T.eye[pet.eyes] ? pet.eyes : "dot";
    if (st === "sleep" || st === "hibernate" || blink) eye = "closed";
    else if (st === "happy" || st === "play" || (st === "eat" && (f % 4) > 1)) eye = "joy";
    else if (st === "sick") eye = "x";
    else if (st === "sad") eye = "sad";
    else if (br === "lazy") eye = "sleepy";
    const er = T.eye[eye], ew = Math.max(...er.map(r => r.length)), eyeH = er.length;
    let g = baby ? 1 : 2;
    while (g > 0 && 15 - g - ew + 1 + sway <= L(ei)) g--;
    er.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === ".") return; const x = 15 - g - ew + 1 + i + sway; put(x, eyeY + j, ch); put(MIR(x) + 2 * sway, eyeY + j, ch); }));
    if (!(st === "sleep" || st === "hibernate" || st === "sick" || st === "sad")){
      const x = 15 - g - ew + sway, y = eyeY + eyeH;
      if (x > L(rowAt(ei + eyeH))) { put(x, y, "#F59AB0"); put(MIR(x) + 2 * sway, y, "#F59AB0"); }
    }
    let mouth = T.mouth[pet.mouth] ? pet.mouth : "smile";
    if (st === "eat") mouth = (f % 4) < 2 ? "open" : "chew";
    else if (st === "hungry") mouth = (f >> 2) % 2 ? "open" : "frown";
    else if (st === "sad" || st === "sick" || br === "grump") mouth = "frown";
    else if (st === "sleep") mouth = "flat";
    const my = eyeY + eyeH + 1;
    if (!lying){
      const mr = T.mouth[mouth], mw = mr[0].length;
      mr.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== ".") put(16 - mw / 2 + i + sway, my + j, ch); }));
    }
    /* a sleep bubble from the nose grows and pops */
    if (st === "sleep"){
      const t = (f >> 1) % 8, r = [0, 1, 1, 2, 2, 2, 0, 0][t], bx = 17 + sway + r, by = my - r;
      if (r === 1){ put(bx, by, "#CFE8FF"); }
      if (r >= 2) for (let a = -r + 1; a < r; a++) for (let b = -r + 1; b < r; b++) if (Math.abs(a) + Math.abs(b) <= r) put(bx + a, by + b, Math.abs(a) + Math.abs(b) === r - 1 ? "#9CC9F0" : "#DDF0FF");
      if (r >= 2) put(bx - 1, by - 1, "w");
    }

    /* branch and state accessories */
    if (br === "athlete" && !lying){ const y = eyeY - 2; for (let x = 0; x < G; x++) if (body[y] && body[y][x]) put(x, y, "#E0475B"); }
    if (br === "lazy" && st !== "happy" && !lying){ const t = top - 1; [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [1, -1], [2, -1], [3, -1], [4, -1], [2, -2], [3, -2], [4, -3], [5, -3]].forEach(([a, b]) => put(13 + a + sway, t + b, b === 0 ? "#F2E8CF" : "#5B6CC2")); put(18 + sway, t - 4, "w"); }
    if (br === "donut") [[L(H - 1) - 3, bot], [R(H - 1) + 4, bot - 1], [L(H - 1) - 2, bot + 2]].forEach(([x, y]) => put(x, y, "#C98B4B"));
    if (br === "balanced" && (f % 12) < 6){ put(L(0) - 3, top + 1, "#F5C842"); put(R(2) + 3, top + 4, "#F5C842"); put(L(0) - 3, top, "w"); }
    if (st === "sick") for (let k = 0; k < 4; k++) put(17 + sway + k, my + 1 - (k >> 1), k === 3 ? "#E0475B" : "#DDE3EA");
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
