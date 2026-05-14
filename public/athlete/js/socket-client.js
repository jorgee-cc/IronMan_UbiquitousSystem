/**
 * MÓDULO SOCKET CLIENT
 * ====================
 * 
 * Gestiona la comunicación en tiempo real entre el cliente (aplicación del atleta)
 * y el servidor mediante WebSocket usando Socket.IO.
 * 
 * Socket.IO proporciona:
 * - Comunicación bidireccional en tiempo real
 * - Fallback automático a HTTP long-polling si WebSocket no disponible
 * - Reconexión automática en caso de desconexión
 * - Manejo de eventos nombrados (emit/on)
 * 
 * FLUJO DE COMUNICACIÓN:
 * 
 * Cliente (Atleta):
 * - Envía eventos: update_heart_rate, trigger_sos, detect_fall, change_stage, confirm_ok
 * - Recibe eventos: sos_activated, status_ok, fall_detected, stage_changed, etc.
 * 
 * Servidor (Centro de Control):
 * - Recibe eventos del cliente
 * - Procesa la información (lógica de negocio)
 * - Emite eventos de vuelta al cliente
 * - Gestiona contactos de emergencia y alertas
 * 
 * Este módulo actúa como intermediario entre:
 * - Módulos locales (Biometrics, MotionControl, VoiceControl, UI)
 * - Servidor remoto (procesamiento, almacenamiento, alertas)
 */

