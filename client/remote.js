// ==================== REMOTE CLIENT ADAPTER ====================
// Runs on non-host clients. Receives state from host, renders UI,
// captures player actions and sends them to host.

const RemoteAdapter = {
  gameState: null,
  waitingForInput: false, // 입력 대기 중이면 render에서 핸드 갱신 방지
  lastHandNumber: 0, // 판 번호 추적

  init() {
    Network.onGameMsg = (data) => this.handleMessage(data);
    Network.onHostDisconnected = () => {
      alert('호스트가 연결을 끊었습니다. 게임이 종료됩니다.');
      window.location.reload();
    };
  },

  handleMessage(data) {
    const { type, payload } = data;

    switch (type) {
      case 'state-update':
        this.applyState(payload);
        break;
      case 'your-turn-bid':
        this.handleBidRequest(payload);
        break;
      case 'your-turn-exchange':
        this.handleExchangeRequest(payload);
        break;
      case 'your-turn-trump-change':
        this.handleTrumpChangeRequest(payload);
        break;
      case 'your-turn-friend':
        this.handleFriendRequest(payload);
        break;
      case 'your-turn-play':
        this.handlePlayRequest(payload);
        break;
      case 'your-turn-joker-suit':
        this.handleJokerSuitRequest(payload);
        break;
      case 'new-round':
        this.handleNewRound(payload);
        break;
      case 'show-message':
        showMessage(payload.text, payload.duration || 1800);
        break;
      case 'play-sfx':
        SFX.play(payload.sfx);
        break;
      case 'trick-result':
        // Already reflected in state-update
        break;
      case 'round-result':
        this.handleRoundResult(payload);
        break;
      case 'game-over':
        this.handleGameOver(payload);
        break;
    }
  },

  applyState(state) {
    this.gameState = state;

    // Update game object fields for rendering functions to use
    game.phase = state.phase;
    game.trump = state.trump;
    game.declarer = state.declarer;
    game.friend = state.friend;
    game.friendRevealed = state.friendRevealed;
    game.friendType = state.friendType;
    game.friendCard = state.friendCard;
    game.currentBid = state.currentBid;
    game.trickNumber = state.trickNumber;
    game.currentTrick = state.currentTrick;
    game.trickLeader = state.trickLeader;
    game.currentPlayer = state.currentPlayer;
    game.rulingPoints = state.rulingPoints;
    game.oppoPoints = state.oppoPoints;
    game.playerNames = state.playerNames;
    game.totalScores = state.totalScores;
    game.handNumber = state.handNumber;
    game.playerWonPointCards = state.playerWonPointCards;

    // Set own hand
    game.hands[localPlayerIndex] = state.yourHand || [];

    // Render (입력 대기 중이면 핸드카드 갱신 방지)
    this.render(state);
  },

  render(state) {
    updateNameTags();
    updateTrumpIndicator();
    updatePointCounter();
    updateWonCardsDisplay();
    updateScoreboard();

    // 지지율 표시 (view 기준)
    for (let view = 0; view < 5; view++) {
      const seat = viewToSeat(view);
      document.getElementById(`total-${view}`).textContent = '지지율 ' + state.totalScores[seat] + '%';
    }

    if (state.trickNumber !== undefined) {
      document.getElementById('trick-num').textContent = (state.trickNumber + 1);
      document.getElementById('trick-counter').classList.add('visible');
      document.getElementById('point-counter').classList.add('visible');
    }

    // Render own hand (입력 대기 중이면 건드리지 않음)
    if (!this.waitingForInput) {
      updatePlayerHand();
    }

    // Render AI hands (view 기준)
    const bw = isMobile() ? 20 : 36;
    const bh = isMobile() ? 28 : 52;
    const ml = isMobile() ? '-5px' : '-10px';
    for (let view = 1; view < 5; view++) {
      const seat = viewToSeat(view);
      const el = document.getElementById(`ai-hand-${view}`);
      if (!el) continue;
      el.innerHTML = '';
      const count = state.handCounts ? state.handCounts[seat] : 0;
      for (let j = 0; j < count; j++) {
        const back = renderCardBack(bw, bh);
        back.style.marginLeft = j === 0 ? '0' : ml;
        el.appendChild(back);
      }
    }

    // Render current trick (placeCardInSlot은 내부에서 seatToView 사용)
    clearPlayArea();
    if (state.currentTrick) {
      for (const play of state.currentTrick) {
        placeCardInSlot(play.player, play.card);
      }
    }
  },

  // ========== Turn Handlers ==========

  async handleBidRequest(payload) {
    this.waitingForInput = true;
    const bid = await humanBid();
    this.waitingForInput = false;
    Network.sendToHost('bid-response', bid);
  },

  async handleExchangeRequest(payload) {
    this.waitingForInput = true;
    // payload has { allCards, kittyLabel }
    const allCards = payload.allCards;
    game.sortHand(allCards);

    const result = await new Promise(resolve => {
      let selected = new Set();
      let modal = null;

      function render() {
        const kittyLabel = payload.kittyLabel || '';
        const html = `
          <h2>카드 교환</h2>
          <p style="text-align:center;color:#aaa">바닥패: ${kittyLabel}</p>
          <p style="text-align:center">버릴 카드 3장을 선택하세요</p>
          <div class="card-row" id="exchange-cards"></div>
          <div class="btn-row">
            <button class="btn primary" id="exchange-confirm" ${selected.size !== 3 ? 'disabled' : ''}>확인 (${selected.size}/3)</button>
          </div>`;
        if (modal) removeModal(modal);
        modal = showModal(html);
        const cardRow = modal.querySelector('#exchange-cards');
        for (let i = 0; i < allCards.length; i++) {
          const wrapper = document.createElement('div');
          wrapper.style.display = 'inline-block';
          wrapper.style.cursor = 'pointer';
          wrapper.style.transition = 'transform 0.15s';
          if (selected.has(i)) wrapper.style.transform = 'translateY(-12px)';
          const canvas = renderCard(allCards[i], 56, 80);
          canvas.style.borderRadius = '5px';
          if (selected.has(i)) {
            canvas.style.outline = '2px solid #FFD700';
            canvas.style.borderRadius = '5px';
          }
          wrapper.appendChild(canvas);
          wrapper.addEventListener('click', () => {
            if (selected.has(i)) selected.delete(i);
            else if (selected.size < 3) selected.add(i);
            render();
          });
          cardRow.appendChild(wrapper);
        }
        modal.querySelector('#exchange-confirm')?.addEventListener('click', () => {
          if (selected.size === 3) {
            const discarded = [...selected].map(i => allCards[i]);
            removeModal(modal);
            resolve(discarded);
          }
        });
      }
      render();
    });

    this.waitingForInput = false;
    Network.sendToHost('exchange-response', { discards: result });
  },

  async handleTrumpChangeRequest(payload) {
    this.waitingForInput = true;
    const currentTrump = payload.currentTrump || 'spades';
    const currentBidNum = payload.currentBidNum || 13;
    const result = await new Promise(resolve => {
      let newTrump = currentTrump;
      let newBidNum = currentBidNum;
      let modal = null;

      function renderTrumpBid() {
        const trumpText = newTrump === 'notrump' ? 'NT' : SUIT_SYMBOLS[newTrump];
        const trumpColor = newTrump === 'notrump' ? '#FFD700' : SUIT_COLORS[newTrump];
        const html = `
          <h2>기루다 / 공약 변경</h2>
          <p style="text-align:center;font-size:20px;margin:10px 0">
            현재: <span style="color:${trumpColor};font-weight:bold">${newBidNum} ${trumpText}</span>
          </p>
          <p style="text-align:center;color:#aaa;font-size:13px;margin-bottom:10px">기루다 변경 시 공약이 자동으로 올라갑니다</p>
          <div style="text-align:center;margin-bottom:12px">
            <span style="color:#aaa;font-size:13px">기루다 선택</span><br>
            <div class="btn-row" style="margin-top:6px">
              ${SUITS.map(s => `<button class="btn ${newTrump === s ? 'primary' : ''}" data-newsuit="${s}" style="color:${SUIT_COLORS[s]}">${SUIT_SYMBOLS[s]}</button>`).join('')}
              <button class="btn ${newTrump === 'notrump' ? 'primary' : ''}" data-newsuit="notrump" style="color:#FFD700">NT</button>
            </div>
          </div>
          <div style="text-align:center;margin-bottom:14px">
            <span style="color:#aaa;font-size:13px">공약 추가</span><br>
            <div class="btn-row" style="margin-top:6px">
              <button class="btn" id="bid-down" ${newBidNum <= currentBidNum ? 'disabled' : ''}>-</button>
              <span style="font-size:24px;font-weight:bold;color:#FFD700;min-width:50px;display:inline-block">${newBidNum}</span>
              <button class="btn" id="bid-up" ${newBidNum >= 20 ? 'disabled' : ''}>+</button>
            </div>
          </div>
          <div class="btn-row">
            <button class="btn primary" id="confirm-trump-bid">확인</button>
          </div>`;
        if (modal) removeModal(modal);
        modal = showModal(html);

        modal.querySelectorAll('[data-newsuit]').forEach(btn => {
          btn.addEventListener('click', () => {
            const suit = btn.dataset.newsuit;
            if (suit !== currentTrump) {
              if (currentTrump !== 'notrump' && suit === 'notrump') {
                newBidNum = Math.max(newBidNum, currentBidNum + 1);
              } else if (suit !== newTrump) {
                newBidNum = Math.max(newBidNum, currentBidNum + 2);
              }
            }
            newTrump = suit;
            renderTrumpBid();
          });
        });
        modal.querySelector('#bid-up')?.addEventListener('click', () => {
          if (newBidNum < 20) { newBidNum++; renderTrumpBid(); }
        });
        modal.querySelector('#bid-down')?.addEventListener('click', () => {
          if (newBidNum > currentBidNum) { newBidNum--; renderTrumpBid(); }
        });
        modal.querySelector('#confirm-trump-bid').addEventListener('click', () => {
          removeModal(modal);
          resolve({ newTrump: newTrump !== currentTrump ? newTrump : null, newBidNum });
        });
      }
      renderTrumpBid();
    });
    this.waitingForInput = false;
    Network.sendToHost('trump-change-response', result);
  },

  async handleFriendRequest(payload) {
    this.waitingForInput = true;
    // Reuse the friend selection UI
    const result = await new Promise(resolve => {
      let selectedSuit = 'spades';
      let selectedRank = 'A';
      let modal = null;

      function render() {
        const suitBtns = SUITS.map(s =>
          `<div class="suit-btn ${selectedSuit === s ? 'active' : ''}" data-fsuit="${s}" style="color:${SUIT_COLORS[s]}">${SUIT_SYMBOLS[s]}</div>`
        ).join('');
        const rankBtns = RANKS.map(r =>
          `<div class="rank-btn ${selectedRank === r ? 'active' : ''}" data-frank="${r}">${r}</div>`
        ).join('');
        const previewText = `${selectedRank}${SUIT_SYMBOLS[selectedSuit]}`;
        const html = `
          <h2>프렌드 선택</h2>
          <div class="friend-picker">
            <p>프렌드 카드를 지정하세요</p>
            <div class="suit-select">${suitBtns}</div>
            <div class="rank-select">${rankBtns}</div>
            <p style="font-size:22px;color:#FFD700;font-weight:bold">선택: ${previewText}</p>
            <div class="btn-row">
              <button class="btn primary" id="friend-card-confirm">카드 지정</button>
              <button class="btn" id="friend-mighty" style="color:#FFD700">👑 마이티</button>
              <button class="btn" id="friend-joker" style="color:#e040fb">🃏 조커</button>
              <button class="btn" id="friend-player-show" style="color:#4FC3F7">👤 사람 지정</button>
              <button class="btn" id="friend-first">초구 프렌드</button>
              <button class="btn" id="friend-none">노프렌드</button>
            </div>
            <div id="friend-player-list" style="display:none;margin-top:10px">
              <p style="color:#aaa;font-size:13px;margin-bottom:6px;text-align:center">프렌드로 지정할 플레이어를 선택하세요</p>
              ${game.playerNames.map((name, i) => i !== Network.mySeat ?
                `<button class="btn" data-fplayer="${i}" style="margin:3px;min-width:120px">${name}</button>` : ''
              ).join('')}
            </div>
          </div>`;
        if (modal) removeModal(modal);
        modal = showModal(html);
        modal.querySelectorAll('[data-fsuit]').forEach(btn => {
          btn.addEventListener('click', () => { selectedSuit = btn.dataset.fsuit; render(); });
        });
        modal.querySelectorAll('[data-frank]').forEach(btn => {
          btn.addEventListener('click', () => { selectedRank = btn.dataset.frank; render(); });
        });
        modal.querySelector('#friend-card-confirm').addEventListener('click', () => {
          removeModal(modal);
          resolve({ type: 'card', suit: selectedSuit, rank: selectedRank });
        });
        modal.querySelector('#friend-mighty').addEventListener('click', () => {
          removeModal(modal);
          resolve({ type: 'card', isMighty: true });
        });
        modal.querySelector('#friend-joker').addEventListener('click', () => {
          removeModal(modal);
          resolve({ type: 'card', isJoker: true });
        });
        modal.querySelector('#friend-player-show').addEventListener('click', () => {
          const list = modal.querySelector('#friend-player-list');
          list.style.display = list.style.display === 'none' ? 'block' : 'none';
        });
        modal.querySelectorAll('[data-fplayer]').forEach(btn => {
          btn.addEventListener('click', () => {
            removeModal(modal);
            resolve({ type: 'player', seat: parseInt(btn.dataset.fplayer) });
          });
        });
        modal.querySelector('#friend-first').addEventListener('click', () => {
          removeModal(modal); resolve({ type: 'first' });
        });
        modal.querySelector('#friend-none').addEventListener('click', () => {
          removeModal(modal); resolve({ type: 'none' });
        });
      }
      render();
    });
    this.waitingForInput = false;
    Network.sendToHost('friend-response', result);
  },

  async handlePlayRequest(payload) {
    this.waitingForInput = true;
    const playableCards = payload.playableCards;
    // Show joker call button if applicable
    if (payload.canJokerCall) {
      document.getElementById('joker-call-btn').style.display = 'block';
    }

    updatePlayerHand(true, playableCards);
    const chosenCard = await waitForUI();
    this.waitingForInput = false;
    document.getElementById('joker-call-btn').style.display = 'none';
    Network.sendToHost('play-response', { card: chosenCard });
  },

  async handleJokerSuitRequest() {
    this.waitingForInput = true;
    const suit = await pickJokerSuit();
    this.waitingForInput = false;
    Network.sendToHost('joker-suit-response', { suit });
  },

  handleNewRound(payload) {
    // 화면 정리
    clearPlayArea();
    clearWonCards();
    document.getElementById('hand-container').innerHTML = '';
    for (let v = 1; v < 5; v++) {
      const el = document.getElementById(`ai-hand-${v}`);
      if (el) el.innerHTML = '';
    }
    // 트릭/포인트 카운터 숨기기
    document.getElementById('point-counter').classList.remove('visible');
    document.getElementById('trick-counter').classList.remove('visible');
    // 기루다 표시 초기화
    document.getElementById('trump-indicator').classList.remove('visible');
  },

  async handleRoundResult(payload) {
    const modal = showModal(payload.html);
    await new Promise(resolve => {
      modal.querySelector('#next-hand').addEventListener('click', () => {
        removeModal(modal);
        resolve();
      });
    });
  },

  async handleGameOver(payload) {
    const modal = showModal(payload.html);
    modal.querySelector('#new-game')?.addEventListener('click', () => {
      removeModal(modal);
      window.location.reload();
    });
  }
};
