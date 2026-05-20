/* ============================================================
   RAPsi UNAL — Sistema de Análisis de Bienestar Universitario
   app.js
   Dependencia: Chart.js (cargado antes en el HTML via CDN)
============================================================ */

/* ----------------------------------------------------------
   CONFIGURACIÓN (editable sin tocar otra lógica)
   horasPorCredito: política académica UNAL vigente (1 cr = 3 h)
---------------------------------------------------------- */
const CONFIG = {
  totalHoras:      168,
  horasPorCredito: 3,
  diasSemana:      7,
};

/* ----------------------------------------------------------
   SUPABASE — conexión al backend
   Completa las cadenas con los valores de tu proyecto Supabase.
---------------------------------------------------------- */
const SUPABASE_URL      = "https://gczrxdubzzuiuxuxvxsm.supabase.co";
// La anon key es pública por diseño en aplicaciones del lado del cliente (Vercel);
// la seguridad de los datos está garantizada por las políticas RLS de Supabase.
const SUPABASE_ANON_KEY = "sb_publishable_yJ_cSM-COnRQfZG7US5c8g_26o8SYS1";
// window.supabaseClient evita conflicto de nombre con window.supabase (objeto del CDN)
// y elimina cualquier posible SyntaxError por redeclaración de 'const supabase'
window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ----------------------------------------------------------
   HELPER: sincronizar slider con su etiqueta de valor
   Se llama mediante oninput="syncRange('id')" en el HTML
---------------------------------------------------------- */
function syncRange(id) {
  const input = document.getElementById(id);
  if (!input) return;
  const label = document.getElementById(id + '-val');
  const val   = parseFloat(input.value);
  if (label) {
    label.textContent = `${fmt(val)} h`;
  }
  if (id === 'transit_hours') updateTransitTotal();
  updateCounter();
}

/* ----------------------------------------------------------
   HELPER: actualizar el total semanal de transporte
---------------------------------------------------------- */
function updateTransitTotal() {
  const hours = parseFloat(document.getElementById('transit_hours')?.value) || 0;
  const el    = document.getElementById('transit-total');
  if (el) el.textContent = fmt(hours * 6) + ' h';
}

/* ----------------------------------------------------------
   CONTADOR EN TIEMPO REAL: horas ocupadas de 168
---------------------------------------------------------- */
function updateCounter() {
  const sleep      = parseFloat(document.getElementById('sleep')?.value)             || 7;
  const food       = parseFloat(document.getElementById('food')?.value)              || 1.5;
  const transitH   = parseFloat(document.getElementById('transit_hours')?.value)     || 1;
  const grooming   = parseFloat(document.getElementById('grooming')?.value)          || 1;
  const houseTasks = parseFloat(document.getElementById('house_tasks')?.value)       || 4;
  const isStudent  = document.getElementById('is_student')?.checked ?? true;
  const credits    = isStudent
                   ? (parseFloat(document.getElementById('credits')?.value) || 0) : 0;
  const work       = parseFloat(document.getElementById('work')?.value)              || 0;
  const other      = parseFloat(document.getElementById('other')?.value)             || 0;
  const screen     = parseFloat(document.getElementById('screen')?.value)            || 0;
  const physical   = parseFloat(document.getElementById('physical_activity')?.value) || 0;
  const social     = parseFloat(document.getElementById('social_activity')?.value)   || 0;
  const hobby      = parseFloat(document.getElementById('hobby_wellbeing')?.value)   || 0;

  const D     = CONFIG.diasSemana;
  const total = (sleep * D) + (food * D) + (transitH * 6) + (grooming * D)
              + houseTasks + (credits * CONFIG.horasPorCredito) + work + other
              + (screen * D) + physical + social + hobby;

  const pctUsed = Math.min(100, (total / CONFIG.totalHoras) * 100);

  const usedEl  = document.getElementById('hc-used');
  const barEl   = document.getElementById('hc-bar');
  const wrapEl  = document.getElementById('hours-counter');

  if (usedEl) usedEl.textContent = fmt(total);
  if (barEl)  barEl.style.width  = pctUsed + '%';
  if (wrapEl) wrapEl.classList.toggle('hc-over', total > CONFIG.totalHoras);
}

