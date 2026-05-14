const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');
// ngrok se carga dentro del try al arrancar: si node_modules viene de otro SO
// puede faltar @ngrok/ngrok-darwin-arm64; el servidor local sigue funcionando.

// ── Configuracion base ─────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
// Permitimos cualquier origen porque ngrok genera URLs dinamicas.
// En produccion real se restringiria, pero para la demo es necesario.
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});
const PORT   = process.env.PORT || 3000;

// Si quieres usar tu token de ngrok, establecelo como variable de entorno:
//   set NGROK_AUTHTOKEN=tu_token_aqui   (Windows)
//   export NGROK_AUTHTOKEN=tu_token_aqui (Mac/Linux)
// Sin token funciona igualmente pero con limite de sesion de 2 horas.
const NGROK_TOKEN = process.env.NGROK_AUTHTOKEN || null;

// ── Archivos estáticos por cliente ─────────────────────────────────────────
app.use('/athlete', express.static(path.join(__dirname, 'public/athlete')));
app.use('/drone',   express.static(path.join(__dirname, 'public/drone')));
app.use('/support', express.static(path.join(__dirname, 'public/support')));

// Redirige la raíz al panel de selección
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>IronMan System – Selección de vista</title>
      <style>
        body { font-family: sans-serif; display:flex; flex-direction:column;
               align-items:center; justify-content:center; height:100vh;
               background:#0a0a0a; color:#fff; gap:1.5rem; }
        h1   { font-size:1.4rem; color:#f97316; letter-spacing:0.05em; }
        a    { display:block; padding:1rem 2.5rem; background:#1e293b;
               color:#fff; text-decoration:none; border-radius:8px;
               border:1px solid #334155; font-size:1rem; text-align:center;
               transition:background .2s; }
        a:hover { background:#f97316; }
      </style>
    </head>
    <body>
      <h1>IRONMAN UBIQUITOUS SYSTEM</h1>
      <a href="/athlete">Vista Atleta</a>
      <a href="/drone">Vista Dron</a>
      <a href="/support">Vista Equipo de Apoyo</a>
    </body>
    </html>
  `);
});

// ── Estado global del sistema ──────────────────────────────────────────────
// Centraliza el estado para que clientes que se conecten tarde reciban
// el estado actual sin esperar al siguiente evento.
let systemState = {
  stage:       'cycling',   // 'swimming' | 'cycling' | 'running'
  heartRate:   120,
  status:      'ok',        // 'ok' | 'warning' | 'emergency'
  sosLatched:  false,       // true mientras el SOS no sea confirmado/cancelado
  eventLog:    [],
};

// ── Helpers ────────────────────────────────────────────────────────────────
function addLog(message, type = 'info') {
  const entry = {
    id:        Date.now(),
    timestamp: new Date().toLocaleTimeString('es-ES'),
    message,
    type,      // 'info' | 'warning' | 'emergency' | 'ok'
  };
  systemState.eventLog.unshift(entry);
  if (systemState.eventLog.length > 50) systemState.eventLog.pop(); // límite
  return entry;
}

// ── Lógica Socket.IO ───────────────────────────────────────────────────────
io.on('connection', (socket) => {
  const clientIP = socket.handshake.address;
  console.log(`[CONN] Cliente conectado: ${socket.id} (${clientIP})`);

  // El cliente se identifica al conectar
  socket.on('register', (role) => {
    socket.join(role); // rooms: 'athlete' | 'drone' | 'support'
    console.log(`[REG]  ${socket.id} registrado como "${role}"`);

    // Envía el estado actual al cliente recién conectado
    socket.emit('state_sync', systemState);
  });

  // ── Cambio de etapa (Natación / Ciclismo / Carrera) ─────────────────────
  socket.on('change_stage', (stage) => {
    const validStages = ['swimming', 'cycling', 'running'];
    if (!validStages.includes(stage)) return;

    const labels = { swimming: 'Natación', cycling: 'Ciclismo', running: 'Carrera' };
    systemState.stage  = stage;
    systemState.status = 'ok';
    systemState.sosLatched = false;

    const log = addLog(`Etapa cambiada a: ${labels[stage] || stage}`, 'info');
    io.emit('stage_changed', { stage, log });
    console.log(`[EVT]  Etapa → ${stage}`);
  });

  // ── Actualización de frecuencia cardíaca (simulada desde el atleta) ──────
  socket.on('update_heart_rate', (bpm) => {
    // Si hay un SOS activo, se ignoran por completo las pulsaciones.
    // El sistema solo puede volver a normal con confirm_ok o cancel_sos.
    if (systemState.sosLatched) {
      return;
    }

    systemState.heartRate = bpm;

    let newStatus = 'ok';
    if (bpm >= 190)      newStatus = 'emergency';
    else if (bpm >= 170) newStatus = 'warning';

    // Solo registra en el log si el estado cambia respecto al anterior.
    // Evita inundar el log del equipo de apoyo con un tick cada 3 segundos.
    let log = null;
    if (newStatus !== systemState.status) {
      const messages = {
        ok:        `FC normalizada: ${bpm} bpm`,
        warning:   `FC elevada: ${bpm} bpm`,
        emergency: `FC CRITICA: ${bpm} bpm – Protocolo de emergencia`,
      };
      log = addLog(messages[newStatus], newStatus);
    }

    systemState.status = newStatus;
    io.emit('heart_rate_updated', { bpm, status: newStatus, log });
  });

  // ── SOS (activado por gesto o voz) ───────────────────────────────────────
  socket.on('trigger_sos', (data) => {
    systemState.sosLatched = true;
    systemState.status = 'emergency';
    const log = addLog(
      `SOS activado por ${data.trigger} – Etapa: ${data.stage || systemState.stage}`,
      'emergency'
    );
    io.emit('sos_activated', { ...data, log });
    console.log(`[SOS]  Trigger: ${data.trigger}`);
  });

  // ── Petición de avituallamiento ──────────────────────────────────────────
  socket.on('request_supply', (data) => {
    // Incluye el trigger en el mensaje para que el equipo de apoyo
    // sepa si la peticion vino por voz, gesto de lengua u otro medio
    const trigger = data.trigger || 'desconocido';
    const log = addLog(
      `Peticion de avituallamiento – ${data.type || 'agua'} (via ${trigger})`,
      'warning'
    );
    io.to('support').emit('supply_requested', { ...data, log });
    socket.emit('supply_confirmed', { message: 'Avituallamiento solicitado' });
  });

  // ── Deteccion de caida ─────────────────────────────────────
  socket.on('detect_fall', (data) => {
    systemState.sosLatched = true;
    systemState.status = 'emergency';
    const log = addLog(
      `Caida o parada brusca detectada – aceleracion: ${data.force ? data.force.toFixed(1) : '?'} m/s2`,
      'emergency'
    );
    io.emit('fall_detected', { ...data, log });
    console.log(`[FALL] Fuerza detectada: ${data.force}`);
  });

  // ── Brazo levantado detectado por MediaPipe en el dron ────────────────────
  // Este evento lo emite la vista del dron cuando MediaPipe detecta
  // que el atleta mantiene un brazo levantado durante el umbral de tiempo.
  socket.on('raised_arm_detected', (data) => {
    systemState.sosLatched = true;
    systemState.status = 'emergency';
    const log = addLog(
      `Gesto de socorro detectado por camara del dron – brazo levantado ${data.duration || 3}s`,
      'emergency'
    );
    io.emit('raised_arm_detected', { ...data, log });
    console.log(`[POSE] Gesto de brazo levantado detectado`);
  });

  // ── Confirmación "Estoy bien" ─────────────────────────────────────────────
  socket.on('confirm_ok', () => {
    systemState.sosLatched = false;
    systemState.status = 'ok';
    const log = addLog('Atleta confirma: estoy bien', 'ok');
    io.emit('status_ok', { log });
  });

  // ── SOS cancelado (falsa alarma) ─────────────────────────────────────────
  socket.on('cancel_sos', () => {
    systemState.sosLatched = false;
    systemState.status = 'ok';
    const log = addLog('ℹFalsa alarma – SOS cancelado por el atleta', 'info');
    io.emit('sos_cancelled', { log });
  });

  // ── Desconexión ───────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[DISC] Cliente desconectado: ${socket.id}`);
  });
});

