const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzReMeuhTNzHlzNBA6BvldLcGLNTLsOBf6-zunyHc6cdk1u5Mt3hBkfur8XY9ZPK22n/exec';

const RARITY_STATS = {
  Common: { hp: 100, atk: 15 },
  Uncommon: { hp: 130, atk: 20 },
  Rare: { hp: 165, atk: 26 },
  Epic: { hp: 205, atk: 33 },
  Mythic: { hp: 250, atk: 41 },
  Legend: { hp: 300, atk: 50 }
};

const ELEMENTS = ['Fire', 'Nature', 'Water', 'Lightning'];
const ELEM_ICONS = { Fire: '🔥', Nature: '🌿', Water: '💧', Lightning: '⚡' };

function getElementFromId(itemId) {
  let hash = 0;
  const str = String(itemId);
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) % 1000;
  return ELEMENTS[hash % ELEMENTS.length];
}

// =========================================================
// RETRO MISCRITS-STYLE SYNTHESIZER (BGM + BATTLE SFX)
// =========================================================
const SoundEngine = {
  ctx: null,
  enabled: true,
  bgmTimer: null,
  noteStep: 0,

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  playTone(freq, duration, type = 'triangle', vol = 0.08, delay = 0) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  },

  startBattleBGM() {
    if (!this.enabled || this.bgmTimer) return;
    this.init();
    // Upbeat fantasy RPG battle loop (C minor / G heroic progression)
    const melody = [
      261.63, 311.13, 392.00, 523.25,
      466.16, 392.00, 311.13, 392.00,
      293.66, 349.23, 440.00, 587.33,
      523.25, 493.88, 392.00, 293.66
    ];
    this.noteStep = 0;
    this.bgmTimer = setInterval(() => {
      if (!this.enabled) return;
      const note = melody[this.noteStep % melody.length];
      this.playTone(note, 0.22, 'triangle', 0.045);
      if (this.noteStep % 2 === 0) {
        this.playTone(note / 2, 0.25, 'sine', 0.05);
      }
      this.noteStep++;
    }, 240);
  },

  stopBGM() {
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  },

  playSfx(type) {
    if (!this.enabled) return;
    if (type === 'select') {
      this.playTone(523.25, 0.09, 'sine', 0.08);
      this.playTone(659.25, 0.12, 'sine', 0.08, 0.07);
    } else if (type === 'heal') {
      this.playTone(440, 0.14, 'sine', 0.09);
      this.playTone(554.37, 0.14, 'sine', 0.09, 0.1);
      this.playTone(659.25, 0.25, 'sine', 0.1, 0.2);
    } else if (type === 'hit') {
      this.playTone(180, 0.12, 'sawtooth', 0.11);
      this.playTone(110, 0.2, 'square', 0.11, 0.08);
    } else if (type === 'victory') {
      this.playTone(523.25, 0.15, 'triangle', 0.1);
      this.playTone(659.25, 0.15, 'triangle', 0.1, 0.15);
      this.playTone(783.99, 0.15, 'triangle', 0.1, 0.3);
      this.playTone(1046.50, 0.4, 'triangle', 0.12, 0.45);
    }
  }
};

document.getElementById('audio-toggle-btn').addEventListener('click', () => {
  SoundEngine.enabled = !SoundEngine.enabled;
  const btn = document.getElementById('audio-toggle-btn');
  btn.textContent = SoundEngine.enabled ? '🔊 BGM ON' : '🔇 MUTED';
  if (!SoundEngine.enabled) {
    SoundEngine.stopBGM();
  } else if (state.activeBattleId) {
    SoundEngine.startBattleBGM();
  }
});

// =========================================================
// APPLICATION STATE
// =========================================================
let state = {
  student: null,
  pool: [],
  inventory: [],
  pullCost: 10,
  selectedSquad: [],
  activeBattleId: null,
  lastAnimTs: 0,
  pollTimer: null
};

const toggleLoader = (show) => document.getElementById('loader').classList.toggle('hidden', !show);

async function callGAS(action, payload = {}) {
  try {
    const response = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload })
    });
    return await response.json();
  } catch (error) {
    return { success: false };
  }
}

