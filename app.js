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
  clearInterval(state.pollTimer);
  state = { student: null, pool: [], inventory: [], pullCost: 10, selectedSquad: [], activeBattleId: null, lastAnimTs: 0, pollTimer: null };
  document.getElementById('dashboard-view').classList.add('hidden');
  document.getElementById('login-view').classList.remove('hidden');
});

// --- MENU TABS ---
document.querySelectorAll('.menu-btn').forEach(btn => {
  btn.addEventListener('click', () => {
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
          <div style="font-weight:800;font-size:12px;margin-bottom:4px;">${critterName}</div>
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
        <h4 style="font-size:16px;">${critterName}</h4>
        <span class="badge ${item.rarity}">${item.rarity}</span>
        <div class="stat-line">${ELEM_ICONS[elem]} ${elem} • ❤️ ${stats.hp} • ⚔️ ${stats.atk}</div>
      </div>
    `;
  }).join('');
}

// ================= 3v3 PVP & LEADERBOARD =================

function renderSquadPicker() {
  document.getElementById('squad-count').textContent = state.selectedSquad.length;
  const grid = document.getElementById('squad-picker-grid');

  if (!state.inventory.length) {
    grid.innerHTML = '<p class="stat-line">Summon at least 1 creature to battle!</p>';
    return;
  }

  grid.innerHTML = state.inventory.map(pet => {
    const isSelected = state.selectedSquad.some(s => s.pullId === pet.pullId);
    const elem = pet.element || getElementFromId(pet.itemId);
    const stats = RARITY_STATS[pet.rarity] || RARITY_STATS.Common;
    const critterName = pet.name || `${pet.rarity} Critter`;
    return `
      <div class="mini-card ${isSelected ? 'selected-squad' : ''}" onclick="toggleSquadPet('${pet.pullId}')">
        <img src="${pet.imageUrl}" class="mini-sprite" alt="${critterName}">
        <div style="font-weight:800;font-size:11px;margin-top:4px;">${critterName}</div>
        <div style="margin-top:2px;"><span class="badge ${pet.rarity}">${pet.rarity}</span></div>
        <div class="stat-line" style="margin-top:4px;">${ELEM_ICONS[elem]} ❤️${stats.hp} ⚔️${stats.atk}</div>
      </div>
    `;
  }).join('');
}

window.toggleSquadPet = (pullId) => {
  const existsIdx = state.selectedSquad.findIndex(p => p.pullId === pullId);
  if (existsIdx !== -1) {
    state.selectedSquad.splice(existsIdx, 1);
  } else {
    if (state.selectedSquad.length >= 3) {
      return alert('You can only bring 3 creatures into a 3v3 battle!');
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
  document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.querySelector('[data-tab="pvp"]').classList.add('active');
  document.getElementById('tab-pvp').classList.remove('hidden');

  document.getElementById('pvp-lobby-view').classList.add('hidden');
  document.getElementById('pvp-battle-stage').classList.remove('hidden');
  renderBattleArena(battleState, status);
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

  document.getElementById('my-fighter-name').textContent = myPet.name || myPet.rarity;
  document.getElementById('my-fighter-elem').textContent = `${ELEM_ICONS[myPet.element]} ${myPet.element}`;
  document.getElementById('my-hp-fill').style.width = `${(myPet.hp / myPet.maxHp) * 100}%`;
  document.getElementById('my-hp-text').textContent = `${myPet.hp} / ${myPet.maxHp}`;
  document.getElementById('my-battle-sprite').src = myPet.imageUrl;
  document.getElementById('my-bench-dots').innerHTML = myTeam.map(p => `<span class="b-dot ${p.hp <= 0 ? 'ko' : ''}"></span>`).join('');

  document.getElementById('opp-fighter-name').textContent = oppPet.name || oppPet.rarity;
  document.getElementById('opp-fighter-elem').textContent = `${ELEM_ICONS[oppPet.element]} ${oppPet.element}`;
  document.getElementById('opp-hp-fill').style.width = `${(oppPet.hp / oppPet.maxHp) * 100}%`;
  document.getElementById('opp-hp-text').textContent = `${oppPet.hp} / ${oppPet.maxHp}`;
  document.getElementById('opp-battle-sprite').src = oppPet.imageUrl;
  document.getElementById('opp-bench-dots').innerHTML = oppTeam.map(p => `<span class="b-dot ${p.hp <= 0 ? 'ko' : ''}"></span>`).join('');

  if (bState.lastAction && bState.lastAction.ts !== state.lastAnimTs) {
    state.lastAnimTs = bState.lastAction.ts;
    document.getElementById('battle-log-box').textContent = bState.lastAction.text;
    playSkillAnimation(bState.lastAction, bState.lastAction.by === state.student.id);
  }

  const turnPill = document.getElementById('turn-indicator');
  const skillsPanel = document.getElementById('skills-panel');
  const leaveBtn = document.getElementById('leave-battle-btn');

  if (status === 'FINISHED') {
    turnPill.textContent = bState.winnerId === state.student.id ? '🏆 VICTORY! (+15 ⭐)' : '💀 DEFEAT';
    turnPill.classList.remove('waiting');
    skillsPanel.classList.add('hidden');
    leaveBtn.classList.remove('hidden');
    if (bState.winnerId === state.student.id) {
      state.student.points += 15;
      renderHUD();
    }
  } else {
    leaveBtn.classList.add('hidden');
    const isMyTurn = bState.turn === state.student.id;
    turnPill.textContent = isMyTurn ? '⚡ YOUR TURN!' : '⏳ OPPONENT THINKING...';
    turnPill.classList.toggle('waiting', !isMyTurn);
    skillsPanel.classList.toggle('hidden', !isMyTurn);

    const ultBtn = document.getElementById('ult-skill-btn');
    ultBtn.disabled = myPet.ultCooldown > 0;
    ultBtn.innerHTML = myPet.ultCooldown > 0
      ? `💥 CATACLYSM<br><small>Cooldown: ${myPet.ultCooldown}t</small>`
      : `💥 CATACLYSM<br><small>Heavy Ultimate</small>`;
  }
}

function playSkillAnimation(action, didIUseIt) {
  const mySprite = document.getElementById('my-battle-sprite');
  const oppSprite = document.getElementById('opp-battle-sprite');
  const myFx = document.getElementById('my-fx-layer');
  const oppFx = document.getElementById('opp-fx-layer');

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
    const targetSprite = didIUseIt ? mySprite : oppSprite;
    const targetFx = didIUseIt ? myFx : oppFx;
    targetSprite.classList.add('anim-heal');
    targetFx.textContent = '💚✨';
    setTimeout(() => {
      targetSprite.classList.remove('anim-heal');
      targetFx.textContent = '';
    }, 650);
  } else if (action.animType) {
    const atkSprite = didIUseIt ? mySprite : oppSprite;
    const defSprite = didIUseIt ? oppSprite : mySprite;
    const defFx = didIUseIt ? oppFx : myFx;

    atkSprite.classList.add(didIUseIt ? 'anim-lunge-left' : 'anim-lunge-right');
    setTimeout(() => {
      defSprite.classList.add('anim-hit');
      defFx.textContent = FX_ICONS[action.animType] || '💥';
    }, 200);

    setTimeout(() => {
      atkSprite.classList.remove('anim-lunge-left', 'anim-lunge-right');
      defSprite.classList.remove('anim-hit');
      defFx.textContent = '';
    }, 650);
  }
}

window.useSkill = async (skillIndex) => {
  document.getElementById('skills-panel').classList.add('hidden');
  document.getElementById('turn-indicator').textContent = '⚔️ EXECUTING MOVE...';

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
  state.activeBattleId = null;
  state.lastAnimTs = 0;
  document.getElementById('pvp-battle-stage').classList.add('hidden');
  document.getElementById('pvp-lobby-view').classList.remove('hidden');
  syncLobby();
};
