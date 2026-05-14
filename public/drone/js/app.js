// Cambia el modo de deteccion segun la etapa.
// MediaPipe Pose sigue activo en todas; en ciclismo delega en
// FaceDetection usando los landmarks de pose para detectar
// mano cerca de la boca, y en natacion/carrera usa brazo levantado.
// Se expone como global porque socket-client.js la necesita.
function switchDetectionMode(stage) {
  PoseDetection.setStage(stage);
  FaceDetection.setStage(stage);
  PoseDetection.resume();

  if (stage === 'cycling') {
    FaceDetection.start();
  } else {
    FaceDetection.stop();
  }
}

(function () {

  var btnStart   = document.getElementById('btn-start');
  var startPanel = document.getElementById('start-panel');

  Overlay.start();
  SocketClient.init();

  btnStart.addEventListener('click', function () {
    btnStart.disabled    = true;
    btnStart.textContent = 'Conectando camara...';

    Camera.start(function (success, errorMsg) {
      if (success) {
        startPanel.style.transition = 'opacity 0.5s';
        startPanel.style.opacity    = '0';
        setTimeout(function () {
          startPanel.classList.add('hidden');
        }, 500);

        var videoEl = document.getElementById('camera-feed');

        // Arranca pose inmediatamente; seguira activo en todas las
        // etapas y en ciclismo compartira sus landmarks con FaceDetection.
        PoseDetection.init(videoEl);

        // Inicializa el controlador del gesto de ciclismo.
        FaceDetection.init(videoEl);

      } else {
        document.querySelector('#start-panel p').textContent =
          errorMsg || 'Error al acceder a la camara';
        btnStart.disabled    = false;
        btnStart.textContent = 'Reintentar';
      }
    });
  });

})();