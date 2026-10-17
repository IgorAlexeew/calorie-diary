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

  /* look: {fat 0..100 (50 = in shape), muscle 0..100, branch, state, stage} */
  function sprite(pet, look, f){
    const G = 32, px = Array.from({length: G}, () => Array(G).fill(null)), body = Array.from({length: G}, () => Array(G).fill(false));
    let [main, light, dark] = PALETTES[pet.palette] || PALETTES.mint;
    const st = look.state || "idle", br = look.branch || "";
    if (br === "grump"){ main = gray(main); light = gray(light); dark = gray(dark); }
    if (st === "sick"){ main = tint(main); light = tint(light); }
    const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < G && y < G) px[y][x] = c; };
    const solid = (x, y, c) => { if (x >= 0 && y >= 0 && x < G && y < G){ px[y][x] = c; body[y][x] = true; } };
    const fat = look.fat == null ? 50 : look.fat, mus = look.muscle == null ? 40 : look.muscle;
    const baby = look.stage === "baby", sc = baby ? 0.75 : 1;
    let rx = Math.round((8 + (fat - 50) / 50 * 3) * sc), ry = Math.round(8 * sc);
    if (br === "slim") rx = Math.round(6 * sc);
    if (br === "donut") rx = Math.round(11 * sc);
    const cx = 16;
    /* motion */
    let yoff = 0, xoff = 0;
    if (st === "happy") yoff = [0, -2, -3, -2, 0, 0][f % 6];
    else if (st === "eat") yoff = 0;
    else if (st === "sleep" || st === "hibernate") yoff = 0;
    else if (st === "sick") xoff = [0, 0, 1, 1, 0, 0, -1, -1][f % 8];
    else if (st === "play" && look.toy === "dance"){ xoff = [-1, -1, 0, 1, 1, 0][f % 6]; yoff = [0, -1, 0, 0, -1, 0][f % 6]; }
    else if (st === "play") yoff = [0, -1, -2, -1, 0, 0][f % 6];
    else yoff = (f >> 1) % 2;
    if (st === "idle" && (f % 40) > 30) xoff = (f % 80) > 40 ? 1 : -1;
    const squash = st === "sleep" || st === "hibernate" ? 1 : 0;
    const cy = 22 - ry + 8 + yoff + squash, by = cy;
    const cxx = cx + xoff;
    /* ears behind the body */
    const ty = by - ry + squash;
    const ear = pet.ears;
    if (ear === "cat") for (const s of [-1, 1]) for (let k = 0; k < 5; k++) for (let w = -Math.floor(k / 2); w <= Math.floor(k / 2); w++) solid(cxx + s * Math.round(rx * .55) + w, ty - 3 + k, k > 2 && w === 0 ? light : main);
    if (ear === "bunny") for (const s of [-1, 1]) for (let k = 0; k < 7; k++) for (let w = 0; w < 3; w++) solid(cxx + s * 3 + w - 1, ty - 6 + k, w === 1 && k > 1 ? light : main);
    if (ear === "bear") for (const s of [-1, 1]) for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x * x + y * y <= 5) solid(cxx + s * Math.round(rx * .7) + x, ty + 1 + y, x * x + y * y <= 1 ? light : main);
    if (ear === "horns") for (const s of [-1, 1]) for (let k = 0; k < 3; k++) solid(cxx + s * 4 + (k === 0 ? s : 0), ty - 2 + k, "#F2E8CF");
    /* tail */
    const tx = cxx + rx, tyy = by + 3;
    if (pet.tail === "curl") [[0, 0], [1, 0], [2, -1], [2, -2], [1, -3]].forEach(([a, b]) => solid(tx + a, tyy + b, main));
    if (pet.tail === "fluff") for (let y = -2; y <= 1; y++) for (let x = 0; x <= 3; x++) if (x * x + y * y <= 6) solid(tx + x, tyy + y, x > 1 ? light : main);
    if (pet.tail === "spikes") for (let k = 0; k < 4; k++){ solid(tx + k, tyy + 1 - (k >> 1), main); if (k % 2) solid(tx + k, tyy - (k >> 1), dark); }
    /* feet */
    if (st !== "hibernate") for (const s of [-1, 1]) for (let w = 0; w < 3; w++) solid(cxx + s * Math.max(3, rx - 4) + w - 1, by + ry - (pet.body === "ghost" ? 1 : 0), dark);
    /* body */
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++){
      const dx = (x + .5 - cxx) / rx, dy = (y + .5 - by) / (ry - squash * .5);
      if (!inside(pet.body, dx, dy, x)) continue;
      let c = main;
      if (dx + dy > 1.05) c = dark;
      if (pet.pattern === "belly" && ((dx / .55) ** 2 + ((dy - .45) / .45) ** 2 <= 1)) c = light;
      if (pet.pattern === "spots" && hash(x >> 1, y >> 1) > .82 && dy < .6) c = dark;
      if (pet.pattern === "stripes" && dy < -.1 && (y % 3 === 0)) c = dark;
      solid(x, y, c);
    }
    /* arms: bigger with muscle */
    const armH = br === "athlete" ? 4 : mus > 65 ? 3 : 2, armW = br === "athlete" ? 3 : mus > 65 ? 2 : 1;
    if (st !== "hibernate") for (const s of [-1, 1]) for (let h = 0; h < armH; h++) for (let w = 0; w < armW; w++) solid(cxx + s * (rx + w), by + 1 + h - (st === "happy" || (st === "play" && (look.toy !== "dance" || ((f % 6) < 3) === (s < 0))) ? 3 : 0), main);
    /* antenna / sprout on top */
    if (ear === "antenna"){ for (let k = 1; k <= 3; k++) set(cxx, ty - k, OUT); for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) solid(cxx + a - (a ? 0 : 0), ty - 5 + b, light); }
    if (ear === "sprout"){ for (let k = 1; k <= 3; k++) set(cxx, ty - k, "#3E8E3A"); solid(cxx - 1, ty - 4, "#6CC24A"); solid(cxx - 2, ty - 4, "#6CC24A"); solid(cxx + 1, ty - 3, "#6CC24A"); solid(cxx + 2, ty - 4, "#6CC24A"); }
    /* outline around everything solid */
    const o = [];
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) if (!body[y][x] && !px[y][x]){
      if ((y > 0 && body[y - 1][x]) || (y < G - 1 && body[y + 1][x]) || (x > 0 && body[y][x - 1]) || (x < G - 1 && body[y][x + 1])) o.push([x, y]);
    }
    o.forEach(([x, y]) => set(x, y, OUT));
    /* highlight */
    if (st !== "hibernate"){ set(cxx - Math.round(rx * .5), by - Math.round(ry * .55), "#FFFFFF"); set(cxx - Math.round(rx * .5) + 1, by - Math.round(ry * .55), light); }
    /* face */
    const ey = by - 2 + (baby ? 1 : 0), ex = Math.max(2, Math.min(4, rx - 4));
    const blink = (f % 30) === 0 || (f % 30) === 1;
    let eyeMode = pet.eyes;
    if (st === "sleep" || st === "hibernate" || blink) eyeMode = "closed";
    if (st === "happy" || st === "play" || st === "eat" && (f % 4) > 1) eyeMode = "joy";
    if (st === "sick") eyeMode = "x";
    if (st === "sad") eyeMode = "sad";
    if (br === "lazy" && eyeMode !== "closed" && eyeMode !== "joy") eyeMode = "sleepy";
    for (const s of [-1, 1]){
      const x = cxx + s * ex - (s > 0 ? 1 : 0);
      switch (eyeMode){
        case "closed": set(x, ey + 1, OUT); set(x + 1, ey + 1, OUT); break;
        case "joy": set(x, ey + 1, OUT); set(x + 1, ey, OUT); set(x + 2, ey + 1, OUT); break;
        case "x": set(x, ey, OUT); set(x + 2, ey, OUT); set(x + 1, ey + 1, OUT); set(x, ey + 2, OUT); set(x + 2, ey + 2, OUT); break;
        case "sad": set(x, ey + 1, OUT); set(x + 1, ey + 1, OUT); set(x + 1, ey + 2, OUT); set(x + (s < 0 ? 0 : 1), ey - 1, OUT); break;
        case "sleepy": set(x, ey + 1, OUT); set(x + 1, ey + 1, OUT); set(x, ey, dark); set(x + 1, ey, dark); break;
        case "big": set(x, ey, OUT); set(x + 1, ey, "#FFFFFF"); set(x, ey + 1, OUT); set(x + 1, ey + 1, OUT); break;
        case "bead": set(x, ey, OUT); set(x + 1, ey, OUT); set(x, ey + 1, OUT); set(x + 1, ey + 1, OUT); set(x, ey - 1, OUT); set(x + 1, ey - 1, OUT); set(x, ey, "#FFFFFF"); break;
        default: set(x, ey, OUT); set(x, ey + 1, OUT);
      }
    }
    if (!(st === "sleep" || st === "hibernate")) for (const s of [-1, 1]) set(cxx + s * (ex + 2) - (s > 0 ? 1 : 0), ey + 2, "#F59AB0");
    const my = ey + 3;
    if (st === "eat"){ const open = (f % 4) < 2; set(cxx - 1, my, OUT); set(cxx, my, OUT); if (open){ set(cxx - 1, my + 1, "#B0303C"); set(cxx, my + 1, "#B0303C"); set(cxx - 2, my, OUT); set(cxx + 1, my, OUT); } }
    else if (st === "sad" || st === "sick" || br === "grump"){ set(cxx - 2, my + 1, OUT); set(cxx - 1, my, OUT); set(cxx, my, OUT); set(cxx + 1, my + 1, OUT); }
    else if (st === "sleep" || st === "hibernate" || pet.mouth === "flat"){ set(cxx - 1, my, OUT); set(cxx, my, OUT); }
    else if (pet.mouth === "cat"){ set(cxx - 2, my, OUT); set(cxx - 1, my + 1, OUT); set(cxx, my, OUT); set(cxx + 1, my + 1, OUT); set(cxx + 2, my, OUT); }
    else { set(cxx - 2, my, OUT); set(cxx - 1, my + 1, OUT); set(cxx, my + 1, OUT); set(cxx + 1, my, OUT); if (pet.mouth === "fang") set(cxx, my + 2, "#FFFFFF"); }
    /* branch accessories */
    if (br === "athlete") for (let x = cxx - rx + 1; x <= cxx + rx - 1; x++) if (body[ey - 2] && body[ey - 2][x]) set(x, ey - 2, "#E0475B");
    if (br === "lazy" && st !== "happy"){ [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [1, -1], [2, -1], [3, -1], [2, -2], [3, -3], [4, -3]].forEach(([a, b]) => set(cxx - 2 + a, ty - 1 + b, b === 0 ? "#F2E8CF" : "#5B6CC2")); set(cxx + 5, ty - 3, "#FFFFFF"); }
    if (br === "donut") [[-rx - 2, 6], [rx + 3, 5], [-rx - 1, 8]].forEach(([a, b]) => set(cxx + a, by + b - 2, "#C98B4B"));
    if (br === "balanced" && (f % 12) < 6){ set(cxx - rx - 2, ty, "#F5C842"); set(cxx + rx + 2, ty + 3, "#F5C842"); set(cxx - rx - 2, ty - 1, "#FFFFFF"); }
    if (st === "sick") for (let k = 0; k < 4; k++) set(cxx + 1 + k, my + 1 - (k >> 1), k === 3 ? "#E0475B" : "#DDE3EA");
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
    const grid = look.stage === "egg" ? egg(pet, f, look.crack || 0) : sprite(pet, look, f);
    /* where the pet stands: wanders a little when idle, chases the ball when playing */
    let ox = 8, bx = 0, byy = 0;
    if (st === "idle") ox += Math.round(5 * Math.sin(f / 45));
    if (st === "play" && look.toy !== "dance"){
      const t = f % 48, k = t < 24 ? t / 24 : (48 - t) / 24;
      bx = Math.round(6 + k * 34); byy = Math.round(31 - Math.abs(Math.sin(t / 48 * Math.PI * 4)) * 12);
      ox += Math.max(-6, Math.min(6, Math.round((bx - 24) * 0.3)));
    }
    const oy = 4;
    grid.forEach((row, y) => row.forEach((c, x) => { if (c){ ctx.fillStyle = c; ctx.fillRect((ox + x) * S, (oy + y) * S, S, S); } }));
    if (st === "sleep" || st === "hibernate") for (let k = 0; k < 2; k++){ const t = (f + k * 8) % 16; icon(ctx, "z", (33 + k * 4 + (t >> 3)) * S, (14 - (t >> 1)) * S, "#F4F1D0", S * (k ? 1 : 0.75) | 0 || 1); }
    if (st === "happy" || (st === "eat" && f % 16 > 10)) for (let k = 0; k < 3; k++){ const t = (f * 2 + k * 7) % 20; icon(ctx, "heart", (10 + k * 13) * S, (16 - t / 2) * S | 0, "#E0475B", S * .6 | 0 || 1); }
    if (st === "eat" && f % 16 <= 10){ const t = f % 16; icon(ctx, "apple", 22 * S, Math.min(13, t * 2) * S, "#E0475B", S * .8 | 0 || 1); }
    if (st === "sad") icon(ctx, "drop", (34 + (f % 2)) * S, 14 * S, "#6AB3F0", S * .7 | 0 || 1);
    if (st === "hungry"){ ctx.fillStyle = "#FFFFFF"; ctx.fillRect(34 * S, 5 * S, 11 * S, 9 * S); ctx.fillRect(32 * S, 13 * S, 2 * S, 2 * S); icon(ctx, "apple", 36 * S, 7 * S, "#E0475B", S); }
    if (st === "play" && look.toy !== "dance"){ icon(ctx, "ball", bx * S, byy * S, "#E0475B", S); ctx.fillStyle = "#FFFFFF"; ctx.fillRect((bx + 1) * S, (byy + 1) * S, S, S); }
    if (st === "play" && look.toy === "dance") for (let k = 0; k < 2; k++){ const t = (f + k * 9) % 18; icon(ctx, "note", (k ? 36 : 6) * S, (18 - (t >> 1)) * S, k ? "#8A63D2" : "#3E8FD8", S * .7 | 0 || 1); }
    if (st === "hibernate"){ ctx.fillStyle = "rgba(220,230,255,.35)"; ctx.fillRect(10 * S, 30 * S, 28 * S, 3 * S); }
  }
  window.PetEngine = {PALETTES, PARTS, NAMES, randomPet, draw, sprite};
})();
