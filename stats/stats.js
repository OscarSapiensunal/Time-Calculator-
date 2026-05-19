/* ============================================================
   RAPsi UNAL — Dashboard de Análisis de Bienestar
   stats.js  ·  v2 — Consulta robusta, Insights, Dona interactiva
============================================================ */

/* ----------------------------------------------------------
   SUPABASE — misma configuración que app.js en la raíz
---------------------------------------------------------- */
const SUPABASE_URL      = "https://gczrxdubzzuiuxuxvxsm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_yJ_cSM-COnRQfZG7US5c8g_26o8SYS1";
window.supabaseClient   = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ----------------------------------------------------------
   INSTANCIAS DE GRÁFICAS
---------------------------------------------------------- */
let barChartInst      = null;
let doughnutChartInst = null;

/* ----------------------------------------------------------
   CATEGORÍAS VISUALES — propiedades del objeto avgs calculado localmente
---------------------------------------------------------- */
const CATEGORIAS = [
  { label: 'Sueño y Alimentación',   keys: ['sleep', 'food'],           color: '#27546c' },
  { label: 'Cuidado Personal',        keys: ['grooming'],                color: '#3d8ba0' },
  { label: 'Transporte',              keys: ['transit'],                 color: '#5a9bb5' },
  { label: 'Academia y Obligaciones', keys: ['study', 'other', 'house'], color: '#ff9491' },
  { label: 'Trabajo',                 keys: ['work'],                    color: '#e8956d' },
  { label: 'Ocio Digital',            keys: ['screen'],                  color: '#ffccc9' },
  { label: 'Deporte y Salud',         keys: ['physical'],                color: '#2F7A8C' },
  { label: 'Tiempo Social',           keys: ['social'],                  color: '#5BC8AF' },
  { label: 'Hobbies',                 keys: ['hobby'],                   color: '#B79CED' },
  { label: 'Tiempo Libre',            keys: ['free'],                    color: '#a8d5a2' },
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
   Recibe el array de filas crudas de registros_bienestar y devuelve
   el objeto avgs con la misma estructura que usan KPIs, gráficas e insights.
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
    sleep, food, grooming, transit, study, other,
    house, work, screen, physical, social, hobby, free,
    sleepDaily:   sleep / 7,
    screenDaily:  screen / 7,
    academic:     study + other + house,
    wellbeing:    physical + social + hobby,
    pctPhysical:  records.filter(r => (parseFloat(r.physical_activity_hours) || 0) > 0).length / n * 100,
    pctSocial:    records.filter(r => (parseFloat(r.quality_social_hours)    || 0) > 0).length / n * 100,
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
   FECHAS POR DEFECTO: último año
---------------------------------------------------------- */
function setDefaultDates() {
  const today = new Date();
  const from  = new Date(today);
  from.setFullYear(from.getFullYear() - 1);

  document.getElementById('date-to').value   = today.toISOString().slice(0, 10);
  document.getElementById('date-from').value = from.toISOString().slice(0, 10);
}

/* ----------------------------------------------------------
   KPI CARDS
---------------------------------------------------------- */
function updateKPIs(avgs, count) {
  document.getElementById('kpi-val-total').textContent    = count.toLocaleString('es-CO');
  document.getElementById('kpi-val-sleep').textContent    = fmt(avgs.sleepDaily)  + ' h/día';
  document.getElementById('kpi-val-academic').textContent = fmt(avgs.study)       + ' h/sem';
  document.getElementById('kpi-val-free').textContent     = fmt(avgs.free)        + ' h/sem';
}

/* ----------------------------------------------------------
   HISTORIAS COMUNITARIAS — 4 narrativas cruzadas de salud colectiva
---------------------------------------------------------- */
function renderInsights(avgs) {
  const el = document.getElementById('insights-container');
  if (!el) return;

  // — Story 1: Deuda de Sueño Colectiva
  const deudaSueno = avgs.sleepDaily < 7 && avgs.study > 40;

  // — Story 2: Paradoja del Ocio Digital
  const paradojaOcio = avgs.screen > avgs.wellbeing;

  // — Story 3: Carga Invisible del Territorio
  const transitPct = avgs.free > 0
    ? Math.round((avgs.transit / avgs.free) * 100)
    : null;

  // — Story 4: Tendencia al Aislamiento Institucional
  const aislamientoRisk = avgs.social < 3 || avgs.pctSocial < 50;

  const cards = [
    {
      icon:   '🌙',
      title:  'La Deuda de Sueño Colectiva',
      ok:     !deudaSueno,
      value:  `${fmt(avgs.sleepDaily)} h/noche · ${fmt(avgs.study)} h/sem académicas`,
      desc:   deudaSueno
        ? `La comunidad universitaria sostiene sus altas cargas académicas sacrificando el descanso base. En promedio, estamos acumulando una deuda de sueño colectiva que reduce el bienestar y afecta directamente el rendimiento cognitivo institucional.`
        : `El promedio de sueño se mantiene dentro del rango recomendado (${fmt(avgs.sleepDaily)} h/noche) incluso con una carga académica de ${fmt(avgs.study)} h/semana. Un indicador de equilibrio institucional positivo.`,
      accent: '#27546c',
    },
    {
      icon:   '📱',
      title:  'La Paradoja del Ocio Digital',
      ok:     !paradojaOcio,
      value:  `${fmt(avgs.screen)} h pantallas · ${fmt(avgs.wellbeing)} h bienestar activo`,
      desc:   paradojaOcio
        ? `Como comunidad, pasamos más tiempo promedio en pantallas recreativas (${fmt(avgs.screen)} h) que en descanso activo, deporte y socialización sumados (${fmt(avgs.wellbeing)} h). El consumo digital se ha convertido en la principal vía pasiva de desconexión.`
        : `La comunidad supera el tiempo de pantallas (${fmt(avgs.screen)} h) con bienestar activo combinado (${fmt(avgs.wellbeing)} h) de deporte, socialización y hobbies. Una señal de agencia frente al consumo digital pasivo.`,
      accent: '#5a9bb5',
    },
    {
      icon:   '🚌',
      title:  'La Carga Invisible del Territorio',
      ok:     null,
      value:  `${fmt(avgs.transit)} h/semana en desplazamiento`,
      desc:   avgs.free > 0
        ? `El desplazamiento urbano opera como un segundo trabajo no reconocido. El estudiante promedio invierte ${fmt(avgs.transit)} horas a la semana en transporte público, devorando silenciosamente un ${transitPct}% del tiempo libre que podría usarse para la salud o el autocuidado.`
        : `El desplazamiento urbano consume ${fmt(avgs.transit)} horas semanales sobre una agenda que ya no tiene tiempo libre neto. Esta carga invisible no aparece en ningún horario oficial.`,
      accent: '#3d8ba0',
    },
    {
      icon:   '👥',
      title:  'Tendencia al Aislamiento Institucional',
      ok:     !aislamientoRisk,
      value:  `${fmt(avgs.social)} h/sem · ${avgs.pctSocial.toFixed(0)}% con tiempo social`,
      desc:   aislamientoRisk
        ? `Detectamos una restricción severa en las redes de socialización activa de los usuarios filtrados. Las demandas cotidianas están desplazando los espacios comunitarios, aumentando el riesgo latente de aislamiento y pérdida de tejido de apoyo en la sede.`
        : `La comunidad mantiene conexiones sociales activas con un promedio de ${fmt(avgs.social)} h/semana y el ${avgs.pctSocial.toFixed(0)}% de usuarios reportando tiempo social. Las redes de apoyo interpersonal se sostienen como factor protector.`,
      accent: '#5BC8AF',
    },
  ];

  el.innerHTML = cards.map(c => {
    const badge = c.ok === true
      ? '<span class="insight-badge insight-badge--ok">✓ Favorable</span>'
      : c.ok === false
        ? '<span class="insight-badge insight-badge--warn">↑ Alerta</span>'
        : '';
    return `
      <div class="insight-card">
        <div class="insight-icon">${c.icon}</div>
        <div class="insight-body">
          <div class="insight-header-row">
            <span class="insight-title">${c.title}</span>
            ${badge}
          </div>
          <div class="insight-value" style="color:${c.accent}">${c.value}</div>
          <div class="insight-desc">${c.desc}</div>
        </div>
      </div>`;
  }).join('');
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
   COLUMNAS QUE SE SOLICITAN A registros_bienestar
---------------------------------------------------------- */
const COLS_SELECT = [
  'sleep_hours', 'food_hours', 'grooming_hours', 'transport_hours',
  'academic_load_hours', 'work_hours', 'obligations_hours', 'house_tasks_hours',
  'scrolling_hours', 'physical_activity_hours', 'quality_social_hours',
  'other_hobbies_hours', 'available_time', 'is_student',
].join(', ');

/* ----------------------------------------------------------
   CONSULTA PRINCIPAL A SUPABASE
   Lee registros_bienestar directamente para soportar filtros de fecha/hora
   y tipo de usuario en tiempo real. Los promedios se calculan en cliente.
---------------------------------------------------------- */
async function fetchData() {
  showLoading();

  const dateFrom = document.getElementById('date-from').value;
  const dateTo   = document.getElementById('date-to').value;
  const timeFrom = document.getElementById('time-from').value;
  const timeTo   = document.getElementById('time-to').value;
  const userType = document.getElementById('user-type').value;

  let query = window.supabaseClient
    .from('registros_bienestar')
    .select(COLS_SELECT)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (dateFrom) {
    const isoFrom = `${dateFrom}T${timeFrom || '00:00:00'}`;
    query = query.gte('created_at', isoFrom);
  }
  if (dateTo) {
    const isoTo = `${dateTo}T${timeTo || '23:59:59'}`;
    query = query.lte('created_at', isoTo);
  }

  if (userType === 'student')    query = query.eq('is_student', true);
  if (userType === 'nonstudent') query = query.eq('is_student', false);

  const { data, error } = await query;

  if (error) {
    console.error('[Stats] Error Supabase:', error.code, error.message, error.details);
    showEmpty('Error al conectar con la base de datos. Revisa la consola del navegador (F12).');
    return;
  }

  console.log(`[Stats] Registros obtenidos: ${data?.length ?? 0}`);

  if (!data || data.length === 0) {
    showEmpty('No se encontraron registros para los filtros seleccionados.');
    return;
  }

  destroyCharts();
  const avgs = computeClientAverages(data);

  showContent();
  updateKPIs(avgs, data.length);
  renderInsights(avgs);
  renderBarChart(avgs);
  renderDoughnutChart(avgs);
}

/* ----------------------------------------------------------
   PUNTO DE ENTRADA
---------------------------------------------------------- */
function applyFilters() { fetchData(); }

document.addEventListener('DOMContentLoaded', () => {
  setDefaultDates();

  // Filtros reactivos: se recalcula al cambiar cualquier control
  ['date-from', 'date-to', 'time-from', 'time-to', 'user-type'].forEach(id =>
    document.getElementById(id).addEventListener('change', fetchData)
  );

  fetchData();
});
