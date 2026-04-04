// ==================== LOBBY UI ====================
const Lobby = {
  serverUrl: null,
  players: [],
  onStart: null, // callback when game starts

  async show() {
    // Determine server URL (same origin when served from server)
    this.serverUrl = window.location.origin;

    const html = `
      <h2>다인 플레이</h2>
      <div id="lobby-main">
        <div style="margin-bottom:12px">
          <label style="font-size:15px;color:#aaa">닉네임</label><br>
          <input type="text" id="lobby-name" value="플레이어" maxlength="8"
            style="margin-top:6px;padding:8px 14px;border-radius:8px;border:2px solid #555;background:#1a2a1a;color:#fff;font-size:16px;width:200px;text-align:center">
        </div>
        <div class="btn-row">
          <button class="btn primary" id="lobby-create">방 만들기</button>
          <button class="btn" id="lobby-join-show">방 참가</button>
        </div>
        <div id="lobby-join-input" style="display:none;margin-top:14px;text-align:center">
          <input type="text" id="lobby-code-input" placeholder="방 코드 입력" maxlength="4"
            style="padding:8px 14px;border-radius:8px;border:2px solid #555;background:#1a2a1a;color:#FFD700;font-size:22px;width:140px;text-align:center;letter-spacing:6px;text-transform:uppercase">
          <button class="btn primary" id="lobby-join-go" style="margin-left:8px">참가</button>
        </div>
        <p id="lobby-error" style="color:#f44336;font-size:14px;margin-top:10px;display:none"></p>
      </div>
      <div id="lobby-room" style="display:none">
        <div style="text-align:center;margin-bottom:16px">
          <span style="color:#aaa;font-size:14px">방 코드</span><br>
          <span id="lobby-room-code" style="font-size:36px;color:#FFD700;letter-spacing:8px;font-weight:bold"></span>
        </div>
        <div id="lobby-player-list" style="margin:16px 0"></div>
        <p style="text-align:center;color:#888;font-size:13px" id="lobby-ai-note"></p>
        <div class="btn-row" style="margin-top:16px">
          <button class="btn primary" id="lobby-start" style="display:none">게임 시작</button>
          <button class="btn" id="lobby-leave">나가기</button>
        </div>
        <p style="text-align:center;color:#888;font-size:13px;margin-top:8px" id="lobby-wait-msg"></p>
      </div>
    `;

    const panel = document.getElementById('panel-multi');
    panel.innerHTML = html;
    panel.classList.add('visible');

    // Wire up events
    document.getElementById('lobby-create').onclick = () => this.createRoom();
    document.getElementById('lobby-join-show').onclick = () => {
      document.getElementById('lobby-join-input').style.display = 'block';
    };
    document.getElementById('lobby-join-go').onclick = () => this.joinRoom();
    document.getElementById('lobby-code-input').addEventListener('keyup', (e) => {
      if (e.key === 'Enter') this.joinRoom();
    });
    document.getElementById('lobby-leave').onclick = () => this.leave();
  },

  showError(msg) {
    const el = document.getElementById('lobby-error');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 3000);
  },

  async createRoom() {
    const name = document.getElementById('lobby-name').value.trim() || '호스트';
    try {
      await Network.connect(this.serverUrl);
      const res = await Network.createRoom(name);
      this.showRoom(res.code, true);
      this.setupNetworkHandlers();
    } catch (e) {
      this.showError(e.message);
    }
  },

  async joinRoom() {
    const name = document.getElementById('lobby-name').value.trim() || '참가자';
    const code = document.getElementById('lobby-code-input').value.trim().toUpperCase();
    if (code.length !== 4) { this.showError('4자리 방 코드를 입력하세요.'); return; }
    try {
      await Network.connect(this.serverUrl);
      const res = await Network.joinRoom(code, name);
      this.showRoom(code, false);
      this.updatePlayerList(res.players);
      this.setupNetworkHandlers();
    } catch (e) {
      this.showError(e.message);
    }
  },

  showRoom(code, isHost) {
    document.getElementById('lobby-main').style.display = 'none';
    document.getElementById('lobby-room').style.display = 'block';
    document.getElementById('lobby-room-code').textContent = code;
    if (isHost) {
      document.getElementById('lobby-start').style.display = 'inline-block';
      document.getElementById('lobby-start').onclick = () => this.startGame();
      document.getElementById('lobby-wait-msg').textContent = '다른 플레이어를 기다리는 중...';
    } else {
      document.getElementById('lobby-wait-msg').textContent = '호스트가 게임을 시작할 때까지 대기 중...';
    }
  },

  setupNetworkHandlers() {
    Network.onPlayerList = (players) => this.updatePlayerList(players);
    Network.onPlayerLeft = (data) => this.updatePlayerList(data.players);
    Network.onGameStarted = (data) => this.onGameStart(data);
    Network.onHostDisconnected = () => {
      alert('호스트가 연결을 끊었습니다.');
      this.leave();
    };
  },

  updatePlayerList(players) {
    this.players = players;
    const container = document.getElementById('lobby-player-list');
    if (!container) return;
    const aiCount = 5 - players.length;
    container.innerHTML = players.map((p, i) =>
      `<div style="padding:6px 16px;margin:4px 0;background:rgba(255,215,0,0.1);border:1px solid rgba(255,215,0,0.3);border-radius:8px;display:flex;justify-content:space-between;align-items:center">
        <span style="color:#fff;font-weight:bold">${p.name}</span>
        <span style="color:#888;font-size:12px">${i === 0 ? '호스트' : '참가자'}</span>
      </div>`
    ).join('');

    // Show AI note
    const noteEl = document.getElementById('lobby-ai-note');
    if (noteEl) {
      noteEl.textContent = aiCount > 0
        ? `빈 자리 ${aiCount}개는 AI가 채웁니다.`
        : '5명 모두 참가!';
    }

    // Enable start button if host and 2+ players
    const startBtn = document.getElementById('lobby-start');
    if (startBtn && Network.isHost) {
      startBtn.disabled = players.length < 2;
    }
  },

  async startGame() {
    try {
      await Network.startGame();
    } catch (e) {
      this.showError(e.message);
    }
  },

  onGameStart(data) {
    // Close lobby panel
    document.getElementById('panel-multi').classList.remove('visible');

    // Start the game with multiplayer config
    if (this.onStart) {
      this.onStart({
        isHost: Network.isHost,
        mySeat: Network.mySeat,
        players: data.players
      });
    }
  },

  leave() {
    Network.disconnect();
    // Reset lobby
    document.getElementById('panel-multi').classList.remove('visible');
  }
};
