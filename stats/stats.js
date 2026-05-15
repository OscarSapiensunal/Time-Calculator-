/* ============================================================
   RAPsi UNAL — Dashboard de Análisis de Bienestar
   stats.js  ·  Conexión Supabase + lógica del dashboard
============================================================ */

/* ----------------------------------------------------------
   SUPABASE — misma configuración que app.js en la raíz
---------------------------------------------------------- */
const SUPABASE_URL      = "https://gczrxdubzzuiuxuxvxsm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_yJ_cSM-COnRQfZG7US5c8g_26o8SYS1";

window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ----------------------------------------------------------
   INSTANCIAS DE GRÁFICAS (reutilizables entre consultas)
---------------------------------------------------------- */
let barChartInst   = null;
let radarChartInst = null;

/* ----------------------------------------------------------
   CATEGORÍAS: agrupan las columnas de la BD en segmentos
   visuales idénticos a los del gráfico principal (app.js).
---------------------------------------------------------- */
const CATEGORIAS = [
  {
    label: 'Sueño y Alimentación',
    keys:  ['sleep_hours', 'food_hours'],
    color: '#27546c',
  },
  {
    label: 'Cuidado Personal',
    keys:  ['grooming_hours'],
    color: '#3d8ba0',
  },
  {
    label: 'Transporte',
    keys:  ['transport_hours'],
    color: '#5a9bb5',
  },
  {
    label: 'Academia y Obligaciones',
    keys:  ['academic_load_hours', 'obligations_hours', 'house_tasks_hours'],
    color: '#ff9491',
  },
  {
    label: 'Ocio Digital',
    keys:  ['scrolling_hours'],
    color: '#ffccc9',
  },
  {
    label: 'Deporte y Salud',
    keys:  ['physical_activity_hours'],
    color: '#2F7A8C',
  },
  {
    label: 'Tiempo Social',
    keys:  ['quality_social_hours'],
    color: '#5BC8AF',
  },
  {
    label: 'Hobbies',
    keys:  ['other_hobbies_hours'],
    color: '#B79CED',
  },
  {
    label: 'Tiempo Libre',
    keys:  ['available_time'],
    color: '#a8d5a2',
  },
];

/* ----------------------------------------------------------
   HELPERS
---------------------------------------------------------- */
function fmt(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function avgCol(rows, key) {
  if (!rows.length) return 0;
  const sum = rows.reduce((acc, r) => acc + (parseFloat(r[key]) || 0), 0);
  return sum / rows.length;
}

function categoryAvg(rows, cat) {
  if (!rows.length) return 0;
  return rows.reduce((acc, r) => {
    return acc + cat.keys.reduce((s, k) => s + (parseFloat(r[k]) || 0), 0);
  }, 0) / rows.length;
}

/* ----------------------------------------------------------
   FECHAS POR DEFECTO: los últimos 90 días
---------------------------------------------------------- */
function setDefaultDates() {
  const today = new Date();
  const from  = new Date(today);
  from.setDate(from.getDate() - 90);

  document.getElementById('date-to').value   = today.toISOString().slice(0, 10);
  document.getElementById('date-from').value = from.toISOString().slice(0, 10);
}

/* ----------------------------------------------------------
   ESTADO DE UI: cargando / vacío / contenido
---------------------------------------------------------- */
function setLoading(on) {
  document.getElementById('state-loading').style.display  = on ? 'flex' : 'none';
  document.getElementById('kpi-section').style.display    = on ? 'none' : '';
  document.getElementById('charts-section').style.display = on ? 'none' : '';
}

function setEmpty(on) {
  document.getElementById('state-empty').style.display    = on ? 'flex' : 'none';
  document.getElementById('kpi-section').style.display    = on ? 'none' : '';
  document.getElementById('charts-section').style.display = on ? 'none' : '';
}

/* ----------------------------------------------------------
   KPI CARDS
---------------------------------------------------------- */
function updateKPIs(rows) {
  const count = rows.length;

  document.getElementById('kpi-val-total').textContent =
    count.toLocaleString('es-CO');

  if (count === 0) {
    document.getElementById('kpi-val-sleep').textContent    = '—';
    document.getElementById('kpi-val-academic').textContent = '—';
    document.getElementById('kpi-val-free').textContent     = '—';
    return;
  }

  const avgSleepWeekly  = avgCol(rows, 'sleep_hours');
  const avgSleepDaily   = avgSleepWeekly / 7;
  const avgAcademic     = avgCol(rows, 'academic_load_hours');
  const avgFree         = avgCol(rows, 'available_time');

  document.getElementById('kpi-val-sleep').textContent    = fmt(avgSleepDaily)  + ' h/día';
  document.getElementById('kpi-val-academic').textContent = fmt(avgAcademic)    + ' h/sem';
  document.getElementById('kpi-val-free').textContent     = fmt(avgFree)        + ' h/sem';
}

/* ----------------------------------------------------------
   GRÁFICO DE BARRAS HORIZONTAL — promedios por categoría
---------------------------------------------------------- */
function renderBarChart(rows) {
  const values = CATEGORIAS.map(cat => parseFloat(categoryAvg(rows, cat).toFixed(1)));
  const labels = CATEGORIAS.map(c => c.label);
  const colors = CATEGORIAS.map(c => c.color);

  const chartData = {
    labels,
    datasets: [{
      label: 'Horas promedio / semana',
      data:            values,
      backgroundColor: colors,
      borderRadius:    5,
      borderSkipped:   false,
    }],
  };

  const cfg = {
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
          grid: { color: 'rgba(39,84,108,.07)' },
          ticks: {
            font:     { family: "'DM Sans', sans-serif", size: 12 },
            color:    '#5a7a8a',
            callback: v => v + ' h',
          },
        },
        y: {
          grid: { display: false },
          ticks: {
            font:  { family: "'DM Sans', sans-serif", size: 12 },
            color: '#1a2e38',
          },
        },
      },
    },
  };

  if (barChartInst) {
    barChartInst.data = chartData;
    barChartInst.update('active');
  } else {
    barChartInst = new Chart(
      document.getElementById('barChart').getContext('2d'),
      cfg,
    );
  }
}

