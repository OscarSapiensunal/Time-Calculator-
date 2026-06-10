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
   FECHAS POR DEFECTO: último año
---------------------------------------------------------- */
function setDefaultDates() {
  function localDateStr(d) {
    const y   = d.getFullYear();
    const m   = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  const today = new Date();
  const from  = new Date(today);
  from.setFullYear(from.getFullYear() - 1);

  document.getElementById('date-to').value   = localDateStr(today);
  document.getElementById('date-from').value = localDateStr(from);
}

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
      : `La comunidad universitaria sostiene sus altas cargas académicas sacrificando el descanso base. En promedio, estamos acumulando una deuda de sueño colectiva que reduce el bienestar y afecta directamente el rendimiento cognitivo institucional.`;

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
      : `Como comunidad, pasamos más tiempo promedio en pantallas recreativas (${fmt(avgs.screen)} h) que en descanso activo, deporte y socialización sumados (${fmt(avgs.wellbeing)} h). El consumo digital se ha convertido en la principal vía pasiva de desconexión.`;

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
      : `Detectamos una restricción severa en las redes de socialización activa de los usuarios filtrados. Las demandas cotidianas están desplazando los espacios comunitarios, aumentando el riesgo latente de aislamiento y pérdida de tejido de apoyo en la sede.`;

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

  // Hora local de Bogotá (UTC-5, sin DST). Si la app se despliega
  // a más sedes, mover este offset a una constante de configuración.
  const TZ_OFFSET = '-05:00';
  if (dateFrom) {
    const isoFrom = `${dateFrom}T${timeFrom || '00:00'}:00${TZ_OFFSET}`;
    query = query.gte('created_at', isoFrom);
  }
  if (dateTo) {
    const isoTo = `${dateTo}T${timeTo || '23:59'}:59${TZ_OFFSET}`;
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
  // Colapsar filtros por defecto en mobile
  if (window.innerWidth <= 600) {
    document.getElementById('filters-details')?.removeAttribute('open');
  }
  setDefaultDates();

  // Filtros reactivos: se recalcula al cambiar cualquier control
  ['date-from', 'date-to', 'time-from', 'time-to', 'user-type'].forEach(id =>
    document.getElementById(id).addEventListener('change', fetchData)
  );

  fetchData();
});
