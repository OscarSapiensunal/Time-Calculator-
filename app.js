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
    tAcademico, hTransit,
    sleep, credits, isStudent,
    hGrooming, hPhysical, hSocial, hHobby
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
function setResult(key, value, labelOverride) {
  const valEl = document.getElementById('res-' + key);
  const pctEl = document.getElementById('res-' + key + '-pct');

  if (valEl) {
    valEl.textContent = fmt(value);
    valEl.classList.remove('animate-count');
    void valEl.offsetWidth; // fuerza reflow para reiniciar animación
    valEl.classList.add('animate-count');
  }

  if (pctEl) {
    pctEl.textContent = pct(value) + ' de la semana';
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
      label: 'Sueño y Alimentación',
      value: hSleep + hFood,
      color: '#27546c',
      desc:  'Sueño nocturno y tiempo dedicado a comidas'
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
   FEEDBACK DE EQUILIBRIO OCUPACIONAL Y SALUD MENTAL
   Lenguaje: empático, no evaluativo, orientado al autocuidado.
========================================================== */
function renderFeedback({
  tLibreNeto, tBienestar, tOcioDigital,
  tAcademico, hTransit,
  sleep, credits, isStudent,
  hGrooming, hPhysical, hSocial, hHobby
}) {
  const cards = [];

  // ——————————————————————————————————————————————
  // A. EQUILIBRIO GENERAL: tiempo libre neto
  // "bienestar cubierto" = duerme bien Y tiene actividades restauradoras
  // ——————————————————————————————————————————————
  const bienestarCubierto = sleep >= 7 && tBienestar >= 10;

  if (tLibreNeto < 0) {
    cards.push({
      type: 'warn', icon: '🚨',
      title: 'Sobreocupación crítica detectada',
      body: `Tu semana está usando ${fmt(Math.abs(tLibreNeto))} horas más de las que existen.
             Eso no es un error de cálculo: es una señal real de que el ritmo actual puede
             estar cobrando un precio invisible en tu cuerpo y tu mente.
             No se trata de ser más eficiente; se trata de revisar qué cargas podrían
             aligerarse o redistribuirse. Hablar con alguien de RAPsi puede ayudarte
             a encontrar alternativas concretas.`
    });
  } else if (tLibreNeto < 10 && !bienestarCubierto) {
    cards.push({
      type: 'warn', icon: '⏳',
      title: 'Tu margen de descanso es muy estrecho',
      body: `Tienes ${fmt(tLibreNeto)} horas semanales sin ningún compromiso asignado,
             y además tu tiempo de descanso y ocio activo es bajo.
             El descanso no es un premio al final del trabajo: es el tejido que hace
             sostenible todo lo demás.
             Incluso pequeños cambios —una tarde libre, salir a caminar sin destino—
             pueden marcar una diferencia real en cómo te sientes.`
    });
  } else if (tLibreNeto < 10 && bienestarCubierto) {
    cards.push({
      type: 'info', icon: '💡',
      title: 'Agenda ajustada, pero tu bienestar está cubierto',
      body: `Te quedan ${fmt(tLibreNeto)} horas sin asignar esta semana, lo que es un margen pequeño.
             Sin embargo, ya tienes incorporados el descanso y el tiempo para lo que te importa,
             lo cual es lo más valioso. Cuida que esas horas libres no terminen siendo
             obligaciones disfrazadas de ocio.`
    });
  } else if (tLibreNeto < 20) {
    cards.push({
      type: 'info', icon: '💡',
      title: 'Tu tiempo libre existe, cuídalo',
      body: `Tienes ${fmt(tLibreNeto)} horas semanales disponibles. No son muchas, pero son tuyas.
             La clave no es cuántas horas libres tienes, sino si ese tiempo
             realmente te restaura o simplemente "pasa".
             ¿Hay algo que genuinamente te recargue que todavía no estés priorizando?`
    });
  } else {
    cards.push({
      type: 'ok', icon: '🌿',
      title: `Tienes ${fmt(tLibreNeto)} horas libres reales esta semana`,
      body: `Eso es una señal de equilibrio. Que ese tiempo no se te escurra en
             obligaciones disfrazadas de ocio: el descanso intencional, la conexión
             genuina con otras personas y el juego sin propósito son tan importantes
             como cualquier logro académico.`
    });
  }

  // ——————————————————————————————————————————————
  // B. SUEÑO: regulación fisiológica base
  // ——————————————————————————————————————————————
  if (sleep < 6) {
    cards.push({
      type: 'warn', icon: '😴',
      title: 'El sueño que pierdes no se recupera fácilmente',
      body: `Dormir ${sleep} h al día afecta la consolidación de la memoria, la regulación
             emocional y el sistema inmune, incluso si sientes que "ya te acostumbraste".
             Priorizar el sueño no es un signo de poca dedicación: es la base
             sobre la que el aprendizaje realmente ocurre.`
    });
  } else if (sleep >= 9) {
    cards.push({
      type: 'info', icon: '🛌',
      title: 'Duermes mucho, ¿cómo despiertas?',
      body: `Dormir más de 9 horas con regularidad puede ser el cuerpo pidiendo
             recuperación de una deuda acumulada, o a veces es una forma en que
             la mente evita situaciones difíciles.
             Si aun así te despiertas cansado/a o sin energía para el día,
             puede valer la pena explorarlo con alguien de confianza.`
    });
  }

  // ——————————————————————————————————————————————
  // B2. CUIDADO PERSONAL: grooming como anclaje de bienestar
  // ——————————————————————————————————————————————
  if (hGrooming / CONFIG.diasSemana < 0.5) {
    cards.push({
      type: 'info', icon: '🪥',
      title: 'El cuidado personal también restaura',
      body: `Dedicas ${fmt(hGrooming)} h semanales a tu arreglo e higiene personal.
             Aunque parecen momentos rutinarios, son pausas reales entre una actividad
             y otra. Proteger ese espacio —ducharse sin prisa, prepararse con calma—
             tiene un efecto silencioso pero consistente en cómo te sientes el resto del día.`
    });
  } else {
    cards.push({
      type: 'ok', icon: '🪥',
      title: `${fmt(hGrooming)} h semanales de cuidado propio — un ancla cotidiana`,
      body: `Los rituales de higiene y arreglo personal son momentos de transición:
             del sueño al día, del día al descanso. Dedicarles tiempo con intención
             convierte lo rutinario en un acto de autocuidado real y consistente.`
    });
  }

  // ——————————————————————————————————————————————
  // C. BIENESTAR ACTIVO: indicador central de RAPsi
  // ——————————————————————————————————————————————
  if (tBienestar < 5) {
    cards.push({
      type: 'warn', icon: '💜',
      title: 'Tu tiempo de autocuidado activo es muy bajo',
      body: `Esta semana sumas ${fmt(tBienestar)} h entre deporte, vínculos y lo que te apasiona.
             Es una señal de que el cuidado propio quedó en segundo plano.
             No necesitas grandes bloques: 20 minutos de movimiento,
             una llamada con alguien que quieres o hacer algo que disfrutes
             ya marcan una diferencia real en cómo te sientes.`
    });
  } else if (tBienestar < 10) {
    cards.push({
      type: 'info', icon: '🌱',
      title: `${fmt(tBienestar)} horas para ti — hay margen para crecer`,
      body: `Dedicas ${fmt(hPhysical)} h a deporte y salud, ${fmt(hSocial)} h
             con las personas que quieres y ${fmt(hHobby)} h en lo que te apasiona.
             Identifica cuál de las tres está más descuidada y dale un poco más de lugar.`
    });
  } else {
    cards.push({
      type: 'ok', icon: '💪',
      title: `${fmt(tBienestar)} horas para lo que te importa — eso se nota`,
      body: `Dedicas ${fmt(hPhysical)} h a deporte y salud, ${fmt(hSocial)} h
             con las personas que quieres y ${fmt(hHobby)} h en lo que te apasiona.
             Ese equilibrio entre la exigencia académica y el cuidado propio
             es uno de los factores más protectores frente al desgaste universitario.`
    });
  }

  // ——————————————————————————————————————————————
  // D. OCIO DIGITAL vs. BIENESTAR ACTIVO
  // ——————————————————————————————————————————————
  if (tOcioDigital > 0 && tOcioDigital > tBienestar) {
    cards.push({
      type: 'warn', icon: '📱',
      title: 'El scroll está ocupando más espacio que el autocuidado',
      body: `Esta semana inviertes más tiempo en pantallas recreativas (${fmt(tOcioDigital)} h)
             que en actividades que genuinamente te restauran (${fmt(tBienestar)} h).
             No es una crítica al uso del celular: a veces el scroll es la única forma
             de desconectarse que tenemos disponible.
             Pero si sientes que terminas más agotado/a después de scrollear que antes,
             puede ser el momento de explorar otras formas de descanso activo.`
    });
  } else if (tOcioDigital > 28) {
    cards.push({
      type: 'info', icon: '📲',
      title: 'Mucho tiempo en pantallas, ¿cómo te deja?',
      body: `${fmt(tOcioDigital)} horas semanales en pantallas recreativas es una cantidad
             considerable. La pregunta clave no es si es "demasiado" según algún estándar,
             sino cómo te sientes después: ¿descansado/a o vaciado/a?
             Escuchar esa respuesta es ya un acto de conciencia sobre tu bienestar.`
    });
  }

  // ——————————————————————————————————————————————
  // E. BIENESTAR POR DIMENSIONES: mensaje personalizado con valor real
  // ——————————————————————————————————————————————
  if (hPhysical === 0) {
    cards.push({
      type: 'info', icon: '🚶',
      title: 'Esta semana no hay movimiento registrado',
      body: `No anotaste tiempo de deporte o actividad física. El cuerpo y la mente son
             inseparables: incluso 20–30 minutos de caminata reducen el cortisol
             y mejoran la concentración. No necesitas un gimnasio: solo moverte con intención.`
    });
  } else if (tBienestar < 10) {
    cards.push({
      type: 'ok', icon: '🏃',
      title: `Dedicas ${fmt(hPhysical)} h a deporte y salud esta semana`,
      body: `El movimiento regular es uno de los factores más protectores del bienestar
             emocional durante la vida universitaria. Seguir moviéndote, aunque sea poco,
             marca una diferencia real en cómo te sientes y concentras.`
    });
  }

  if (hSocial === 0) {
    cards.push({
      type: 'info', icon: '👥',
      title: 'Esta semana no hay tiempo con las personas que quieres',
      body: `La soledad académica es uno de los factores de riesgo más subestimados
             en la vida universitaria. Un café con alguien, participar en un grupo
             o escribirle a alguien que hace tiempo no contactas puede marcar diferencia.`
    });
  } else if (tBienestar < 10) {
    cards.push({
      type: 'ok', icon: '👥',
      title: `Pasas ${fmt(hSocial)} h con las personas que quieres`,
      body: `La conexión genuina con amigos, pareja o familia es uno de los pilares
             del bienestar emocional. Ese tiempo no es un lujo: es parte esencial
             de lo que hace sostenible el semestre.`
    });
  }

  if (hHobby === 0) {
    cards.push({
      type: 'info', icon: '🎨',
      title: 'Esta semana no hay tiempo para lo que te apasiona',
      body: `No tienes tiempo registrado para hobbies ni actividades restauradoras.
             Estos espacios —aunque pequeños— son fundamentales para recuperar energía
             y mantener la motivación. No hace falta que sea sofisticado:
             una serie, dibujar algo, escuchar música o cinco minutos en silencio ya cuentan.`
    });
  } else if (tBienestar < 10) {
    cards.push({
      type: 'ok', icon: '🎨',
      title: `Dedicas ${fmt(hHobby)} h a lo que te apasiona`,
      body: `Reservar tiempo para tus hobbies y actividades restauradoras es un acto
             de autocuidado real. Ese espacio te permite recuperar energía y mantener
             la motivación a lo largo del semestre.`
    });
  }

  // ——————————————————————————————————————————————
  // F. CARGA ACADÉMICA Y TRANSPORTE
  // ——————————————————————————————————————————————
  if (credits > 18) {
    cards.push({
      type: 'warn', icon: '📚',
      title: 'Carga académica alta: cuídate con más atención',
      body: `${credits} créditos implican aproximadamente ${credits * CONFIG.horasPorCredito} h
             semanales de dedicación, lo que deja poco margen para el resto de la vida.
             Hablar con tu asesor/a académico/a sobre la distribución del semestre
             puede abrir opciones que no siempre son visibles desde adentro.`
    });
  }

  if (hTransit > 14) {
    cards.push({
      type: 'info', icon: '🚌',
      title: 'El transporte también es una carga invisible',
      body: `${fmt(hTransit)} horas semanales de desplazamiento representan una fatiga
             real que pocas veces se cuenta como tal.
             Explorar opciones (clases virtuales, grupos de estudio cercanos, podcasts
             o audiolibros en el trayecto) puede convertir ese tiempo en algo más
             llevadero o incluso en tiempo de recuperación.`
    });
  }

  // ——————————————————————————————————————————————
  // G. MENSAJE DE CIERRE: siempre presente, empático
  // ——————————————————————————————————————————————
  cards.push({
    type: 'ok', icon: '🌱',
    title: 'Conocerse es el primer paso del autocuidado',
    body: `Haber completado esta reflexión ya dice algo sobre ti: que te importa
           tu bienestar, no solo tu rendimiento.
           No existe una distribución perfecta del tiempo. Existe la que te permite
           estudiar con sentido, descansar de verdad y seguir siendo tú.
           Si algo de lo que viste hoy te inquieta, <a href="https://www.instagram.com/rapsi.unal/" target="_blank" rel="noopener noreferrer" class="feedback-ig-link">@rapsi.unal</a> y
          <a href="https://www.instagram.com/acompanamientounal_bog/" target="_blank" rel="noopener noreferrer" class="feedback-ig-link">@acompanamientounal_bog</a>. están para acompañarte.`
  });

  // ——————————————————————————————————————————————
  // RENDERIZAR TARJETAS
  // ——————————————————————————————————————————————
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
