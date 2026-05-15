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
   COLUMNAS QUE SE PIDEN A LA BD (los 12 factores)
---------------------------------------------------------- */
const COLS_SELECT = [
  'sleep_hours',
  'food_hours',
  'grooming_hours',
  'transport_hours',
  'academic_load_hours',
  'obligations_hours',
  'house_tasks_hours',
  'scrolling_hours',
  'physical_activity_hours',
  'quality_social_hours',
  'other_hobbies_hours',
  'available_time',
  'is_student',
].join(', ');

/* ----------------------------------------------------------
   CATEGORÍAS VISUALES — mismas 9 que en app.js (para las gráficas)
---------------------------------------------------------- */
const CATEGORIAS = [
  { label: 'Sueño y Alimentación',   keys: ['sleep_hours', 'food_hours'],                                            color: '#27546c' },
  { label: 'Cuidado Personal',        keys: ['grooming_hours'],                                                       color: '#3d8ba0' },
  { label: 'Transporte',              keys: ['transport_hours'],                                                      color: '#5a9bb5' },
  { label: 'Academia y Obligaciones', keys: ['academic_load_hours', 'obligations_hours', 'house_tasks_hours'],         color: '#ff9491' },
  { label: 'Ocio Digital',            keys: ['scrolling_hours'],                                                      color: '#ffccc9' },
  { label: 'Deporte y Salud',         keys: ['physical_activity_hours'],                                              color: '#2F7A8C' },
  { label: 'Tiempo Social',           keys: ['quality_social_hours'],                                                 color: '#5BC8AF' },
  { label: 'Hobbies',                 keys: ['other_hobbies_hours'],                                                  color: '#B79CED' },
  { label: 'Tiempo Libre',            keys: ['available_time'],                                                       color: '#a8d5a2' },
];

