var SocketClient = (function () {

  var socket = io();

  function init() {

    // Al conectar, registra este cliente como 'drone'
    // para que el servidor lo incluya en la room correcta
    socket.on('connect', function () {
      socket.emit('register', 'drone');
      setConnectionStatus(true);
    });

    socket.on('disconnect', function () {
      setConnectionStatus(false);
      // Apaga la linterna si se pierde la conexion para no
      // dejar el dispositivo con la linterna encendida indefinidamente
      Camera.stopTorch();
    });

    // Sincronizacion inicial: recibe el estado actual del sistema
    // por si este cliente se conecta cuando la sesion ya esta activa
    socket.on('state_sync', function (state) {
      Overlay.updateStage(state.stage);
      updateBiometrics(state.heartRate, state.status);

      if (state.status === 'emergency') {
        Camera.startTorch();
      }

      // Activa el modelo correcto segun la etapa en la que
      // ya estaba el sistema cuando este cliente se conecto
      switchDetectionMode(state.stage);
    });

    // Cambio de etapa: actualiza la etiqueta del header
    socket.on('stage_changed', function (data) {
      Overlay.updateStage(data.stage);
      switchDetectionMode(data.stage);
    });

    // Actualizacion de frecuencia cardiaca desde el atleta
    socket.on('heart_rate_updated', function (data) {
      updateBiometrics(data.bpm, data.status);
    });

    // SOS activado: enciende la linterna y muestra el panel de alerta
    socket.on('sos_activated', function (data) {
      Camera.startTorch();
      Overlay.showAlert('SOS ACTIVADO', data.log ? data.log.message : 'Protocolo de emergencia');
      setBadgeStatus('emergency');
    });

    // Caida detectada: misma respuesta que SOS
    socket.on('fall_detected', function (data) {
      Camera.startTorch();
      Overlay.showAlert('CAIDA DETECTADA', data.log ? data.log.message : 'Asistencia requerida');
      setBadgeStatus('emergency');
    });

    // Brazo levantado detectado por MediaPipe: misma respuesta que SOS
    socket.on('raised_arm_detected', function (data) {
      Camera.startTorch();
      Overlay.showAlert('BRAZO LEVANTADO', data.log ? data.log.message : 'Gesto de socorro detectado');
      setBadgeStatus('emergency');
    });

    // Atleta confirma que esta bien: apaga la linterna y limpia alertas
    socket.on('status_ok', function () {
      Camera.stopTorch();
      Overlay.clearAlert();
      setBadgeStatus('ok');
    });

    // SOS cancelado: misma accion que status_ok
    socket.on('sos_cancelled', function () {
      Camera.stopTorch();
      Overlay.clearAlert();
      setBadgeStatus('ok');
    });

  }

  // ── Funciones de utilidad del DOM ──────────────────────────

  function setConnectionStatus(connected) {
    var dot = document.getElementById('connection-status');
    dot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
  }

  function setBadgeStatus(status) {
    var badge = document.getElementById('system-status');
    var labels = { ok: 'OK', warning: 'ALERTA', emergency: 'SOS' };
    badge.className   = 'system-badge ' + status;
    badge.textContent = labels[status] || status.toUpperCase();
  }

  function updateBiometrics(bpm, status) {
    var hrEl = document.getElementById('hr-value');
    hrEl.textContent = bpm;
    hrEl.className   = status;

    var statusEl = document.getElementById('athlete-status');
    var statusLabels = { ok: 'Normal', warning: 'Elevada', emergency: 'Critica' };
    statusEl.textContent = statusLabels[status] || 'Desconocido';

    setBadgeStatus(status);
  }

  function emit(event, data) {
    socket.emit(event, data);
  }

  return { init: init, emit: emit };

})();