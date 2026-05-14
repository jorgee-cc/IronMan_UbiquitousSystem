var UI = (function () {

  // Referencias a los elementos del DOM que se actualizan con frecuencia.
  // Se guardan en variables para no llamar a getElementById en cada evento.
  var els = {
    connectionDot:    document.getElementById('connection-status'),
    systemStatusCard: document.getElementById('system-status-display'),
    systemStatusLabel:document.getElementById('system-status-label'),
    hrValue:          document.getElementById('hr-value'),
    hrBar:            document.getElementById('hr-bar'),
    hrClassification: document.getElementById('hr-classification'),
    lastEventTime:    document.getElementById('last-event-time'),
    lastEventMessage: document.getElementById('last-event-message'),
    eventLog:         document.getElementById('event-log'),
    stageIndicators:  document.querySelectorAll('.stage-indicator'),
  };

  // Etiquetas de estado para mostrar en la tarjeta principal
  var STATUS_LABELS = {
    ok:        'NORMAL',
    warning:   'ALERTA',
    emergency: 'SOS',
  };

  // Etiquetas del tipo de evento para mostrar en el log
  var TYPE_LABELS = {
    info:      'Info',
    ok:        'OK',
    warning:   'Alerta',
    emergency: 'SOS',
  };

  // Clasificacion textual de la frecuencia cardiaca
  var HR_CLASSIFICATIONS = [
    { max: 100, label: 'Reposo',    status: 'ok' },
    { max: 140, label: 'Moderada',  status: 'ok' },
    { max: 170, label: 'Intensa',   status: 'ok' },
    { max: 190, label: 'Elevada',   status: 'warning' },
    { max: 220, label: 'Critica',   status: 'emergency' },
  ];

  function setConnectionStatus(connected) {
    els.connectionDot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
  }

  function setSystemStatus(status) {
    // Actualiza el color y texto de la tarjeta de estado principal
    els.systemStatusCard.className  = 'status-display ' + (status || 'ok');
    els.systemStatusLabel.textContent = STATUS_LABELS[status] || status.toUpperCase();
  }

  function updateStage(stage) {
    // Elimina la clase 'active' de todos los indicadores
    // y la aplica solo al que corresponde a la etapa recibida
    els.stageIndicators.forEach(function (indicator) {
      indicator.classList.toggle('active', indicator.dataset.stage === stage);
    });
  }

  function updateHeartRate(bpm, status) {
    // Actualiza el valor numerico y su clase de color
    els.hrValue.textContent = bpm;
    els.hrValue.className   = 'metric-value ' + (status || 'ok');

    // Calcula el porcentaje de la barra dentro del rango fisiologico 40-220 bpm.
    // Clampea el valor para que nunca salga del rango visible.
    var pct = Math.min(100, Math.max(0, ((bpm - 40) / (220 - 40)) * 100));
    els.hrBar.style.width = pct + '%';

    // Asigna el color de la barra segun el estado
    var barColors = {
      ok:        'var(--color-ok)',
      warning:   'var(--color-warning)',
      emergency: 'var(--color-emergency)',
    };
    els.hrBar.style.background = barColors[status] || barColors.ok;

    // Busca la clasificacion textual correspondiente al valor de bpm
    var classification = HR_CLASSIFICATIONS.find(function (c) { return bpm <= c.max; });
    els.hrClassification.textContent = classification
      ? classification.label + ' (' + bpm + ' bpm)'
      : 'Fuera de rango';
  }

  function setLastEvent(log) {
    if (!log) return;

    // Actualiza la tarjeta de ultimo evento con los datos del log recibido
    els.lastEventTime.textContent    = log.timestamp || '--:--:--';
    els.lastEventMessage.textContent = log.message   || 'Sin descripcion';
  }

  function addLogEntry(log, animate) {
    if (!log) return;

    // Elimina el mensaje de "esperando eventos" la primera vez
    var emptyMsg = els.eventLog.querySelector('.log-empty');
    if (emptyMsg) emptyMsg.remove();

    // Crea el elemento de entrada del log
    var entry = document.createElement('div');

    /*
      La clase 'log-entry' base mas la clase del tipo
      (info / ok / warning / emergency) controla el color
      del borde izquierdo y la etiqueta de tipo.
      Si animate es false (restauracion del historial),
      se suprime la animacion para no hacer un destello
      al cargar multiples entradas de golpe.
    */
    entry.className = 'log-entry ' + (log.type || 'info') +
                      (animate === false ? ' no-animate' : '');

    // Columna 1: hora del evento
    var timeEl = document.createElement('span');
    timeEl.className   = 'log-entry-time';
    timeEl.textContent = log.timestamp || '--:--:--';

    // Columna 2: etiqueta del tipo de evento
    var typeEl = document.createElement('span');
    typeEl.className   = 'log-entry-type';
    typeEl.textContent = TYPE_LABELS[log.type] || log.type || 'Info';

    // Columna 3: mensaje del evento
    var msgEl = document.createElement('span');
    msgEl.className   = 'log-entry-message';
    msgEl.textContent = log.message || '';

    entry.appendChild(timeEl);
    entry.appendChild(typeEl);
    entry.appendChild(msgEl);

    // Inserta la nueva entrada al principio del log
    // para que el mas reciente siempre quede arriba
    els.eventLog.insertBefore(entry, els.eventLog.firstChild);
  }

  function clearLog() {
    // Vacia el log y restaura el mensaje inicial
    els.eventLog.innerHTML = '<div class="log-empty">Registro limpiado</div>';
  }

  return {
    setConnectionStatus: setConnectionStatus,
    setSystemStatus:     setSystemStatus,
    updateStage:         updateStage,
    updateHeartRate:     updateHeartRate,
    setLastEvent:        setLastEvent,
    addLogEntry:         addLogEntry,
    clearLog:            clearLog,
  };

})();