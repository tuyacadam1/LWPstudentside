const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzReMeuhTNzHlzNBA6BvldLcGLNTLsOBf6-zunyHc6cdk1u5Mt3hBkfur8XY9ZPK22n/exec';

const RARITY_STATS = {
  Common: { hp: 100, atk: 15, power: 1 },
  Uncommon: { hp: 130, atk: 20, power: 2 },
  Rare: { hp: 165, atk: 26, power: 3 },
  Epic: { hp: 205, atk: 33, power: 4 },
  Mythic: { hp: 250, atk: 41, power: 5 },
  Legend: { hp: 300, atk: 50, power: 6 }
};

const ELEMENTS = ['Fire', 'Nature', 'Water', 'Lightning'];
const ELEM_ICONS = { Fire: '🔥', Nature: '🌿', Water: '💧', Lightning: '⚡' };

function getElementFromId(itemId) {
  let hash = 0;
  const str = String(itemId);
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) % 1000;
  return ELEMENTS[hash % ELEMENTS.length];
}

function getElementMultiplier(atkElem, defElem) {
  if (
    (atkElem === 'Fire' && defElem === 'Nature') ||
    (atkElem === 'Nature' && defElem === 'Water') ||
    (atkElem === 'Water' && defElem === 'Lightning') ||
    (atkElem === 'Lightning' && defElem === 'Fire')
  ) return 1.5;

  if (
    (defElem === 'Fire' && atkElem === 'Nature') ||
    (defElem === 'Nature' && atkElem === 'Water') ||
    (defElem === 'Water' && atkElem === 'Lightning') ||
    (defElem === 'Lightning' && atkElem === 'Fire')
  ) return 0.75;

  return 1.0;
}

function getTypeEffectivenessLabel(myElem, oppElem) {
  const mult = getElementMultiplier(myElem, oppElem);
  if (mult > 1) return '🔥 SUPER EFFECTIVE (1.5x)!';
  if (mult < 1) return '⚠️ Resisted (0.75x)';
  return 'Neutral Matchup (1.0x)';
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
  } else if (state.battle) {
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
  opponents: [],
  battle: null,
  customFlips: JSON.parse(localStorage.getItem('edugacha_flips') || '{}')
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

    // Auto-select top 3 strongest pets by default
    const sorted = [...state.inventory].sort((a, b) => {
      const pa = (RARITY_STATS[a.rarity] || RARITY_STATS.Common).power;
      const pb = (RARITY_STATS[b.rarity] || RARITY_STATS.Common).power;
      return pb - pa;
    });
    state.selectedSquad = sorted.slice(0, 3);

    document.getElementById('login-error').textContent = '';
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.remove('hidden');

    renderHUD();
    renderPoolPreview();
    renderCollection();
    renderSquadPicker();
    await loadArenaRoster();
  } else {
    document.getElementById('login-error').textContent = res.message;
  }
  toggleLoader(false);
});