var SocketClient = (function () {

  // ========== VARIABLE PRIVADA ==========
  /**
   * socket: Objeto de conexión Socket.IO
   * 
   * Creado automáticamente por io() sin parámetros:
   * - Detecta automáticamente la URL del servidor actual
   * - En desarrollo: http://localhost:3000
   * - En producción: USA el dominio del cliente
   * 
   * El objeto socket es responsable de:
   * - Mantener la conexión con el servidor
   * - Emitir y recibir eventos
   * - Reconectar automáticamente si se desconecta
   * - Manejar errores de comunicación
   * 
   * NOTE: Socket.IO ejecuta automáticamente la conexión, no requiere llamada explícita
   */
  var socket = io();

  // ========== FUNCIÓN INICIALIZADORA ==========
  /**
   * init()
   * ------
   * 
   * Registra todos los event listeners en el socket.
   * Debe ser llamada una sola vez al inicializar la aplicación.
   * Esta función configura todo el protocolo de comunicación client-server.
   * 
   * Implementa el flujo:
   * 1. Cuando se conecta → Registra el cliente como 'athlete'
   * 2. Escucha eventos del servidor y actualiza la UI
   * 3. Coordina con módulos locales (Biometrics, UI)
   * 
   * Listeners registrados:
   * - connect: Conexión establecida
   * - disconnect: Conexión perdida
   * - state_sync: Sincronización de estado completo
   * - stage_changed: Cambio de etapa confirmado
   * - heart_rate_updated: Actualización de frecuencia cardíaca
   * - sos_activated: SOS activado
   * - status_ok: Estado OK confirmado
   * - sos_cancelled: SOS cancelado
   * - fall_detected: Caída detectada
   * - supply_confirmed: Confirmación de suministro
   */
  function init() {
    
    /**
     * EVENT: connect
     * ===============
     * 
     * Disparador: Socket.IO establece conexión con el servidor
     * Frecuencia: Una sola vez al iniciar, y nuevamente si se reconecta
     * 
     * Acciones:
     * 1. Emite evento 'register' con rol 'athlete' al servidor
     *    El servidor guarda info de que hay un cliente atleta conectado
     * 2. Actualiza la UI para mostrar que hay conexión
     * 
     * Importancia: Sin este listener, el servidor no sabe quién es el cliente
     */
    socket.on('connect', function () {
      // Informa al servidor que este es un cliente tipo 'athlete'
      socket.emit('register', 'athlete');
      
      // Actualiza UI: muestra conectado (verde/online)
      UI.setConnectionStatus(true);
    });

    /**
     * EVENT: disconnect
     * ==================
     * 
     * Disparador: Socket.IO pierde conexión con el servidor
     * Razones: Servidor caído, pérdida de WiFi, conexión rechazada, etc.
     * 
     * Acciones:
     * 1. Actualiza la UI para mostrar desconexión
     *    Normalmente muestra indicador rojo/offline
     * 
     * Notas:
     * - Socket.IO intentará reconectar automáticamente cada cierto tiempo
     * - No es necesario hacer nada especial, el cliente vuelve a conectar
     * - La UI debe mostrar estado desconectado mientras se reconecta
     */
    socket.on('disconnect', function () {
      // Actualiza UI: muestra desconectado (rojo/offline)
      UI.setConnectionStatus(false);
    });

    /**
     * EVENT: state_sync
     * =================
     * 
     * Disparador: Servidor envía sincronización de estado completo
     * Cuándo se envía:
     * - Cuando el cliente se conecta por primera vez (init)
     * - Cuando se recupera una conexión interrumpida (reconexión)
     * - Periódicamente para asegurar sincronización
     * 
     * Parámetro recibido:
     * {
     *   heartRate: número (BPM actual)
     *   status: 'ok', 'warning', 'emergency'
     *   stage: 'swimming', 'cycling', 'running'
     *   ... otros campos del estado global
     * }
     * 
     * Acciones:
     * 1. Sincroniza el estado en la UI (UI.syncState)
     * 2. Actualiza el simulador de biometría con el BPM actual
     *    Esto asegura que el cliente y servidor tengan mismo ritmo cardíaco
     * 
     * Ejemplo de flujo:
     * - Usuario abre app en dispositivo nuevo
     * - Se conecta al servidor
     * - Servidor envía state_sync con datos actuales del otro dispositivo
     * - UI y Biometrics se sincronizan automáticamente
     */
    socket.on('state_sync', function (state) {
      // Sincroniza todos los datos en UI (pantalla actualizada)
      UI.syncState(state);
      
      // Sincroniza el corazón simulado con el BPM del servidor
      Biometrics.setHeartRate(state.heartRate);
    });

    /**
     * EVENT: stage_changed
     * ====================
     * 
     * Disparador: Servidor confirma que se cambió la etapa
     * Cuándo se envía:
     * - Después de que el cliente emitió 'change_stage' y el servidor lo procesó
     * - El servidor verifica y valida el cambio
     * 
     * Parámetro recibido:
     * {
     *   stage: 'cycling' | 'swimming' | 'running'
     * }
     * 
     * Acciones:
     * 1. Actualiza la UI para resaltar la nueva etapa
     * 
     * Notas:
     * - Este evento es la confirmación del servidor
     * - El cliente ya envió el cambio, pero espera confirmación
     * - Garantiza que cliente y servidor estén en sincronía
     */
    socket.on('stage_changed', function (data) {
      // Actualiza UI: resalta/marca la nueva etapa seleccionada
      UI.updateStage(data.stage);
    });

    /**
     * EVENT: heart_rate_updated
     * ==========================
     * 
     * Disparador: Servidor notifica cambio en ritmo cardíaco
     * Cuándo se envía:
     * - Cuando el cliente emitió 'update_heart_rate'
     * - El servidor procesa y confirma el cambio
     * - Puede venir de múltiples fuentes (este dispositivo, otro dispositivo, etc)
     * 
     * Parámetro recibido:
     * {
     *   bpm: número (latidos por minuto, 40-220)
     *   status: 'ok' | 'warning' | 'emergency'
     * }
     * 
     * Acciones:
     * 1. Actualiza la UI con el nuevo BPM
     * 2. Actualiza color/indicador según el estado
     * 
     * Flujo típico:
     * - Cliente manda: update_heart_rate(85)
     * - Servidor procesa y valida
     * - Servidor responde: heart_rate_updated({bpm: 85, status: 'ok'})
     * - UI actualiza el display del ritmo cardíaco
     * 
     * Nota: El status es computado por el servidor basado en la salud del atleta
     */
    socket.on('heart_rate_updated', function (data) {
      // Actualiza UI con nuevo BPM y su estado visual (color indicador)
      UI.updateHeartRate(data.bpm, data.status);
    });

    /**
     * EVENT: sos_activated
     * ====================
     * 
     * Disparador: Servidor confirma que un SOS fue activado
     * Cuándo se envía:
     * - Cuando el cliente (o servidor) dispara SOS
     * - El servidor lo registra y notifica a todos los clientes conectados
     * 
     * Parámetro: Ninguno (solo confirmación)
     * 
     * Acciones:
     * 1. Cambia estado del sistema a 'emergency'
     *    - Sonidos de alerta, colores rojo, parpadeos
     * 2. Muestra notificación emergente
     * 3. Inicia protocolo de emergencia
     *    - Contacta a servicios de emergencia
     *    - Notifica a contactos de confianza
     *    - Registra ubicación y datos biométricos
     * 
     * Estado emergente:
     * - "SOS activado - Esperando respuesta"
     * - Significa que el sistema está alerta, esperando confirmación o respuesta
     * 
     * Notas:
     * - Este es un estado crítico de alto nivel
     * - El UI debe ser muy visible y pedir confirmación
     */
    socket.on('sos_activated', function () {
      // Cambia estado visual del sistema a emergencia (UI roja, sonidos)
      UI.setSystemStatus('emergency');
      
      // Muestra notificación emergente al usuario
      UI.showToast('SOS activado - Esperando respuesta', 'emergency');
    });

    /**
     * EVENT: status_ok
     * =================
     * 
     * Disparador: Servidor confirma que el estado es OK
     * Cuándo se envía:
     * - Cuando el usuario presiona el botón "OK" (confirm_ok)
     * - Después de que el SOS ha sido manejado
     * - Cuando el servidor verifica que todo está bien
     * 
     * Parámetro: Ninguno (solo confirmación)
     * 
     * Acciones:
     * 1. Cambia estado del sistema a 'ok'
     *    - Colores normales (azul/verde)
     *    - Detiene sonidos de alerta
     * 2. Muestra notificación de confirmación
     * 
     * Flujo típico:
     * - Usuario abre app después de SOS
     * - Ve estado 'emergency'
     * - Presiona botón "Confirmo que estoy OK"
     * - Cliente emite: confirm_ok()
     * - Servidor responde: status_ok
     * - UI vuelve a estado normal
     * 
     * Nota: Este evento restaura el estado normal de operación
     */
    socket.on('status_ok', function () {
      // Cambia estado visual del sistema a normal (colores/sonidos normales)
      UI.setSystemStatus('ok');
      
      // Muestra notificación confirmando estado OK
      UI.showToast('Estado confirmado: OK', 'ok');
    });

    /**
     * EVENT: sos_cancelled
     * ====================
     * 
     * Disparador: El SOS fue cancelado
     * Cuándo se envía:
     * - Cuando el usuario cancela el SOS antes de que se maneje
     * - Cuando el servidor detecta falsa alarma
     * - Después de cierto tiempo sin confirmar emergencia
     * 
     * Parámetro: Ninguno (solo confirmación)
     * 
     * Acciones:
     * 1. Cambia estado del sistema a 'ok'
     * 2. Muestra notificación informativa
     * 
     * Diferencia con status_ok:
     * - status_ok: El atleta confirma que está bien después de SOS
     * - sos_cancelled: El SOS se cancela antes de respuesta
     * 
     * Ejemplo:
     * - Usuario presiona SOS por accidente
     * - Tiene 10 segundos para cancelar
     * - Presiona "Cancelar SOS"
     * - Servidor responde: sos_cancelled
     */
    socket.on('sos_cancelled', function () {
      // Cambia estado visual del sistema a normal
      UI.setSystemStatus('ok');
      
      // Muestra notificación informando que SOS fue cancelado
      UI.showToast('SOS cancelado', 'info');
    });

    /**
     * EVENT: fall_detected
     * ====================
     * 
     * Disparador: Servidor confirma detección de caída
     * Cuándo se envía:
     * - Cuando el cliente (MotionControl) detecta impacto o inmovilidad
     * - Después de validación y procesamiento en servidor
     * - Sin necesidad de confirmación del usuario (es automático)
     * 
     * Parámetro: Ninguno (solo confirmación)
     * 
     * Acciones:
     * 1. Cambia estado del sistema a 'emergency'
     * 2. Muestra notificación específica para caídas
     * 3. Activa protocolo de emergencia automáticamente
     *    - Sin esperar confirmación del usuario
     *    - Asume que el atleta no puede responder
     * 
     * Diferencia con sos_activated:
     * sos_activated: El usuario presiona botón manualmente
     * fall_detected: Sistema detecta automáticamente por sensores
     * 
     * Crítico: Este evento requiere máxima atención
     * - El dispositivo mostró que detectó una caída
     * - Asistencia está en camino
     * - No requiere confirmación del usuario
     */
    socket.on('fall_detected', function () {
      // Cambia estado visual del sistema a emergencia (máxima alerta)
      UI.setSystemStatus('emergency');
      
      // Muestra notificación específica de caída y que asistencia viene
      UI.showToast('Caida detectada - Asistencia en camino', 'emergency');
    });

    /**
     * EVENT: supply_confirmed
     * ========================
     * 
     * Disparador: Servidor confirma suministro o servicio
     * Cuándo se envía:
     * - Cuando se entrega suministro médico
     * - Cuando se completa un servicio de rescate
     * - Cuando se verifica asistencia en el terreno
     * 
     * Parámetro:
     * {
     *   message: string (mensaje descriptivo del suministro)
     * }
     * 
     * Ejemplo:
     * {
     *   message: 'Equipo médico de emergencia ha llegado'
     * }
     * 
     * Acciones:
     * 1. Muestra notificación con el mensaje del servidor
     * 2. Tipo 'ok' indica confirmación positiva
     * 
     * Notas:
     * - Este evento es menos crítico que los anteriores
     * - Es una actualización informativa
     * - Típicamente se envía después de SOS o fall_detected
     */
    socket.on('supply_confirmed', function (data) {
      // Muestra notificación informativa con el mensaje del servidor
      UI.showToast(data.message, 'ok');
    });
  }

  // ========== FUNCIÓN DE EMISIÓN ==========
  /**
   * emit(event, data)
   * -----------------
   * 
   * Envía un evento (con datos) al servidor mediante WebSocket.
   * Función auxiliar que abstrae socket.emit de Socket.IO.
   * 
   * Parámetros:
   * @param {string} event - Nombre del evento (ej: 'update_heart_rate')
   * @param {object|any} data - Datos a enviar (puede ser objeto, string, número, etc)
   * 
   * Ejemplos de uso:
   * - SocketClient.emit('update_heart_rate', 85)
   * - SocketClient.emit('trigger_sos', { trigger: 'boton', stage: 'cycling' })
   * - SocketClient.emit('change_stage', 'swimming')
   * - SocketClient.emit('detect_fall', { force: 28.5, reason: 'impacto' })
   * 
   * Eventos típicos emitidos por el cliente:
   * 1. 'update_heart_rate' → Envía BPM actualizado
   * 2. 'trigger_sos' → Activa protocolo SOS
   * 3. 'change_stage' → Cambia etapa de actividad
   * 4. 'detect_fall' → Reporte de detección de caída
   * 5. 'confirm_ok' → Confirmación de estado OK
   * 6. 'voice_command' → Comando por voz recibido
   * 
   * Nota:
   * - No espera respuesta (es asincrónico)
   * - El servidor responde con eventos separados (ej: heart_rate_updated)
   * - Si hay error de conexión, Socket.IO encola el evento
   */
  function emit(event, data) {
    // Envía el evento y datos al servidor mediante WebSocket
    socket.emit(event, data);
  }

  // ========== INTERFAZ PÚBLICA ==========
  /**
   * El módulo expone dos funciones públicas:
   * 
   * 1. init: Debe llamarse una sola vez al inicio de la aplicación
   *    Registra todos los listeners de eventos
   * 
   * 2. emit: Se usa para enviar eventos al servidor
   *    Puede ser llamado múltiples veces desde otros módulos
   * 
   * Todos los listeners están en init() para evitar múltiples registros
   * Todos los eventos se escuchan continuamente después de init()
   */
  return { init: init, emit: emit };

})();