// --- LOGIN / LOGOUT ---
document.getElementById('student-login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  SoundEngine.init();
  const studentId = document.getElementById('student-id-input').value.trim().toUpperCase();
  toggleLoader(true);

  const res = await callGAS('getStudentData', { studentId });
  if (res.success) {
    state.student = res.student;
    state.pool = res.pool;
    state.inventory = res.inventory;
    state.pullCost = res.pullCost || 10;
    state.selectedSquad = state.inventory.slice(0, 3);

    document.getElementById('login-error').textContent = '';
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.remove('hidden');

    renderHUD();
    renderPoolPreview();
    renderCollection();
    renderSquadPicker();
    startLobbyHeartbeat();
  } else {
    document.getElementById('login-error').textContent = res.message;
  }
  toggleLoader(false);
});

document.getElementById('logout-btn').addEventListener('click', () => {
  SoundEngine.stopBGM();
  clearInterval(state.pollTimer);
  state = { student: null, pool: [], inventory: [], pullCost: 10, selectedSquad: [], activeBattleId: null, lastAnimTs: 0, pollTimer: null };
  document.getElementById('dashboard-view').classList.add('hidden');
  document.getElementById('login-view').classList.remove('hidden');
});

// --- MENU TABS ---
document.querySelectorAll('.menu-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    SoundEngine.playSfx('select');
    document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');
  });
});

function renderHUD() {
  document.getElementById('student-name').textContent = `👾 ${state.student.name}`;
  document.getElementById('student-guild').textContent = `🏰 ${state.student.className} • ${state.student.id}`;
  document.getElementById('student-points').textContent = state.student.points;

  const summonBtn = document.getElementById('summon-btn');
  summonBtn.textContent = `✨ SUMMON CREATURE (${state.pullCost} ⭐)`;
  summonBtn.disabled = state.student.points < state.pullCost;
}

// --- SUMMON GACHA ---
document.getElementById('summon-btn').addEventListener('click', async () => {
  if (state.student.points < state.pullCost) return;
  SoundEngine.init();

  const egg = document.getElementById('portal-placeholder');
  const wonSprite = document.getElementById('won-sprite');
  const wonBanner = document.getElementById('won-banner');
  const summonBtn = document.getElementById('summon-btn');

  summonBtn.disabled = true;
  wonSprite.classList.add('hidden');
  wonBanner.classList.add('hidden');
  egg.classList.remove('hidden');
  egg.classList.add('portal-shake');

  const res = await callGAS('pullGacha', { studentId: state.student.id });
  egg.classList.remove('portal-shake');

  if (res.success) {
    SoundEngine.playSfx('victory');
    state.student.points = res.newPoints;
    state.inventory.push(res.wonItem);
    if (state.selectedSquad.length < 3) state.selectedSquad.push(res.wonItem);

    egg.classList.add('hidden');
    wonSprite.src = res.wonItem.imageUrl;
    wonSprite.classList.remove('hidden');

    const elem = res.wonItem.element || getElementFromId(res.wonItem.itemId);
    const critterName = res.wonItem.name || `${res.wonItem.rarity} Critter`;
    const badge = document.getElementById('won-rarity-badge');
    badge.className = `badge ${res.wonItem.rarity}`;
    badge.textContent = `${critterName} • ${res.wonItem.rarity} • ${ELEM_ICONS[elem]} ${elem}`;
    wonBanner.classList.remove('hidden');

    renderHUD();
    renderCollection();
    renderSquadPicker();
  } else {
    alert(res.message || 'Summon failed!');
    renderHUD();
  }
});

function renderPoolPreview() {
  const grid = document.getElementById('pool-preview-grid');
  grid.innerHTML = state.pool.map((item, idx) => {
    const elem = item.element || getElementFromId(item.id);
    const critterName = item.name || `${item.rarity} Critter`;
    return `
      <div class="mini-card">
        <img src="${item.imageUrl}" class="mini-sprite" style="animation-delay: -${(idx * 0.3) % 2}s;" alt="${critterName}">
        <div style="margin-top:6px;">
          <div style="font-weight:800;font-size:11px;margin-bottom:4px;">${critterName}</div>
          <span class="badge ${item.rarity}">${item.rarity}</span>
          <div class="stat-line" style="margin-top:4px;">${ELEM_ICONS[elem]} ${elem}</div>
        </div>
      </div>
    `;
  }).join('');
}

