(function () {

  // Inicializa la conexion con el servidor y registra
  // todos los manejadores de eventos del sistema
  SocketClient.init();

  // Reloj del sistema en tiempo real.
  // Se actualiza cada segundo para que el equipo de apoyo
  // pueda correlacionar los eventos del log con la hora real.
  function updateClock() {
    var timeEl = document.getElementById('system-time');
    if (timeEl) {
      timeEl.textContent = new Date().toLocaleTimeString('es-ES');
    }
  }

  // Arranca el reloj inmediatamente y luego lo actualiza cada segundo
  updateClock();
  setInterval(updateClock, 1000);

  // Boton para limpiar el registro de eventos.
  // Util durante sesiones de demostracion para resetear la vista
  // sin necesidad de recargar la pagina.
  var btnClearLog = document.getElementById('btn-clear-log');
  btnClearLog.addEventListener('click', function () {
    UI.clearLog();
  });

})();