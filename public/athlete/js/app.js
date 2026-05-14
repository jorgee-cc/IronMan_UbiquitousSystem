/**
 * MÓDULO APP (CONTROLADOR PRINCIPAL)
 * ==================================
 * 
 * Este es el archivo principal de la aplicación cliente para el atleta.
 * Actúa como orquestador central que:
 * 
 * 1. INICIALIZACIÓN:
 *    - Establece la conexión WebSocket con el servidor
 *    - Inicializa el control manual de biometría (frecuencia cardíaca)
 * 
 * 2. GESTIÓN DE INTERFAZ:
 *    - Referencias a todos los elementos DOM (botones)
 *    - Vinculación de event listeners a acciones
 * 
 * 3. COORDINACIÓN DE MÓDULOS:
 *    - Comunica cambios entre Biometrics, VoiceControl, MotionControl, UI
 *    - Centraliza la lógica de eventos del usuario
 * 
 * Módulos utilizados:
 * - SocketClient: Comunicación WebSocket con servidor
 * - Biometrics: Gestión del ritmo cardíaco
 * - VoiceControl: Control por reconocimiento de voz
 * - MotionControl: Detección de movimiento del dispositivo
 * - UI: Actualización de interfaz gráfica
 */

(function () {

  // ========== VARIABLES PRIVADAS ==========
  /**
   * currentStage: Almacena la etapa/actividad actual del atleta
   * Valores posibles:
   * - 'swimming': Natación
   * - 'cycling': Ciclismo (valor inicial)
   * - 'running': Carrera
   * 
   * Se actualiza cuando el usuario hace clic en los botones de etapa
   * Se sincroniza con los módulos de Biometrics, VoiceControl y MotionControl
   */
  var currentStage = 'cycling';

  // ========== REFERENCIAS A ELEMENTOS DEL DOM ==========
  /**
   * btnSOS: Botón de emergencia SOS
   * Disparador: Activación de protocolo de emergencia
   * Datos enviados: { trigger: 'boton', stage: currentStage }
   */
  var btnSOS        = document.getElementById('btn-sos');
  
  /**
   * btnOK: Botón de confirmación de estado OK
   * Disparador: Confirmación de que el atleta está bien después de una alerta
   */
  var btnOK         = document.getElementById('btn-ok');
  
  /**
   * btnVoice: Botón para activar/desactivar reconocimiento de voz
   * Disparador: Toggle del módulo VoiceControl
   */
  var btnVoice      = document.getElementById('btn-voice-toggle');
  
  /**
   * btnMotion: Botón para activar/desactivar sensores de movimiento
   * Disparador: Activación del módulo MotionControl
   */
  var btnMotion     = document.getElementById('btn-motion-toggle');
  
  /**
   * btnHrUp: Botón para aumentar manualmente el ritmo cardíaco simulado
   * Disparador: Incremento de 5 BPM
   */
  var btnHrUp       = document.getElementById('btn-hr-up');
  
  /**
   * btnHrDown: Botón para disminuir manualmente el ritmo cardíaco simulado
   * Disparador: Decremento de 5 BPM
   */
  var btnHrDown     = document.getElementById('btn-hr-down');
  
  /**
   * btnHrCritical: Botón para simular una situación de emergencia cardíaca
   * Disparador: Establece el BPM en nivel crítico (195 BPM)
   */
  var btnHrCritical = document.getElementById('btn-hr-critical');
  
  /**
   * stageButtons: NodeList de todos los botones de selección de etapa
   * Selector CSS: '.stage-btn' - Usa data-stage para identificar el tipo
   * Cada botón contiene un atributo data-stage con los valores:
   * swimming, cycling, running
   */
  var stageButtons  = document.querySelectorAll('.stage-btn');

  // ========== INICIALIZACIÓN DEL SISTEMA ==========
  /**
   * Establece la conexión WebSocket con el servidor.
   * Debe ser llamado antes de cualquier comunicación con el servidor.
   * Internamente configura:
   * - URL del servidor
   * - Listeners para eventos del servidor
   * - Protocolo de reconexión
   */
  SocketClient.init();

  // ========== EVENT LISTENERS ==========

  /**
   * SELECTOR DE ETAPA (Stage Buttons)
   * =================================
   * 
   * Itera sobre todos los botones de etapa y añade listeners para cambios.
   * Cuando se selecciona una nueva etapa:
   * 1. Se actualiza la variable currentStage
   * 2. Se notifica al servidor del cambio
   * 3. Se actualizan todos los módulos y la UI con la nueva etapa
   * 
   * El atributo data-stage en cada botón identifica el tipo de actividad
   */
  stageButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      // Obtiene el valor de etapa del atributo data-stage del botón clickeado
      currentStage = btn.dataset.stage;
      
      // Notifica al servidor sobre el cambio de etapa
      SocketClient.emit('change_stage', currentStage);
      
      // Actualiza la interfaz gráfica para resaltar la etapa seleccionada
      UI.updateStage(currentStage);
      
      // Actualiza el reconocimiento de voz con contexto de la nueva etapa
      VoiceControl.setStage(currentStage);
      
      // Notifica a los sensores de movimiento sobre la nueva etapa
      MotionControl.setStage(currentStage);
    });
  });

  /**
   * BOTÓN SOS (Emergencia)
   * =====================
   * 
   * Dispara un protocolo de emergencia.
   * La información de la etapa actual se incluye para contexto en el servidor.
   * 
   * Evento emitido al servidor:
   * - Nombre: 'trigger_sos'
   * - Payload: { trigger: 'boton', stage: currentStage }
   *   trigger: Indica que fue activado por botón (no por sensor)
   *   stage: Etapa actual para contexto del atleta
   */
  btnSOS.addEventListener('click', function () {
    SocketClient.emit('trigger_sos', { trigger: 'boton', stage: currentStage });
  });

  /**
   * BOTÓN OK (Confirmación)
   * =======================
   * 
   * Confirma que el atleta está bien después de que el servidor
   * ha levantado una alerta de advertencia.
   * 
   * Sirve para:
   * - Descartar alertas falsas
   * - Reconocer que el usuario ha visto y procesado la alerta
   * - Restaurar el estado normal de monitoreo
   * 
   * Evento emitido al servidor:
   * - Nombre: 'confirm_ok'
   * - Payload: Ninguno (solo confirmación)
   */
  btnOK.addEventListener('click', function () {
    SocketClient.emit('confirm_ok');
  });

  /**
   * BOTÓN CONTROL POR VOZ
   * =====================
   * 
   * Activa/desactiva el módulo de reconocimiento de voz.
   * El módulo VoiceControl interpreta comandos de voz del usuario.
   * 
   * Funciona tanto para:
   * - Cambiar de etapa hablando (swimming, cycling, running)
   * - Activar SOS por comando de voz
   * - Otros controles futuros basados en voz
   * 
   * El botón se pasa como parámetro para que VoiceControl pueda
   * actualizar su estado visual (activo/inactivo)
   */
  btnVoice.addEventListener('click', function () {
    VoiceControl.toggle(btnVoice);
  });

  /**
   * BOTÓN SENSORES DE MOVIMIENTO
   * ============================
   * 
   * Activa el acceso a los sensores de movimiento del dispositivo
   * (acelerómetro, giroscopio, etc.).
   * 
   * MotionControl detecta:
   * - Caídas del atleta
   * - Cambios bruscos de aceleración
   * - Posibles situaciones de peligro
   * 
   * El botón se pasa como parámetro para que MotionControl pueda
   * actualizar su estado visual (activo/inactivo)
   */
  btnMotion.addEventListener('click', function () {
    MotionControl.activate(btnMotion);
  });

  /**
   * BOTÓN AUMENTAR RITMO CARDÍACO (+5 BPM)
   * =====================================
   * 
   * Incrementa manualmente el ritmo cardíaco simulado en 5 latidos por minuto.
   * Útil para:
   * - Pruebas y debugging
   * - Simulación de aumento de esfuerzo
   * - Testing del sistema
   * 
   * Llamada: Biometrics.changeBy(5)
   * - Parámetro positivo incrementa el BPM
   * - Se normaliza automáticamente al rango válido (40-220)
   */
  btnHrUp.addEventListener('click', function () {
    Biometrics.changeBy(5);
  });

  /**
   * BOTÓN DISMINUIR RITMO CARDÍACO (-5 BPM)
   * ========================================
   * 
   * Decrementa manualmente el ritmo cardíaco simulado en 5 latidos por minuto.
   * Útil para:
   * - Pruebas y debugging
   * - Simulación de disminución de esfuerzo
   * - Testing del sistema
   * 
   * Llamada: Biometrics.changeBy(-5)
   * - Parámetro negativo disminuye el BPM
   * - Se normaliza automáticamente al rango válido (40-220)
   */
  btnHrDown.addEventListener('click', function () {
    Biometrics.changeBy(-5);
  });

  /**
   * BOTÓN EMERGENCIA CARDÍACA
   * =========================
   * 
   * Simula una situación de emergencia estableciendo el BPM en nivel crítico.
   * Activa todos los protocolos de alerta del sistema.
   * 
   * Llamada: Biometrics.setCritical()
   * - Establece BPM en 195 (nivel de emergencia)
   * - Emite evento al servidor
   * - Actualiza la UI con estado de emergencia
   * 
   * Usado para testing y simulación de escenarios de riesgo
   */
  btnHrCritical.addEventListener('click', function () {
    Biometrics.setCritical();
  });

  /**
   * FIN DEL MÓDULO
   * ==============
   * 
   * El módulo se auto-ejecuta inmediatamente (IIFE) y establece
   * toda la lógica de la aplicación. Después de esto, el sistema
   * está ready para recibir eventos de usuario y comunicarse con el servidor.
   */

})();