document.getElementById('logout-btn').addEventListener('click', () => {
  SoundEngine.stopBGM();
  state.student = null;
  state.battle = null;
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
    if (btn.dataset.tab === 'pvp' || btn.dataset.tab === 'leaderboard') {
      loadArenaRoster();
    }
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

// ================= DAILY BOT ARENA & LEADERBOARD =================

function renderSquadPicker() {
  document.getElementById('squad-count').textContent = state.selectedSquad.length;
  const squadBar = document.getElementById('active-squad-bar');
  const grid = document.getElementById('squad-picker-grid');

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

async function loadArenaRoster() {
  if (!state.student) return;
  const res = await callGAS('getArenaRoster', {
    studentId: state.student.id,
    classId: state.student.classId
  });

  if (!res || !res.success) return;
  state.opponents = res.opponents || [];

  // Render Classmates & Their Best 3-Pet Teams
  const listEl = document.getElementById('opponents-roster-list');
  if (!state.opponents.length) {
    listEl.innerHTML = '<p class="stat-line">No other classmates in this guild yet.</p>';
  } else {
    listEl.innerHTML = state.opponents.map(opp => {
      const hasTeam = opp.bestTeam && opp.bestTeam.length > 0;
      const teamHtml = hasTeam
        ? opp.bestTeam.map(pet => {
            const elem = pet.element || getElementFromId(pet.itemId);
            return `
              <div class="opp-pet-mini">
                <img src="${pet.imageUrl}" alt="${pet.name}">
                <div style="font-size:9px;font-weight:800;margin-top:2px;max-width:72px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${pet.name}</div>
                <span class="badge ${pet.rarity}" style="font-size:8px;padding:2px 6px;margin-top:2px;">${ELEM_ICONS[elem]} ${pet.rarity}</span>
              </div>
            `;
          }).join('')
        : '<div style="grid-column:1/-1;text-align:center;font-size:11px;color:#a5b4fc;padding:12px;">No creatures summoned yet</div>';

      let actionBtnHtml = '';
      if (opp.defeatedToday) {
        actionBtnHtml = `<div class="defeated-pill">✅ DEFEATED TODAY • Come back tomorrow!</div>`;
      } else if (!hasTeam) {
        actionBtnHtml = `<button class="game-btn btn-blue full-width" disabled>NO TEAM TO BATTLE</button>`;
      } else {
        actionBtnHtml = `<button class="game-btn btn-red full-width" onclick="startBotBattle('${opp.id}')">⚔️ CHALLENGE ${opp.name.toUpperCase()}'S TEAM</button>`;
      }

      return `
        <div class="opponent-card ${opp.defeatedToday ? 'defeated-card' : ''}">
          <div class="opp-card-header">
            <strong style="font-size:15px;">👾 ${opp.name}</strong>
            <span class="stat-line">Best Squad</span>
          </div>
          <div class="opp-best-team">${teamHtml}</div>
          ${actionBtnHtml}
        </div>
      `;
    }).join('');
  }

  // Render Leaderboard
  const lbEl = document.getElementById('leaderboard-list');
  lbEl.innerHTML = (res.leaderboard || []).map((row, idx) => `
    <div class="rank-row ${idx === 0 ? 'top-1' : ''}">
      <div>
        <span class="rank-num">#${idx + 1}</span>
        <strong>${row.name}</strong>
      </div>
      <div class="rank-wins">🏆 ${row.wins} WINS</div>
    </div>
  `).join('');
}

// =========================================================
// INSTANT LOCAL 3v3 BOT STRATEGY ENGINE
// =========================================================
function buildCombatant(item) {
  const base = RARITY_STATS[item.rarity] || RARITY_STATS.Common;
  const element = item.element || getElementFromId(item.itemId);
  return {
    itemId: item.itemId,
    name: item.name || `${item.rarity} Critter`,
    rarity: item.rarity,
    imageUrl: item.imageUrl,
    element: element,
    hp: base.hp,
    maxHp: base.hp,
    atk: base.atk,
    defDebuff: 0,
    shielded: false,
    ultCooldown: 0
  };
}

window.startBotBattle = (oppId) => {
  if (state.selectedSquad.length === 0) {
    return alert('Select 1 to 3 creatures for your squad first!');
  }
  const opp = state.opponents.find(o => o.id === oppId);
  if (!opp || !opp.bestTeam.length || opp.defeatedToday) return;

  SoundEngine.init();
  SoundEngine.startBattleBGM();

  state.battle = {
    defenderId: opp.id,
    defenderName: opp.name,
    myTeam: state.selectedSquad.map(buildCombatant),
    myActive: 0,
    oppTeam: opp.bestTeam.map(buildCombatant),
    oppActive: 0,
    isMyTurn: true,
    finished: false,
    logText: `⚔️ Battle Started vs ${opp.name}'s Best Team! Your move!`
  };

  document.getElementById('pvp-lobby-view').classList.add('hidden');
  document.getElementById('pvp-battle-stage').classList.remove('hidden');
  renderBattleArena();
};

function applyFacingDirection(wrapId, itemId, side) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  const saved = state.customFlips[itemId];
  if (saved) {
    wrap.className = `facing-wrap ${saved}`;
  } else {
    wrap.className = side === 'left' ? 'facing-wrap face-right' : 'facing-wrap face-left';
  }
}

window.flipSprite = (side) => {
  SoundEngine.playSfx('select');
  const wrapId = side === 'my' ? 'my-facing-wrap' : 'opp-facing-wrap';
  const wrap = document.getElementById(wrapId);
  const itemId = wrap.dataset.itemId;
  const nextDir = wrap.classList.contains('face-right') ? 'face-left' : 'face-right';
  wrap.className = `facing-wrap ${nextDir}`;
  if (itemId) {
    state.customFlips[itemId] = nextDir;
    localStorage.setItem('edugacha_flips', JSON.stringify(state.customFlips));
  }
};

function updateHpBar(fillEl, hp, maxHp) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  fillEl.style.width = `${pct}%`;
  fillEl.classList.remove('low-hp', 'mid-hp');
  if (pct <= 25) fillEl.classList.add('low-hp');
  else if (pct <= 55) fillEl.classList.add('mid-hp');
}

function formatStatusTags(pet) {
  const tags = [];
  if (pet.shielded) tags.push('🛡️50%');
  if (pet.defDebuff > 0) tags.push(`💔-${pet.defDebuff * 20}%DEF`);
  return tags.join(' ');
}

function renderBattleArena() {
  const b = state.battle;
  if (!b) return;

  const myPet = b.myTeam[b.myActive];
  const oppPet = b.oppTeam[b.oppActive];

  // Update My HUD Plate
  document.getElementById('my-fighter-name').textContent = myPet.name;
  document.getElementById('my-fighter-elem').textContent = `${ELEM_ICONS[myPet.element]} ${myPet.element}`;
  updateHpBar(document.getElementById('my-hp-fill'), myPet.hp, myPet.maxHp);
  document.getElementById('my-hp-text').textContent = `${myPet.hp}/${myPet.maxHp}`;
  document.getElementById('my-status-tags').textContent = formatStatusTags(myPet);
  document.getElementById('my-battle-sprite').src = myPet.imageUrl;
  document.getElementById('my-facing-wrap').dataset.itemId = myPet.itemId;
  applyFacingDirection('my-facing-wrap', myPet.itemId, 'left');
  document.getElementById('my-bench-dots').innerHTML = b.myTeam.map(p => `<span class="b-dot ${p.hp <= 0 ? 'ko' : ''}"></span>`).join('');

  // Update Enemy Bot HUD Plate
  document.getElementById('opp-fighter-name').textContent = oppPet.name;
  document.getElementById('opp-fighter-elem').textContent = `${ELEM_ICONS[oppPet.element]} ${oppPet.element}`;
  updateHpBar(document.getElementById('opp-hp-fill'), oppPet.hp, oppPet.maxHp);
  document.getElementById('opp-hp-text').textContent = `${oppPet.hp}/${oppPet.maxHp}`;
  document.getElementById('opp-status-tags').textContent = formatStatusTags(oppPet);
  document.getElementById('opp-battle-sprite').src = oppPet.imageUrl;
  document.getElementById('opp-facing-wrap').dataset.itemId = oppPet.itemId;
  applyFacingDirection('opp-facing-wrap', oppPet.itemId, 'right');
  document.getElementById('opp-bench-dots').innerHTML = b.oppTeam.map(p => `<span class="b-dot ${p.hp <= 0 ? 'ko' : ''}"></span>`).join('');

  // Customize Elemental Skill Card
  document.getElementById('elem-skill-icon').textContent = ELEM_ICONS[myPet.element];
  document.getElementById('elem-skill-title').textContent = `${myPet.element.toUpperCase()} SURGE`;
  document.getElementById('elem-skill-desc').textContent = getTypeEffectivenessLabel(myPet.element, oppPet.element);

  // Render Tactical 3-Pet Swap Bar
  document.getElementById('party-swap-bar').innerHTML = b.myTeam.map((pet, idx) => {
    const isCurrent = idx === b.myActive;
    const isDead = pet.hp <= 0;
    const cls = isCurrent ? 'active-pet' : (isDead ? 'ko-pet' : '');
    return `
      <button type="button" class="swap-pet-btn ${cls}" ${isCurrent || isDead ? 'disabled' : ''} onclick="swapBattlePet(${idx})">
        <img src="${pet.imageUrl}" style="width:22px;height:22px;object-fit:contain;" alt="${pet.name}">
        <span>${isCurrent ? 'ACTIVE' : (isDead ? 'KO' : `SWAP ${ELEM_ICONS[pet.element]}`)}</span>
      </button>
    `;
  }).join('');

  document.getElementById('battle-log-box').textContent = b.logText;

  const turnPill = document.getElementById('turn-indicator');
  const skillsWrapper = document.getElementById('skills-wrapper');
  const leaveBtn = document.getElementById('leave-battle-btn');

  if (b.finished) {
    skillsWrapper.classList.add('hidden');
    leaveBtn.classList.remove('hidden');
  } else {
    skillsWrapper.classList.remove('hidden');
    leaveBtn.classList.add('hidden');
    turnPill.textContent = b.isMyTurn ? '⚡ YOUR TURN — CHOOSE MOVE!' : `🤖 ${b.defenderName.toUpperCase()}'S BOT THINKING...`;
    turnPill.classList.toggle('waiting', !b.isMyTurn);
    skillsWrapper.classList.toggle('skills-locked', !b.isMyTurn);

    const ultBtn = document.getElementById('ult-skill-btn');
    ultBtn.disabled = myPet.ultCooldown > 0;
    document.getElementById('ult-skill-desc').textContent = myPet.ultCooldown > 0
      ? `Cooldown: ${myPet.ultCooldown}t`
      : 'Heavy Ultimate';
  }
}

function executeCombatMove(attacker, defender, skillIndex) {
  if (attacker.ultCooldown > 0) attacker.ultCooldown--;

  const armorMult = 1 + (attacker.defDebuff ? 0 : 0) + ((defender.defDebuff || 0) * 0.2);
  const shieldMult = defender.shielded ? 0.5 : 1.0;

  let animType = 'strike';
  let dmg = 0;
  let heal = 0;
  let extraNote = '';
  let skillName = 'Armor Break Claw';

  if (skillIndex === 0) {
    skillName = 'Armor Break Claw';
    animType = 'strike';
    dmg = Math.round(attacker.atk * 0.95 * armorMult * shieldMult);
    defender.defDebuff = Math.min(3, (defender.defDebuff || 0) + 1);
    extraNote = ' (DEF -20%!)';
  } else if (skillIndex === 1) {
    skillName = `${attacker.element} Surge`;
    animType = attacker.element.toLowerCase();
    const elemMult = getElementMultiplier(attacker.element, defender.element);
    dmg = Math.round(attacker.atk * 1.25 * elemMult * armorMult * shieldMult);
    if (elemMult > 1) extraNote = ' (SUPER EFFECTIVE 1.5x!)';
    else if (elemMult < 1) extraNote = ' (Resisted 0.75x)';
  } else if (skillIndex === 2) {
    skillName = 'Guard & Mend';
    animType = 'heal';
    heal = Math.round(attacker.maxHp * 0.25);
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + heal);
    attacker.shielded = true;
    extraNote = ' (50% Shield Active!)';
  } else if (skillIndex === 3) {
    skillName = `${attacker.element} Cataclysm`;
    animType = 'ultimate';
    const elemMult = getElementMultiplier(attacker.element, defender.element);
    dmg = Math.round(attacker.atk * 1.85 * elemMult * armorMult * shieldMult);
    attacker.ultCooldown = 2;
    if (elemMult > 1) extraNote = ' (CRITICAL ELEMENT!)';
  }

  if (dmg > 0 && defender.shielded) {
    defender.shielded = false;
    extraNote += ' [Blocked 50% by Shield!]';
  }

  if (dmg > 0) {
    defender.hp = Math.max(0, defender.hp - dmg);
  }

  const text = heal > 0
    ? `${attacker.name} used ${skillName} (+${heal} HP)${extraNote}`
    : `${attacker.name} used ${skillName} for ${dmg} DMG!${extraNote}`;

  return { animType, dmg, heal, text };
}

