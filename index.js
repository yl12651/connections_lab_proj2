const express = require('express');
const http = require('http');
const { randomBytes } = require('crypto');
const socketIo = require('socket.io');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('public'));

const server = http.createServer(app);
const io = new socketIo.Server(server);

const clients = new Map();

// Generate a bright random HSL color for each user.
// Use HSL to ensure good saturation and brightness levels when randomly generating colors.
function randomColor() {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue}, 80%, 60%)`;
}

// Produce a normalized random canvas position.
// Enforce a margin so users don't spawn at the very edge.
function randomPosition() {
  const margin = 0.1;
  const span = 1 - margin * 2;
  return { x: margin + Math.random() * span, y: margin + Math.random() * span };
}

// Strip internal socket data and expose the client payload.
function buildClientPayload(client) {
  const { userId, color, position, intensity } = client;
  return { userId, color, position, intensity };
}

// Handle new socket connections and initialize their state.
io.on('connection', (socket) => {
  const userId = randomBytes(3).toString('hex');
  const clientData = {
    socketId: socket.id,
    userId,
    color: randomColor(),
    position: randomPosition(),
    intensity: 0,
  };

  clients.set(socket.id, clientData);

  const peers = Array.from(clients.values())
    .filter((client) => client.socketId !== socket.id)
    .map(buildClientPayload);

  socket.emit('hello', {
    self: buildClientPayload(clientData),
    peers,
  });

  // Inform everyone else that a new user joined.
  socket.broadcast.emit('user-joined', buildClientPayload(clientData));

  // Receive intensity updates sent by this client.
  socket.on('state-update', (payload = {}) => {
    const client = clients.get(socket.id);
    if (!client) {
      return;
    }

    const rawIntensity = payload.intensity;
    const clampedIntensity = Math.max(0, Math.min(rawIntensity, 1));

    client.intensity = clampedIntensity;

    socket.broadcast.emit('state-update', {
      userId: client.userId,
      intensity: client.intensity,
    });
  });

  // Clean up state when the client disconnects.
  socket.on('disconnect', () => {
    const client = clients.get(socket.id);
    if (!client) {
      return;
    }

    clients.delete(socket.id);

    socket.broadcast.emit('user-left', {
      userId: client.userId,
    });
  });
});

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