/* ----------------------------------------------------------
   HELPERS
---------------------------------------------------------- */
function fmt(n) {
  const v = parseFloat(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function meanCol(rows, key) {
  if (!rows.length) return 0;
  return rows.reduce((s, r) => s + (parseFloat(r[key]) || 0), 0) / rows.length;
}

function categoryAvg(rows, cat) {
  if (!rows.length) return 0;
  return rows.reduce((s, r) =>
    s + cat.keys.reduce((a, k) => a + (parseFloat(r[k]) || 0), 0), 0
  ) / rows.length;
}

/* ----------------------------------------------------------
   CÁLCULO DE PROMEDIOS — los 12 factores + derivados
---------------------------------------------------------- */
function computeAverages(rows) {
  const n = rows.length;
  if (!n) return null;

  const mean = key => meanCol(rows, key);

  const sleep    = mean('sleep_hours');
  const food     = mean('food_hours');
  const grooming = mean('grooming_hours');
  const transit  = mean('transport_hours');
  const study    = mean('academic_load_hours');
  const other    = mean('obligations_hours');
  const house    = mean('house_tasks_hours');
  const screen   = mean('scrolling_hours');
  const physical = mean('physical_activity_hours');
  const social   = mean('quality_social_hours');
  const hobby    = mean('other_hobbies_hours');
  const free     = mean('available_time');

  return {
    // 12 factores individuales
    sleep, food, grooming, transit, study, other,
    house, screen, physical, social, hobby, free,
    // Derivados
    sleepDaily:   sleep / 7,
    screenDaily:  screen / 7,
    academic:     study + other + house,
    wellbeing:    physical + social + hobby,
    pctPhysical:  rows.filter(r => (parseFloat(r.physical_activity_hours) || 0) > 0).length / n * 100,
    pctSocial:    rows.filter(r => (parseFloat(r.quality_social_hours)    || 0) > 0).length / n * 100,
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
   INSIGHTS NARRATIVOS
---------------------------------------------------------- */
function renderInsights(avgs) {
  const el = document.getElementById('insights-container');
  if (!el) return;

  const sleepOk    = avgs.sleepDaily >= 7;
  const freeStrict = avgs.free < 10;

  const cards = [
    {
      icon:   '🌙',
      title:  'Sueño promedio',
      value:  `${fmt(avgs.sleepDaily)} h por noche`,
      desc:   sleepOk
        ? 'Dentro del rango recomendado de 7–9 h para adultos jóvenes.'
        : `Por debajo del mínimo recomendado — déficit de ${fmt(7 - avgs.sleepDaily)} h/noche.`,
      accent: '#27546c',
      ok:     sleepOk,
    },
    {
      icon:   '📚',
      title:  'Carga académica',
      value:  `${fmt(avgs.study)} h/semana`,
      desc:   `Más ${fmt(avgs.house)} h de hogar y ${fmt(avgs.other)} h de otras obligaciones (total ${fmt(avgs.academic)} h).`,
      accent: '#ff9491',
      ok:     null,
    },
    {
      icon:   '🏃',
      title:  'Actividad física',
      value:  `${avgs.pctPhysical.toFixed(0)}% la practica`,
      desc:   `Promedio de ${fmt(avgs.physical)} h/sem entre registros. El ${(100 - avgs.pctPhysical).toFixed(0)}% no reporta ninguna actividad.`,
      accent: '#2F7A8C',
      ok:     avgs.pctPhysical >= 50,
    },
    {
      icon:   '📱',
      title:  'Tiempo en pantallas',
      value:  `${fmt(avgs.screen)} h/semana`,
      desc:   `Equivale a ${fmt(avgs.screenDaily)} h/día en redes sociales, streaming y scroll.`,
      accent: '#5a9bb5',
      ok:     null,
    },
    {
      icon:   '🌿',
      title:  'Tiempo libre neto',
      value:  `${fmt(avgs.free)} h/semana`,
      desc:   freeStrict
        ? 'Margen muy ajustado — posible señal de sobreocupación.'
        : 'Hay espacio razonable para la recuperación y el descanso.',
      accent: '#a8d5a2',
      ok:     !freeStrict,
    },
    {
      icon:   '💜',
      title:  'Bienestar activo',
      value:  `${fmt(avgs.wellbeing)} h/semana`,
      desc:   `Deporte, socialización y hobbies combinados. El ${avgs.pctSocial.toFixed(0)}% tiene tiempo social registrado.`,
      accent: '#B79CED',
      ok:     null,
    },
  ];

  el.innerHTML = cards.map(c => {
    const badge = c.ok === true
      ? '<span class="insight-badge insight-badge--ok">✓ OK</span>'
      : c.ok === false
        ? '<span class="insight-badge insight-badge--warn">↓ Atención</span>'
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
function renderBarChart(rows) {
  const values = CATEGORIAS.map(cat => parseFloat(categoryAvg(rows, cat).toFixed(1)));
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
function renderDoughnutChart(rows) {
  const TOTAL = 168;
  const data  = CATEGORIAS.map(cat => parseFloat(categoryAvg(rows, cat).toFixed(1)));

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
   CONSULTA PRINCIPAL A SUPABASE
   Directa sobre registros_bienestar con filtros opcionales.
---------------------------------------------------------- */
async function fetchData() {
  showLoading();

  const from     = document.getElementById('date-from').value;
  const to       = document.getElementById('date-to').value;
  const userType = document.getElementById('user-type').value;

  let query = window.supabaseClient
    .from('registros_bienestar')
    .select(COLS_SELECT)
    .order('created_at', { ascending: false })
    .limit(1000);

  // Filtros de fecha: sin sufijo de zona horaria para máxima compatibilidad
  if (from) query = query.gte('created_at', from);
  if (to)   query = query.lte('created_at', to + 'T23:59:59');

  // Filtro de tipo de usuario
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

  const avgs = computeAverages(data);

  showContent();
  updateKPIs(avgs, data.length);
  renderInsights(avgs);
  renderBarChart(data);
  renderDoughnutChart(data);
}

/* ----------------------------------------------------------
   PUNTO DE ENTRADA
---------------------------------------------------------- */
function applyFilters() { fetchData(); }

document.addEventListener('DOMContentLoaded', () => {
  setDefaultDates();

  // Filtros reactivos: se recalcula al cambiar cualquier control
  ['date-from', 'date-to', 'user-type'].forEach(id =>
    document.getElementById(id).addEventListener('change', fetchData)
  );

  fetchData();
});