window.useSkill = (skillIndex) => {
  const b = state.battle;
  if (!b || !b.isMyTurn || b.finished) return;

  SoundEngine.playSfx('select');
  b.isMyTurn = false;

  const myPet = b.myTeam[b.myActive];
  const oppPet = b.oppTeam[b.oppActive];
  const outcome = executeCombatMove(myPet, oppPet, skillIndex);
  b.logText = outcome.text;

  playSkillAnimation(outcome, true);
  renderBattleArena();

  // Check if Opponent Pet fainted
  if (oppPet.hp <= 0) {
    const nextOppIdx = b.oppTeam.findIndex(p => p.hp > 0);
    if (nextOppIdx !== -1) {
      b.oppActive = nextOppIdx;
      b.logText += ` ${oppPet.name} KO'd! ${b.defenderName} sent out ${b.oppTeam[nextOppIdx].name}!`;
      renderBattleArena();
      setTimeout(runBotTurn, 1100);
    } else {
      handleBattleEnd(true);
    }
    return;
  }

  // Trigger Smart Bot Response
  setTimeout(runBotTurn, 1100);
};

window.swapBattlePet = (petIndex) => {
  const b = state.battle;
  if (!b || !b.isMyTurn || b.finished || petIndex === b.myActive || b.myTeam[petIndex].hp <= 0) return;

  SoundEngine.playSfx('select');
  b.isMyTurn = false;
  b.myActive = petIndex;
  const switchedPet = b.myTeam[petIndex];
  b.logText = `🔄 Tactical Swap! Go, ${switchedPet.name} (${switchedPet.element})!`;

  playSkillAnimation({ animType: 'swap', dmg: 0, heal: 0 }, true);
  renderBattleArena();

  setTimeout(runBotTurn, 1050);
};