/* ----------------------------------------------------------
   GRÁFICO RADAR — distribución porcentual del tiempo
---------------------------------------------------------- */
function renderRadarChart(rows) {
  const TOTAL  = 168;
  const values = CATEGORIAS.map(cat => {
    const h = categoryAvg(rows, cat);
    return parseFloat(((h / TOTAL) * 100).toFixed(1));
  });

  const chartData = {
    labels: CATEGORIAS.map(c => c.label),
    datasets: [{
      label: '% de la semana',
      data:                values,
      backgroundColor:     'rgba(39,84,108,.12)',
      borderColor:         '#27546c',
      borderWidth:         2,
      pointBackgroundColor: CATEGORIAS.map(c => c.color),
      pointBorderColor:    '#ffffff',
      pointBorderWidth:    2,
      pointRadius:         5,
      pointHoverRadius:    7,
    }],
  };

  const cfg = {
    type: 'radar',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: item => `  ${item.parsed.r}% de las 168 h`,
          },
          backgroundColor: '#1a2e38',
          titleColor:      '#ffffff',
          bodyColor:       'rgba(255,255,255,.8)',
          padding:         12,
          cornerRadius:    8,
        },
      },
      scales: {
        r: {
          beginAtZero: true,
          grid:        { color: 'rgba(39,84,108,.12)' },
          angleLines:  { color: 'rgba(39,84,108,.12)' },
          pointLabels: {
            font:  { family: "'DM Sans', sans-serif", size: 10 },
            color: '#1a2e38',
          },
          ticks: {
            font:      { family: "'DM Sans', sans-serif", size: 10 },
            color:     '#5a7a8a',
            callback:  v => v + '%',
            stepSize:  10,
          },
        },
      },
    },
  };

  if (radarChartInst) {
    radarChartInst.data = chartData;
    radarChartInst.update('active');
  } else {
    radarChartInst = new Chart(
      document.getElementById('radarChart').getContext('2d'),
      cfg,
    );
  }

  renderRadarLegend();
}

/* ----------------------------------------------------------
   LEYENDA HTML DEL RADAR
---------------------------------------------------------- */
function renderRadarLegend() {
  const el = document.getElementById('radar-legend');
  if (!el) return;
  el.innerHTML = CATEGORIAS.map(c => `
    <div class="rl-item">
      <div class="rl-dot" style="background:${c.color}"></div>
      <span>${c.label}</span>
    </div>
  `).join('');
}

/* ----------------------------------------------------------
   CONSULTA PRINCIPAL A SUPABASE
---------------------------------------------------------- */
async function fetchData() {
  setLoading(true);

  const from     = document.getElementById('date-from').value;
  const to       = document.getElementById('date-to').value;
  const userType = document.getElementById('user-type').value;

  const COLS = [
    'sleep_hours', 'food_hours', 'grooming_hours', 'transport_hours',
    'academic_load_hours', 'obligations_hours', 'house_tasks_hours',
    'scrolling_hours', 'physical_activity_hours', 'quality_social_hours',
    'other_hobbies_hours', 'available_time', 'is_student',
  ].join(', ');

  let query = window.supabaseClient
    .from('registros_bienestar')
    .select(COLS);

  if (from) query = query.gte('created_at', from + 'T00:00:00.000Z');
  if (to)   query = query.lte('created_at', to   + 'T23:59:59.999Z');

  if (userType === 'student')    query = query.eq('is_student', true);
  if (userType === 'nonstudent') query = query.eq('is_student', false);

  const { data, error } = await query;

  if (error) {
    console.error('[Stats] Error al cargar datos:', error.message);
    setLoading(false);
    setEmpty(true);
    return;
  }

  setLoading(false);

  if (!data || data.length === 0) {
    setEmpty(true);
    return;
  }

  setEmpty(false);
  document.getElementById('kpi-section').style.display    = '';
  document.getElementById('charts-section').style.display = '';

  updateKPIs(data);
  renderBarChart(data);
  renderRadarChart(data);
}

/* ----------------------------------------------------------
   HANDLER DEL BOTÓN "Aplicar filtros"
---------------------------------------------------------- */
function applyFilters() {
  fetchData();
}

/* ----------------------------------------------------------
   INICIALIZACIÓN
---------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  setDefaultDates();
  fetchData();
});
