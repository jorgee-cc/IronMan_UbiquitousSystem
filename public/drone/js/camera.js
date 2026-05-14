var Camera = (function () {

  // Referencia al elemento video del DOM
  var videoEl = document.getElementById('camera-feed');

  // Guardamos referencia al track de video activo para poder
  // acceder a la constraint 'torch' posteriormente.
  // Es null hasta que getUserMedia resuelve con exito.
  var videoTrack = null;

  // Identificador del intervalo de parpadeo.
  // Se guarda para poder detenerlo cuando la emergencia se cancela.
  var torchInterval  = null;

  // Estado actual de la linterna para alternarla en cada tick
  var torchState     = false;

  function start(callback) {

    // Comprobacion de soporte: getUserMedia no esta disponible
    // en todos los navegadores ni en contextos no seguros (sin HTTPS)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('[CAMERA] getUserMedia no disponible');
      if (callback) callback(false, 'API no disponible en este navegador');
      return;
    }

    // Configuracion del stream: se pide la camara trasera (environment)
    // con la resolucion ideal de 1280x720.
    // Si el dispositivo no soporta esa resolucion, el navegador
    // elige la mas cercana disponible automaticamente.
    var constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false, // no se necesita audio
    };

    navigator.mediaDevices.getUserMedia(constraints)
      .then(function (stream) {
        videoEl.srcObject = stream;

        // Guardamos el track de video para poder acceder a la
        // linterna (torch) mas adelante en emergencias
        var tracks = stream.getVideoTracks();
        if (tracks.length > 0) {
          videoTrack = tracks[0];
        }

        // Algunos navegadores moviles no disparan loadedmetadata de forma
        // consistente en streams en vivo. Usamos varias vias para confirmar
        // que el video esta listo y evitar que la app quede en "Pose: inactiva".
        var readyNotified = false;
        function notifyReady() {
          if (readyNotified) return;
          readyNotified = true;
          Overlay.resizeCanvas(window.innerWidth, window.innerHeight);
          if (callback) callback(true);
        }

        videoEl.addEventListener('loadedmetadata', notifyReady, { once: true });
        videoEl.addEventListener('canplay', notifyReady, { once: true });

        // Si el stream ya tiene metadatos, no esperamos eventos.
        if (videoEl.readyState >= 1) {
          notifyReady();
        }

        // En iOS/Android es mas robusto forzar play() tras el gesto del boton.
        videoEl.play()
          .then(notifyReady)
          .catch(function () {
            // Si play() falla, mantenemos los listeners y un fallback temporal.
          });

        // Fallback defensivo: evita bloqueo si el navegador omite eventos.
        setTimeout(notifyReady, 1500);
      })
      .catch(function (err) {
        console.error('[CAMERA] Error al acceder a la camara:', err);
        var msg = err.name === 'NotAllowedError'
          ? 'Permiso de camara denegado'
          : 'No se pudo acceder a la camara: ' + err.message;
        if (callback) callback(false, msg);
      });
  }

  function stop() {
    // Detiene todos los tracks del stream para liberar la camara
    // y apagar el indicador de camara activa del dispositivo
    if (videoEl.srcObject) {
      videoEl.srcObject.getTracks().forEach(function (track) {
        track.stop();
      });
      videoEl.srcObject = null;
    }
  }

    // ── Control de linterna ────────────────────────────────────

  // Aplica la constraint torch al track de video activo.
  // El valor true enciende la linterna y false la apaga.
  // Se envuelve en try/catch porque algunos dispositivos Android
  // lanzan un error si torch no esta soportado en ese hardware concreto.
  function setTorch(value) {
    if (!videoTrack) {
      console.warn('[TORCH] No hay track de video activo');
      return;
    }

    videoTrack.applyConstraints({ advanced: [{ torch: value }] })
      .catch(function (err) {
        console.warn('[TORCH] No se pudo cambiar el estado de la linterna:', err);
      });
  }

  // Inicia el parpadeo de la linterna con un intervalo de 1 segundo.
  // Si ya hay un parpadeo activo no hace nada para evitar intervalos duplicados.
  function startTorch() {
    if (torchInterval) return;

    // Enciende la linterna inmediatamente sin esperar al primer tick
    torchState = true;
    setTorch(true);

    torchInterval = setInterval(function () {
      // Alterna el estado en cada tick del intervalo
      torchState = !torchState;
      setTorch(torchState);
    }, 1000);

    console.log('[TORCH] Parpadeo activado');
  }

  // Detiene el parpadeo y apaga la linterna.
  // Se llama cuando el atleta confirma que esta bien o cancela el SOS.
  function stopTorch() {
    if (torchInterval) {
      clearInterval(torchInterval);
      torchInterval = null;
    }

    // Asegura que la linterna queda apagada al detener el parpadeo
    torchState = false;
    setTorch(false);

    console.log('[TORCH] Parpadeo desactivado');
  }

  return {
    start:      start,
    stop:       stop,
    startTorch: startTorch,
    stopTorch:  stopTorch,
  };

})();