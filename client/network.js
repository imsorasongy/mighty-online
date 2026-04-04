// ==================== NETWORK LAYER ====================
const Network = {
  socket: null,
  roomCode: null,
  isHost: false,
  mySeat: -1,
  connected: false,

  // Event handlers (set by lobby/host/remote)
  onPlayerList: null,
  onPlayerLeft: null,
  onGameStarted: null,
  onGameMsg: null,
  onHostDisconnected: null,

  connect(serverUrl) {
    return new Promise((resolve, reject) => {
      if (this.socket) { resolve(); return; }
      // Load socket.io client from server
      const script = document.createElement('script');
      script.src = serverUrl + '/socket.io/socket.io.js';
      script.onload = () => {
        this.socket = io(serverUrl);
        this.socket.on('connect', () => {
          this.connected = true;
          console.log('[Network] 서버 연결됨');

          this.socket.on('player-list', (data) => {
            if (this.onPlayerList) this.onPlayerList(data.players);
          });
          this.socket.on('player-left', (data) => {
            if (this.onPlayerLeft) this.onPlayerLeft(data);
          });
          this.socket.on('game-started', (data) => {
            if (this.onGameStarted) this.onGameStarted(data);
          });
          this.socket.on('game-msg', (data) => {
            if (this.onGameMsg) this.onGameMsg(data);
          });
          this.socket.on('host-disconnected', () => {
            if (this.onHostDisconnected) this.onHostDisconnected();
          });

          resolve();
        });
        this.socket.on('connect_error', (err) => {
          reject(new Error('서버 연결 실패: ' + err.message));
        });
      };
      script.onerror = () => reject(new Error('Socket.io 로드 실패'));
      document.head.appendChild(script);
    });
  },

  createRoom(name) {
    return new Promise((resolve, reject) => {
      this.socket.emit('create-room', { name }, (res) => {
        if (res.success) {
          this.roomCode = res.code;
          this.mySeat = res.seat;
          this.isHost = true;
          resolve(res);
        } else {
          reject(new Error(res.error));
        }
      });
    });
  },

  joinRoom(code, name) {
    return new Promise((resolve, reject) => {
      this.socket.emit('join-room', { code: code.toUpperCase(), name }, (res) => {
        if (res.success) {
          this.roomCode = code.toUpperCase();
          this.mySeat = res.seat;
          this.isHost = false;
          resolve(res);
        } else {
          reject(new Error(res.error));
        }
      });
    });
  },

  startGame() {
    return new Promise((resolve, reject) => {
      this.socket.emit('start-game', {}, (res) => {
        if (res && res.success) resolve();
        else reject(new Error(res ? res.error : '시작 실패'));
      });
    });
  },

  // 호스트 → 전체 또는 특정 시트
  send(type, payload, toSeat) {
    if (!this.socket) return;
    this.socket.emit('game-msg', { type, payload, to: toSeat !== undefined ? toSeat : null });
  },

  // 참가자 → 호스트
  sendToHost(type, payload) {
    if (!this.socket) return;
    this.socket.emit('game-msg', { type, payload });
  },

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
      this.roomCode = null;
      this.isHost = false;
      this.mySeat = -1;
    }
  }
};