// --- COLLECTION ---
function renderCollection() {
  document.getElementById('collection-count').textContent = state.inventory.length;
  const grid = document.getElementById('collection-grid');

  if (!state.inventory.length) {
    grid.innerHTML = '<div class="game-box" style="grid-column:1/-1;text-align:center;">No creatures captured yet!</div>';
    return;
  }

  const grouped = {};
  state.inventory.forEach(entry => {
    if (!grouped[entry.itemId]) grouped[entry.itemId] = { ...entry, count: 1 };
    else grouped[entry.itemId].count++;
  });

  grid.innerHTML = Object.values(grouped).map((item, idx) => {
    const stats = RARITY_STATS[item.rarity] || RARITY_STATS.Common;
    const elem = item.element || getElementFromId(item.itemId);
    const critterName = item.name || `${item.rarity} Critter`;
    return `
      <div class="item-card">
        ${item.count > 1 ? `<span class="dupe-badge">x${item.count}</span>` : ''}
        <img src="${item.imageUrl}" class="creature-sprite" style="animation-delay: -${(idx * 0.4) % 2}s;" alt="${critterName}">
        <h4 style="font-size:15px;">${critterName}</h4>
        <span class="badge ${item.rarity}">${item.rarity}</span>
        <div class="stat-line">${ELEM_ICONS[elem]} ${elem} • ❤️ ${stats.hp} • ⚔️ ${stats.atk}</div>
      </div>
    `;
  }).join('');
}

// ================= 3v3 PVP & LEADERBOARD =================

