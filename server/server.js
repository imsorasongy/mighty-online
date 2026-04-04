const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Serve static files from parent directory
app.use(express.static(path.join(__dirname, '..')));

// Serve 온라인마이티.html as the default page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '온라인마이티.html'));
});

// ==================== ROOM MANAGEMENT ====================
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusing chars
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

io.on('connection', (socket) => {
  console.log(`[연결] ${socket.id}`);
  let currentRoom = null;
  let currentSeat = -1;

  // 방 만들기
  socket.on('create-room', (data, callback) => {
    const code = generateRoomCode();
    const room = {
      code,
      hostId: socket.id,
      players: [{ id: socket.id, name: data.name || '호스트', seat: 0 }],
      started: false
    };
    rooms.set(code, room);
    currentRoom = code;
    currentSeat = 0;
    socket.join(code);
    console.log(`[방 생성] ${code} by ${data.name}`);
    callback({ success: true, code, seat: 0 });
  });

  // 방 참가
  socket.on('join-room', (data, callback) => {
    const room = rooms.get(data.code);
    if (!room) {
      callback({ success: false, error: '존재하지 않는 방입니다.' });
      return;
    }
    if (room.started) {
      callback({ success: false, error: '이미 게임이 시작되었습니다.' });
      return;
    }
    if (room.players.length >= 5) {
      callback({ success: false, error: '방이 가득 찼습니다.' });
      return;
    }

    const seat = room.players.length;
    room.players.push({ id: socket.id, name: data.name || `Player${seat}`, seat });
    currentRoom = data.code;
    currentSeat = seat;
    socket.join(data.code);

    // 방의 모든 플레이어 목록 전송
    const playerList = room.players.map(p => ({ name: p.name, seat: p.seat }));
    io.to(data.code).emit('player-list', { players: playerList });

    console.log(`[참가] ${data.name} -> ${data.code} (seat ${seat})`);
    callback({ success: true, seat, players: playerList });
  });

  // 게임 시작 (호스트만)
  socket.on('start-game', (data, callback) => {
    const room = rooms.get(currentRoom);
    if (!room || room.hostId !== socket.id) {
      callback && callback({ success: false, error: '호스트만 시작할 수 있습니다.' });
      return;
    }
    room.started = true;
    const playerList = room.players.map(p => ({ name: p.name, seat: p.seat }));
    io.to(currentRoom).emit('game-started', { players: playerList });
    console.log(`[게임 시작] ${currentRoom} (${room.players.length}명)`);
    callback && callback({ success: true });
  });

  // 게임 메시지 중계 (호스트 → 특정 플레이어 or 전체, 플레이어 → 호스트)
  socket.on('game-msg', (data) => {
    const room = rooms.get(currentRoom);
    if (!room) return;

    if (socket.id === room.hostId) {
      // 호스트가 보냄: 특정 대상 or 전체
      if (data.to !== undefined && data.to !== null) {
        // 특정 시트에게
        const target = room.players.find(p => p.seat === data.to);
        if (target) {
          io.to(target.id).emit('game-msg', { type: data.type, payload: data.payload, from: 0 });
        }
      } else {
        // 전체 (호스트 제외)
        socket.to(currentRoom).emit('game-msg', { type: data.type, payload: data.payload, from: 0 });
      }
    } else {
      // 플레이어가 보냄: 호스트에게만
      io.to(room.hostId).emit('game-msg', { type: data.type, payload: data.payload, from: currentSeat });
    }
  });

  // 연결 끊김
  socket.on('disconnect', () => {
    console.log(`[연결 해제] ${socket.id}`);
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    if (socket.id === room.hostId) {
      // 호스트 나감: 방 전체 종료
      io.to(currentRoom).emit('host-disconnected');
      rooms.delete(currentRoom);
      console.log(`[방 삭제] ${currentRoom} (호스트 퇴장)`);
    } else {
      // 일반 플레이어 나감
      room.players = room.players.filter(p => p.id !== socket.id);
      const playerList = room.players.map(p => ({ name: p.name, seat: p.seat }));
      io.to(currentRoom).emit('player-left', { seat: currentSeat, players: playerList });
      console.log(`[퇴장] seat ${currentSeat} from ${currentRoom}`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`마이티 서버 실행 중: http://localhost:${PORT}`);
});
