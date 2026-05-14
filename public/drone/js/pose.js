var PoseDetection = (function () {

  // ── Constantes de deteccion ────────────────────────────────
  // Indices de landmarks de MediaPipe Pose relevantes para el gesto
  var LANDMARK = {
    LEFT_SHOULDER:  11,
    RIGHT_SHOULDER: 12,
    LEFT_WRIST:     15,
    RIGHT_WRIST:    16,
  };

  // Margen en coordenadas normalizadas (0-1) que la muñeca debe
  // superar por encima del hombro para considerar el brazo levantado.
  // 0.15 equivale a aproximadamente el 15% de la altura de la imagen,
  // suficiente para distinguir una brazada de un gesto de socorro.
  var RAISE_MARGIN = 0.15;

  // Segundos que el gesto debe mantenerse antes de activar el SOS.
  // 3 segundos evitan activaciones accidentales durante la natacion.
  var REQUIRED_SECONDS = 3;

  // Tiempo de cooldown tras una activacion para evitar envios repetidos.
  var COOLDOWN_MS = 15000;

  // ── Estado interno ─────────────────────────────────────────
  var pose           = null;   // instancia de MediaPipe Pose
  var videoEl        = null;   // video del stream ya abierto por Camera.start()
  var isInitialized  = false;
  var isRunning      = false;
  var isSendingFrame = false;
  var rafId          = null;
  var gestureStartMs = null;   // timestamp de inicio del gesto detectado
  var inCooldown     = false;
  var currentStage   = 'cycling';
  var countdownInterval = null;

  // Referencias al DOM del panel de pose
  var poseStatusEl   = document.getElementById('pose-status');
  var countdownEl    = document.getElementById('gesture-countdown');
  var countdownValEl = document.getElementById('countdown-value');

  // ── Logica de deteccion del gesto ──────────────────────────

  // Determina si los landmarks indican que un brazo esta levantado.
  // Devuelve true si la muñeca izquierda O la muñeca derecha esta
  // por encima del hombro correspondiente mas el margen definido.
  function isArmRaised(landmarks) {
    var ls = landmarks[LANDMARK.LEFT_SHOULDER];
    var rs = landmarks[LANDMARK.RIGHT_SHOULDER];
    var lw = landmarks[LANDMARK.LEFT_WRIST];
    var rw = landmarks[LANDMARK.RIGHT_WRIST];

    // Comprueba que los landmarks tienen visibilidad suficiente.
    // MediaPipe asigna un valor de visibilidad entre 0 y 1.
    // Un landmark con visibilidad menor de 0.5 no es fiable.
    var leftVisible  = ls.visibility > 0.5 && lw.visibility > 0.5;
    var rightVisible = rs.visibility > 0.5 && rw.visibility > 0.5;

    // En coordenadas normalizadas, Y crece hacia abajo.
    // Una muñeca levantada tiene Y menor que el hombro.
    // Se resta el margen para exigir que el brazo este
    // claramente levantado y no solo al nivel del hombro.
    var leftRaised  = leftVisible  && (lw.y < ls.y - RAISE_MARGIN);
    var rightRaised = rightVisible && (rw.y < rs.y - RAISE_MARGIN);

    return leftRaised || rightRaised;
  }

  // Inicia el contador regresivo visual en el panel de pose
  function startCountdown() {
    var remaining = REQUIRED_SECONDS;
    countdownEl.classList.remove('hidden');
    countdownValEl.textContent = remaining + 's';

    countdownInterval = setInterval(function () {
      remaining--;
      countdownValEl.textContent = remaining + 's';
      if (remaining <= 0) stopCountdown();
    }, 1000);
  }

  function stopCountdown() {
    clearInterval(countdownInterval);
    countdownInterval = null;
    countdownEl.classList.add('hidden');
  }

  // Activa el protocolo de socorro y envia el evento al servidor
  function triggerRaisedArm() {
    inCooldown = true;
    gestureStartMs = null;
    stopCountdown();

    // Notifica al servidor con el trigger y la etapa actual
    SocketClient.emit('raised_arm_detected', {
      trigger:  'mediapipe-pose',
      stage:    currentStage,
      duration: REQUIRED_SECONDS,
    });

    // Actualiza el panel de pose para indicar que se ha activado
    poseStatusEl.textContent = 'Gesto confirmado – SOS enviado';
    poseStatusEl.className   = '';

    // Muestra el panel de alerta en la vista del dron
    Overlay.showAlert('BRAZO LEVANTADO', 'Gesto de socorro detectado – asistencia en camino');

    // El cooldown evita que el mismo gesto se envie multiples veces
    setTimeout(function () {
      inCooldown = false;
      poseStatusEl.textContent = 'Pose: activa';
      poseStatusEl.className   = 'active';
      Overlay.clearAlert();
    }, COOLDOWN_MS);
  }

  // ── Callback de resultados de MediaPipe ────────────────────

  // Se llama en cada fotograma procesado por MediaPipe Pose.
  // Recibe el objeto de resultados con los landmarks detectados.
  function onResults(results) {
    var canvas = document.getElementById('overlay-canvas');
    var ctx    = canvas.getContext('2d');

    // Limpia el canvas antes de dibujar el nuevo fotograma
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Si no se detecta ningun cuerpo en el fotograma, resetea el gesto
    if (!results.poseLandmarks) {
      if (currentStage === 'cycling') {
        FaceDetection.handlePoseMissing();
        return;
      }

      if (gestureStartMs !== null) {
        gestureStartMs = null;
        stopCountdown();
        poseStatusEl.textContent = 'Pose: buscando atleta...';
        poseStatusEl.className   = 'active';
      }
      return;
    }

    // Dibuja el esqueleto del atleta sobre el canvas usando
    // las utilidades de dibujo de MediaPipe.
    // Se dibujan primero las conexiones (huesos) y luego los puntos.
    drawConnectors(
      ctx,
      results.poseLandmarks,
      POSE_CONNECTIONS,
      { color: 'rgba(249, 115, 22, 0.6)', lineWidth: 2 }
    );

    drawLandmarks(
      ctx,
      results.poseLandmarks,
      { color: 'rgba(249, 115, 22, 0.9)', lineWidth: 1, radius: 3 }
    );

    // En ciclismo usamos el mismo pipeline de Pose para extraer
    // el gesto de mano cerca de la boca. Asi evitamos cargar
    // un segundo modelo.
    if (currentStage === 'cycling') {
      FaceDetection.processPoseLandmarks(results.poseLandmarks);
      return;
    }

    // Si estamos en cooldown no procesa el gesto
    if (inCooldown) return;

    var armed = isArmRaised(results.poseLandmarks);
    var now   = Date.now();

    if (armed) {
      if (gestureStartMs === null) {
        // Primera deteccion del gesto: inicia el cronometro
        gestureStartMs = now;
        startCountdown();
        poseStatusEl.textContent = 'Brazo detectado – manteniendo...';
        poseStatusEl.className   = 'detecting';
      } else {
        // El gesto se mantiene: comprueba si ha pasado el tiempo requerido
        var elapsed = (now - gestureStartMs) / 1000;
        if (elapsed >= REQUIRED_SECONDS) {
          triggerRaisedArm();
        }
      }
    } else {
      // El gesto se interrumpio antes del tiempo requerido
      if (gestureStartMs !== null) {
        gestureStartMs = null;
        stopCountdown();
        poseStatusEl.textContent = 'Pose: activa';
        poseStatusEl.className   = 'active';
      }
    }
  }

  // ── Inicializacion de MediaPipe ────────────────────────────

  function detectLoop() {
    if (!isRunning || !pose || !videoEl) return;

    if (!isSendingFrame && videoEl.readyState >= 2) {
      isSendingFrame = true;
      pose.send({ image: videoEl })
        .catch(function (err) {
          console.warn('[POSE] Error procesando frame:', err);
        })
        .finally(function () {
          isSendingFrame = false;
        });
    }

    rafId = requestAnimationFrame(detectLoop);
  }

  function startLoop() {
    if (isRunning || !isInitialized) return;
    isRunning = true;
    poseStatusEl.textContent = 'Pose: activa';
    poseStatusEl.className   = 'active';
    detectLoop();
  }

  function stopLoop() {
    isRunning = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    isSendingFrame = false;
  }

  function init(videoElement) {
    videoEl = videoElement;

    if (isInitialized) {
      startLoop();
      return;
    }

    poseStatusEl.textContent = 'Pose: iniciando...';
    poseStatusEl.className   = '';

    try {
      // En Android es mas estable procesar frames del stream ya abierto
      // en lugar de crear una segunda captura con MediaPipe Camera.
      pose = new Pose({
        locateFile: function (file) {
          return 'https://cdn.jsdelivr.net/npm/@mediapipe/pose/' + file;
        },
      });

      pose.setOptions({
        modelComplexity: 0,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.5,
      });

      pose.onResults(onResults);
      isInitialized = true;
      startLoop();
      console.log('[POSE] Inicializado correctamente');
    } catch (err) {
      console.error('[POSE] Error al inicializar Pose:', err);
      poseStatusEl.textContent = 'Pose: error al iniciar';
    }
  }

  function setStage(stage) {
    currentStage = stage;
  }

  // Se llama cuando la etapa cambia a ciclismo.
  function pause() {
    stopLoop();
    stopCountdown();
    gestureStartMs = null;
    console.log('[POSE] Loop de deteccion pausado');
  }

  // Se llama cuando la etapa pasa a natacion/carrera.
  function resume() {
    if (!isInitialized) return;
    startLoop();
    console.log('[POSE] Loop de deteccion reanudado');
  }

  return {
    init:    init,
    setStage: setStage,
    pause:   pause,
    resume:  resume,
  };

})();