function renderSquadPicker() {
  document.getElementById('squad-count').textContent = state.selectedSquad.length;
  const squadBar = document.getElementById('active-squad-bar');
  const grid = document.getElementById('squad-picker-grid');

  // Render Top 3-Slot Active Squad Tray
  let slotsHtml = '';
  for (let i = 0; i < 3; i++) {
    const pet = state.selectedSquad[i];
    if (pet) {
      const elem = pet.element || getElementFromId(pet.itemId);
      const name = pet.name || `${pet.rarity} Critter`;
      slotsHtml += `
        <div class="squad-slot filled" onclick="toggleSquadPet('${pet.pullId}')">
          <img src="${pet.imageUrl}" style="width:42px;height:42px;object-fit:contain;" alt="${name}">
          <div style="font-size:10px;font-weight:900;color:#34d399;margin-top:2px;">#${i + 1} ${name}</div>
          <div style="font-size:9px;color:#fbbf24;">${ELEM_ICONS[elem]} ${pet.rarity}</div>
        </div>
      `;
    } else {
      slotsHtml += `
        <div class="squad-slot">
          <div style="font-size:18px;opacity:0.4;">➕</div>
          <div style="font-size:10px;color:#a5b4fc;font-weight:700;">SLOT #${i + 1}</div>
        </div>
      `;
    }
  }
  squadBar.innerHTML = slotsHtml;

  if (!state.inventory.length) {
    grid.innerHTML = '<p class="stat-line">Summon at least 1 creature to battle!</p>';
    return;
  }

  // Render Selectable Collection Grid with Clear Borders & Slot Badges
  grid.innerHTML = state.inventory.map(pet => {
    const squadIndex = state.selectedSquad.findIndex(s => s.pullId === pet.pullId);
    const isSelected = squadIndex !== -1;
    const elem = pet.element || getElementFromId(pet.itemId);
    const stats = RARITY_STATS[pet.rarity] || RARITY_STATS.Common;
    const critterName = pet.name || `${pet.rarity} Critter`;
    return `
      <div class="mini-card ${isSelected ? 'selected-squad' : ''}" onclick="toggleSquadPet('${pet.pullId}')">
        ${isSelected ? `<span class="squad-check-badge">✓ #${squadIndex + 1}</span>` : ''}
        <img src="${pet.imageUrl}" class="mini-sprite" alt="${critterName}">
        <div style="font-weight:800;font-size:11px;margin-top:4px;">${critterName}</div>
        <div style="margin-top:2px;"><span class="badge ${pet.rarity}">${pet.rarity}</span></div>
        <div class="stat-line" style="margin-top:4px;">${ELEM_ICONS[elem]} ❤️${stats.hp} ⚔️${stats.atk}</div>
      </div>
    `;
  }).join('');
}

window.toggleSquadPet = (pullId) => {
  SoundEngine.playSfx('select');
  const existsIdx = state.selectedSquad.findIndex(p => p.pullId === pullId);
  if (existsIdx !== -1) {
    state.selectedSquad.splice(existsIdx, 1);
  } else {
    if (state.selectedSquad.length >= 3) {
      return alert('Your 3v3 squad is full! Tap a selected pet to swap it out.');
    }
    const pet = state.inventory.find(p => p.pullId === pullId);
    if (pet) state.selectedSquad.push(pet);
  }
  renderSquadPicker();
};

function startLobbyHeartbeat() {
  syncLobby();
  state.pollTimer = setInterval(syncLobby, 3500);
}

async function syncLobby() {
  if (!state.student) return;

  if (state.activeBattleId) {
    const bRes = await callGAS('pollBattle', { battleId: state.activeBattleId });
    if (bRes.success) {
      renderBattleArena(bRes.state, bRes.status);
    }
    return;
  }

  const res = await callGAS('heartbeatAndLobby', {
    studentId: state.student.id,
    classId: state.student.classId,
    name: state.student.name
  });

  if (!res.success) return;

  const listEl = document.getElementById('online-players-list');
  if (!res.onlinePlayers.length) {
    listEl.innerHTML = '<p class="stat-line">No other classmates online right now. Wait for a friend to log in!</p>';
  } else {
    listEl.innerHTML = res.onlinePlayers.map(p => `
      <div class="online-row">
        <div><span class="online-dot"></span><strong>${p.name}</strong></div>
        <button class="game-btn btn-red btn-sm" onclick="challengeStudent('${p.id}', '${p.name}')">⚔️ CHALLENGE 3v3</button>
      </div>
    `).join('');
  }

  const lbEl = document.getElementById('leaderboard-list');
  lbEl.innerHTML = res.leaderboard.map((row, idx) => `
    <div class="rank-row ${idx === 0 ? 'top-1' : ''}">
      <div>
        <span class="rank-num">#${idx + 1}</span>
        <strong>${row.name}</strong>
      </div>
      <div class="rank-wins">🏆 ${row.wins} WINS</div>
    </div>
  `).join('');

  const alertBox = document.getElementById('incoming-challenge-box');
  if (res.activeBattle) {
    const b = res.activeBattle;
    if (b.status === 'PENDING' && b.p2Id === state.student.id) {
      alertBox.classList.remove('hidden');
      document.getElementById('challenger-text').textContent = `${b.p1Name} challenged you to a 3v3 Miscrits Battle!`;
      document.getElementById('accept-challenge-btn').onclick = () => acceptChallenge(b.battleId);
    } else if (b.status === 'ACTIVE') {
      alertBox.classList.add('hidden');
      enterBattleArena(b.battleId, b.state, b.status);
    }
  } else {
    alertBox.classList.add('hidden');
  }
}

window.challengeStudent = async (oppId, oppName) => {
  if (state.selectedSquad.length === 0) {
    return alert('Select 1 to 3 creatures for your squad first!');
  }
  SoundEngine.init();
  toggleLoader(true);
  const res = await callGAS('challengePlayer', {
    classId: state.student.classId,
    p1Id: state.student.id,
    p1Name: state.student.name,
    p1Team: state.selectedSquad,
    p2Id: oppId,
    p2Name: oppName
  });
  toggleLoader(false);

  if (res.success) {
    state.activeBattleId = res.battleId;
    SoundEngine.startBattleBGM();
    document.getElementById('pvp-lobby-view').classList.add('hidden');
    document.getElementById('pvp-battle-stage').classList.remove('hidden');
    document.getElementById('battle-log-box').textContent = `Waiting for ${oppName} to accept your 3v3 challenge...`;
    document.getElementById('skills-panel').classList.add('hidden');
  }
};

async function acceptChallenge(battleId) {
  if (state.selectedSquad.length === 0) {
    return alert('Select 1 to 3 creatures in your squad first!');
  }
  SoundEngine.init();
  toggleLoader(true);
  const res = await callGAS('acceptBattle', {
    battleId,
    p2Team: state.selectedSquad
  });
  toggleLoader(false);

  if (res.success) {
    document.getElementById('incoming-challenge-box').classList.add('hidden');
    enterBattleArena(battleId, res.state, 'ACTIVE');
  }
}

function enterBattleArena(battleId, battleState, status) {
  state.activeBattleId = battleId;
  SoundEngine.startBattleBGM();

  document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.querySelector('[data-tab="pvp"]').classList.add('active');
  document.getElementById('tab-pvp').classList.remove('hidden');

  document.getElementById('pvp-lobby-view').classList.add('hidden');
  document.getElementById('pvp-battle-stage').classList.remove('hidden');
  renderBattleArena(battleState, status);
}

function updateHpBar(fillEl, hp, maxHp) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  fillEl.style.width = `${pct}%`;
  fillEl.classList.remove('low-hp', 'mid-hp');
  if (pct <= 25) fillEl.classList.add('low-hp');
  else if (pct <= 55) fillEl.classList.add('mid-hp');
}

function renderBattleArena(bState, status) {
  if (!bState.p2Team || !bState.p2Team.length) return;

  const isPlayer1 = bState.p1Id === state.student.id;
  const myTeam = isPlayer1 ? bState.p1Team : bState.p2Team;
  const myIdx = isPlayer1 ? bState.p1Active : bState.p2Active;
  const oppTeam = isPlayer1 ? bState.p2Team : bState.p1Team;
  const oppIdx = isPlayer1 ? bState.p2Active : bState.p1Active;

  const myPet = myTeam[myIdx];
  const oppPet = oppTeam[oppIdx];

  // Update My HUD Plate
  document.getElementById('my-fighter-name').textContent = myPet.name || myPet.rarity;
  document.getElementById('my-fighter-elem').textContent = `${ELEM_ICONS[myPet.element]} ${myPet.element}`;
  updateHpBar(document.getElementById('my-hp-fill'), myPet.hp, myPet.maxHp);
  document.getElementById('my-hp-text').textContent = `${myPet.hp}/${myPet.maxHp}`;
  document.getElementById('my-battle-sprite').src = myPet.imageUrl;
  document.getElementById('my-bench-dots').innerHTML = myTeam.map(p => `<span class="b-dot ${p.hp <= 0 ? 'ko' : ''}"></span>`).join('');

  // Update Enemy HUD Plate
  document.getElementById('opp-fighter-name').textContent = oppPet.name || oppPet.rarity;
  document.getElementById('opp-fighter-elem').textContent = `${ELEM_ICONS[oppPet.element]} ${oppPet.element}`;
  updateHpBar(document.getElementById('opp-hp-fill'), oppPet.hp, oppPet.maxHp);
  document.getElementById('opp-hp-text').textContent = `${oppPet.hp}/${oppPet.maxHp}`;
  document.getElementById('opp-battle-sprite').src = oppPet.imageUrl;
  document.getElementById('opp-bench-dots').innerHTML = oppTeam.map(p => `<span class="b-dot ${p.hp <= 0 ? 'ko' : ''}"></span>`).join('');

  // Customize Elemental Skill Button for Active Pet
  document.getElementById('elem-skill-icon').textContent = ELEM_ICONS[myPet.element];
  document.getElementById('elem-skill-title').textContent = `${myPet.element.toUpperCase()} SURGE`;

  // Play Skill Animation if a new turn happened
  if (bState.lastAction && bState.lastAction.ts !== state.lastAnimTs) {
    state.lastAnimTs = bState.lastAction.ts;
    document.getElementById('battle-log-box').textContent = bState.lastAction.text;
    playSkillAnimation(bState.lastAction, bState.lastAction.by === state.student.id);
  }

  const turnPill = document.getElementById('turn-indicator');
  const skillsPanel = document.getElementById('skills-panel');
  const leaveBtn = document.getElementById('leave-battle-btn');

  if (status === 'FINISHED') {
    SoundEngine.stopBGM();
    const didWin = bState.winnerId === state.student.id;
    turnPill.textContent = didWin ? '🏆 VICTORY! (+15 ⭐)' : '💀 DEFEAT';
    turnPill.classList.remove('waiting');
    skillsPanel.classList.add('hidden');
    leaveBtn.classList.remove('hidden');
    if (didWin) {
      SoundEngine.playSfx('victory');
      state.student.points += 15;
      renderHUD();
    }
  } else {
    leaveBtn.classList.add('hidden');
    const isMyTurn = bState.turn === state.student.id;
    turnPill.textContent = isMyTurn ? '⚡ YOUR TURN!' : '⏳ OPPONENT TURN...';
    turnPill.classList.toggle('waiting', !isMyTurn);
    skillsPanel.classList.toggle('hidden', !isMyTurn);

    const ultBtn = document.getElementById('ult-skill-btn');
    ultBtn.disabled = myPet.ultCooldown > 0;
    document.getElementById('ult-skill-desc').textContent = myPet.ultCooldown > 0
      ? `Cooldown: ${myPet.ultCooldown}t`
      : 'Ultimate Burst';
  }
}

function showFloatingNumber(popupEl, text, isHeal = false) {
  popupEl.textContent = text;
  popupEl.classList.remove('hidden', 'heal-pop');
  if (isHeal) popupEl.classList.add('heal-pop');
  // Restart CSS animation
  void popupEl.offsetWidth;
  setTimeout(() => popupEl.classList.add('hidden'), 950);
}

function playSkillAnimation(action, didIUseIt) {
  const viewport = document.getElementById('arena-viewport');
  const mySprite = document.getElementById('my-battle-sprite');
  const oppSprite = document.getElementById('opp-battle-sprite');
  const myPopup = document.getElementById('my-dmg-popup');
  const oppPopup = document.getElementById('opp-dmg-popup');
  const orb = document.getElementById('projectile-orb');

  const FX_ICONS = {
    strike: '💥',
    fire: '🔥',
    nature: '🌿',
    water: '🌊',
    lightning: '⚡',
    heal: '💚',
    ultimate: '☄️'
  };

  if (action.animType === 'heal') {
    SoundEngine.playSfx('heal');
    const targetSprite = didIUseIt ? mySprite : oppSprite;
    const targetPopup = didIUseIt ? myPopup : oppPopup;
    targetSprite.classList.add('anim-heal');
    showFloatingNumber(targetPopup, `+${action.heal} HP`, true);
    setTimeout(() => targetSprite.classList.remove('anim-heal'), 650);
  } else if (action.animType) {
    const atkSprite = didIUseIt ? mySprite : oppSprite;
    const defSprite = didIUseIt ? oppSprite : mySprite;
    const defPopup = didIUseIt ? oppPopup : myPopup;

    if (action.animType === 'strike') {
      atkSprite.classList.add(didIUseIt ? 'anim-lunge-left' : 'anim-lunge-right');
    } else {
      // Launch flying elemental projectile across arena
      orb.textContent = FX_ICONS[action.animType] || '🔥';
      orb.classList.remove('hidden', 'fly-left-to-right', 'fly-right-to-left');
      void orb.offsetWidth;
      orb.classList.add(didIUseIt ? 'fly-left-to-right' : 'fly-right-to-left');
    }

    setTimeout(() => {
      SoundEngine.playSfx('hit');
      viewport.classList.add('arena-shake');
      defSprite.classList.add('anim-hit');
      showFloatingNumber(defPopup, `-${action.dmg}`, false);
    }, 220);

    setTimeout(() => {
      viewport.classList.remove('arena-shake');
      atkSprite.classList.remove('anim-lunge-left', 'anim-lunge-right');
      defSprite.classList.remove('anim-hit');
      orb.classList.add('hidden');
    }, 680);
  }
}

window.useSkill = async (skillIndex) => {
  SoundEngine.playSfx('select');
  document.getElementById('skills-panel').classList.add('hidden');
  document.getElementById('turn-indicator').textContent = '⚔️ ATTACKING...';

  const res = await callGAS('submitTurn', {
    battleId: state.activeBattleId,
    studentId: state.student.id,
    skillIndex
  });

  if (res.success) {
    renderBattleArena(res.state, res.status);
  }
};

window.exitBattleArena = () => {
  SoundEngine.stopBGM();
  state.activeBattleId = null;
  state.lastAnimTs = 0;
  document.getElementById('pvp-battle-stage').classList.add('hidden');
  document.getElementById('pvp-lobby-view').classList.remove('hidden');
  syncLobby();
};
