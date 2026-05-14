# IronMan Ubiquitous System
IronMan Ubiquitous System es una ecología de interacción diseñada para monitorizar y asistir a atletas durante competiciones de larga distancia (Ironman). El sistema permite una comunicación fluida y manos libres entre el atleta, un dron de seguimiento y el equipo de apoyo, optimizando la seguridad mediante el uso de interfaces de usuario naturales (NUI) y sensores ubicuos.

# Descripción del Sistema
El proyecto aborda el reto de mantener a un atleta conectado y seguro sin interrumpir su rendimiento físico. Se basa en tres pilares operativos:

Vista Atleta: Interacción mediante voz y sensores de movimiento integrados en dispositivos móviles o wearables.

Vista Dron: Monitorización visual automática utilizando visión artificial para detectar gestos de socorro o necesidades de avituallamiento.

Vista Equipo de Apoyo: Dashboard en tiempo real para la supervisión de biometría y gestión de protocolos de emergencia.

# Funcionalidades Básicas
El sistema implementa tres bloques de funcionalidades mínimas esenciales para la competición:

1. Navegación y Selección de Etapa
Gestión de Contexto: Permite cambiar la etapa activa entre Natación, Ciclismo y Carrera.

Sincronización Total: Al cambiar de etapa, el servidor actualiza automáticamente el contexto de todos los módulos (reconocimiento de voz, sensores y modo de detección del dron) para adaptarse a la actividad actual.

2. Control de Emergencias (Protocolo SOS)
Activación Manual: Botón SOS dedicado en la interfaz del atleta.

Activación Automática por Biometría: El sistema monitoriza la frecuencia cardíaca y dispara el protocolo de emergencia si se detecta un estado crítico (FC ≥ 190 bpm).

Activación por voz: Con el microfono activo, el sistema detecta el comando de voz "ayuda"

Activacion por caida: Con el sensor de movimiento activo, el sistema envía una alerta SOS al sobrepasar los 80 m/s²

Activacion por gesto de cabeza: En la etapa ciclista y con el sensor de movimiento activo, al girar la cabeza (el movil) se envía una alerta de SOS.

Gesto de Brazo Levantado: En las etapas de natación y carrera, el dron detecta si el atleta mantiene el brazo levantado durante 3 segundos para disparar el protocolo SOS.

Bloqueo de Seguridad: Una vez activado el SOS, el sistema bloquea las actualizaciones biométricas normales para priorizar la gestión de la alerta hasta que se resuelva la situación.

3. Salida y Confirmación
Restablecimiento del Estado: Mecanismo "Estoy bien" (confirm_ok) para que el atleta confirme su seguridad tras una alerta, devolviendo el sistema a su estado normal.

Gestión de Falsas Alarmas: Opción de cancelar un SOS activo en caso de activación accidental.

4. Petición de Avituallamiento (Suministros)
Voz (Atleta): El comando de voz "agua" envía una solicitud de avituallamiento al equipo de apoyo.

Visión Artificial (Dron): En la etapa de ciclismo, el dron detecta mediante FaceMesh si el atleta abre la boca durante 2 segundos para solicitar agua automáticamente sin usar las manos.

5. Feedback Visual
Respuesta del Dron: Ante cualquier alerta SOS, el dron activa el parpadeo de su linterna (flash) y muestra paneles de alerta en pantalla completa con un tinte rojo parpadeante para indicar que la asistencia está en camino

6. Monitorización y Registro (Equipo de Apoyo)
Registro Cronológico (Log): Un historial en tiempo real que muestra exactamente qué activó cada alerta (el "trigger") y a qué hora ocurrió, permitiendo una trazabilidad total.

Sincronización de Estado: Cualquier dispositivo que se conecte tarde (por ejemplo, una tablet de soporte nueva) recibe automáticamente el estado actual del atleta (FC, etapa, SOS activo) mediante una sincronización global (state_sync).

# Tecnologías Utilizadas
Core
Node.js & Express: Servidor de aplicaciones y gestión de rutas.

Socket.IO: Comunicación bidireccional y eventos en tiempo real.

ngrok: Tunelización HTTPS para acceso remoto y habilitación de permisos de sensores.

Inteligencia Artificial & Sensores
MediaPipe (Pose & FaceLandmarker): Detección de poses y blendshapes faciales en la cámara del dron.

Web Speech API: Reconocimiento de comandos específicos de voz en español.

DeviceMotion & DeviceOrientation API: Detección de caídas e impactos mediante acelerómetro y gestos de cabeza mediante giroscopio.

# Estructura del Proyecto
Plaintext
public/                 # Archivos estáticos de las interfaces
│   ├── athlete/            # Interfaz del atleta (voz y sensores)
│   ├── drone/              # Interfaz del dron (MediaPipe e IA)
│   ├── support/            # Panel del equipo de apoyo (Dashboard)
│   └── selection/          # Pantalla de inicio de selección de rol
├── server.js               # Servidor central y lógica de Socket.IO
├── package.json            # Dependencias y scripts de Node.js
└── especificaciones.md     # Documentación técnica detallada
# Configuración
Requisitos Previos
Node.js 18.x o superior.

NPM (incluido con Node.js) o PNPM.

Cuenta y API de ngrok (opcional para sesiones largas).

# Instalación
Clonar el repositorio.

Acceder a la carpeta del proyecto:

Bash
Instalar las dependencias:

Bash
npm install

# Ejecución y Uso
Modos de Ejecución
Producción: npm start

Desarrollo (con recarga automática): npm run dev

URLs Disponibles
Una vez arrancado el servidor (por defecto en el puerto 3000), se puede acceder a:

Atleta: http://localhost:3000/athlete

Dron: http://localhost:3000/drone

Dahsboard: http://localhost:3000/support

* Uso con ngrok
Para habilitar la cámara, el micrófono y los sensores de movimiento en dispositivos móviles, es obligatorio el uso de HTTPS. El servidor intenta abrir un túnel automáticamente al iniciar.

Para usar tu propio token de ngrok:

Windows (PowerShell): $env:NGROK_AUTHTOKEN="tu_token_aqui"

Mac/Linux: export NGROK_AUTHTOKEN=tu_token_aqui

# Eventos del Sistema (Socket.IO)
El sistema se comunica mediante una serie de eventos clave:

change_stage: Sincroniza la etapa activa (natación, ciclismo, carrera).

update_heart_rate: Actualiza la biometría simulada.

trigger_sos: Activa el protocolo de emergencia (desde botón, voz, gesto o sensores).

detect_fall: Notifica impactos o inmovilidad prolongada.

raised_arm_detected: Alerta generada por el dron al detectar el brazo levantado del atleta.

request_supply: Petición de agua (vía voz o gesto facial).

# Troubleshooting (Problemas Comunes)
Permisos en iOS: Los sensores de movimiento en dispositivos iOS requieren una interacción del usuario y HTTPS. Pulsa "Activar sensores" en la vista del atleta tras cargar la página vía ngrok.

Carga de Modelos IA: La carga inicial de MediaPipe en la vista del dron puede tardar unos segundos dependiendo de la conexión.

Puerto ocupado: Si el puerto 3000 está en uso, puedes cambiarlo con PORT=4000 npm start.

# Mejoras Futuras
Geolocalización: Integración de la Geolocation API para mostrar la posición real del atleta en un mapa.

Notificaciones Auditivas: Alertas sonoras en el panel de soporte para eventos críticos.

Integración de Wearables: Conexión directa con APIs de smartwatches para biometría real.