function runBotTurn() {
  const b = state.battle;
  if (!b || b.finished) return;

  const botPet = b.oppTeam[b.oppActive];
  const playerPet = b.myTeam[b.myActive];

  // Smart Tactical Bot AI Decision
  let chosenSkill = 0;
  const elemMult = getElementMultiplier(botPet.element, playerPet.element);

  if (botPet.hp < botPet.maxHp * 0.42 && !botPet.shielded && Math.random() < 0.65) {
    chosenSkill = 2; // Guard & Mend when low HP
  } else if (botPet.ultCooldown === 0 && (elemMult >= 1 || playerPet.hp <= botPet.atk * 1.8)) {
    chosenSkill = 3; // Use Ultimate when ready
  } else if (elemMult > 1) {
    chosenSkill = 1; // Exploit Super-Effective Element!
  } else if ((playerPet.defDebuff || 0) < 2 && Math.random() < 0.5) {
    chosenSkill = 0; // Stack Armor Break
  } else {
    chosenSkill = elemMult < 1 ? 0 : 1;
  }

  const outcome = executeCombatMove(botPet, playerPet, chosenSkill);
  b.logText = `[BOT] ${outcome.text}`;
  playSkillAnimation(outcome, false);
  renderBattleArena();

  // Check if Player Pet fainted
  if (playerPet.hp <= 0) {
    const nextMyIdx = b.myTeam.findIndex(p => p.hp > 0);
    if (nextMyIdx !== -1) {
      b.myActive = nextMyIdx;
      b.logText += ` ${playerPet.name} KO'd! Go, ${b.myTeam[nextMyIdx].name}!`;
      b.isMyTurn = true;
      renderBattleArena();
    } else {
      handleBattleEnd(false);
    }
    return;
  }

  b.isMyTurn = true;
  renderBattleArena();
}