/* ----------------------------------------------------------
   HELPERS: formato numérico y porcentaje
---------------------------------------------------------- */
function fmt(n) {
  // Muestra 1 decimal solo si el valor no es entero
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function pct(n) {
  return ((n / CONFIG.totalHoras) * 100).toFixed(1) + '%';
}

/* ----------------------------------------------------------
   INSTANCIA DEL GRÁFICO (reutilizable entre recálculos)
---------------------------------------------------------- */
let weekChart = null;

/* ==========================================================
   FUNCIÓN PRINCIPAL: CALCULAR
   Orquesta lectura → cálculo → UI → gráfico → feedback
========================================================== */
function calcular() {

  // --------------------------------------------------------
  // 1. VALIDACIÓN DEL CONSENTIMIENTO (Ley 1581/2012)
  //    Bloqueo técnico antes de procesar cualquier dato.
  // --------------------------------------------------------
  const consentBox = document.getElementById('consent_accepted');
  if (!consentBox || !consentBox.checked) {
    alert('Por favor acepta el tratamiento de datos (Ley 1581/2012) antes de continuar.');
    consentBox.closest('.consent-box').style.outline = '2px solid #ff9491';
    consentBox.focus();
    consentBox.closest('.consent-box').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return; // detener ejecución
  }
  consentBox.closest('.consent-box').style.outline = '';

  // --------------------------------------------------------
  // 2. CAPTURA DE LAS 14 VARIABLES DEL FORMULARIO
  //    Valores con fallback para evitar NaN en cálculos.
  // --------------------------------------------------------

  // Bloque estructural (valores DIARIOS → se multiplican × 7)
  const sleep        = parseFloat(document.getElementById('sleep').value)              || 7;
  const food         = parseFloat(document.getElementById('food').value)               || 1.5;
  const transitHours = parseFloat(document.getElementById('transit_hours').value)      || 1;
  const grooming     = parseFloat(document.getElementById('grooming').value)           || 1;
  const houseTasks   = parseFloat(document.getElementById('house_tasks').value)        || 4;

  // Bloque académico / obligaciones
  const isStudent  = document.getElementById('is_student')?.checked ?? true;
  const credits    = isStudent
                   ? (parseFloat(document.getElementById('credits').value) || 0) : 0;
  const work       = parseFloat(document.getElementById('work').value)               || 0;
  const other      = parseFloat(document.getElementById('other').value)              || 0;

  // Bloque bienestar: scrolling (DIARIO → × 7)
  const screen     = parseFloat(document.getElementById('screen').value)             || 0;

  // Bloque bienestar: actividades semanales
  const physical   = parseFloat(document.getElementById('physical_activity').value)  || 0;
  const social     = parseFloat(document.getElementById('social_activity').value)    || 0;
  const hobby      = parseFloat(document.getElementById('hobby_wellbeing').value)    || 0;

  // --------------------------------------------------------
  // 3. CONVERSIÓN A HORAS SEMANALES
  // --------------------------------------------------------
  const D = CONFIG.diasSemana;

  const hSleep      = sleep       * D;
  const hFood       = food        * D;
  const hTransit    = transitHours * 6;            // asume 6 días/semana
  const hGrooming   = grooming    * D;
  const hHouseTasks = houseTasks;                  // ya es semanal
  const hStudy      = credits     * CONFIG.horasPorCredito;
  const hWork       = work;                        // ya es semanal
  const hOther      = other;
  const hScreen     = screen      * D;
  const hPhysical   = physical;
  const hSocial     = social;
  const hHobby      = hobby;

  // --------------------------------------------------------
  // 4. ALGORITMO INSTITUCIONAL DE BIENESTAR
  // --------------------------------------------------------

  // Necesidades corporales ineludibles (sueño, alimentación, aseo)
  const tEstructural = hSleep + hFood + hGrooming;

  // Tiempo académico, obligaciones fijas y hogar
  const tAcademico   = hStudy + hOther + hHouseTasks;

  // Bienestar activo: física + social + hobbies/actividades restauradoras
  const tBienestar   = hPhysical + hSocial + hHobby;

  // Ocio digital: consumo pasivo de pantallas
  const tOcioDigital = hScreen;

  // Total ocupado
  const tOcupado = tEstructural + hTransit + tAcademico + hWork
                 + tBienestar   + tOcioDigital;

  // Tiempo libre neto (puede ser negativo: sobreocupación crítica)
  const tLibreNeto = CONFIG.totalHoras - tOcupado;

  // Segmento gráfico: tiempo libre neto puro
  const tOcioYLibre = Math.max(0, tLibreNeto);

  // --------------------------------------------------------
  // 5. ACTUALIZAR TARJETAS DE RESULTADO
  // --------------------------------------------------------
  setResult('sleep',       hSleep,                  'Descanso nocturno');
  setResult('food',        hFood,                   'Alimentación');
  setResult('grooming',    hGrooming,               'Cuidado personal');
  setResult('transit',     hTransit,                'Desplazamientos');
  setResult('study',       hStudy,                  'Carga académica');
  setResult('work',        hWork,                   'Trabajo');
  setResult('obligations', hOther,                  'Otras obligaciones');
  setResult('screen',      hScreen,                 'Ocio digital');
  setResult('physical',    hPhysical,               'Deporte y salud');
  setResult('social',      hSocial,                 'Con los que quieres');
  setResult('hobby',       hHobby,                  'Lo que te apasiona');
  setResult('free',        Math.max(0, tLibreNeto), 'Tiempo libre neto');
  setResult('total',       tOcupado,                'Total ocupado');

  // --------------------------------------------------------
  // 6. MOSTRAR SECCIONES OCULTAS
  // --------------------------------------------------------
  document.querySelector('.results-section').classList.add('visible');
  document.querySelector('.chart-section').classList.add('visible');
  document.querySelector('.feedback-section').classList.add('visible');

  // --------------------------------------------------------
  // 7. GRÁFICO Y FEEDBACK
  // --------------------------------------------------------
  renderChart({ hSleep, hFood, hGrooming, hTransit, tAcademico,
                hWork, tOcioDigital, hPhysical, hSocial, hHobby, tOcioYLibre });

  renderFeedback({
    tLibreNeto, tBienestar, tOcioDigital,
    tAcademico, hTransit, hWork,
    sleep, credits, isStudent,
    hPhysical, hSocial
  });

  // --------------------------------------------------------
  // 8. SCROLL SUAVE A RESULTADOS
  // --------------------------------------------------------
  setTimeout(() => {
    document.querySelector('.results-section')
      .scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);

  // --------------------------------------------------------
  // 9. GUARDAR EN SUPABASE (fire-and-forget, no bloquea la UI)
  // --------------------------------------------------------
  saveToSupabase({
    usuario_id:               null,
    consent_accepted:         true,
    is_student:               isStudent,
    sleep_hours:              parseFloat(hSleep),
    transport_hours:          parseFloat(hTransit),
    food_hours:               parseFloat(hFood),
    grooming_hours:           parseFloat(hGrooming),
    house_tasks_hours:        parseFloat(hHouseTasks),
    academic_credits:         parseFloat(credits),
    academic_load_hours:      parseFloat(hStudy),
    work_hours:               parseFloat(hWork),
    obligations_hours:        parseFloat(hOther),
    scrolling_hours:          parseFloat(hScreen),
    physical_activity_hours:  parseFloat(hPhysical),
    quality_social_hours:     parseFloat(hSocial),
    other_hobbies_hours:      parseFloat(hHobby),
    available_time:           parseFloat(tLibreNeto),
    wellbeing_time:           parseFloat(tBienestar),
    occupied_time:            parseFloat(tOcupado),
  });
}

/* ----------------------------------------------------------
   SUPABASE: guardar registro anónimo en registros_bienestar
   usuario_id es null literal para evitar errores de tipo UUID.
---------------------------------------------------------- */
async function saveToSupabase(data) {
  try {
    const { error } = await window.supabaseClient
      .from('registros_bienestar')
      .insert([data]);

    if (error) throw error;
    console.log('[RAPsi] Registro de bienestar guardado correctamente.');
  } catch (err) {
    console.error('[RAPsi] Error al guardar registro:', err.message);
  }
}

/* ----------------------------------------------------------
   HELPER: actualizar una tarjeta de resultado con animación
---------------------------------------------------------- */
/* Microdatos institucionales por categoría — se muestran en "Así se ve tu semana"
   para invitar a la reflexión sin emitir juicio sobre el dato del usuario. */
const FACTS = {
  sleep:       'La OMS recomienda 7–9 h por noche para adultos jóvenes (18–25 años)',
  food:        'Dedicar 20–30 min por comida favorece la digestión y la saciedad',
  grooming:    'Una rutina diaria de higiene completa toma en promedio 60–90 min',
  transit:     'Estudiantes de Bogotá invierten en promedio 1.5–2 h/día en desplazamientos',
  study:       'Cada crédito UNAL equivale a 3 h semanales (clase + estudio independiente)',
  obligations: 'Las obligaciones de cuidado y voluntariado cuentan como trabajo invisible',
  work:        'Jornada legal en Colombia: 46 h/semana (desde julio 2025: 44 h)',
  screen:      'Adultos jóvenes promedian 6 h/día en pantallas recreativas (DataReportal 2024)',
  physical:    'La OMS recomienda mínimo 150 min/semana de actividad física moderada',
  social:      'La calidad de los vínculos predice el bienestar a largo plazo (Harvard Adult Development Study)',
  hobby:       'Los hobbies creativos se asocian con menor riesgo de depresión y ansiedad',
  free:        'El bienestar activo recarga distinto al tiempo libre pasivo',
  total:       'Las 168 h semanales son el único recurso verdaderamente igualitario entre personas'
};

function setResult(key, value, labelOverride) {
  const valEl  = document.getElementById('res-' + key);
  const factEl = document.getElementById('res-' + key + '-pct');

  if (valEl) {
    valEl.textContent = fmt(value);
    valEl.classList.remove('animate-count');
    void valEl.offsetWidth; // fuerza reflow para reiniciar animación
    valEl.classList.add('animate-count');
  }

  if (factEl) {
    factEl.textContent = FACTS[key] || '';
  }
}

/* ==========================================================
   GRÁFICO DOUGHNUT — 6 CATEGORÍAS MACRO
   Agrupa las 13 variables en segmentos legibles.
========================================================== */
function renderChart({ hSleep, hFood, hGrooming, hTransit, tAcademico,
                        hWork, tOcioDigital, hPhysical, hSocial, hHobby, tOcioYLibre }) {

  const ctx = document.getElementById('weekChart').getContext('2d');

  const CATEGORIAS = [
    {
      label: 'Sueño',
      value: hSleep,
      color: '#27546c',
      desc:  'Sueño nocturno acumulado en la semana'
    },
    {
      label: 'Alimentación',
      value: hFood,
      color: '#d4a574',
      desc:  'Tiempo dedicado a preparar, comer y descansar post-comida'
    },
    {
      label: 'Cuidado Personal',
      value: hGrooming,
      color: '#3d8ba0',
      desc:  'Higiene, arreglo y rituales de autocuidado'
    },
    {
      label: 'Transporte',
      value: hTransit,
      color: '#5a9bb5',
      desc:  'Desplazamientos semanales'
    },
    {
      label: 'Academia y Obligaciones',
      value: tAcademico,
      color: '#ff9491',
      desc:  'Carga académica, hogar y compromisos fijos'
    },
    {
      label: 'Trabajo',
      value: hWork,
      color: '#e8956d',
      desc:  'Trabajo remunerado o prácticas'
    },
    {
      label: 'Ocio Digital',
      value: tOcioDigital,
      color: '#ffccc9',
      desc:  'Redes sociales, streaming, scroll'
    },
    {
      label: 'Deporte y salud',
      value: hPhysical,
      color: '#2F7A8C',
      desc:  'Ejercicio, deporte y caminatas activas'
    },
    {
      label: 'Tiempo con los que quieres',
      value: hSocial,
      color: '#5BC8AF',
      desc:  'Amigos, pareja, familia — conexión genuina'
    },
    {
      label: 'Lo que te apasiona',
      value: hHobby,
      color: '#B79CED',
      desc:  'Creatividad, hobbies y actividades restauradoras'
    },
    {
      label: 'Tiempo libre',
      value: tOcioYLibre,
      color: '#e2e8f0',
      desc:  'Recreación libre y tiempo sin compromisos'
    },
  ];

  const chartData = {
    labels:   CATEGORIAS.map(c => c.label),
    datasets: [{
      data:             CATEGORIAS.map(c => Math.max(0, c.value)),
      backgroundColor:  CATEGORIAS.map(c => c.color),
      borderWidth:      3,
      borderColor:      '#ffffff',
      hoverBorderWidth: 4,
      hoverOffset:      10,
    }]
  };

  if (weekChart) {
    // Actualizar sin destruir la instancia (evita parpadeo)
    weekChart.data = chartData;
    weekChart.update('active');
  } else {
    weekChart = new Chart(ctx, {
      type: 'doughnut',
      data: chartData,
      options: {
        cutout: '65%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) => {
                const val  = item.parsed;
                const pctV = ((val / CONFIG.totalHoras) * 100).toFixed(1);
                return `  ${fmt(val)} h  (${pctV}%)`;
              },
              afterLabel: (item) => '  ' + CATEGORIAS[item.dataIndex].desc,
            },
            backgroundColor: '#1a2e38',
            titleColor:      '#ffffff',
            bodyColor:       'rgba(255,255,255,.8)',
            padding:         14,
            cornerRadius:    10,
            boxPadding:      4,
          }
        },
        animation: {
          animateRotate: true,
          duration:      900,
          easing:        'easeInOutQuart'
        },
      }
    });
  }

  // --------------------------------------------------------
  // LEYENDA PERSONALIZADA (HTML)
  // --------------------------------------------------------
  const legendEl = document.getElementById('chart-legend');
  legendEl.innerHTML = CATEGORIAS.map(item => {
    const barW = Math.min(100, Math.round(
      (Math.max(0, item.value) / CONFIG.totalHoras) * 100
    ));
    return `
      <div class="legend-item">
        <div class="legend-dot"
             style="background:${item.color}; border:1.5px solid rgba(0,0,0,.08)"></div>
        <div class="legend-info">
          <div class="legend-name">${item.label}</div>
          <div class="legend-hours">
            ${fmt(Math.max(0, item.value))} h · ${pct(Math.max(0, item.value))}
          </div>
        </div>
        <div class="legend-bar-wrap">
          <div class="legend-bar"
               style="width:${barW}%; background:${item.color};
                      border:1px solid rgba(0,0,0,.06)"></div>
        </div>
      </div>`;
  }).join('');
}