// ── Arranque ───────────────────────────────────────────────────────────────

// Muestra las URLs de acceso para cada vista del sistema
function mostrarEnlaces(baseUrl) {
  console.log(`\n  Atleta  → ${baseUrl}/athlete`);
  console.log(`  Dron    → ${baseUrl}/drone`);
  console.log(`  Equipo  → ${baseUrl}/support\n`);
}

server.listen(PORT, async () => {
  console.log('\n══════════════════════════════════════════════');
  console.log('   IRONMAN UBIQUITOUS SYSTEM');
  console.log('══════════════════════════════════════════════');

  // Enlace local (solo funciona en este PC)
  console.log('\n[LOCAL] http://localhost:' + PORT);
  mostrarEnlaces('http://localhost:' + PORT);

  // Intenta abrir un tunel ngrok para acceso remoto.
  // ngrok proporciona HTTPS, necesario para que funcionen
  // la camara, el microfono y los sensores en moviles.
  try {
    const ngrok = require('@ngrok/ngrok');
    const listenerConfig = { addr: PORT };

    // Si hay token, lo usamos para sesiones mas largas
    if (NGROK_TOKEN) {
      listenerConfig.authtoken = NGROK_TOKEN;
    }

    const listener = await ngrok.forward(listenerConfig);
    const publicUrl = listener.url();

    console.log('[NGROK] Tunel publico activo (HTTPS):');
    console.log(`        ${publicUrl}`);
    mostrarEnlaces(publicUrl);
    console.log('  Comparte estas URLs con los dispositivos del equipo.');
    console.log('  HTTPS es necesario para camara, micro y sensores.\n');
  } catch (err) {
    // Si ngrok falla, el servidor sigue funcionando en local.
    // Esto pasa si no hay internet o si ngrok esta bloqueado.
    console.warn('[NGROK] No se pudo abrir el tunel:', err.message);
    console.warn('        El sistema funciona en local sin problema.\n');
  }
});