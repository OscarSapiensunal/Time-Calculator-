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
   CATEGORÍAS VISUALES — columnas de la vista analisis_promedios_bienestar
   (v3.0: se añade Trabajo; claves usan prefijo avg_ de la vista)
---------------------------------------------------------- */
const CATEGORIAS = [
  { label: 'Sueño y Alimentación',   keys: ['avg_sleep_hours', 'avg_food_hours'],                                             color: '#27546c' },
  { label: 'Cuidado Personal',        keys: ['avg_grooming_hours'],                                                            color: '#3d8ba0' },
  { label: 'Transporte',              keys: ['avg_transport_hours'],                                                           color: '#5a9bb5' },
  { label: 'Academia y Obligaciones', keys: ['avg_academic_load_hours', 'avg_obligations_hours', 'avg_house_tasks_hours'],      color: '#ff9491' },
  { label: 'Trabajo',                 keys: ['avg_work_hours'],                                                                color: '#e8956d' },
  { label: 'Ocio Digital',            keys: ['avg_scrolling_hours'],                                                           color: '#ffccc9' },
  { label: 'Deporte y Salud',         keys: ['avg_physical_activity_hours'],                                                   color: '#2F7A8C' },
  { label: 'Tiempo Social',           keys: ['avg_quality_social_hours'],                                                      color: '#5BC8AF' },
  { label: 'Hobbies',                 keys: ['avg_other_hobbies_hours'],                                                       color: '#B79CED' },
  { label: 'Tiempo Libre',            keys: ['avg_available_time'],                                                            color: '#a8d5a2' },
];

/* ----------------------------------------------------------
   HELPERS
---------------------------------------------------------- */
function fmt(n) {
  const v = parseFloat(n) || 0;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

// Suma las claves avg_* de una categoría sobre la fila pre-agregada de la vista.
function categoryValue(row, cat) {
  return cat.keys.reduce((s, k) => s + (parseFloat(row[k]) || 0), 0);
}

/* ----------------------------------------------------------
   MAPEO DE PROMEDIOS — desde la fila de analisis_promedios_bienestar
   La vista ya expone los promedios calculados; solo remapeamos nombres.
---------------------------------------------------------- */
function computeAverages(row) {
  const g = key => parseFloat(row[key]) || 0;

  const sleep    = g('avg_sleep_hours');
  const food     = g('avg_food_hours');
  const grooming = g('avg_grooming_hours');
  const transit  = g('avg_transport_hours');
  const study    = g('avg_academic_load_hours');
  const other    = g('avg_obligations_hours');
  const house    = g('avg_house_tasks_hours');
  const work     = g('avg_work_hours');
  const screen   = g('avg_scrolling_hours');
  const physical = g('avg_physical_activity_hours');
  const social   = g('avg_quality_social_hours');
  const hobby    = g('avg_other_hobbies_hours');
  const free     = g('avg_available_time');

  return {
    sleep, food, grooming, transit, study, other,
    house, work, screen, physical, social, hobby, free,
    sleepDaily:   sleep / 7,
    screenDaily:  screen / 7,
    academic:     study + other + house,
    wellbeing:    physical + social + hobby,
    // La vista puede exponer porcentajes; se usa 0 como fallback seguro.
    pctPhysical:  g('pct_with_physical_activity'),
    pctSocial:    g('pct_with_social_activity'),
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
function renderBarChart(row) {
  const values = CATEGORIAS.map(cat => parseFloat(categoryValue(row, cat).toFixed(1)));
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
function renderDoughnutChart(row) {
  const TOTAL = 168;
  const data  = CATEGORIAS.map(cat => parseFloat(categoryValue(row, cat).toFixed(1)));

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
   Lee la vista analisis_promedios_bienestar, que ya expone promedios
   calculados y tiene políticas RLS de lectura pública.
   Para métricas globales en crudo usar: supabaseClient.rpc('rapsi_informe_agregado')
---------------------------------------------------------- */
async function fetchData() {
  showLoading();

  const { data, error } = await window.supabaseClient
    .from('analisis_promedios_bienestar')
    .select('*');

  if (error) {
    console.error('[Stats] Error Supabase:', error.code, error.message, error.details);
    showEmpty('Error al conectar con la base de datos. Revisa la consola del navegador (F12).');
    return;
  }

  console.log(`[Stats] Filas de vista recibidas: ${data?.length ?? 0}`);

  if (!data || data.length === 0) {
    showEmpty('No se encontraron registros en el sistema.');
    return;
  }

  const row   = data[0];
  const count = parseInt(row.total_registros) || 0;
  const avgs  = computeAverages(row);

  showContent();
  updateKPIs(avgs, count);
  renderInsights(avgs);
  renderBarChart(row);
  renderDoughnutChart(row);
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