/* ==========================================================
   FEEDBACK DE EQUILIBRIO OCUPACIONAL · MOTOR v2

   Filosofía: el bienestar es un balance entre tres bloques —
   carga (académico + trabajo + transporte), sostenimiento
   (sueño + comida + higiene), y bienestar activo (físico +
   social + hobbies). Las reglas miran combinaciones, no
   umbrales aislados.

   Tono: describir realidades, ofrecer palancas, no moralizar.
   Lo estructural (transporte, créditos altos) se reframea
   como oportunidad, no como problema a eliminar.

   Estructura: if independientes (no cadena), tope MAX = 4
   tarjetas + cierre universal. Técnica del sándwich:
   alertas y fortalezas conviven en la misma vista.
========================================================== */
function renderFeedback({
  tLibreNeto, tBienestar, tOcioDigital,
  tAcademico, hTransit, hWork,
  sleep, credits, isStudent,
  hPhysical, hSocial
}) {
  const hSleep         = sleep * CONFIG.diasSemana;
  const cargaDura      = tAcademico + hWork + hTransit;
  const sostenimiento  = hSleep; // sueño es el proxy más confiable
  const MAX            = 4;
  const cards          = [];
  // ════════════════════════════════════════════════════════
  // ALERTAS — describir realidades, ofrecer palancas
  // ════════════════════════════════════════════════════════
  // 1 · Sobreocupación física crítica
  if (cards.length < MAX && tLibreNeto < 0) {
    cards.push({
      type: 'warn', icon: '🔴',
      title: 'Tu semana no cierra',
      body: `Lo que reportas suma más horas de las que tiene una semana.
             No es falta de organización — es que el cubo no cierra.
             Algo está ocupando espacio que no existe: probablemente sueño
             negociado, comidas saltadas o multitarea invisible. Vale la pena
             revisar qué está cediendo en silencio.`
    });
  }
  // 2 · Burnout estructural
  if (cards.length < MAX && cargaDura > 60 && hSleep < 42) {
    cards.push({
      type: 'warn', icon: '🚨',
      title: 'Carga alta con descanso corto',
      body: `Estás sosteniendo ${fmt(cargaDura)} h/sem de obligaciones duras
             (estudio + trabajo + transporte) con ${fmt(hSleep / 7)} h de sueño
             por noche. Una semana así es viable; un mes así no lo es. El
             cuerpo paga con concentración, ánimo y salud antes de que se note.`
    });
  }
  // 3 · Privación severa de sueño
  if (cards.length < MAX && hSleep < 35) {
    cards.push({
      type: 'warn', icon: '😵',
      title: 'Alerta del cuerpo: dormir menos de 5 h',
      body: `${fmt(hSleep / 7)} h por noche no es disciplina, es deuda
             acumulándose. La regulación emocional, la memoria de corto plazo
             y la respuesta inmune dependen del sueño profundo. Una semana
             así se siente como tres. Si no puedes dormir más esta semana,
             al menos protege un día completo de recuperación.`
    });
  }
  // 4 · Procrastinación del sueño por pantallas
  if (cards.length < MAX && tOcioDigital > 15 && hSleep < 49) {
    cards.push({
      type: 'warn', icon: '🌙',
      title: 'Las pantallas están negociando con tu descanso',
      body: `${fmt(tOcioDigital)} h/sem en pantallas recreativas + ${fmt(hSleep / 7)} h
             de sueño por noche. La calidad del sueño cae aunque cierres los
             ojos: la luz azul retrasa la melatonina y el "una más" nocturno
             acumula deuda cognitiva. El experimento que sí funciona: poner
             el celular a cargar lejos de la cama.`
    });
  }
  // 5 · Evasión digital (no simple consumo alto)
  if (cards.length < MAX && tOcioDigital > 20 && tBienestar < tOcioDigital / 2) {
    cards.push({
      type: 'warn', icon: '📱',
      title: 'Pantallas como refugio, no como ocio',
      body: `Pasas ${fmt(tOcioDigital)} h en pantallas recreativas, pero solo
             ${fmt(tBienestar)} h en actividades restauradoras activas
             (deporte, vínculos, hobbies). A veces no es ocio, es agotamiento
             buscando salida. La pregunta honesta: ¿de qué descansas cuando
             scrolleas?`
    });
  }
  // 6 · Aislamiento social (regla independiente, no condicionada a estudio)
  if (cards.length < MAX && hSocial < 2) {
    cards.push({
      type: 'warn', icon: '🫥',
      title: 'Vínculos en pausa esta semana',
      body: `Reportas menos de 2 h de tiempo de calidad con personas que te
             importan. Los vínculos no se construyen en crisis — se cultivan
             antes. Una llamada de 15 minutos a alguien con quien te ríes
             es de las palancas más rentables que existen para la salud mental.`
    });
  }
  // 7 · Tiempo libre sin restauración
  if (cards.length < MAX && tLibreNeto >= 5 && tBienestar < 3) {
    cards.push({
      type: 'warn', icon: '⏳',
      title: 'Tiempo libre sin convertirse en bienestar',
      body: `Tienes ${fmt(tLibreNeto)} h libres a la semana, pero solo
             ${fmt(tBienestar)} h en actividades restauradoras. El descanso
             pasivo no recarga igual que la actividad restauradora: el cuerpo
             y la mente necesitan moverse, conectar, crear — no solo dejar
             de hacer cosas.`
    });
  }
  // 8 · Transporte como segunda jornada (reframe, no prohibición)
  if (cards.length < MAX && hTransit > 12) {
    cards.push({
      type: 'warn', icon: '🚌',
      title: 'El transporte es una segunda jornada',
      body: `${fmt(hTransit)} h/sem en transporte es tiempo de tu semana que
             ya está siendo invertido — no se puede recuperar, pero sí se
             puede convertir. ¿Audiolibros? ¿Podcast de algo que te interese?
             ¿Una serie liviana? ¿Cerrar los ojos y descansar de verdad?
             La palanca no es "transportarse menos", es decidir qué pasa
             dentro de esas horas.`
    });
  }
  // ════════════════════════════════════════════════════════
  // FORTALEZAS — reconocer balance, no umbrales aislados
  // ════════════════════════════════════════════════════════
  // 9 · Balance Integral (la regla más exigente — la joya)
  if (
    cards.length < MAX &&
    hSleep >= 49 &&
    tBienestar >= 7 &&
    tLibreNeto >= 0 &&
    tOcioDigital <= 14
  ) {
    cards.push({
      type: 'strength', icon: '🌟',
      title: 'Balance Integral',
      body: `Estás cuidando varios pilares al tiempo: sueño en rango saludable,
             bienestar activo presente, semana que cierra sin sobregiro, y uso
             medido de pantallas. Esto es lo que se ve cuando alguien se conoce
             y se respeta. Sostenlo — es más difícil de recuperar que de
             mantener.`
    });
  }
  // 10 · Carga académica saludable (contextual: solo si el resto está bien)
  if (
    cards.length < MAX &&
    isStudent &&
    tAcademico >= 15 &&
    hSleep >= 42 &&
    tBienestar >= 5
  ) {
    cards.push({
      type: 'strength', icon: '📖',
      title: 'Carga académica sostenida con balance',
      body: `Manejas ${fmt(tAcademico)} h/sem de estudio sin sacrificar lo
             que sostiene esa carga: duermes ${fmt(hSleep / 7)} h por noche
             y dedicas ${fmt(tBienestar)} h al bienestar activo. La carga
             alta no es el problema — el problema es la carga alta sin
             colchón. Tú tienes colchón.`
    });
  }
  // 11 · Descanso en rango OMS
  if (cards.length < MAX && hSleep >= 49 && hSleep <= 63) {
    cards.push({
      type: 'strength', icon: '🌙',
      title: 'Descanso en rango OMS',
      body: `Duermes ${fmt(hSleep / 7)} h por noche, dentro del rango
             recomendado por la OMS (7–9 h). El sueño es el pilar invisible
             del rendimiento cognitivo y la regulación emocional: estás
             cuidando lo que sostiene todo lo demás.`
    });
  }
  // 12 · Vida activa
  if (cards.length < MAX && hPhysical >= 3) {
    cards.push({
      type: 'strength', icon: '🏃',
      title: 'Cuerpo en movimiento',
      body: `${fmt(hPhysical)} h/sem de actividad física, por encima del
             umbral mínimo de la OMS (150 min). El movimiento regular es de
             las herramientas más sólidas que existen para regular la
             ansiedad, mejorar el sueño y proteger la salud mental.`
    });
  }
  // 13 · Red social viva
  if (cards.length < MAX && hSocial >= 5) {
    cards.push({
      type: 'strength', icon: '💬',
      title: 'Red de apoyo activa',
      body: `Dedicas ${fmt(hSocial)} h semanales a tiempo de calidad con
             personas que te importan. El Harvard Adult Development Study
             (80 años siguiendo a las mismas personas) encontró que la
             calidad de los vínculos predice el bienestar mejor que el
             dinero, el éxito o los genes. Estás invirtiendo en lo correcto.`
    });
  }
  // 14 · Higiene digital
  if (cards.length < MAX && tOcioDigital <= 12) {
    cards.push({
      type: 'strength', icon: '✨',
      title: 'Pantallas bajo control',
      body: `${fmt(tOcioDigital)} h/sem en pantallas recreativas es uso
             moderado. La contención del consumo digital pasivo libera
             espacio cognitivo y emocional para descanso real, conversaciones
             presentes y actividades que genuinamente restauran.`
    });
  }
  // ════════════════════════════════════════════════════════
  // CIERRE UNIVERSAL — siempre presente
  // ════════════════════════════════════════════════════════
  cards.push({
    type: 'ok', icon: '🌱',
    title: 'Conocerse es el primer paso del autocuidado',
    body: `Haber completado esta reflexión ya dice algo sobre ti: que te importa
           tu bienestar, no solo tu rendimiento. No existe una distribución
           perfecta del tiempo. Existe la que te permite estudiar con sentido,
           descansar de verdad y seguir siendo tú. Si algo de lo que viste hoy
           te inquieta,
           <a href="https://www.instagram.com/rapsi.unal/" target="_blank" rel="noopener noreferrer" class="feedback-ig-link">@rapsi.unal</a> y
           <a href="https://www.instagram.com/acompanamientounal_bog/" target="_blank" rel="noopener noreferrer" class="feedback-ig-link">@acompanamientounal_bog</a>
           están para acompañarte.`
  });
  // ════════════════════════════════════════════════════════
  // RENDERIZAR
  // ════════════════════════════════════════════════════════
  const container = document.getElementById('feedback-cards');
  container.innerHTML = cards.map((c, i) => `
    <div class="feedback-card ${c.type}" style="animation-delay:${i * 0.08}s">
      <div class="fc-icon">${c.icon}</div>
      <div class="fc-content">
        <h4>${c.title}</h4>
        <p>${c.body}</p>
      </div>
    </div>
  `).join('');
}