async function handleBattleEnd(didWin) {
  const b = state.battle;
  b.finished = true;
  SoundEngine.stopBGM();

  const turnPill = document.getElementById('turn-indicator');
  if (didWin) {
    SoundEngine.playSfx('victory');
    turnPill.textContent = '🏆 VICTORY! (+15 ⭐)';
    turnPill.classList.remove('waiting');
    b.logText = `🏆 You defeated ${b.defenderName}'s team and earned +15 ⭐! Come back tomorrow to battle them again!`;
    renderBattleArena();

    // Save daily victory & +15 pts to Google Sheets
    const res = await callGAS('recordDailyWin', {
      classId: state.student.classId,
      attackerId: state.student.id,
      defenderId: b.defenderId
    });
    if (res && res.success && !res.alreadyClaimed) {
      state.student.points = res.newPoints || (state.student.points + 15);
      renderHUD();
    }
  } else {
    turnPill.textContent = '💀 DEFEAT — TRY AGAIN!';
    turnPill.classList.add('waiting');
    b.logText = `💀 ${b.defenderName}'s team defeated you! Adjust your squad and try again!`;
    renderBattleArena();
  }
}

function showFloatingNumber(popupEl, text, isHeal = false) {
  popupEl.textContent = text;
  popupEl.classList.remove('hidden', 'heal-pop');
  if (isHeal) popupEl.classList.add('heal-pop');
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
    heal: '🛡️',
    ultimate: '☄️'
  };

  if (action.animType === 'swap') {
    SoundEngine.playSfx('select');
    const targetSprite = didIUseIt ? mySprite : oppSprite;
    targetSprite.classList.add('anim-heal');
    setTimeout(() => targetSprite.classList.remove('anim-heal'), 600);
  } else if (action.animType === 'heal') {
    SoundEngine.playSfx('heal');
    const targetSprite = didIUseIt ? mySprite : oppSprite;
    const targetPopup = didIUseIt ? myPopup : oppPopup;
    targetSprite.classList.add('anim-heal');
    showFloatingNumber(targetPopup, `🛡️ +${action.heal} HP`, true);
    setTimeout(() => targetSprite.classList.remove('anim-heal'), 650);
  } else if (action.animType) {
    const atkSprite = didIUseIt ? mySprite : oppSprite;
    const defSprite = didIUseIt ? oppSprite : mySprite;
    const defPopup = didIUseIt ? oppPopup : myPopup;

    if (action.animType === 'strike') {
      atkSprite.classList.add(didIUseIt ? 'anim-lunge-left' : 'anim-lunge-right');
    } else {
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

window.exitBattleArena = () => {
  SoundEngine.stopBGM();
  state.battle = null;
  document.getElementById('pvp-battle-stage').classList.add('hidden');
  document.getElementById('pvp-lobby-view').classList.remove('hidden');
  loadArenaRoster();
};
