/* ============================================================
   RAPsi UNAL — Dashboard de Análisis de Bienestar
   stats.js  ·  v3 — 100% estático, datos desde JSON local
============================================================ */

/* ----------------------------------------------------------
   INSTANCIAS DE GRÁFICAS
---------------------------------------------------------- */
let barChartInst      = null;
let doughnutChartInst = null;

/* ----------------------------------------------------------
   CATEGORÍAS VISUALES — usan prefijo avg_* para que categoryValue
   lea directamente los aliases del objeto avgs.
---------------------------------------------------------- */
const CATEGORIAS = [
  { label: 'Sueño',                   keys: ['avg_sleep_hours'],                                                              color: '#27546c' },
  { label: 'Alimentación',            keys: ['avg_food_hours'],                                                               color: '#d4a574' },
  { label: 'Cuidado Personal',        keys: ['avg_grooming_hours'],                                                           color: '#3d8ba0' },
  { label: 'Transporte',              keys: ['avg_transport_hours'],                                                          color: '#5a9bb5' },
  { label: 'Academia y Obligaciones', keys: ['avg_academic_load_hours', 'avg_obligations_hours', 'avg_house_tasks_hours'],     color: '#ff9491' },
  { label: 'Trabajo',                 keys: ['avg_work_hours'],                                                               color: '#e8956d' },
  { label: 'Ocio Digital',            keys: ['avg_scrolling_hours'],                                                          color: '#ffccc9' },
  { label: 'Deporte y Salud',         keys: ['avg_physical_activity_hours'],                                                  color: '#2F7A8C' },
  { label: 'Tiempo Social',           keys: ['avg_quality_social_hours'],                                                     color: '#5BC8AF' },
  { label: 'Hobbies',                 keys: ['avg_other_hobbies_hours'],                                                      color: '#B79CED' },
  { label: 'Tiempo Libre',            keys: ['avg_available_time'],                                                           color: '#a8d5a2' },
];

