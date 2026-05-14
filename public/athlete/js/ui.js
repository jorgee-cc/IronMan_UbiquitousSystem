var UI = (function () {

  var els = {
    connectionDot:   document.getElementById('connection-status'),
    systemBadge:     document.getElementById('system-status'),
    hrValue:         document.getElementById('hr-value'),
    hrStatus:        document.getElementById('hr-status'),
    stageButtons:    document.querySelectorAll('.stage-btn'),
    gestureSection:  document.getElementById('gesture-section'),
    voiceFeedback:   document.getElementById('voice-feedback'),
    voiceTranscript: document.getElementById('voice-transcript'),
    fallStatus:      document.getElementById('fall-detection-status'),
    gestureStatus:   document.getElementById('gesture-status'),
  };

  var STATUS_LABELS = {
    ok:        { label: 'Normal',  hrClass: 'ok' },
    warning:   { label: 'Elevada', hrClass: 'warning' },
    emergency: { label: 'Critica', hrClass: 'emergency' },
  };

  var BADGE_LABELS = { ok: 'OK', warning: 'ALERTA', emergency: 'SOS' };

  function setConnectionStatus(connected) {
    els.connectionDot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
  }

  function setSystemStatus(status) {
    els.systemBadge.className = 'system-badge ' + status;
    els.systemBadge.textContent = BADGE_LABELS[status] || status.toUpperCase();
  }

  function updateHeartRate(bpm, status) {
    var info = STATUS_LABELS[status] || STATUS_LABELS.ok;
    els.hrValue.textContent = bpm;
    els.hrValue.className = info.hrClass;
    els.hrStatus.textContent = info.label;
    setSystemStatus(status);
  }

  function updateStage(stage) {
    els.stageButtons.forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.stage === stage);
    });
    els.gestureSection.classList.toggle('hidden', stage !== 'cycling');
  }

  function syncState(state) {
    updateStage(state.stage);
    updateHeartRate(state.heartRate, state.status);
  }

  function setVoiceFeedback(active, transcript) {
    els.voiceFeedback.classList.toggle('hidden', !active);
    els.voiceTranscript.textContent = transcript || '';
  }

  function setFallDetectionStatus(active, alert) {
    if (alert) {
      els.fallStatus.textContent = 'Caida detectada';
      els.fallStatus.className = 'alert';
    } else if (active) {
      els.fallStatus.textContent = 'Deteccion activa';
      els.fallStatus.className = 'active';
    } else {
      els.fallStatus.textContent = 'Deteccion de caida: inactiva';
      els.fallStatus.className = '';
    }
  }

  function setGestureStatus(text) {
    els.gestureStatus.textContent = text;
  }

  var toastTimeout = null;

  function showToast(message, type) {
    var existing = document.querySelector('.toast');
    if (existing) existing.remove();
    if (toastTimeout) clearTimeout(toastTimeout);

    var toast = document.createElement('div');
    toast.className = 'toast ' + (type || 'info');
    toast.textContent = message;
    document.body.appendChild(toast);

    toastTimeout = setTimeout(function () { toast.remove(); }, 3500);
  }

  return {
    setConnectionStatus: setConnectionStatus,
    setSystemStatus:     setSystemStatus,
    updateHeartRate:     updateHeartRate,
    updateStage:         updateStage,
    syncState:           syncState,
    setVoiceFeedback:    setVoiceFeedback,
    setFallDetectionStatus: setFallDetectionStatus,
    setGestureStatus:    setGestureStatus,
    showToast:           showToast,
  };

})();