var Overlay = (function () {

  var canvas    = document.getElementById('overlay-canvas');
  var ctx       = canvas.getContext('2d');
  var alertEl   = document.getElementById('alert-panel');
  var stageEl   = document.getElementById('stage-label');

  // Estado interno del overlay
  var state = {
    isAlert:   false,     // true si hay una alerta activa
    alertType: 'ok',      // 'ok' | 'warning' | 'emergency'
    animFrame: 0,         // contador de frames para la animacion
  };

  // Colores de alerta segun el tipo
  var ALERT_COLORS = {
    ok:        'rgba(34, 197, 94, 0)',    // sin overlay en estado normal
    warning:   'rgba(245, 158, 11, 0.2)',
    emergency: 'rgba(239, 68, 68, 0.35)',
  };

  // Nombres de etapa para mostrar en el header
  var STAGE_LABELS = {
    swimming: 'Natacion',
    cycling:  'Ciclismo',
    running:  'Carrera',
  };

  // ── Loop de animacion ──────────────────────────────────────

  // Se ejecuta en cada frame del navegador (aprox. 60 fps).
  // Solo dibuja algo cuando hay una alerta activa para no
  // consumir recursos innecesariamente en estado normal.
  function animate() {
    requestAnimationFrame(animate);

    // Limpia el canvas en cada frame
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!state.isAlert) return;

    state.animFrame++;

    // Efecto de parpadeo: alterna la opacidad cada 30 frames (0.5s a 60fps)
    // Esto reproduce el efecto de "luz roja parpadeante" del Storyboard
    var visible = Math.floor(state.animFrame / 30) % 2 === 0;
    if (!visible) return;

    // Dibuja un borde de color que cubre todo el perimetro del canvas.
    // El strokeStyle usa el color definido para el tipo de alerta pero
    // con opacidad completa para el borde.
    var borderColor = state.alertType === 'emergency'
      ? 'rgba(239, 68, 68, 0.9)'
      : 'rgba(245, 158, 11, 0.9)';

    ctx.strokeStyle = borderColor;
    ctx.lineWidth   = 18;

    // Se inset el rect 9px para que el borde quede dentro del canvas
    ctx.strokeRect(9, 9, canvas.width - 18, canvas.height - 18);

    // Relleno semitransparente sobre toda la pantalla para el efecto de tinte
    ctx.fillStyle = ALERT_COLORS[state.alertType] || ALERT_COLORS.emergency;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // ── API publica ────────────────────────────────────────────

  // Ajusta el canvas a las dimensiones reales del video
  // para que los overlays coincidan exactamente con el feed
  function resizeCanvas(w, h) {
    canvas.width  = w || window.innerWidth;
    canvas.height = h || window.innerHeight;
  }

  // Activa el overlay de alerta y muestra el panel central
  function showAlert(title, message) {
    state.isAlert   = true;
    state.alertType = 'emergency';
    state.animFrame = 0;

    // Actualiza el contenido del panel de alerta central
    document.getElementById('alert-title').textContent   = title   || 'ALERTA';
    document.getElementById('alert-message').textContent = message || '';

    alertEl.classList.remove('hidden');
  }

  // Limpia el overlay y oculta el panel de alerta
  function clearAlert() {
    state.isAlert   = false;
    state.alertType = 'ok';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    alertEl.classList.add('hidden');
  }

  // Actualiza la etiqueta de etapa en el header
  function updateStage(stage) {
    stageEl.textContent = STAGE_LABELS[stage] || stage;
  }

  // Inicia el loop de animacion.
  // Se llama una sola vez desde app.js al arrancar el sistema.
  function start() {
    // Ajusta el canvas al tamaño de la ventana en la carga inicial
    // antes de que el video este disponible
    resizeCanvas(window.innerWidth, window.innerHeight);

    // Reajusta el canvas si el usuario rota el dispositivo
    window.addEventListener('resize', function () {
      resizeCanvas(window.innerWidth, window.innerHeight);
    });

    animate();
  }

  return {
    start:        start,
    resizeCanvas: resizeCanvas,
    showAlert:    showAlert,
    clearAlert:   clearAlert,
    updateStage:  updateStage,
  };

})();