/* ----------------------------------------------------------
   HELPERS
---------------------------------------------------------- */
function fmt(n) {
  const v = parseFloat(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

// Suma las propiedades del objeto avgs que corresponden a una categoría.
function categoryValue(avgs, cat) {
  return cat.keys.reduce((s, k) => s + (avgs[k] || 0), 0);
}

/* ----------------------------------------------------------
   CÁLCULO DE PROMEDIOS EN CLIENTE
   Devuelve propiedades en dos formas:
   - avg_*  → leídas por categoryValue() → gráficas (CATEGORIAS usa avg_* keys)
   - short  → leídas por renderInsights() / updateKPIs()
---------------------------------------------------------- */
function computeClientAverages(records) {
  const n = records.length;
  if (!n) return null;

  const mean = col => records.reduce((s, r) => s + (parseFloat(r[col]) || 0), 0) / n;

  const sleep    = mean('sleep_hours');
  const food     = mean('food_hours');
  const grooming = mean('grooming_hours');
  const transit  = mean('transport_hours');
  const study    = mean('academic_load_hours');
  const other    = mean('obligations_hours');
  const house    = mean('house_tasks_hours');
  const work     = mean('work_hours');
  const screen   = mean('scrolling_hours');
  const physical = mean('physical_activity_hours');
  const social   = mean('quality_social_hours');
  const hobby    = mean('other_hobbies_hours');
  const free     = mean('available_time');

  return {
    // Aliases avg_* — requeridos por CATEGORIAS → categoryValue → gráficas
    avg_sleep_hours:             sleep,
    avg_food_hours:              food,
    avg_grooming_hours:          grooming,
    avg_transport_hours:         transit,
    avg_academic_load_hours:     study,
    avg_work_hours:              work,
    avg_obligations_hours:       other,
    avg_house_tasks_hours:       house,
    avg_scrolling_hours:         screen,
    avg_physical_activity_hours: physical,
    avg_quality_social_hours:    social,
    avg_other_hobbies_hours:     hobby,
    avg_available_time:          free,
    // Nombres cortos — usados por KPIs e Insights
    sleep, food, grooming, transit, study, other,
    house, work, screen, physical, social, hobby, free,
    // Derivados
    sleepDaily:  sleep / 7,
    screenDaily: screen / 7,
    academic:    study + other + house,
    wellbeing:   physical + social + hobby,
    pctPhysical: records.filter(r => (parseFloat(r.physical_activity_hours) || 0) > 0).length / n * 100,
    pctSocial:   records.filter(r => (parseFloat(r.quality_social_hours)    || 0) > 0).length / n * 100,
  };
}

/* ----------------------------------------------------------
   GESTIÓN DE ESTADOS — loading / empty / content
   Centralizada: evita que funciones parciales se pisen.
---------------------------------------------------------- */
const CONTENT_IDS = ['kpi-section', 'insights-section', 'charts-section'];

function destroyCharts() {
  if (barChartInst)      { barChartInst.destroy();      barChartInst      = null; }
  if (doughnutChartInst) { doughnutChartInst.destroy(); doughnutChartInst = null; }
}

function showLoading() {
  destroyCharts();
  document.getElementById('state-loading').style.display = 'flex';
  document.getElementById('state-empty').style.display   = 'none';
  CONTENT_IDS.forEach(id => { document.getElementById(id).style.display = 'none'; });
}

function showEmpty(msg) {
  destroyCharts();
  document.getElementById('state-loading').style.display = 'none';
  const emptyEl = document.getElementById('state-empty');
  emptyEl.style.display = 'flex';
  if (msg) emptyEl.querySelector('p').textContent = msg;
  CONTENT_IDS.forEach(id => { document.getElementById(id).style.display = 'none'; });
}

function showContent() {
  document.getElementById('state-loading').style.display = 'none';
  document.getElementById('state-empty').style.display   = 'none';
  CONTENT_IDS.forEach(id => { document.getElementById(id).style.display = ''; });
}

/* ----------------------------------------------------------
   TIMELINE — estado del dominio temporal (data-driven)
   Se configura a partir de los created_at reales del JSON:
   el día más antiguo es el offset 0 y el más reciente, maxOff.
---------------------------------------------------------- */
let ALL_RECORDS = [];
const MS_DAY        = 86400000;
const MESES_ABBR    = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MILESTONE_YMD = '2026-05-21';   // Jueves · Feria de las Emociones
const TL = { baseMs: 0, maxOff: 0, milestoneOff: null };

// created_at (UTC) → día calendario en Colombia (UTC-5, sin DST) "YYYY-MM-DD"
function colombiaDay(ms) {
  return new Date(ms - 5 * 3600 * 1000).toISOString().slice(0, 10);
}
// offset (días desde el día más antiguo) → "YYYY-MM-DD"
function offsetToYMD(off) {
  return new Date(TL.baseMs + off * MS_DAY).toISOString().slice(0, 10);
}
// "YYYY-MM-DD" → instante (ms) del inicio o fin del día en Colombia
function ymdToMs(ymd, endOfDay) {
  return new Date(`${ymd}T${endOfDay ? '23:59:59' : '00:00:00'}-05:00`).getTime();
}
function ymdToLabel(ymd) { const [y, m, d] = ymd.split('-').map(Number); return `${d} ${MESES_ABBR[m - 1]} ${y}`; }
function ymdToShort(ymd) { const [, m, d] = ymd.split('-').map(Number);  return `${d} ${MESES_ABBR[m - 1]}`; }
function pctOf(off)      { return TL.maxOff ? (off / TL.maxOff) * 100 : 0; }

/* ----------------------------------------------------------
   KPI CARDS
---------------------------------------------------------- */
function updateKPIs(avgs, count) {
  document.getElementById('kpi-val-total').textContent    = count.toLocaleString('es-CO');
  document.getElementById('kpi-val-sleep').textContent    = fmt(avgs.sleepDaily)  + ' h/día';
  document.getElementById('kpi-val-academic').textContent = fmt(avgs.study)       + ' h/sem';
  document.getElementById('kpi-val-free').textContent     = fmt(avgs.wellbeing)   + ' h/sem';
}

/* ----------------------------------------------------------
   HISTORIAS COMUNITARIAS — 4 narrativas cruzadas de salud colectiva
   Badge 3-tier: strength (fortaleza) · ok (favorable) · warn (alerta)
---------------------------------------------------------- */
function renderInsights(avgs) {
  const el = document.getElementById('insights-container');
  if (!el) return;

  function badgeHTML(state) {
    if (state === 'strength') return '<span class="insight-badge insight-badge--strength">⭐ Fortaleza</span>';
    if (state === 'ok')       return '<span class="insight-badge insight-badge--ok">✓ Favorable</span>';
    if (state === 'warn')     return '<span class="insight-badge insight-badge--warn">↑ Alerta</span>';
    return '';
  }

  // — Story 1: Sueño colectivo
  const sleep1State = avgs.sleepDaily >= 7.5            ? 'strength'
                    : avgs.sleepDaily >= 7              ? 'ok'
                    : (avgs.sleepDaily < 7 && avgs.study > 40) ? 'warn'
                    : null;

  const sleep1Desc = sleep1State === 'strength'
    ? `Fortaleza institucional: la comunidad duerme un promedio de ${fmt(avgs.sleepDaily)} h/noche. Sostener este estándar incluso bajo carga académica es un logro colectivo significativo que protege el rendimiento cognitivo y el bienestar general.`
    : sleep1State === 'ok'
      ? `El promedio de sueño se mantiene dentro del rango recomendado (${fmt(avgs.sleepDaily)} h/noche) incluso con una carga académica de ${fmt(avgs.study)} h/semana. Un indicador de equilibrio institucional positivo.`
      : `La comunidad universitaria sostiene sus altas cargas académicas sacrificando el descanso base. En promedio, estamos acumulando una deuda de sueño colectiva que reduce el bienestar y afecta directamente el rendimiento cognitivo institucional. Los CDC (2024) recomiendan de 7 a 9 horas; menos de esto afecta la consolidación de memoria, aumenta la irritabilidad y el riesgo metabólico (National Heart, Lung, and Blood Institute, 2022).`;

  // — Story 2: Ocio digital vs bienestar activo
  const paradojaOcio  = avgs.screen > avgs.wellbeing;
  const digital2State = (!paradojaOcio && avgs.screen <= avgs.wellbeing * 0.5 && avgs.wellbeing > 5)
                          ? 'strength'
                        : !paradojaOcio ? 'ok'
                        : 'warn';

  const digital2Desc = digital2State === 'strength'
    ? `Fortaleza colectiva: el tiempo de pantallas (${fmt(avgs.screen)} h) es menos de la mitad del bienestar activo combinado (${fmt(avgs.wellbeing)} h de deporte, socialización y hobbies). La comunidad filtrada demuestra una relación saludable con la tecnología.`
    : digital2State === 'ok'
      ? `La comunidad supera el tiempo de pantallas (${fmt(avgs.screen)} h) con bienestar activo combinado (${fmt(avgs.wellbeing)} h) de deporte, socialización y hobbies. Una señal de agencia frente al consumo digital pasivo.`
      : `Como comunidad, pasamos más tiempo promedio en pantallas recreativas (${fmt(avgs.screen)} h) que en descanso activo, deporte y socialización sumados (${fmt(avgs.wellbeing)} h). El consumo digital se ha convertido en la principal vía pasiva de desconexión. Tiempos superiores a 3 horas diarias en redes se asocian con trastornos del sueño, agotamiento y mayor ansiedad en universitarios (Osman, 2025).`;

  // — Story 3: Carga de transporte
  const transitState = avgs.transit <= 5 ? 'strength' : null;
  const transitPct   = avgs.free > 0 ? Math.round((avgs.transit / avgs.free) * 100) : null;

  const transit3Desc = transitState === 'strength'
    ? `Fortaleza territorial: con solo ${fmt(avgs.transit)} h semanales de desplazamiento, la comunidad filtrada tiene una carga de transporte baja que preserva tiempo para el autocuidado y la vida social.`
    : avgs.free > 0
      ? `El desplazamiento urbano opera como un segundo trabajo no reconocido. El usuario promedio invierte ${fmt(avgs.transit)} horas a la semana en transporte público, devorando silenciosamente un ${transitPct}% del tiempo libre que podría usarse para la salud o el autocuidado.`
      : `El desplazamiento urbano consume ${fmt(avgs.transit)} horas semanales sobre una agenda que ya no tiene tiempo libre neto. Esta carga invisible no aparece en ningún horario oficial.`;

  // — Story 4: Tejido social
  const aislamientoRisk = avgs.social < 3 || avgs.pctSocial < 50;
  const social4State    = (avgs.pctSocial >= 70 && avgs.social >= 5) ? 'strength'
                        : !aislamientoRisk                            ? 'ok'
                        : 'warn';

  const social4Desc = social4State === 'strength'
    ? `Fortaleza social institucional: el ${avgs.pctSocial.toFixed(0)}% de la comunidad reporta tiempo social activo, con un promedio de ${fmt(avgs.social)} h/semana. Las redes de apoyo interpersonal son sólidas y actúan como factor protector colectivo.`
    : social4State === 'ok'
      ? `La comunidad mantiene conexiones sociales activas con un promedio de ${fmt(avgs.social)} h/semana y el ${avgs.pctSocial.toFixed(0)}% de usuarios reportando tiempo social. Las redes de apoyo interpersonal se sostienen como factor protector.`
      : `Detectamos una restricción severa en las redes de socialización activa de los usuarios filtrados. Las demandas cotidianas están desplazando los espacios comunitarios, aumentando el riesgo latente de aislamiento y pérdida de tejido de apoyo en la sede. La OMS recomienda 150 min semanales de actividad física, y dedicar al menos 2 horas a encuentros sociales sin agenda académica impacta directo en el bienestar emocional (Chalela-Naffah).`;

  const stories = [
    {
      icon:   '🌙',
      title:  'La Deuda de Sueño Colectiva',
      state:  sleep1State,
      value:  `${fmt(avgs.sleepDaily)} h/noche · ${fmt(avgs.study)} h/sem académicas`,
      desc:   sleep1Desc,
      accent: '#27546c',
    },
    {
      icon:   '📱',
      title:  'La Paradoja del Ocio Digital',
      state:  digital2State,
      value:  `${fmt(avgs.screen)} h pantallas · ${fmt(avgs.wellbeing)} h bienestar activo`,
      desc:   digital2Desc,
      accent: '#5a9bb5',
    },
    {
      icon:   '🚌',
      title:  'La Carga Invisible del Territorio',
      state:  transitState,
      value:  `${fmt(avgs.transit)} h/semana en desplazamiento`,
      desc:   transit3Desc,
      accent: '#3d8ba0',
    },
    {
      icon:   '👥',
      title:  'Tejido Social de la Comunidad',
      state:  social4State,
      value:  `${fmt(avgs.social)} h/sem · ${avgs.pctSocial.toFixed(0)}% con tiempo social`,
      desc:   social4Desc,
      accent: '#5BC8AF',
    },
  ];

  el.innerHTML = stories.map(s => `
    <div class="insight-card">
      <div class="insight-icon">${s.icon}</div>
      <div class="insight-body">
        <div class="insight-header-row">
          <span class="insight-title">${s.title}</span>
          ${badgeHTML(s.state)}
        </div>
        <div class="insight-value" style="color:${s.accent}">${s.value}</div>
        <div class="insight-desc">${s.desc}</div>
      </div>
    </div>`).join('');
}

/* ----------------------------------------------------------
   GRÁFICO DE BARRAS — promedios semanales por categoría
---------------------------------------------------------- */
function renderBarChart(avgs) {
  const values = CATEGORIAS.map(cat => parseFloat(categoryValue(avgs, cat).toFixed(1)));
  const labels = CATEGORIAS.map(c => c.label);
  const colors = CATEGORIAS.map(c => c.color);

  const chartData = {
    labels,
    datasets: [{
      label:           'Horas promedio / semana',
      data:            values,
      backgroundColor: colors,
      borderRadius:    5,
      borderSkipped:   false,
    }],
  };

  barChartInst = new Chart(document.getElementById('barChart').getContext('2d'), {
    type: 'bar',
    data: chartData,
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: item => `  ${item.parsed.x.toFixed(1)} h / semana`,
          },
          backgroundColor: '#1a2e38',
          titleColor:      '#ffffff',
          bodyColor:       'rgba(255,255,255,.8)',
          padding:         12,
          cornerRadius:    8,
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid:  { color: 'rgba(39,84,108,.07)' },
          ticks: {
            font:     { family: "'DM Sans', sans-serif", size: 12 },
            color:    '#5a7a8a',
            callback: v => v + ' h',
          },
        },
        y: {
          grid:  { display: false },
          ticks: {
            font:  { family: "'DM Sans', sans-serif", size: 12 },
            color: '#1a2e38',
          },
        },
      },
    },
  });
}