/* ----------------------------------------------------------
   EXPOSICIÓN GLOBAL DE FUNCIONES LLAMADAS DESDE HTML
   Necesario para que onclick="calcular()" y oninput="syncRange()"
   funcionen correctamente en cualquier entorno de carga.
---------------------------------------------------------- */
window.calcular   = calcular;
window.syncRange  = syncRange;

/* ----------------------------------------------------------
   BARRA DE PROGRESO DE SCROLL
---------------------------------------------------------- */
window.addEventListener('scroll', () => {
  const scrollTop   = document.documentElement.scrollTop || document.body.scrollTop;
  const scrollTotal = document.documentElement.scrollHeight - window.innerHeight;
  const progress    = scrollTotal > 0 ? (scrollTop / scrollTotal) * 100 : 0;
  document.getElementById('progress-bar').style.width = progress + '%';
});

/* ----------------------------------------------------------
   INICIALIZACIÓN AL CARGAR LA PÁGINA
   Sincroniza todos los sliders con sus etiquetas de valor.
---------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  [
    'sleep', 'food', 'transit_hours', 'grooming', 'house_tasks',
    'work', 'screen', 'physical_activity', 'social_activity', 'hobby_wellbeing'
  ].forEach(syncRange);

  // Reflejar la regla de créditos en el hint del formulario
  const hpcLabel = document.getElementById('hpc-label');
  if (hpcLabel) hpcLabel.textContent = CONFIG.horasPorCredito + ' h';

  // Visibilidad condicional del bloque de créditos
  const isStudentCb  = document.getElementById('is_student');
  const creditsField = document.getElementById('credits-field');
  if (isStudentCb && creditsField) {
    isStudentCb.addEventListener('change', () => {
      creditsField.style.display = isStudentCb.checked ? '' : 'none';
      updateCounter();
    });
  }

  // Inicializar totales y contador
  updateTransitTotal();
  updateCounter();
});
