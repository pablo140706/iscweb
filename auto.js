// ============================================================
//  P17 · MODO AUTOMÁTICO
// ============================================================
document.querySelectorAll(".auto-tab").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll(".auto-tab").forEach((b) => b.classList.toggle("active", b === btn));
    const mode = btn.dataset.mode;
    document.querySelector(".auto-config[data-mode='auto']").hidden = (mode !== "auto");
  };
});

function hhmmToMin(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }

function ofertaCaeEnVentana(sesiones, iniMin, finMin) {
  return sesiones.every((s) => hhmmToMin(s.ini) >= iniMin && hhmmToMin(s.fin) <= finMin);
}

// Detecta conflicto entre dos arrays de sesiones
function sesionesChocan(a, b) {
  for (const sa of a) for (const sb of b) {
    if (sa.dia === sb.dia && sa.ini < sb.fin && sb.ini < sa.fin) return true;
  }
  return false;
}

// Bloques de clase (horas de inicio). El índice mide huecos en la rejilla.
const BLOQUE_INI = ["07:00","08:30","10:30","12:00","13:30","15:00","16:30","18:30","20:00"];
function bloqueIdx(ini) {
  const i = BLOQUE_INI.indexOf(ini);
  if (i !== -1) return i;
  const min = hhmmToMin(ini); let best = 0;
  BLOQUE_INI.forEach((b, k) => { if (hhmmToMin(b) <= min) best = k; });
  return best;
}
// Horas muertas: bloques vacíos entre la 1.ª y la última clase de cada día
function contarHuecos(items) {
  const byDay = {};
  items.forEach((it) => (it.sesiones || []).forEach((s) => {
    (byDay[s.dia] = byDay[s.dia] || []).push(bloqueIdx(s.ini));
  }));
  let huecos = 0;
  Object.values(byDay).forEach((idxs) => {
    idxs.sort((a, b) => a - b);
    huecos += (idxs[idxs.length - 1] - idxs[0] + 1) - idxs.length;
  });
  return huecos;
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// ============================================================
//  SERIACIÓN (linealidad del plan, según la imagen del mapa curricular)
//  dependiente → [prerequisito(s)]. La dependiente SOLO se puede meter en
//  modo Auto si TODOS sus prerequisitos están APROBADOS (si alguno está
//  reprobado o pendiente, se bloquea). Excepción del usuario marcada (★).
// ============================================================
const SERIACION = {
  "CALCULO APLICADO": ["CALCULO"],
  "ALGEBRA LINEAL": ["ANALISIS VECTORIAL"],                                   // ★ excepción (no Mecánica)
  "ALGORITMOS Y ESTRUCTURA DE DATOS": ["FUNDAMENTOS DE PROGRAMACION"],
  "ECUACIONES DIFERENCIALES": ["CALCULO APLICADO"],
  "CIRCUITOS ELECTRICOS": ["MECANICA Y ELECTROMAGNETISMO"],
  "ANALISIS Y DISENO DE ALGORITMOS": ["ALGORITMOS Y ESTRUCTURA DE DATOS"],
  "PARADIGMAS DE PROGRAMACION": ["ALGORITMOS Y ESTRUCTURA DE DATOS"],
  "ELECTRONICA ANALOGICA": ["CIRCUITOS ELECTRICOS"],
  "DISENO DE SISTEMAS DIGITALES": ["FUNDAMENTOS DE DISENO DIGITAL"],
  "TEORIA DE LA COMPUTACION": ["ANALISIS Y DISENO DE ALGORITMOS"],
  "TECNOLOGIAS PARA DESARROLLO DE APLICACIONES WEB": ["BASES DE DATOS"],
  "MATEMATICAS AVANZADAS PARA LA INGENIERIA": ["ECUACIONES DIFERENCIALES"],
  "ARQUITECTURA DE COMPUTADORAS": ["DISENO DE SISTEMAS DIGITALES"],
  "COMPILADORES": ["ANALISIS Y DISENO DE ALGORITMOS"],
  "INSTRUMENTACION Y CONTROL": ["ELECTRONICA ANALOGICA"],
  "SISTEMAS EN CHIP": ["ARQUITECTURA DE COMPUTADORAS"],
  "PROCESAMIENTO DIGITAL DE SENALES": ["MATEMATICAS AVANZADAS PARA LA INGENIERIA"],
  "INGENIERIA DE SOFTWARE": ["ANALISIS Y DISENO DE SISTEMAS"],
  "APLICACIONES PARA COMUNICACIONES EN RED": ["REDES DE COMPUTADORAS"],
  "ADMINISTRACION DE SERVICIOS EN RED": ["REDES DE COMPUTADORAS"],
  "SISTEMAS DISTRIBUIDOS": ["SISTEMAS OPERATIVOS"],
};
const VENTANA_SEM = 3; // máximo de semestres que puede abarcar el horario auto

function buscarMateriaPlan(normName) {
  for (let s = 0; s < PLAN.length; s++) {
    const arr = PLAN[s].materias;
    for (let i = 0; i < arr.length; i++) {
      if (norm(arr[i][0]) === normName) return { s, i, id: idOf(s, i), name: arr[i][0] };
    }
  }
  return null;
}

// ¿Los prerequisitos de la materia están todos aprobados? (sin prereq = libre)
function prereqsAprobados(name) {
  const reqs = SERIACION[norm(name)];
  if (!reqs || !reqs.length) return true;
  return reqs.every((rn) => {
    const mt = buscarMateriaPlan(rn);
    if (!mt) return true; // prereq no hallado en el plan: no bloquear
    return getSub(mt.id, mt.name).status === "aprobada";
  });
}

// Nombre legible del/los prereq(s) que faltan por aprobar (para el mensaje)
function prereqFaltante(name) {
  const reqs = SERIACION[norm(name)];
  if (!reqs) return null;
  for (const rn of reqs) {
    const mt = buscarMateriaPlan(rn);
    if (mt && getSub(mt.id, mt.name).status !== "aprobada") return mt.name;
  }
  return null;
}

// Ajusta la ventana horaria sugerida según el turno elegido
document.getElementById("autoTurno").addEventListener("change", (e) => {
  const v = e.target.value;
  const ent = document.getElementById("autoEntrada");
  const sal = document.getElementById("autoSalida");
  if (v === "M") { ent.value = "07:00"; sal.value = "15:00"; }
  else if (v === "V") { ent.value = "12:00"; sal.value = "21:30"; }
  else { ent.value = "07:00"; sal.value = "21:30"; }
});

// Estado del generador (para el botón "Otra opción")
let autoPool = [];        // soluciones distintas, todas con el máximo de materias colocadas
let autoLastKey = null;   // última combinación mostrada (para no repetir)
let autoCtx = null;       // { semNombre, totalFaltantes }

function keyDeSol(sol) { return sol.elegidas.map((e) => e.sid + ":" + e.grupo).sort().join("|"); }

function generarHorarioAuto() {
  const entrada = document.getElementById("autoEntrada").value;
  const salida = document.getElementById("autoSalida").value;
  const turno = document.getElementById("autoTurno").value;
  const maxMat = Math.max(1, Math.min(9, parseInt(document.getElementById("autoMax").value) || 7));
  const resultEl = document.getElementById("autoResult");
  const otraBtn = document.getElementById("autoOtraBtn");

  if (!entrada || !salida) { alert("Captura hora de entrada y salida."); return; }
  const iniMin = hhmmToMin(entrada);
  const finMin = hhmmToMin(salida);
  if (iniMin >= finMin) { alert("La hora de salida debe ser mayor que la de entrada."); return; }

  const base = state.horario.filter((h) => !h._auto);
  const credBloq = creditosBloqueados();
  const credBase = base.reduce((a, h) => a + h.cred, 0);
  const credDisponibles = MAX_CRED - credBloq - credBase;

  // 1) Todas las inscribibles que no estén ya en el horario.
  //    Incluye reprobadas: canInscribir() solo descarta aprobadas y las
  //    reprobadas en 2ª vuelta (bloqueadas, sin 3.er intento). El criterio de
  //    recurso es el mismo que usa el alta manual en avance.js.
  const pendientes = [];
  for (let s = 0; s < PLAN.length; s++) {
    PLAN[s].materias.forEach(([name, cred], i) => {
      const id = idOf(s, i);
      if (OPT_SLOTS[id]) return;
      const rec = getSub(id, name);
      const inscribible = rec.status === "pendiente" || rec.status === "reprobada";
      if (inscribible && canInscribir(rec) && !base.some((h) => h.sid === id)) {
        const recurse = rec.status === "reprobada" || rec.veces >= 2;
        pendientes.push({ id, name, cred, i, s, recurse });
      }
    });
  }

  if (pendientes.length === 0) {
    autoPool = []; autoLastKey = null; autoCtx = null;
    if (otraBtn) otraBtn.hidden = true;
    resultEl.innerHTML = `<div class="auto-warn">No faltan materias por inscribir (o ya las tienes en el horario).</div>`;
    return;
  }

  // 2) Seriación: la dependiente solo entra si su prerequisito está aprobado
  const bloqueadasSer = pendientes.filter((f) => !prereqsAprobados(f.name));
  let faltantes = pendientes.filter((f) => prereqsAprobados(f.name));

  if (faltantes.length === 0) {
    autoPool = []; autoLastKey = null; autoCtx = null;
    if (otraBtn) otraBtn.hidden = true;
    const ejemplo = bloqueadasSer[0];
    const req = ejemplo ? prereqFaltante(ejemplo.name) : null;
    resultEl.innerHTML = `<div class="auto-warn">Todas las pendientes están bloqueadas por seriación` +
      (req ? ` (ej.: <b>${esc(ejemplo.name)}</b> necesita aprobar <b>${esc(req)}</b>)` : "") +
      `. Aprueba/captura los prerequisitos primero o agrégalas a mano.</div>`;
    return;
  }

  // 3) Ventana de semestres: ancla en el semestre más bajo con pendientes
  //    colocables y permite a lo más VENTANA_SEM semestres (ej. 1 → 1,2,3).
  //    Los recursos quedan FUERA de este cálculo y nunca se filtran: una
  //    reprobada de 1.er semestre no debe arrastrar la ventana hacia abajo y
  //    dejar fuera el semestre que la persona cursa hoy.
  const recursos = faltantes.filter((f) => f.recurse);
  const normales = faltantes.filter((f) => !f.recurse);
  const ancla = normales.length ? normales : faltantes;
  const minSem = Math.min(...ancla.map((f) => f.s));
  const maxSem = minSem + (VENTANA_SEM - 1);
  const fueraVentana = normales.filter((f) => f.s > maxSem);
  faltantes = recursos.concat(normales.filter((f) => f.s <= maxSem));

  if (credDisponibles <= 0) {
    autoPool = []; if (otraBtn) otraBtn.hidden = true;
    resultEl.innerHTML = `<div class="auto-warn">No hay créditos disponibles (${fmt(credBase)} inscritos + ${fmt(credBloq)} bloqueados = ${fmt(credBase + credBloq)} de ${MAX_CRED}).</div>`;
    return;
  }

  const addMax = Math.max(0, maxMat - base.length);
  if (addMax === 0) {
    if (otraBtn) otraBtn.hidden = true;
    resultEl.innerHTML = `<div class="auto-warn">Ya tienes ${base.length} materias en el horario (tu tope es ${maxMat}). Sube el tope para agregar más.</div>`;
    return;
  }

  const cand = faltantes.map((f) => {
    const ofs = scheduleFor(f.s, f.i)
      .filter((e) => turno === "ambos" || (turnoDeGrupo(e.grupo) || "M") === turno)
      .filter((e) => ofertaCaeEnVentana(e.sesiones, iniMin, finMin))
      .filter((e) => !base.some((h) => sesionesChocan(h.sesiones, e.sesiones)));
    return { ...f, ofs };
  });

  const bySem = {};
  for (const f of cand) (bySem[f.s] = bySem[f.s] || []).push(f);
  const semKeys = Object.keys(bySem).sort((a, b) => a - b);

  const soluciones = [];
  const seen = new Set();
  for (let iter = 0; iter < 600; iter++) {
    // Prioridad: primero TODOS los recursos (reprobadas y 2ª vuelta), de
    // semestre menor a mayor; después el resto con la misma cascada. Así los
    // recursos eligen horario antes y el greedy no se queda sin huecos para
    // ellos. El azar sigue viviendo dentro de cada grupo.
    const orden = [];
    for (const s of semKeys) orden.push(...shuffle(bySem[s].filter((f) => f.recurse)));
    for (const s of semKeys) orden.push(...shuffle(bySem[s].filter((f) => !f.recurse)));

    const elegidas = [];
    let credAcum = 0;
    for (const f of orden) {
      if (elegidas.length >= addMax) break;
      if (credAcum + f.cred > credDisponibles) continue;
      const ops = shuffle(f.ofs).filter((of) => !elegidas.some((e) => sesionesChocan(e.sesiones, of.sesiones)));
      if (ops.length) {
        const of = ops[0];
        elegidas.push({
          sid: f.id, materia: f.name, maestro: of.profesor, grupo: of.grupo,
          edificio: of.edificio, salon: of.salon, sesiones: of.sesiones,
          cred: f.cred, tipo: f.recurse ? "recurse" : "nueva", _auto: true,
        });
        credAcum += f.cred;
      }
    }
    if (!elegidas.length) continue;
    const key = elegidas.map((e) => e.sid + ":" + e.grupo).sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    soluciones.push({
      elegidas,
      placed: elegidas.length,
      recursos: elegidas.filter((e) => e.tipo === "recurse").length,
      huecos: contarHuecos(base.concat(elegidas)),
    });
  }

  if (!soluciones.length) {
    autoPool = []; if (otraBtn) otraBtn.hidden = true;
    resultEl.innerHTML = `<div class="auto-warn">⚠️ No se pudo cuadrar ninguna materia faltante en esa ventana. Amplía tu horario de entrada/salida o cambia de turno.</div>`;
    return;
  }

  // Criterio de desempate, en orden: más recursos colocados, luego más
  // materias, luego menos huecos. Que los recursos manden aquí es lo que
  // garantiza la prioridad: ponerlos primero en el orden no basta, porque una
  // combinación con menos recursos pero más materias ganaría por volumen.
  soluciones.sort((a, b) => b.recursos - a.recursos || b.placed - a.placed || a.huecos - b.huecos);
  const maxRecursos = soluciones[0].recursos;
  const conRecursos = soluciones.filter((s) => s.recursos === maxRecursos);
  const bestPlaced = conRecursos[0].placed;
  const minHuecos = conRecursos.find((s) => s.placed === bestPlaced).huecos;
  autoPool = conRecursos.filter((s) => s.placed === bestPlaced && s.huecos === minHuecos);
  autoLastKey = null;
  autoCtx = {
    totalFaltantes: faltantes.length,
    totalRecursos: recursos.length,
    bloqueadasSer: bloqueadasSer.length,
    fueraVentana: fueraVentana.length,
    minSem, maxSem,
  };

  aplicarSolucionAuto();
}

// Aplica una solución del pool (aleatoria y distinta a la anterior) sobre la base manual
function aplicarSolucionAuto() {
  if (!autoPool.length || !autoCtx) return;
  const resultEl = document.getElementById("autoResult");
  const otraBtn = document.getElementById("autoOtraBtn");
  const base = state.horario.filter((h) => !h._auto);

  let pool = autoPool;
  if (autoPool.length > 1 && autoLastKey) {
    const filtered = autoPool.filter((s) => keyDeSol(s) !== autoLastKey);
    if (filtered.length) pool = filtered;
  }
  const sol = pool[Math.floor(Math.random() * pool.length)];
  autoLastKey = keyDeSol(sol);

  state.horario = base.concat(sol.elegidas);
  save();
  renderHorario();

  if (otraBtn) otraBtn.hidden = autoPool.length < 2;

  const totalCred = state.horario.reduce((a, e) => a + e.cred, 0);
  const colocadas = sol.elegidas.length;
  const sinFit = autoCtx.totalFaltantes - colocadas;
  const porSem = {};
  sol.elegidas.forEach((e) => {
    const m = e.sid.match(/^s(\d+)-/);
    const s = m ? parseInt(m[1]) : 0;
    (porSem[s] = porSem[s] || []).push(e);
  });
  const resumenSems = Object.keys(porSem).sort((a, b) => a - b)
    .map((s) => `${porSem[s].length} de ${PLAN[s].sem}`).join(", ");
  const recColocados = sol.recursos || 0;
  const recTotal = autoCtx.totalRecursos || 0;
  let html = `<div class="auto-ok">✅ Agregué <b>${colocadas}</b> materia(s): ${resumenSems}. ` +
    (recColocados ? `Incluye <b>${recColocados}</b> para recursar. ` : "") +
    `Horario: <b>${state.horario.length}</b> materias · ${fmt(totalCred)} créditos · ` +
    `<b>${sol.huecos === 0 ? "sin horas muertas" : sol.huecos + " hueco(s)"}</b>.</div>`;
  if (recTotal > recColocados) {
    html += `<div class="auto-warn">⚠️ ${recTotal - recColocados} materia(s) por recursar no cupieron en tu ventana de horas, aunque tenían prioridad. Amplía el horario o cambia de turno.</div>`;
  }
  if (sinFit > 0) {
    html += `<div class="auto-warn">⚠️ ${sinFit} materia(s) no cupieron sin chocar en tu ventana de horas. Amplía el horario o agrégalas a mano.</div>`;
  }
  if (autoPool.length > 1) {
    html += `<div class="auto-hint">¿No te convence? Pulsa <b>🎲 Otra opción</b> para barajar otra combinación igual de compacta.</div>`;
  }
  resultEl.innerHTML = html;
}

document.getElementById("autoGenBtn").onclick = () => generarHorarioAuto();
document.getElementById("autoOtraBtn").onclick = () => {
  if (autoPool.length) aplicarSolucionAuto(); else generarHorarioAuto();
};

// P14: Borrar todo el horario
document.getElementById("clearHorarioBtn").onclick = () => {
  if (state.horario.length === 0) { alert("Tu horario ya está vacío."); return; }
  if (confirm(`¿Borrar las ${state.horario.length} materia(s) que tienes en el horario? Esta acción no se puede deshacer.`)) {
    state.horario = [];
    save();
    renderHorario();
    // refresca botones del plan
    planEl.querySelectorAll(".drop.open").forEach((d) => {
      const subj = d.closest(".subject");
      const m = subj.dataset.id.match(/^s(\d+)-(\d+)$/);
      if (m) renderDrop(d, parseInt(m[1]), parseInt(m[2]));
    });
  }
};

document.getElementById("backupBtn").onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "avance_carrera.json";
  a.click();
  URL.revokeObjectURL(a.href);
};
document.getElementById("restoreBtn").onclick = () => document.getElementById("fileInput").click();
document.getElementById("fileInput").onchange = (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const parsed = JSON.parse(r.result);
      state = {
        subjects: parsed.subjects || {},
        horario: parsed.horario || [],
        teacherMats: parsed.teacherMats || {},
      };
      save();
      location.reload();
    } catch (err) {
      alert("Ese archivo no se pudo leer. Usa el respaldo .json que descargaste.");
    }
  };
  r.readAsText(f);
};
document.getElementById("resetBtn").onclick = () => {
  if (confirm("¿Borrar todo tu avance, calificaciones, métricas y horario?")) {
    state = blankState();
    save();
    location.reload();
  }
};