/* ----------------------------------------------------------
   GRÁFICO DONA — distribución de las 168 horas semanales
---------------------------------------------------------- */
function renderDoughnutChart(avgs) {
  const TOTAL = 168;
  const data  = CATEGORIAS.map(cat => parseFloat(categoryValue(avgs, cat).toFixed(1)));

  const chartData = {
    labels:   CATEGORIAS.map(c => c.label),
    datasets: [{
      data,
      backgroundColor:  CATEGORIAS.map(c => c.color),
      borderWidth:      3,
      borderColor:      '#ffffff',
      hoverBorderWidth: 4,
      hoverOffset:      10,
    }],
  };

  doughnutChartInst = new Chart(document.getElementById('doughnutChart').getContext('2d'), {
    type: 'doughnut',
    data: chartData,
    options: {
      cutout: '62%',
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: item => {
              const v   = item.parsed;
              const pct = ((v / TOTAL) * 100).toFixed(1);
              return `  ${v.toFixed(1)} h  (${pct}% de la semana)`;
            },
          },
          backgroundColor: '#1a2e38',
          titleColor:      '#ffffff',
          bodyColor:       'rgba(255,255,255,.8)',
          padding:         12,
          cornerRadius:    8,
        },
      },
      animation: {
        animateRotate: true,
        duration:      700,
        easing:        'easeInOutQuart',
      },
    },
  });

  renderDoughnutLegend(data, TOTAL);
}

