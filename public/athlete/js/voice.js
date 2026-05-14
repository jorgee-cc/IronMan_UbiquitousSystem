var VoiceControl = (function () {

  var recognition = null;
  var isListening = false;
  var currentStage = 'cycling';

  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  var COMMANDS = {
    agua:     requestWater,
    ayuda:    requestSOS,
    ok:       confirmOK,
    bien:     confirmOK,
    cancelar: cancelSOS,
  };

  function requestWater() {
    SocketClient.emit('request_supply', { type: 'agua', stage: currentStage, trigger: 'voz' });
    UI.showToast('Avituallamiento solicitado', 'ok');
  }

  function requestSOS() {
    SocketClient.emit('trigger_sos', { trigger: 'voz', stage: currentStage });
    UI.showToast('SOS por voz activado', 'emergency');
  }

  function confirmOK() {
    SocketClient.emit('confirm_ok');
    UI.showToast('Estado confirmado: OK', 'ok');
  }

  function cancelSOS() {
    SocketClient.emit('cancel_sos');
    UI.showToast('SOS cancelado', 'info');
  }

  function processTranscript(transcript) {
    var text = transcript.toLowerCase().trim();
    UI.setVoiceFeedback(true, '"' + text + '"');

    var keys = Object.keys(COMMANDS);
    for (var i = 0; i < keys.length; i++) {
      if (text.indexOf(keys[i]) !== -1) {
        COMMANDS[keys[i]]();
        return;
      }
    }
  }

  function init() {
    if (!SpeechRecognition) {
      console.warn('[VOICE] Web Speech API no disponible en este navegador');
      return false;
    }

    recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = function (event) {
      var last = event.results[event.results.length - 1];
      if (last.isFinal) {
        processTranscript(last[0].transcript);
      }
    };

    recognition.onerror = function (event) {
      if (event.error !== 'no-speech') {
        console.error('[VOICE] Error:', event.error);
        UI.showToast('Error en reconocimiento de voz: ' + event.error, 'warning');
      }
    };

    recognition.onend = function () {
      if (isListening) recognition.start();
    };

    return true;
  }

  function toggle(btnElement) {
    if (!recognition) {
      var ok = init();
      if (!ok) {
        UI.showToast('Reconocimiento de voz no disponible en este navegador', 'warning');
        return;
      }
    }

    if (isListening) {
      recognition.stop();
      isListening = false;
      btnElement.textContent = 'Activar microfono';
      btnElement.classList.remove('active');
      UI.setVoiceFeedback(false);
    } else {
      recognition.start();
      isListening = true;
      btnElement.textContent = 'Desactivar microfono';
      btnElement.classList.add('active');
      UI.setVoiceFeedback(true, 'Esperando comando...');
    }
  }

  function setStage(stage) {
    currentStage = stage;
  }

  return { toggle: toggle, setStage: setStage };

})();