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
const SUPABASE_ANON_KEY = "sb_publishable_yJ_cSM-COnRQfZG7US5c8g_26o8SYS1";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ----------------------------------------------------------
   HELPER: sincronizar slider con su etiqueta de valor
   Se llama mediante oninput="syncRange('id')" en el HTML
---------------------------------------------------------- */
function syncRange(id) {
  const input = document.getElementById(id);
  if (!input) return;
  const label = document.getElementById(id + '-val');
  const val   = parseFloat(input.value);
  if (label) label.textContent = val % 1 === 0 ? `${val} h` : `${val} h`;
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
  // 2. CAPTURA DE LAS 13 VARIABLES DEL FORMULARIO
  //    Valores con fallback para evitar NaN en cálculos.
  // --------------------------------------------------------

  // Bloque estructural (valores DIARIOS → se multiplican × 7)
  const sleep      = parseFloat(document.getElementById('sleep').value)             || 7;
  const food       = parseFloat(document.getElementById('food').value)              || 1.5;
  const transit    = parseFloat(document.getElementById('transit').value)           || 1;
  const grooming   = parseFloat(document.getElementById('grooming').value)          || 1;
  const houseTasks = parseFloat(document.getElementById('house_tasks').value)       || 0.5;

  // Bloque académico / obligaciones (valores SEMANALES directos)
  const credits    = parseFloat(document.getElementById('credits').value)           || 0;
  const other      = parseFloat(document.getElementById('other').value)             || 0;

  // Bloque bienestar: scrolling (DIARIO → × 7)
  const screen     = parseFloat(document.getElementById('screen').value)            || 0;

  // Bloque bienestar: actividades (valores SEMANALES directos)
  const physical   = parseFloat(document.getElementById('physical_activity').value) || 0;
  const social     = parseFloat(document.getElementById('social_activity').value)   || 0;
  const creative   = parseFloat(document.getElementById('creative_activity').value) || 0;
  const mindful    = parseFloat(document.getElementById('mindfulness').value)       || 0;
  const leisure    = parseFloat(document.getElementById('leisure').value)           || 0;

  // --------------------------------------------------------
  // 3. CONVERSIÓN A HORAS SEMANALES
  // --------------------------------------------------------
  const D = CONFIG.diasSemana;

  const hSleep      = sleep      * D;
  const hFood       = food       * D;
  const hTransit    = transit    * D;
  const hGrooming   = grooming   * D;
  const hHouseTasks = houseTasks * D;
  const hStudy      = credits    * CONFIG.horasPorCredito;
  const hOther      = other;
  const hScreen     = screen     * D;
  const hPhysical   = physical;
  const hSocial     = social;
  const hCreative   = creative;
  const hMindful    = mindful;
  const hLeisure    = leisure;

  // --------------------------------------------------------
  // 4. ALGORITMO INSTITUCIONAL DE BIENESTAR
  // --------------------------------------------------------

  // Necesidades corporales ineludibles
  const tEstructural = hSleep + hFood + hGrooming + hHouseTasks;

  // Tiempo académico y obligaciones fijas
  const tAcademico   = hStudy + hOther;

  // Bienestar activo: actividades restauradoras elegidas
  const tBienestar   = hPhysical + hSocial + hCreative + hMindful;

  // Ocio digital: consumo pasivo de pantallas
  const tOcioDigital = hScreen;

  // Ocio general: recreación libre no categorizada
  const tOcioGeneral = hLeisure;

  // Total ocupado
  const tOcupado = tEstructural + hTransit + tAcademico
                 + tBienestar   + tOcioDigital + tOcioGeneral;

  // Tiempo libre neto (puede ser negativo: sobreocupación crítica)
  const tLibreNeto = CONFIG.totalHoras - tOcupado;

  // Segmento gráfico unificado (nunca negativo para Chart.js)
  const tOcioYLibre = Math.max(0, tOcioGeneral + tLibreNeto);

  // --------------------------------------------------------
  // 5. ACTUALIZAR TARJETAS DE RESULTADO
  // --------------------------------------------------------
  setResult('sleep',   hSleep,     'Descanso nocturno');
  setResult('study',   hStudy,     'Carga académica');
  setResult('transit', hTransit,   'Desplazamientos');
  setResult('food',    hFood,      'Alimentación');
  setResult('screen',  hScreen,    'Ocio digital');
  setResult('other',   tBienestar, 'Bienestar activo');   // reutiliza slot
  setResult('free',    Math.max(0, tLibreNeto), 'Tiempo libre neto');
  setResult('total',   tOcupado,   'Total ocupado');

  // --------------------------------------------------------
  // 6. MOSTRAR SECCIONES OCULTAS
  // --------------------------------------------------------
  document.querySelector('.results-section').classList.add('visible');
  document.querySelector('.chart-section').classList.add('visible');
  document.querySelector('.feedback-section').classList.add('visible');

  // --------------------------------------------------------
  // 7. GRÁFICO Y FEEDBACK
  // --------------------------------------------------------
  renderChart({ tEstructural, hTransit, tAcademico,
                tOcioDigital, tBienestar, tOcioYLibre });

  renderFeedback({
    tLibreNeto, tBienestar, tOcioDigital, tOcioGeneral,
    tAcademico, hTransit,
    sleep, credits,
    hPhysical, hSocial, hCreative, hMindful
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
    usuario_id:     null,
    sleep_h:        hSleep,
    food_h:         hFood,
    transit_h:      hTransit,
    grooming_h:     hGrooming,
    house_tasks_h:  hHouseTasks,
    study_h:        hStudy,
    other_h:        hOther,
    screen_h:       hScreen,
    physical_h:     hPhysical,
    social_h:       hSocial,
    creative_h:     hCreative,
    mindful_h:      hMindful,
    leisure_h:      hLeisure,
    available_time: Math.max(0, tLibreNeto),
    wellbeing_time: tBienestar,
    occupied_time:  tOcupado,
  });
}

