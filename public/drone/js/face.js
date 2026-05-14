// Controlador de gesto de ciclismo basado en FaceMesh.
//
// Detecta cuando el atleta abre la boca durante 2 segundos para solicitar agua.
// Usa MediaPipe FaceMesh independientemente del modelo Pose, con su propio
// loop de deteccion sobre el mismo elemento <video>.
//
// Landmarks de FaceMesh utilizados:
//   13  → labio superior interior
//   14  → labio inferior interior
//   78  → comisura izquierda
//   308 → comisura derecha
//
// MAR (Mouth Aspect Ratio) = dist(13,14) / dist(78,308)
// Si MAR >= MAR_THRESHOLD durante HOLD_MS → solicita agua.

var FaceDetection = (function () {

  // ── Parámetros del gesto ────────────────────────────────────────────────

  // Tiempo mínimo que la boca debe permanecer abierta (ms)
  var HOLD_MS = 2000;

  // MAR mínimo para considerar la boca "abierta".
  // Empíricamente: boca cerrada ≈ 0.10-0.20, boca abierta ≈ 0.35+
  var MAR_THRESHOLD = 0.35;

  // Cooldown tras una activación para evitar envíos repetidos
  var COOLDOWN_MS = 10000;

  // Índices de landmarks relevantes
  var LM = { TOP: 13, BOTTOM: 14, LEFT: 78, RIGHT: 308 };

  // ── Estado interno ──────────────────────────────────────────────────────

  var faceMesh     = null;   // instancia de MediaPipe FaceMesh
  var videoEl      = null;   // referencia al <video> ya abierto por Camera
  var isActive     = false;
  var inCooldown   = false;
  var currentStage = 'cycling';
  var holdStartMs  = null;   // timestamp de inicio del gesto
  var rafId        = null;
  var isSending    = false;

  // ── Referencias DOM ─────────────────────────────────────────────────────

  var faceStatusEl = document.getElementById('face-status');
  var poseStatusEl = document.getElementById('pose-status');
  var counterPanel = document.getElementById('blink-counter');
  var counterLabel = document.getElementById('blink-label');
  var counterValue = document.getElementById('blink-value');

  // ── Geometría ───────────────────────────────────────────────────────────

  function dist(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Calcula el Mouth Aspect Ratio a partir de los landmarks de FaceMesh.
  // Devuelve 0 si el denominador es casi cero para evitar NaN/Inf.
  function computeMAR(landmarks) {
    var top    = landmarks[LM.TOP];
    var bottom = landmarks[LM.BOTTOM];
    var left   = landmarks[LM.LEFT];
    var right  = landmarks[LM.RIGHT];

    var vertical   = dist(top, bottom);
    var horizontal = dist(left, right);
    if (horizontal < 0.001) return 0;
    return vertical / horizontal;
  }

  // ── UI ──────────────────────────────────────────────────────────────────

  function showIdleStatus() {
    if (!faceStatusEl || inCooldown) return;
    faceStatusEl.textContent = 'Abre la boca para pedir agua';
    faceStatusEl.className   = 'active';
  }

  function showHoldUI(elapsedMs) {
    if (!faceStatusEl || inCooldown) return;

    var elapsed  = (Math.min(elapsedMs, HOLD_MS) / 1000).toFixed(1);
    var required = (HOLD_MS / 1000).toFixed(1);

    faceStatusEl.textContent = 'Mantén boca abierta (' + elapsed + ' / ' + required + 's)';
    faceStatusEl.className   = 'detecting';

    if (!counterPanel) return;
    counterPanel.classList.remove('hidden');
    if (counterLabel) counterLabel.textContent = 'Boca abierta';
    if (counterValue) counterValue.textContent = elapsed + ' / ' + required + 's';
  }

  function hideCounter() {
    if (!counterPanel) return;
    counterPanel.classList.add('hidden');
    if (counterLabel) counterLabel.textContent = 'Boca abierta';
    if (counterValue) counterValue.textContent = '0.0 / ' + (HOLD_MS / 1000).toFixed(1) + 's';
  }

  // ── Callback de FaceMesh ────────────────────────────────────────────────

  function onResults(results) {
    // Solo procesa si el módulo está activo, en ciclismo y sin cooldown
    if (!isActive || currentStage !== 'cycling' || inCooldown) return;

    // Sin cara detectada: resetea el gesto
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      holdStartMs = null;
      hideCounter();
      showIdleStatus();
      return;
    }

    var landmarks = results.multiFaceLandmarks[0];
    var mar       = computeMAR(landmarks);
    var now       = Date.now();

    if (mar >= MAR_THRESHOLD) {
      // Boca abierta: inicia o continúa el temporizador
      if (holdStartMs === null) {
        holdStartMs = now;
        showHoldUI(0);
      } else {
        var elapsed = now - holdStartMs;
        showHoldUI(elapsed);
        if (elapsed >= HOLD_MS) {
          triggerWaterRequest();
        }
      }
    } else {
      // Boca cerrada: resetea el gesto
      holdStartMs = null;
      hideCounter();
      showIdleStatus();
    }
  }

  // ── Solicitud de agua ───────────────────────────────────────────────────

  function triggerWaterRequest() {
    inCooldown  = true;
    holdStartMs = null;
    hideCounter();

    SocketClient.emit('request_supply', {
      type:    'agua',
      stage:   currentStage,
      trigger: 'abrir-boca-camara',
    });

    if (faceStatusEl) {
      faceStatusEl.textContent = 'Agua solicitada';
      faceStatusEl.className   = '';
    }

    console.log('[FACE] Solicitud de agua por boca abierta enviada');

    setTimeout(function () {
      inCooldown = false;
      if (isActive) showIdleStatus();
    }, COOLDOWN_MS);
  }

  // ── Loop de detección ───────────────────────────────────────────────────

  // Loop independiente de Pose: usa requestAnimationFrame para enviar
  // fotogramas al modelo FaceMesh a la cadencia del navegador.
  function detectLoop() {
    if (!isActive || !faceMesh || !videoEl) return;

    if (!isSending && videoEl.readyState >= 2) {
      isSending = true;
      faceMesh.send({ image: videoEl })
        .catch(function (err) {
          console.warn('[FACE] Error procesando frame:', err);
        })
        .finally(function () {
          isSending = false;
        });
    }

    rafId = requestAnimationFrame(detectLoop);
  }

  // ── API pública ─────────────────────────────────────────────────────────

  // Inicializa el modelo FaceMesh. Se llama desde app.js después de que
  // la cámara ya está activa, igual que PoseDetection.init(videoEl).
  function init(videoElement) {
    videoEl = videoElement;

    if (faceMesh) return; // ya inicializado

    try {
      faceMesh = new FaceMesh({
        locateFile: function (file) {
          return 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/' + file;
        },
      });

      faceMesh.setOptions({
        maxNumFaces:            1,
        refineLandmarks:        false,  // false = más rápido, suficiente para labios
        minDetectionConfidence: 0.5,
        minTrackingConfidence:  0.5,
      });

      faceMesh.onResults(onResults);
      console.log('[FACE] FaceMesh inicializado');
    } catch (err) {
      console.error('[FACE] Error al inicializar FaceMesh:', err);
    }
  }

  // Activa la detección: muestra el estado y arranca el loop propio.
  // Llamado desde app.js → switchDetectionMode cuando la etapa es 'cycling'.
  function start() {
    isActive    = true;
    holdStartMs = null;

    if (faceStatusEl) faceStatusEl.classList.remove('hidden');
    if (poseStatusEl) poseStatusEl.classList.add('hidden');

    showIdleStatus();
    detectLoop();
  }

  // Detiene el módulo: limpia el loop y resetea el estado.
  function stop() {
    isActive    = false;
    inCooldown  = false;
    holdStartMs = null;
    hideCounter();

    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    isSending = false;

    if (faceStatusEl) faceStatusEl.classList.add('hidden');
    if (poseStatusEl) poseStatusEl.classList.remove('hidden');
  }

  function setStage(stage) {
    currentStage = stage;
  }

  // Mantenidos por compatibilidad con pose.js que los llama en su onResults.
  // Con FaceMesh corriendo en su propio loop ya no son necesarios,
  // pero se conservan para no romper la interfaz existente.
  function processPoseLandmarks() {}
  function handlePoseMissing() {}

  return {
    init:                 init,
    start:                start,
    stop:                 stop,
    setStage:             setStage,
    processPoseLandmarks: processPoseLandmarks,
    handlePoseMissing:    handlePoseMissing,
  };

})();