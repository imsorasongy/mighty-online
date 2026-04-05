// ==================== HOST ADAPTER ====================
// Runs on the host client. Hooks into game flow to broadcast state
// and wait for remote player input.

const HostAdapter = {
  pendingResolves: {}, // seat -> {resolve}

  init() {
    Network.onGameMsg = (data) => this.handleMessage(data);
    Network.onPlayerLeft = (data) => {
      // Player left mid-game: switch their seat to AI
      const seat = data.seat;
      if (multiplayerMode.playerSlots[seat] === 'remote') {
        multiplayerMode.playerSlots[seat] = 'ai';
        game.playerNames[seat] = ['트럼프', '시진핑', '푸틴', '김정은'][seat - 1] || 'AI';
        updateNameTags();
        // If we were waiting for this player, resolve with AI
        if (this.pendingResolves[seat]) {
          this.pendingResolves[seat].resolve({ aiTakeover: true });
          delete this.pendingResolves[seat];
        }
      }
    };
  },

  handleMessage(data) {
    const { type, payload, from } = data;
    // Resolve pending wait if matching
    if (this.pendingResolves[from]) {
      this.pendingResolves[from].resolve(payload);
      delete this.pendingResolves[from];
    }
  },

  // Wait for a remote player to send a response
  // No timeout - only AI takeover if player disconnects (handled by onPlayerLeft)
  waitForRemote(seat, requestType, requestPayload) {
    // Send request to specific seat
    Network.send(requestType, requestPayload, seat);
    return new Promise((resolve) => {
      this.pendingResolves[seat] = { resolve };
    });
  },

  // Broadcast game state to all remote players (each gets personalized view)
  broadcastState() {
    if (!multiplayerMode.enabled) return;
    for (let seat = 0; seat < 5; seat++) {
      if (multiplayerMode.playerSlots[seat] !== 'remote') continue;
      const state = this.buildStateForSeat(seat);
      Network.send('state-update', state, seat);
    }
  },

  buildStateForSeat(seat) {
    return {
      phase: game.phase,
      trump: game.trump,
      declarer: game.declarer,
      friend: game.friend,
      friendRevealed: game.friendRevealed,
      friendType: game.friendType,
      friendCard: game.friendCard,
      currentBid: game.currentBid,
      trickNumber: game.trickNumber,
      currentTrick: game.currentTrick,
      trickLeader: game.trickLeader,
      currentPlayer: game.currentPlayer,
      rulingPoints: game.rulingPoints,
      oppoPoints: game.oppoPoints,
      playerNames: game.playerNames,
      totalScores: game.totalScores,
      handNumber: game.handNumber,
      yourHand: game.hands[seat],
      handCounts: game.hands.map(h => h.length),
      playerWonPointCards: game.playerWonPointCards,
      discardedPoints: 0 // hidden until scoring
    };
  }
};