function renderDoughnutLegend(data, total) {
  const el = document.getElementById('doughnut-legend');
  if (!el) return;
  el.innerHTML = CATEGORIAS.map((c, i) => {
    const pct = ((data[i] / total) * 100).toFixed(1);
    return `
      <div class="dl-item">
        <div class="dl-dot" style="background:${c.color}"></div>
        <span class="dl-label">${c.label}</span>
        <span class="dl-value">${data[i].toFixed(1)} h · ${pct}%</span>
      </div>`;
  }).join('');
}

/* ----------------------------------------------------------
   ARCHIVO LOCAL CON LOS REGISTROS DE registros_bienestar
---------------------------------------------------------- */
const DATA_FILE = 'registros_bienestar_rows.json';

/* ----------------------------------------------------------
   "COMUNIDAD + TÚ" — snapshot local del usuario
   app.js guarda en localStorage la última respuesta calculada
   en la calculadora (mismos nombres de campo que el JSON). Si
   existe y es válida, se incorpora como un registro más al
   arreglo en memoria para que el usuario vea su propio dato
   reflejado en los promedios y gráficas del Informe 2026-1.
---------------------------------------------------------- */
const LOCAL_SNAPSHOT_KEY = 'rapsi_user_snapshots';

function loadLocalSnapshots() {
  try {
    const raw = localStorage.getItem(LOCAL_SNAPSHOT_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    // Migra un snapshot antiguo (objeto único, formato pre-acumulativo) a array.
    const candidates = Array.isArray(parsed) ? parsed : [parsed];

    // Validación mínima por registro: debe tener una fecha parseable
    // y al menos una métrica numérica real (sleep_hours); si no, se
    // ignora silenciosamente en vez de romper el dashboard.
    const snapshots = candidates.filter(snap => {
      if (!snap || typeof snap !== 'object') return false;
      const ts = new Date(snap.created_at).getTime();
      return !Number.isNaN(ts) && !Number.isNaN(parseFloat(snap.sleep_hours));
    });

    if (snapshots.length !== candidates.length) {
      console.warn('[Stats] Algún snapshot local con formato inesperado fue ignorado.');
    }

    // Marca interna (no viaja al JSON ni se vuelve a guardar):
    // permite saber qué registros quedaron dentro del filtro activo.
    snapshots.forEach(snap => { snap.__isLocalSnapshot = true; });
    return snapshots;
  } catch (err) {
    console.warn('[Stats] No se pudieron leer los snapshots locales:', err.message);
    return [];
  }
}

/* ----------------------------------------------------------
   TEXTO DINÁMICO "COMUNIDAD + TÚ"
   Refleja si el snapshot local efectivamente cae dentro del
   rango de fecha/tipo de usuario seleccionado en este momento
   (no sólo si existe en localStorage), para que el mensaje sea
   siempre exacto sobre lo que se está promediando.
---------------------------------------------------------- */
function updateSourceNote(includesLocal) {
  const el = document.getElementById('kpi-source-note');
  if (!el) return;
  el.textContent = includesLocal
    ? 'Análisis basado en las estadísticas de la comunidad + tu registro actual'
    : 'Análisis basado en las estadísticas de la comunidad';
  el.classList.toggle('kpi-source-note--mine', !!includesLocal);
}

/* ----------------------------------------------------------
   CONFIGURACIÓN DEL TIMELINE A PARTIR DE LOS DATOS
   Calcula el rango real [min, max] de created_at y ajusta los
   extremos del slider para que coincidan exactamente con los
   datos disponibles. Posiciona (o esconde) el hito de la Feria.
---------------------------------------------------------- */
function setupTimeline() {
  const times = ALL_RECORDS
    .map(r => new Date(r.created_at).getTime())
    .filter(t => !Number.isNaN(t));

  const minDay = colombiaDay(Math.min(...times));
  const maxDay = colombiaDay(Math.max(...times));

  TL.baseMs = ymdToMs(minDay, false);
  TL.maxOff = Math.round((ymdToMs(maxDay, false) - TL.baseMs) / MS_DAY);

  // Offset del hito (21 may 2026) dentro del dominio real de datos
  const mOff = Math.round((ymdToMs(MILESTONE_YMD, false) - TL.baseMs) / MS_DAY);
  TL.milestoneOff = (mOff >= 0 && mOff <= TL.maxOff) ? mOff : null;

  const from = document.getElementById('range-from');
  const to   = document.getElementById('range-to');
  [from, to].forEach(el => { el.min = 0; el.max = TL.maxOff; el.step = 1; });
  from.value = 0;
  to.value   = TL.maxOff;

  // Muestra el hito sólo si la Feria cae dentro del rango de datos
  const milestone = document.getElementById('tl-milestone');
  if (milestone) {
    if (TL.milestoneOff === null) {
      milestone.style.display = 'none';
    } else {
      milestone.style.display = '';
      milestone.style.left = pctOf(TL.milestoneOff) + '%';
    }
  }

  console.log(`[Stats] Timeline: ${minDay} → ${maxDay} (${TL.maxOff} días)` +
              (TL.milestoneOff !== null ? ` · Feria en offset ${TL.milestoneOff}` : ' · Feria fuera de rango'));

  syncTimelineUI();
}

/* ----------------------------------------------------------
   SINCRONIZA LA UI DEL SLIDER (relleno, burbujas, etiquetas)
   con la posición actual de las manijas. No filtra datos.
---------------------------------------------------------- */
function syncTimelineUI() {
  const a = parseInt(document.getElementById('range-from').value, 10);
  const b = parseInt(document.getElementById('range-to').value, 10);
  const pa = pctOf(a), pb = pctOf(b);

  const fill = document.getElementById('tl-fill');
  fill.style.left  = pa + '%';
  fill.style.width = (pb - pa) + '%';

  const bFrom = document.getElementById('tl-bubble-from');
  const bTo   = document.getElementById('tl-bubble-to');
  bFrom.style.left = pa + '%'; bFrom.textContent = ymdToShort(offsetToYMD(a));
  bTo.style.left   = pb + '%'; bTo.textContent   = ymdToShort(offsetToYMD(b));

  document.getElementById('tl-from-label').textContent = ymdToLabel(offsetToYMD(a));
  document.getElementById('tl-to-label').textContent   = ymdToLabel(offsetToYMD(b));
}

/* ----------------------------------------------------------
   FILTRADO Y RENDER
   Lee la posición del slider + el tipo de usuario y recalcula
   KPIs, insights y gráficas con el subconjunto seleccionado
   (todo en cliente, sobre ALL_RECORDS ya cargado en memoria).
---------------------------------------------------------- */
function renderFiltered() {
  const a = parseInt(document.getElementById('range-from').value, 10);
  const b = parseInt(document.getElementById('range-to').value, 10);
  const userType = document.getElementById('user-type').value;

  const fromMs = ymdToMs(offsetToYMD(a), false);
  const toMs   = ymdToMs(offsetToYMD(b), true);

  let filtered = ALL_RECORDS.filter(r => {
    const ts = new Date(r.created_at).getTime();
    return ts >= fromMs && ts <= toMs;
  });

  if (userType === 'student')    filtered = filtered.filter(r => r.is_student === true);
  if (userType === 'nonstudent') filtered = filtered.filter(r => r.is_student === false);

  console.log(`[Stats] ${offsetToYMD(a)} → ${offsetToYMD(b)} · ${userType} · ${filtered.length} registros`);

  updateSourceNote(filtered.some(r => r.__isLocalSnapshot));

  if (!filtered.length) {
    showEmpty('No se encontraron registros para los filtros seleccionados.');
    return;
  }

  destroyCharts();
  const avgs = computeClientAverages(filtered);

  showContent();
  updateKPIs(avgs, filtered.length);
  renderInsights(avgs);
  renderBarChart(avgs);
  renderDoughnutChart(avgs);
}

/* ----------------------------------------------------------
   ACCESO RÁPIDO AL HITO — fija el filtro al día exacto de la
   Feria de las Emociones (21 may 2026) y refresca todo para
   mostrar de inmediato los promedios e insights de ese día.
---------------------------------------------------------- */
function jumpToMilestone() {
  if (TL.milestoneOff === null) return;
  document.getElementById('range-from').value = TL.milestoneOff;
  document.getElementById('range-to').value   = TL.milestoneOff;
  syncTimelineUI();
  renderFiltered();
}

/* ----------------------------------------------------------
   EVENTOS DEL SLIDER
   - input  → feedback visual en vivo (sin recalcular gráficas)
   - change → recalcula KPIs/gráficas al soltar la manija
   Snap magnético: al soltar una manija a ≤1 día de la Feria,
   se ajusta exactamente al 21 de mayo (facilita aterrizar en
   ese día; el botón del hito colapsa el filtro a ese único día).
---------------------------------------------------------- */
function wireTimelineEvents() {
  const from = document.getElementById('range-from');
  const to   = document.getElementById('range-to');

  function magnet(el) {
    if (TL.milestoneOff !== null &&
        Math.abs(parseInt(el.value, 10) - TL.milestoneOff) <= 1) {
      el.value = TL.milestoneOff;
    }
  }

  from.addEventListener('input', () => {
    if (parseInt(from.value, 10) > parseInt(to.value, 10)) from.value = to.value;
    syncTimelineUI();
  });
  to.addEventListener('input', () => {
    if (parseInt(to.value, 10) < parseInt(from.value, 10)) to.value = from.value;
    syncTimelineUI();
  });
  from.addEventListener('change', () => {
    magnet(from);
    if (parseInt(from.value, 10) > parseInt(to.value, 10)) from.value = to.value;
    syncTimelineUI();
    renderFiltered();
  });
  to.addEventListener('change', () => {
    magnet(to);
    if (parseInt(to.value, 10) < parseInt(from.value, 10)) to.value = from.value;
    syncTimelineUI();
    renderFiltered();
  });

  document.getElementById('user-type').addEventListener('change', renderFiltered);

  const milestone = document.getElementById('tl-milestone');
  if (milestone) {
    milestone.addEventListener('click', (e) => {
      // El ícono "ⓘ" vive dentro del botón del hito pero no debe
      // saltar al día — abre el contexto de la Feria en Instagram.
      if (e.target.closest('.tl-milestone-info')) {
        e.stopPropagation();
        window.open('https://www.instagram.com/rapsi.unal/', '_blank', 'noopener');
        return;
      }
      jumpToMilestone();
    });
  }
}

/* ----------------------------------------------------------
   COORDINACIÓN DEL FILTRO STICKY CON EL HEADER
   En vez de un "top" fijo adivinado por breakpoint (se
   desalineaba: header real ≈ 62–64px, no 53/57px), medimos la
   altura real del header y la exponemos como --header-h. Así
   .filters-section (sticky) queda siempre pegada justo debajo,
   sin huecos ni superposiciones, en cualquier ancho.
---------------------------------------------------------- */
function syncHeaderHeight() {
  const header = document.querySelector('header');
  if (!header) return;
  const h = Math.ceil(header.getBoundingClientRect().height);
  if (h > 0) document.documentElement.style.setProperty('--header-h', `${h}px`);
}

/* ----------------------------------------------------------
   PUNTO DE ENTRADA
   Carga única del JSON, configura el timeline desde los datos
   reales y pinta el estado inicial (rango completo).
---------------------------------------------------------- */
function applyFilters() { renderFiltered(); }

async function initDashboard() {
  syncHeaderHeight();
  window.addEventListener('resize', syncHeaderHeight);
  // Las fuentes (Playfair/DM Sans) pueden cambiar la altura del
  // header al terminar de cargar — se reajusta una vez más.
  document.fonts?.ready?.then(syncHeaderHeight).catch(() => {});

  // Colapsar filtros por defecto en mobile
  if (window.innerWidth <= 600) {
    document.getElementById('filters-details')?.removeAttribute('open');
  }

  showLoading();
  try {
    const res = await fetch(DATA_FILE);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ALL_RECORDS = await res.json();
  } catch (error) {
    console.error('[Stats] Error cargando JSON local:', error);
    showEmpty('Error al cargar los datos locales. Revisa la consola del navegador (F12).');
    return;
  }

  if (!Array.isArray(ALL_RECORDS) || !ALL_RECORDS.length) {
    showEmpty('No hay registros disponibles para mostrar.');
    return;
  }

  console.log(`[Stats] Registros cargados: ${ALL_RECORDS.length}`);

  const localSnapshots = loadLocalSnapshots();
  if (localSnapshots.length) {
    ALL_RECORDS = [...ALL_RECORDS, ...localSnapshots];
    console.log(`[Stats] ${localSnapshots.length} snapshot(s) local(es) incorporado(s) — Comunidad + Tú.`);
  }

  setupTimeline();
  wireTimelineEvents();
  renderFiltered();
}

document.addEventListener('DOMContentLoaded', initDashboard);
