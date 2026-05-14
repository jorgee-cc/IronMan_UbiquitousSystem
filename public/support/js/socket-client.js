var SocketClient = (function () {

  var socket = io();

  var VALID_STAGES = { swimming: true, cycling: true, running: true };

  function changeStage(stage) {
    if (!VALID_STAGES[stage]) return;
    socket.emit('change_stage', stage);
  }

  function bindStageIndicators() {
    var indicators = document.querySelectorAll('.stage-indicator');
    indicators.forEach(function (el) {
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('title', 'Cambiar etapa del sistema');

      el.addEventListener('click', function () {
        var stage = el.dataset.stage;
        if (stage) changeStage(stage);
      });

      el.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          var stage = el.dataset.stage;
          if (stage) changeStage(stage);
        }
      });
    });
  }

  function init() {

    bindStageIndicators();

    // Al conectar, registra este cliente como 'support'
    socket.on('connect', function () {
      socket.emit('register', 'support');
      UI.setConnectionStatus(true);
    });

    socket.on('disconnect', function () {
      UI.setConnectionStatus(false);
    });

    // Sincronizacion inicial: recibe el estado actual del sistema
    // en caso de que este cliente se conecte tarde.
    // Tambien restaura el log de eventos previos.
    socket.on('state_sync', function (state) {
      UI.updateStage(state.stage);
      UI.updateHeartRate(state.heartRate, state.status);
      UI.setSystemStatus(state.status);

      // Restaura el historial de eventos recibido del servidor
      if (state.eventLog && state.eventLog.length > 0) {
        // El log del servidor esta ordenado del mas reciente al mas antiguo.
        // Se invierte para insertarlos en orden cronologico y que
        // el resultado final mantenga el mas reciente arriba.
        var reversed = state.eventLog.slice().reverse();
        reversed.forEach(function (entry) {
          UI.addLogEntry(entry, false); // false = sin animacion al restaurar
        });
      }
    });

    // Cambio de etapa del atleta
    socket.on('stage_changed', function (data) {
      UI.updateStage(data.stage);
      if (data.log) UI.addLogEntry(data.log);
    });

    // Actualizacion de frecuencia cardiaca
    socket.on('heart_rate_updated', function (data) {
      UI.updateHeartRate(data.bpm, data.status);
      UI.setSystemStatus(data.status);
      if (data.log) UI.addLogEntry(data.log);
    });

    // SOS activado por el atleta (boton, voz o gesto)
    socket.on('sos_activated', function (data) {
      UI.setSystemStatus('emergency');
      if (data.log) UI.addLogEntry(data.log);
      UI.setLastEvent(data.log);
    });

    // Caida o parada brusca detectada por DeviceMotion
    socket.on('fall_detected', function (data) {
      UI.setSystemStatus('emergency');
      if (data.log) UI.addLogEntry(data.log);
      UI.setLastEvent(data.log);
    });

    // Brazo levantado detectado por la camara del dron
    socket.on('raised_arm_detected', function (data) {
      UI.setSystemStatus('emergency');
      if (data.log) UI.addLogEntry(data.log);
      UI.setLastEvent(data.log);
    });

    // El atleta confirma que esta bien
    socket.on('status_ok', function (data) {
      UI.setSystemStatus('ok');
      if (data.log) UI.addLogEntry(data.log);
      UI.setLastEvent(data.log);
    });

    // SOS cancelado por el atleta
    socket.on('sos_cancelled', function (data) {
      UI.setSystemStatus('ok');
      if (data.log) UI.addLogEntry(data.log);
      UI.setLastEvent(data.log);
    });

    // Peticion de avituallamiento por voz
    socket.on('supply_requested', function (data) {
      if (data.log) UI.addLogEntry(data.log);
      UI.setLastEvent(data.log);
    });
  }

  return { init: init, changeStage: changeStage };

})();