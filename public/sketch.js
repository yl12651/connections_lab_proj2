let socket;
let selfId = null;
let mic;
let micActive = false;
let smoothedLevel = 0;
let lastUpdateSent = 0;
let landingOverlay;
let landingDismissed = false;

const UPDATE_INTERVAL_MS = 120;
const SPHERE_SIZE_SENSITIVITY = 3;

// Stores active users.
// Map of userId to user objects (parameters).
const users = new Map();

// Initialize the canvas, socket, microphone, and landing overlay.
function setup() {
  const canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent('canvas-container');
  colorMode(HSL, 360, 100, 100, 1);
  noStroke();
  landingOverlay = document.getElementById('landing-overlay');
  if (landingOverlay) {
    landingOverlay.addEventListener(
      'pointerdown',
      () => {
        enableAudio();
      },
      { passive: true }
    );
  }
  connectSocket();
  setupMicrophone();
}

// Establish socket.io listeners to sync user state.
function connectSocket() {
  socket = io();

  socket.on('hello', ({ self, peers }) => {
    users.clear();
    if (self) {
      selfId = self.userId;
      users.set(self.userId, normalizeUser(self, true));
    }
    (peers || []).forEach((peer) => {
      users.set(peer.userId, normalizeUser(peer, false));
    });
  });

  // Track new peers as they join.
  socket.on('user-joined', (user) => {
    if (!user || !user.userId) {
      return;
    }
    users.set(user.userId, normalizeUser(user, false));
  });

  // Remove peers when they leave.
  socket.on('user-left', (info) => {
    const id = info && info.userId;
    if (!id) {
      return;
    }
    users.delete(id);
  });

  // Apply state updates received from other users.
  socket.on('state-update', (update) => {
    if (!update || !update.userId || update.userId === selfId) {
      return;
    }
    const user = users.get(update.userId);
    if (!user) {
      return;
    }
    user.intensity = constrain(update.intensity, 0, 1);
  });
}

// Map incoming user data to user objects parameters.
function normalizeUser(user, isSelf) {
  return {
    userId: user.userId,
    color: user.color,
    position: user.position || { x: 0.5, y: 0.5 },
    intensity: user.intensity,
    isSelf: Boolean(isSelf),
  };
}

// Request microphone access and flag success or failure.
function setupMicrophone() {
  mic = new p5.AudioIn();
  mic.start(
    () => {
      micActive = true;
    },
    (err) => {
      micActive = false;
      console.warn('Microphone access denied or unavailable.', err);
    }
  );
}

// Render loop that clears the canvas, updates audio, and draws spheres.
function draw() {
  background(255);
  updateSelfIntensity();

  users.forEach((user) => {
    drawSphere(user);
  });
}

// Convert mic levels into smoothed intensity and emit updates.
function updateSelfIntensity() {
  if (!selfId) {
    return;
  }
  const me = users.get(selfId);
  if (!me) {
    return;
  }

  // raw amplitude from mic
  const level = micActive && mic ? mic.getLevel() : 0;
  // mupltiply by sensitivity then normalize to 0-1 range
  const normalized = constrain(level * SPHERE_SIZE_SENSITIVITY, 0, 1);
  // blends previous level with new level with 0.2 factor of change per frame
  smoothedLevel = lerp(smoothedLevel, normalized, 0.2);
  me.intensity = smoothedLevel;

  const now = millis();
  if (socket && now - lastUpdateSent >= UPDATE_INTERVAL_MS) {
    lastUpdateSent = now;
    socket.emit('state-update', { intensity: smoothedLevel });
  }
}

// Draw a glowing gradient sphere for a particular user.
function drawSphere(user) {
  const intensity = user.intensity || 0;
  const x = user.position.x * width;
  const y = user.position.y * height;

  const baseRadius = 110;

  // Scale sphere size by eased intensity.
  const eased = Math.pow(intensity, 0.6);
  const radius = baseRadius + eased * 550;

  // Determine glow strength relative to radius.
  const glow = radius * (0.45 + eased * 0.5);

  push();

  translate(x, y);
  const ctx = drawingContext;

  // Convert solid HSL color to hsla with dynamic alpha.
  const hslaColor = (alpha) => {
    const clamped = Math.max(0, Math.min(alpha, 1));
    const colorString = `${user.color}`;
    // Convert hsl(...) to hsla(..., alpha)
    return colorString.replace('hsl', 'hsla').replace(')', `, ${clamped})`);
  };

  ctx.shadowBlur = glow;
  ctx.shadowColor = hslaColor(Math.min(0.75 + intensity * 0.25, 1));

  // Multiple radial gradients fading outwards
  const gradient = ctx.createRadialGradient(0, 0, radius * 0.08, 0, 0, radius);
  gradient.addColorStop(0, hslaColor(1));
  gradient.addColorStop(0.45, hslaColor(Math.min(0.65 + eased * 0.3, 1)));
  gradient.addColorStop(0.82, hslaColor(0.08));
  gradient.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();

  pop();
}

// Hide the landing overlay the first time the user continues.
function hideLanding() {
  if (landingDismissed) {
    return;
  }
  landingDismissed = true;
  if (landingOverlay) {
    landingOverlay.classList.add('landing-hidden');
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

// Resume mic input, dismiss the landing overlay, and wake the audio context.
function enableAudio() {
  hideLanding();
  if (mic && !micActive) {
    mic.start(() => {
      micActive = true;
    });
  }
  if (getAudioContext().state !== 'running') {
    userStartAudio();
  }
}

// Enable audio when the user clicks or touches.
// automatically called by p5.js (needded because browesers require user interaction to start audio?)
function mousePressed() {
  enableAudio();
  return false;
}

function touchStarted() {
  enableAudio();
  return false;
}