/* ----------------------------------------------------------
   SUPABASE: guardar registro anónimo en registros_bienestar
   usuario_id es null literal para evitar errores de tipo UUID.
---------------------------------------------------------- */
async function saveToSupabase(data) {
  try {
    const { error } = await supabase
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
function renderChart({ tEstructural, hTransit, tAcademico,
                        tOcioDigital, tBienestar, tOcioYLibre }) {

  const ctx = document.getElementById('weekChart').getContext('2d');

  const CATEGORIAS = [
    {
      label: 'Descanso y Cuidado',
      value: tEstructural,
      color: '#27546c',
      desc:  'Sueño, alimentación, higiene y hogar'
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
      desc:  'Carga académica y compromisos fijos'
    },
    {
      label: 'Ocio Digital',
      value: tOcioDigital,
      color: '#ffccc9',
      desc:  'Redes sociales, streaming, scroll'
    },
    {
      label: 'Bienestar Activo',
      value: tBienestar,
      color: '#a8d5a2',
      desc:  'Deporte, vínculos, arte, mindfulness'
    },
    {
      label: 'Ocio y Balance Libre',
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
  tLibreNeto, tBienestar, tOcioDigital, tOcioGeneral,
  tAcademico, hTransit,
  sleep, credits,
  hPhysical, hSocial, hCreative, hMindful
}) {
  const cards = [];

  // ——————————————————————————————————————————————
  // A. EQUILIBRIO GENERAL: tiempo libre neto
  // ——————————————————————————————————————————————
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
  } else if (tLibreNeto < 10) {
    cards.push({
      type: 'warn', icon: '⏳',
      title: 'Tu margen de descanso es muy estrecho',
      body: `Solo tienes ${fmt(tLibreNeto)} horas semanales sin ningún compromiso asignado.
             El descanso no es un premio al final del trabajo: es el tejido que hace
             sostenible todo lo demás.
             Incluso pequeños cambios —una tarde libre, salir a caminar sin destino—
             pueden marcar una diferencia real en cómo te sientes.`
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
  // C. BIENESTAR ACTIVO: indicador central de RAPsi
  // ——————————————————————————————————————————————
  if (tBienestar < 5) {
    cards.push({
      type: 'warn', icon: '💜',
      title: 'Tu tiempo de autocuidado activo es muy bajo',
      body: `Solo ${fmt(tBienestar)} horas semanales entre deporte, socialización,
             creatividad y contemplación es poco para sostener el bienestar emocional
             a lo largo del semestre.
             No necesitas grandes bloques de tiempo: 20 minutos de movimiento,
             una llamada con alguien que quieres, o dibujar algo sin propósito
             ya son actos de autocuidado con impacto real.`
    });
  } else if (tBienestar < 10) {
    cards.push({
      type: 'info', icon: '🌱',
      title: 'Tu bienestar activo tiene espacio para crecer',
      body: `Inviertes ${fmt(tBienestar)} horas semanales en actividades que te nutren.
             Es un buen punto de partida. Intenta identificar cuál de las cuatro dimensiones
             (movimiento, vínculos, creatividad, introspección) está más descuidada
             y dale un poco más de lugar esta semana.`
    });
  } else {
    cards.push({
      type: 'ok', icon: '💪',
      title: `${fmt(tBienestar)} horas de autocuidado activo — muy bien`,
      body: `Estás dedicando un tiempo significativo a actividades que te sostienen.
             Ese equilibrio entre la exigencia académica y el cuidado de ti mismo/a
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
  // E. BIENESTAR POR DIMENSIONES: alertas si alguna está en 0
  // ——————————————————————————————————————————————
  if (hPhysical === 0) {
    cards.push({
      type: 'info', icon: '🚶',
      title: 'Sin movimiento registrado esta semana',
      body: `No tienes ninguna actividad física anotada. El cuerpo y la mente son
             inseparables: la evidencia muestra que incluso 20–30 minutos de caminata
             reducen el cortisol (hormona del estrés) y mejoran la concentración.
             No necesitas un gimnasio ni un plan: solo moverte con intención.`
    });
  }

  if (hSocial === 0) {
    cards.push({
      type: 'info', icon: '👥',
      title: 'Sin tiempo de conexión social registrado',
      body: `La soledad académica es uno de los factores de riesgo más subestimados
             en la vida universitaria. No tener ningún espacio de socialización intencional
             esta semana es algo que vale la pena notar.
             Un café con alguien, participar en un grupo, o incluso escribirle
             a una persona que hace tiempo no contactas puede hacer diferencia.`
    });
  }

  if (hCreative === 0 && hMindful === 0) {
    cards.push({
      type: 'info', icon: '🎨',
      title: 'Sin tiempo para la expresión o la introspección',
      body: `No hay espacio registrado para creatividad ni para mindfulness esta semana.
             Estas actividades no son accesorios: son los espacios donde procesamos
             lo que vivimos, nos reconectamos con quiénes somos más allá del rol
             de "estudiante" y recuperamos sentido.
             No hace falta que sea sofisticado: escribir en un cuaderno,
             sentarse en silencio cinco minutos o dibujar algo sin terminar ya cuenta.`
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
           Si algo de lo que viste hoy te inquieta, RAPsi está disponible para
           acompañarte a explorarlo.`
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
    'sleep', 'food', 'transit', 'grooming', 'house_tasks',
    'screen',
    'physical_activity', 'social_activity',
    'creative_activity', 'mindfulness', 'leisure'
  ].forEach(syncRange);

  // Reflejar la regla de créditos en el hint del formulario
  const hpcLabel = document.getElementById('hpc-label');
  if (hpcLabel) hpcLabel.textContent = CONFIG.horasPorCredito + ' h';
});
