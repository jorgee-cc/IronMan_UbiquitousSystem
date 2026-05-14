/**
 * MÓDULO MOTION CONTROL
 * ====================
 * 
 * Detecta movimientos del dispositivo y sensores del atleta para identificar:
 * 
 * 1. CAÍDAS (Fall Detection):
 *    - Detecta impactos bruscos usando acelerómetro
 *    - Detecta inmovilidad prolongada después de un impacto
 *    - Emite evento al servidor para protocolos de emergencia
 * 
 * 2. GESTOS DE CABEZA (Head Shake Gesture):
 *    - Detecta movimientos de sacudida de cabeza (solo en ciclismo)
 *    - Requiere 2 sacudidas dentro de una ventana de tiempo
 *    - Activa protocolo SOS sin usar las manos (seguridad mientras monta)
 * 
 * Sensores utilizados:
 * - DeviceMotion API: Acceso al acelerómetro (movimiento/caídas)
 * - DeviceOrientation API: Acceso al giroscopio (rotación de cabeza)
 * 
 * NOTA: En iOS 13+, requiere permiso explícito y HTTPS
 * En Android, solo requiere permisos en el manifest del app
 */

var MotionControl = (function () {

  // ========== VARIABLES DE CONTROL GENERAL ==========
  /**
   * isActive: Flag que indica si los sensores están actualmente activos
   * true: Sensores están escuchando eventos de movimiento
   * false: Sensores están desactivados, no se capturan eventos
   */
  var isActive = false;
  
  /**
   * currentStage: Etapa de actividad actual del atleta
   * Valores: 'swimming', 'cycling', 'running'
   * 
   * Importancia:
   * - El gesto de cabeza solo funciona en ciclismo (cycling)
   * - En natación nadar no tiene sentido detectar sacudidas
   * - En carrera, el gesto de cabeza para SOS es arriesgado
   */
  var currentStage = 'cycling';

  // ========== VARIABLES PRIVADAS PARA DETECCIÓN DE CAÍDAS ==========
  /**
   * fallCheckInterval: ID del intervalo que monitorea inmovilidad
   * null: No hay intervalo activo
   * number: ID del setInterval que verifica stillnessCount cada 1 segundo
   * Se usa para limpiar el intervalo al desactivar sensores
   */
  var fallCheckInterval = null;
  
  /**
   * lastMagnitude: Última magnitud de aceleración registrada
   * Valor en m/s² (metros por segundo al cuadrado)
   * null: Aún no se ha registrado ningún movimiento
   * number: Magnitud de la aceleración vectorial en 3D
   * 
   * Se usa para:
   * - Detectar impactos bruscos (comparar con FALL_THRESHOLD)
   * - Detectar inmovilidad (comparar con STILLNESS_THRESHOLD)
   */
  var lastMagnitude = null;
  
  /**
   * stillnessCount: Contador de segundos de inmovilidad
   * Se incrementa cada segundo (tick del setInterval)
   * Se resetea a 0 cuando hay movimiento superior al umbral
   * Cuando alcanza STILLNESS_SECONDS, se dispara alerta de caída
   * 
   * Propósito: Detectar si el atleta ha caído y está inconsciente/inmóvil
   */
  var stillnessCount = 0;

  // ========== CONSTANTES PARA DETECCIÓN DE CAÍDAS =========

  /**
   * FALL_THRESHOLD: 25 m/s²
   * 
   * Umbral de aceleración para detectar un impacto brusco.
   * 
   * Contexto físico:
   * - Gravedad terrestre: 9.8 m/s²
   * - Caída desde altura: genera aceleración > 25 m/s²
   * - Impacto de bicicleta: genera aceleración > 25 m/s²
   * 
   * Valor elegido evita falsos positivos por movimientos normales
   * (andar rápido, saltar) pero detecta caídas reales
   */
  var FALL_THRESHOLD      = 80;   // m/s² - impacto brusco

  /**
   * STILLNESS_THRESHOLD: 0.8 m/s²
   * 
   * Umbral de aceleración para considerar al atleta "inmóvil"
   * 
   * Contexto:
   * - 0 m/s²: Dispositivo completamente estático
   * - 0.8 m/s²: Movimientos muy pequeños (respiración, temblor)
   * - > 0.8 m/s²: Movimiento real consciente
   * 
   * Si lastMagnitude < STILLNESS_THRESHOLD durante STILLNESS_SECONDS,
   * se considera que el atleta ha caído y está inmóvil
   */
  var STILLNESS_THRESHOLD = 0.8;  // m/s² - inmovilidad

  /**
   * STILLNESS_SECONDS: 5 segundos
   * 
   * Tiempo de inmovilidad requerido antes de alertar sobre caída
   * 
   * Razón del valor:
   * - 5 segundos es suficiente para distinguir una caída de un movimiento rápido
   * - Evita alertas falsas si el atleta se detiene intencionalmente
   * - Es tiempo suficiente para que el atleta se mueva si está consciente
   */
  var STILLNESS_SECONDS   = 5;    // ticks de 1s antes de alertar

  // ========== VARIABLES PRIVADAS PARA DETECCIÓN DE GESTO DE CABEZA ==========
  /**
   * shakeCount: Contador de sacudidas de cabeza detectadas
   * 0-1: Primera sacudida registrada
   * 2+: Se ha detectado el gesto completo (2 sacudidas)
   * Al llegar a 2, se dispara triggerHeadShake() y se resetea a 0
   */
  var shakeCount    = 0;
  
  /**
   * shakeLastTime: Timestamp (milisegundos) de la última sacudida detectada
   * Se usa para validar la ventana de tiempo SHAKE_WINDOW_MS
   * Si pasa más tiempo del especificado, se resetea el contador
   */
  var shakeLastTime = 0;
  
  /**
   * lastGamma: Último ángulo gamma registrado del giroscopio
   * gamma: Rotación alrededor del eje Y (lado a lado, rotación de cabeza)
   * Valores: -180 a +180 grados
   * null: Primera lectura, no hay valor anterior para comparar
   * 
   * Se usa para calcular el delta (cambio) entre lecturas consecutivas
   */
  var lastGamma     = null;

  // ========== CONSTANTES PARA DETECCIÓN DE GESTO ==========
  /**
   * SHAKE_ANGLE_THRESHOLD: 25 grados
   * 
   * Cambio mínimo de ángulo para considerar una "sacudida"
   * 
   * Razón del valor:
   * - Un movimiento de cabeza natural es > 25 grados
   * - Evita falsos positivos por movimientos menores
   * - Detecta sacudidas intencionales claras
   */
  var SHAKE_ANGLE_THRESHOLD = 25;   // grados de cambio en gamma

  /**
   * SHAKE_WINDOW_MS: 1500 milisegundos (1.5 segundos)
   * 
   * Ventana de tiempo para detectar 2 sacudidas consecutivas
   * 
   * Razón del valor:
   * - Un usuario puede hacer 2 sacudidas decisivas en < 1.5 segundos
   * - Evita contar sacudidas de cabeza naturales no intencionales
   * - Si pasan > 1.5s entre sacudidas, se resetea el contador
   * 
   * Flujo:
   * 1. Detecta sacudida 1
   * 2. Inicia ventana de 1.5 segundos
   * 3. Si detecta sacudida 2 antes de 1.5s → Activa SOS
   * 4. Si no hay sacudida 2 en tiempo → Resetea contador
   */
  var SHAKE_WINDOW_MS       = 1500; // ventana de tiempo para dos sacudidas

  // ========== FUNCIONES PRIVADAS ==========

  /**
   * getMagnitude(x, y, z)
   * ----------------------
   * Calcula la magnitud de un vector de aceleración 3D.
   * 
   * Fórmula: magnitud = √(x² + y² + z²)
   * 
   * Parámetros:
   * @param {number} x - Aceleración en eje X (izquierda-derecha)
   * @param {number} y - Aceleración en eje Y (arriba-abajo)
   * @param {number} z - Aceleración en eje Z (adelante-atrás)
   * 
   * Retorna:
   * @return {number} Magnitud total de aceleración en m/s²
   * 
   * Notas:
   * - Los valores undefined se tratan como 0 (|| 0)
   * - La magnitud siempre es >= 0
   * - Es independiente de la dirección del movimiento
   */
  function getMagnitude(x, y, z) {
    return Math.sqrt((x || 0) * (x || 0) + (y || 0) * (y || 0) + (z || 0) * (z || 0));
  }

  /**
   * onMotion(event)
   * ---------------
   * Event listener para eventos de DeviceMotion (acelerómetro).
   * Se ejecuta continuamente mientras el sensor está activo.
   * 
   * Parámetro:
   * @param {DeviceMotionEvent} event - Evento del acelerómetro
   *   event.accelerationIncludingGravity: Aceleración con gravedad incluida
   *     Contiene propiedades: x, y, z (m/s²)
   * 
   * Proceso:
   * 1. Obtiene la aceleración del evento
   * 2. Calcula la magnitud total del vector de aceleración
   * 3. Almacena la magnitud en lastMagnitude (para verificación de inmovilidad)
   * 4. Si magnitude > FALL_THRESHOLD → Dispara detección de caída
   * 
   * Frecuencia:
   * - Se ejecuta típicamente 50-60 veces por segundo
   * - Algunos dispositivos permiten cambiar frecuencia
   */
  function onMotion(event) {
    // Obtiene la aceleración del evento (incluye efecto de gravedad)
    var acc = event.acceleration;
    
    // Guard: Si no hay datos de aceleración, salir
    if (!acc) return;

    // Calcula la magnitud total del vector de aceleración 3D
    var magnitude = getMagnitude(acc.x, acc.y, acc.z);
    
    // Almacena para usarlo en stillnessCheck
    lastMagnitude = magnitude;

    /**
     * Detecta impactos bruscos
     * Si la aceleración supera el umbral, es probable una caída
     */
    if (magnitude > FALL_THRESHOLD) {
      triggerFall(magnitude, 'impacto');
    }
  }

  /**
   * onOrientation(event)
   * --------------------
   * Event listener para eventos de DeviceOrientation (giroscopio).
   * Detecta rotaciones de cabeza/dispositivo.
   * 
   * Parámetro:
   * @param {DeviceOrientationEvent} event - Evento del giroscopio
   *   event.alpha: Rotación alrededor del eje Z (0-360°)
   *   event.beta: Rotación alrededor del eje X (-180 a +180°)
   *   event.gamma: Rotación alrededor del eje Y (-90 a +90°)
   * 
   * Usamos gamma porque representa las rotaciones lado-a-lado (sacudidas de cabeza)
   * 
   * Proceso:
   * 1. Solo funciona en etapa 'cycling' (ciclismo)
   * 2. Controla que haya valor anterior para comparar
   * 3. Calcula el cambio de ángulo (delta)
   * 4. Si delta > SHAKE_ANGLE_THRESHOLD → Detecta una sacudida
   * 5. Verifica ventana de tiempo para la segunda sacudida
   * 6. Si alcanza 2 sacudidas → Dispara triggerHeadShake()
   * 
   * Frecuencia:
   * - Se ejecuta típicamente 50-60 veces por segundo
   */
  function onOrientation(event) {
    /**
     * Guard: El gesto de cabeza solo funciona en ciclismo
     * Los nadadores no pueden usar este gesto (está bajo agua)
     * Los corredores pueden ver el gesto arriesgado
     */
    if (currentStage !== 'cycling') return;

    // Obtiene el ángulo gamma (rotación lado-a-lado)
    var gamma = event.gamma;
    
    /**
     * Primera lectura: Inicializa lastGamma
     * Se necesita un valor anterior para poder calcular delta
     */
    if (lastGamma === null) {
      lastGamma = gamma;
      return;
    }

    /**
     * Calcula el cambio de ángulo desde la última lectura
     * El valor absoluto ignora la dirección (izquierda o derecha)
     * solo nos importa la magnitud del movimiento
     */
    var delta = Math.abs(gamma - lastGamma);
    lastGamma = gamma;

    /**
     * Detecta una sacudida de cabeza si el delta supera el umbral
     */
    if (delta > SHAKE_ANGLE_THRESHOLD) {
      // Obtiene timestamp actual en milisegundos
      var now = Date.now();
      
      /**
       * Verifica la ventana de tiempo
       * Si han pasado más de SHAKE_WINDOW_MS desde la última sacudida,
       * resetea el contador (son sacudidas no relacionadas)
       */
      if (now - shakeLastTime > SHAKE_WINDOW_MS) {
        shakeCount = 0;
      }
      
      // Incrementa contador de sacudidas detectadas
      shakeCount++;
      shakeLastTime = now;
      
      // Actualiza UI para mostrar progreso: "Gesto detectado (1 / 2)"
      UI.setGestureStatus('Gesto detectado (' + shakeCount + ' / 2)');

      /**
       * Si se han detectado 2 sacudidas dentro de la ventana,
       * se activa el SOS por gesto de cabeza
       */
      if (shakeCount >= 2) {
        shakeCount = 0;
        triggerHeadShake();
      }
    }
  }

  /**
   * triggerFall(force, reason)
   * ---------------------------
   * Maneja la detección de una caída del atleta.
   * 
   * Parámetros:
   * @param {number} force - Magnitud de aceleración en m/s²
   * @param {string} reason - Razón de la detección ('impacto' o 'inmovilidad')
   * 
   * Acciones realizadas:
   * 1. Emite evento 'detect_fall' al servidor con contexto
   * 2. Actualiza UI mostrando que se detectó caída
   * 3. Muestra notificación emergente (toast) con valor de fuerza
   * 4. Resetea UI visual después de 4 segundos
   * 
   * Datos enviados al servidor:
   * {
   *   force: número (aceleración medida)
   *   reason: 'impacto' o 'inmovilidad'
   *   stage: etapa actual ('cycling', 'swimming', 'running')
   * }
   */
  function triggerFall(force, reason) {
    /**
     * Emite evento al servidor con detalles de la caída
     * El servidor puede alertar a contactos de emergencia o servicios
     */
    SocketClient.emit('detect_fall', {
      force: force,
      reason: reason || 'impacto',
      stage: currentStage,
    });
    
    // Actualiza UI: primera 'true' indica que hay detección, segunda 'true' parpadea
    UI.setFallDetectionStatus(true, true);
    
    // Muestra notificación emergente con la fuerza del impacto
    UI.showToast('Caida detectada (' + force.toFixed(1) + ' m/s2)', 'emergency');
    
    /**
     * Resetea el estado visual después de 4 segundos
     * El primer parámetro sigue siendo 'true' (sensores activos)
     * El segundo parámetro es 'false' (no parpadear)
     */
    setTimeout(function () { UI.setFallDetectionStatus(true, false); }, 4000);
  }

  /**
   * triggerHeadShake()
   * ------------------
   * Maneja la activación de SOS mediante gesto de cabeza.
   * 
   * Solo se ejecuta cuando se detectan 2 sacudidas en ventana de tiempo.
   * 
   * Acciones realizadas:
   * 1. Emite evento 'trigger_sos' al servidor
   * 2. Actualiza UI para mostrar que SOS fue activado
   * 3. Muestra notificación emergente
   * 4. Resetea UI después de 3 segundos
   * 
   * Ventaja:
   * - En ciclismo, activar SOS por sacudidas de cabeza es más seguro
   * - No requiere soltar manillar
   * - Manos libres para seguir controlando bicicleta
   */
  function triggerHeadShake() {
    /**
     * Emite SOS al servidor con especificación de que fue por gesto
     * Esto permite diferenciar SOS por botón vs SOS por gesto
     */
    SocketClient.emit('trigger_sos', { trigger: 'gesto-cabeza', stage: currentStage });
    
    // Actualiza UI mostrando que el SOS fue activado
    UI.setGestureStatus('SOS por gesto activado');
    
    // Muestra notificación emergente
    UI.showToast('SOS por gesto de cabeza activado', 'emergency');
    
    /**
     * Resetea el estado UI después de 3 segundos
     * Vuelve a mostrar "Esperando gesto..." para próximas detecciones
     */
    setTimeout(function () { UI.setGestureStatus('Esperando gesto...'); }, 3000);
  }

  /**
   * startStillnessCheck()
   * --------------------
   * Inicia el intervalo que monitorea inmovilidad prolongada.
   * 
   * Propósito:
   * Detectar si el atleta está inconsciente o inmóvil después de una caída.
   * Ejecuta un check cada 1 segundo que:
   * 
   * 1. Verifica si lastMagnitude < STILLNESS_THRESHOLD
   * 2. Si es verdad, incrementa stillnessCount
   * 3. Si stillnessCount >= STILLNESS_SECONDS → Dispara caída por inmovilidad
   * 4. Si hay movimiento, resetea el contador
   * 
   * Flujo típico de detección:
   * - T=0s: Impacto brusco (magnitude > FALL_THRESHOLD) → triggerFall('impacto')
   * - T=1-5s: Atleta está inmóvil → stillnessCount incrementa
   * - T=5s: stillnessCount === 5 → triggerFall('inmovilidad')
   * - Si el atleta se mueve antes de 5s → Contador se resetea
   */
  function startStillnessCheck() {
    /**
     * setInterval: Ejecuta la función cada 1000 ms (1 segundo)
     * Se almacena el ID para poder limpiar después (clearInterval)
     */
    fallCheckInterval = setInterval(function () {
      /**
       * Verifica si hay inmovilidad
       * lastMagnitude !== null: Asegura que se ha capturado al menos una lectura
       * lastMagnitude < STILLNESS_THRESHOLD: Verifica que el movimiento es mínimo
       */
      if (lastMagnitude !== null && lastMagnitude < STILLNESS_THRESHOLD) {
        // Incrementa el contador de inmovilidad
        stillnessCount++;
        
        /**
         * Si lleva STILLNESS_SECONDS (5) ticks sin movimiento,
         * se considera que está inconsciente/muy inmóvil
         */
        if (stillnessCount >= STILLNESS_SECONDS) {
          // Dispara alerta de caída por inmovilidad
          triggerFall(lastMagnitude, 'inmovilidad');
          // Resetea para futuras detecciones
          stillnessCount = 0;
        }
      } else {
        /**
         * Si hay movimiento superior al umbral,
         * resetea el contador (el atleta se está moviendo)
         */
        stillnessCount = 0;
      }
    }, 1000); // 1000 ms = 1 segundo
  }

  /**
   * requestPermissions(callback)
   * ---------------------------
   * Solicita permisos para acceder a sensores de movimiento y orientación.
   * 
   * IMPORTANTE:
   * - En iOS 13+, es MANDATORIO solicitar permiso explícitamente
   * - El permiso solo se puede solicitar desde interacción del usuario
   * - Requiere HTTPS (no funciona en HTTP)
   * - En Android, los permisos están en el manifest del app
   * 
   * Parámetro:
   * @param {function} callback - Función a ejecutar con resultado
   *   callback(true): Permisos otorgados
   *   callback(false): Permisos denegados
   * 
   * Proceso:
   * 1. Verifica si es iOS 13+ (comprueba requestPermission)
   * 2. Si es iOS 13+:
   *    - Solicita permiso para DeviceMotion
   *    - Luego solicita permiso para DeviceOrientation
   *    - Retorna true solo si AMBOS son 'granted'
   * 3. Si es otro navegador/dispositivo: Asume que sí (callback true)
   */
  function requestPermissions(callback) {
    /**
     * Verifica si el navegador soporta la API de permisos para DeviceMotion
     * typeof DeviceMotionEvent !== 'undefined': Confirma que existe la clase
     * typeof DeviceMotionEvent.requestPermission === 'function': Confirma iOS 13+
     */
    if (typeof DeviceMotionEvent !== 'undefined' &&
        typeof DeviceMotionEvent.requestPermission === 'function') {
      
      /**
       * Flujo para iOS 13+:
       * 1. Solicita permiso para DeviceMotion
       * 2. Luego (then) solicita permiso para DeviceOrientation
       * 3. Verifica que AMBOS sean 'granted'
       */
      DeviceMotionEvent.requestPermission()
        .then(function (motionResult) {
          // Encadena con la solicitud de orientación
          return DeviceOrientationEvent.requestPermission()
            .then(function (orientResult) {
              // Ambos deben ser 'granted' para permitir acceso
              callback(motionResult === 'granted' && orientResult === 'granted');
            });
        })
        .catch(function () { 
          // Si hay error (usuario rechaza), retorna false
          callback(false); 
        });
    } else {
      /**
       * Para Android y otros navegadores:
       * Asume que sí (el navegador ya tiene los permisos del manifest)
       */
      callback(true);
    }
  }

  /**
   * activate(btnElement)
   * --------------------
   * Activa los sensores de movimiento e inicia la detección.
   * 
   * Parámetro:
   * @param {HTMLElement} btnElement - El botón que activó esta función
   *   Se usa para actualizar su estado visual
   * 
   * Flujo:
   * 1. Si ya está activo: Desactiva (toggle)
   * 2. Si no está activo:
   *    - Solicita permisos necesarios
   *    - Si permisos OK: Inicia listeners de eventos
   *    - Si permisos denegados: Muestra error
   * 
   * Listeners registrados:
   * - 'devicemotion': Acelerómetro (caídas)
   * - 'deviceorientation': Giroscopio (gestos de cabeza)
   */
  function activate(btnElement) {
    /**
     * Toggle: Si ya está activo, desactiva los sensores
     * Esto evita tener que crear dos funciones separadas
     */
    if (isActive) {
      deactivate(btnElement);
      return;
    }

    /**
     * Solicita los permisos necesarios
     * El callback se ejecuta cuando el usuario responde a la solicitud
     */
    requestPermissions(function (granted) {
      /**
       * Si los permisos fueron denegados, muestra error y sale
       */
      if (!granted) {
        UI.showToast('Permiso de sensores denegado', 'warning');
        return;
      }

      /**
       * Registra event listeners en el objeto window
       * Estos listeners se ejecutarán continuamente mientras esté activo
       */
      window.addEventListener('devicemotion',      onMotion);
      window.addEventListener('deviceorientation', onOrientation);
      
      /**
       * Inicia el intervalo que monitorea inmovilidad
       * Ejecuta un check cada 1 segundo
       */
      startStillnessCheck();

      /**
       * Actualiza el estado del módulo
       */
      isActive = true;
      
      /**
       * Actualiza el botón para mostrar que está activo
       */
      btnElement.textContent = 'Desactivar sensores';
      btnElement.classList.add('active');
      
      /**
       * Actualiza la UI para mostrar que la detección está activa
       * Primera 'true': Sensores activos
       * Segunda 'false': No parpadear
       */
      UI.setFallDetectionStatus(true, false);
    });
  }

  /**
   * deactivate(btnElement)
   * ----------------------
   * Desactiva los sensores de movimiento y detiene la detección.
   * Limpia todos los event listeners e intervalos.
   * 
   * Parámetro:
   * @param {HTMLElement} btnElement - El botón para actualizar estado
   * 
   * Limpeza:
   * - Remueve event listeners de devicemotion y deviceorientation
   * - Limpia el intervalo de monitoreo de inmovilidad
   * - Resetea todas las variables de estado
   */
  function deactivate(btnElement) {
    /**
     * Remueve los event listeners para dejar de recibir eventos
     * Las funciones onMotion y onOrientation dejarán de ejecutarse
     */
    window.removeEventListener('devicemotion',      onMotion);
    window.removeEventListener('deviceorientation', onOrientation);
    
    /**
     * Limpia el intervalo de monitoreo de inmovilidad
     */
    if (fallCheckInterval) clearInterval(fallCheckInterval);

    /**
     * Resetea todas las variables de estado a sus valores iniciales
     */
    isActive        = false;
    lastMagnitude   = null;
    stillnessCount  = 0;
    shakeCount      = 0;
    lastGamma       = null;

    /**
     * Actualiza el botón para mostrar que está inactivo
     */
    btnElement.textContent = 'Activar sensores';
    btnElement.classList.remove('active');
    
    /**
     * Actualiza la UI para mostrar que la detección está desactiva
     * Primera 'false': Sensores inactivos
     * Segunda 'false': No parpadear
     */
    UI.setFallDetectionStatus(false, false);
  }

  /**
   * setStage(stage)
   * ---------------
   * Actualiza la etapa/actividad actual del atleta.
   * Resetea variables relacionadas al gesto de cabeza.
   * 
   * Parámetro:
   * @param {string} stage - Nueva etapa: 'swimming', 'cycling', 'running'
   * 
   * Razón de reseteo:
   * - El gesto solo funciona en ciclismo
   * - Al cambiar de etapa, resetea el contador para evitar falsos positivos
   * - lastGamma se resetea para nueva línea base de orientación
   */
  function setStage(stage) {
    // Actualiza la etapa actual
    currentStage = stage;
    
    // Resetea el contador de gestos (nueva etapa, nuevo contexto)
    shakeCount   = 0;
    
    // Resetea el valor anterior de rotación (nueva línea base)
    lastGamma    = null;
  }

  // ========== INTERFAZ PÚBLICA ==========
  /**
   * El módulo expone solo dos funciones públicas:
   * 1. activate: Para activar/desactivar los sensores
   * 2. setStage: Para cambiar la etapa actual
   * 
   * El resto de la funcionalidad es privada e interna
   */
  return { 
    activate: activate, 
    setStage: setStage 
  };

})();