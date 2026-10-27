// Minimal city builder: grid of tiles, monthly budget, population and happiness.
(function () {
  const COLS = 32, ROWS = 20, T = 30;
  const TOOLS = {
    road:     { label: "Carretera", icon: "🛣️", cost: 10,  upkeep: 0.2, color: "#3a3f4b" },
    house:    { label: "Casa",      icon: "🏠", cost: 100, upkeep: 0,   color: "#6ea8ff", pop: 8 },
    shop:     { label: "Tienda",    icon: "🏪", cost: 150, upkeep: 0,   color: "#ffb86b", jobs: 6 },
    factory:  { label: "Fábrica",   icon: "🏭", cost: 250, upkeep: 0,   color: "#ff7a8a", jobs: 14, pollution: 1 },
    school:   { label: "Escuela",   icon: "🏫", cost: 400, upkeep: 8,   color: "#5ee6b0", happy: 1 },
    hospital: { label: "Hospital",  icon: "🏥", cost: 500, upkeep: 10,  color: "#f2f5ff", happy: 1 },
    park:     { label: "Parque",    icon: "🌳", cost: 60,  upkeep: 1,   color: "#57b05a", happy: 0.5, pollution: -1 },
    bulldoze: { label: "Demoler",   icon: "🧨", cost: 5 },
  };
  const KEYS = Object.keys(TOOLS);
  const SAVE = "urbania-save";

  const canvas = document.getElementById("board"), ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  let tool = "road", paused = false, state, painting = false;

  function fresh() { return { grid: Array(COLS * ROWS).fill(null), money: 5000, month: 1, pop: 0, jobs: 0, happy: 60 }; }
  function load() {
    try { const s = JSON.parse(localStorage.getItem(SAVE)); if (s && s.grid?.length === COLS * ROWS) return s; } catch {}
    return fresh();
  }
  function save() { try { localStorage.setItem(SAVE, JSON.stringify(state)); } catch {} }
  state = load();

  const at = (x, y) => (x < 0 || y < 0 || x >= COLS || y >= ROWS ? null : state.grid[y * COLS + x]);
  const nearRoad = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy) === "road");
  const log = (msg) => ($("log").textContent = msg);

  // Toolbar
  $("tools").innerHTML = KEYS.map((k, i) =>
    `<button class="tool" data-tool="${k}" aria-pressed="${k === tool}">${TOOLS[k].icon} ${TOOLS[k].label}<small>${i + 1} · ${TOOLS[k].cost} €</small></button>`).join("");
  function pick(k) {
    tool = k;
    document.querySelectorAll(".tool").forEach((b) => b.setAttribute("aria-pressed", b.dataset.tool === k));
  }
  $("tools").addEventListener("click", (e) => { const b = e.target.closest(".tool"); if (b) pick(b.dataset.tool); });

  function place(x, y, kind) {
    const i = y * COLS + x, cur = state.grid[i], t = TOOLS[kind];
    if (kind === "bulldoze") {
      if (!cur) return;
      if (state.money < t.cost) return log("No tienes dinero para demoler.");
      state.money -= t.cost; state.grid[i] = null; return;
    }
    if (cur) return;
    if (kind !== "road" && !nearRoad(x, y)) return log(`${t.label}: necesita una carretera al lado.`);
    if (state.money < t.cost) return log("Fondos insuficientes. Espera a cobrar impuestos.");
    state.money -= t.cost; state.grid[i] = kind;
  }

  function cell(e) {
    const r = canvas.getBoundingClientRect();
    return [Math.floor(((e.clientX - r.left) / r.width) * COLS), Math.floor(((e.clientY - r.top) / r.height) * ROWS)];
  }
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (e) => {
    painting = true; canvas.setPointerCapture(e.pointerId);
    const [x, y] = cell(e); place(x, y, e.button === 2 ? "bulldoze" : tool); draw();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!painting) return;
    const [x, y] = cell(e); place(x, y, e.buttons === 2 ? "bulldoze" : tool); draw();
  });
  canvas.addEventListener("pointerup", () => { painting = false; save(); });

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea")) return;
    const n = Number(e.key);
    if (n >= 1 && n <= KEYS.length) pick(KEYS[n - 1]);
    else if (e.key === "b" || e.key === "B") pick("bulldoze");
    else if (e.code === "Space") { e.preventDefault(); togglePause(); }
  });
  function togglePause() { paused = !paused; $("pause").textContent = paused ? "▶ Seguir" : "⏸ Pausa"; }
  $("pause").onclick = togglePause;
  $("reset").onclick = () => { if (confirm("¿Empezar una ciudad nueva? Se perderá la actual.")) { state = fresh(); save(); draw(); hud(); log(""); } };

  // Monthly simulation
  function tick() {
    if (paused) return;
    let homes = 0, jobs = 0, happy = 0, pollution = 0, upkeep = 0;
    state.grid.forEach((k) => {
      if (!k) return;
      const t = TOOLS[k];
      homes += t.pop || 0; jobs += t.jobs || 0; happy += t.happy || 0;
      pollution += t.pollution || 0; upkeep += t.upkeep || 0;
    });
    const mood = Math.max(0, Math.min(100, 50 + happy * 6 - Math.max(0, pollution) * 3 - Math.max(0, state.pop - jobs) * 0.5));
    state.happy = Math.round(state.happy + (mood - state.happy) * 0.3);
    const target = Math.round(homes * (0.4 + state.happy / 170));
    state.pop += Math.sign(target - state.pop) * Math.ceil(Math.abs(target - state.pop) * 0.25);
    state.jobs = jobs;
    const employed = Math.min(state.pop, jobs);
    const income = Math.round(state.pop * 1.5 + employed * 2);
    state.money += income - Math.round(upkeep);
    state.month++;
    if (state.money < 0) log("⚠️ Estás en números rojos. Reduce gastos o espera a que crezca la población.");
    else if (homes && jobs < state.pop) log("Falta empleo: construye tiendas o fábricas.");
    else if (homes && state.happy < 50) log("Los vecinos están descontentos: añade escuelas, hospitales o parques.");
    hud(); save();
  }

  function hud() {
    $("money").textContent = `${state.money.toLocaleString("es")} €`;
    $("money").style.color = state.money < 0 ? "#ff7a8a" : "";
    $("pop").textContent = state.pop.toLocaleString("es");
    $("jobs").textContent = state.jobs.toLocaleString("es");
    $("happy").textContent = `${state.happy}%`;
    $("month").textContent = state.month;
  }

  function draw() {
    ctx.fillStyle = "#2a4a2f"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(255,255,255,.05)";
    for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x * T, 0); ctx.lineTo(x * T, ROWS * T); ctx.stroke(); }
    for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0, y * T); ctx.lineTo(COLS * T, y * T); ctx.stroke(); }
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `${T * 0.6}px system-ui`;
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const k = at(x, y); if (!k) continue;
        const t = TOOLS[k];
        if (k === "road") {
          ctx.fillStyle = t.color; ctx.fillRect(x * T, y * T, T, T);
          ctx.fillStyle = "#ffd27a";
          if (at(x - 1, y) === "road" || at(x + 1, y) === "road") ctx.fillRect(x * T + 4, y * T + T / 2 - 1, T - 8, 2);
          if (at(x, y - 1) === "road" || at(x, y + 1) === "road") ctx.fillRect(x * T + T / 2 - 1, y * T + 4, 2, T - 8);
        } else {
          ctx.fillStyle = t.color; ctx.fillRect(x * T + 2, y * T + 2, T - 4, T - 4);
          ctx.fillText(t.icon, x * T + T / 2, y * T + T / 2 + 1);
        }
      }
  }

  hud(); draw();
  log(state.month === 1 ? "Empieza trazando una carretera (herramienta 1)." : "Ciudad cargada. ¡Sigue construyendo!");
  setInterval(() => { tick(); }, 2000);
})();
