const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const os = require('os');

let mainWindow;
let tunnel = null;
const PORT = 3000;

// ==================== SERVER (embedded) ====================
const expressApp = express();
const server = http.createServer(expressApp);
const io = new Server(server, { cors: { origin: '*' } });

expressApp.use(express.static(__dirname));

expressApp.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '온라인마이티.html'));
});

let tunnelUrl = null;

expressApp.get('/api/server-info', (req, res) => {
  const addresses = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  res.json({ addresses, port: PORT, tunnelUrl });
});

// ==================== ROOM MANAGEMENT ====================
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);
  let currentRoom = null;
  let currentSeat = -1;

  socket.on('create-room', (data, callback) => {
    const code = generateRoomCode();
    const room = {
      code,
      hostId: socket.id,
      players: [{ id: socket.id, name: data.name || 'Host', seat: 0 }],
      started: false
    };
    rooms.set(code, room);
    currentRoom = code;
    currentSeat = 0;
    socket.join(code);
    callback({ success: true, code, seat: 0 });
  });

  socket.on('join-room', (data, callback) => {
    const room = rooms.get(data.code);
    if (!room) { callback({ success: false, error: '존재하지 않는 방입니다.' }); return; }
    if (room.started) { callback({ success: false, error: '이미 게임이 시작되었습니다.' }); return; }
    if (room.players.length >= 5) { callback({ success: false, error: '방이 가득 찼습니다.' }); return; }

    const seat = room.players.length;
    room.players.push({ id: socket.id, name: data.name || `Player${seat}`, seat });
    currentRoom = data.code;
    currentSeat = seat;
    socket.join(data.code);

    const playerList = room.players.map(p => ({ name: p.name, seat: p.seat }));
    io.to(data.code).emit('player-list', { players: playerList });
    callback({ success: true, seat, players: playerList });
  });

  socket.on('start-game', (data, callback) => {
    const room = rooms.get(currentRoom);
    if (!room || room.hostId !== socket.id) {
      callback && callback({ success: false, error: '호스트만 시작할 수 있습니다.' });
      return;
    }
    room.started = true;
    const playerList = room.players.map(p => ({ name: p.name, seat: p.seat }));
    io.to(currentRoom).emit('game-started', { players: playerList });
    callback && callback({ success: true });
  });

  socket.on('game-msg', (data) => {
    const room = rooms.get(currentRoom);
    if (!room) return;

    if (socket.id === room.hostId) {
      if (data.to !== undefined && data.to !== null) {
        const target = room.players.find(p => p.seat === data.to);
        if (target) {
          io.to(target.id).emit('game-msg', { type: data.type, payload: data.payload, from: 0 });
        }
      } else {
        socket.to(currentRoom).emit('game-msg', { type: data.type, payload: data.payload, from: 0 });
      }
    } else {
      io.to(room.hostId).emit('game-msg', { type: data.type, payload: data.payload, from: currentSeat });
    }
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    if (socket.id === room.hostId) {
      io.to(currentRoom).emit('host-disconnected');
      rooms.delete(currentRoom);
    } else {
      room.players = room.players.filter(p => p.id !== socket.id);
      const playerList = room.players.map(p => ({ name: p.name, seat: p.seat }));
      io.to(currentRoom).emit('player-left', { seat: currentSeat, players: playerList });
    }
  });
});

// ==================== ELECTRON APP ====================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Mighty Online',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    server.listen(PORT, '0.0.0.0', async () => {
      console.log(`Server running on port ${PORT}`);

      // Start tunnel
      try {
        const localtunnel = require('localtunnel');
        tunnel = await localtunnel({ port: PORT });
        tunnelUrl = tunnel.url;
        console.log(`Tunnel: ${tunnelUrl}`);
        tunnel.on('close', () => { tunnelUrl = null; });
      } catch (e) {
        console.log('Tunnel failed:', e.message);
      }

      resolve();
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Port already in use - just connect to it
        resolve();
      } else {
        reject(err);
      }
    });
  });
}

app.whenReady().then(async () => {
  await startServer();
  createWindow();
});

app.on('window-all-closed', () => {
  if (tunnel) tunnel.close();
  server.close();
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
