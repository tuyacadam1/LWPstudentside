const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzReMeuhTNzHlzNBA6BvldLcGLNTLsOBf6-zunyHc6cdk1u5Mt3hBkfur8XY9ZPK22n/exec';

let state = {
  student: null,
  pool: [],
  inventory: [],
  pullCost: 10
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
    alert('Connection error!');
    return { success: false };
  }
}

// --- STUDENT LOGIN / LOGOUT ---
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

    document.getElementById('login-error').textContent = '';
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.remove('hidden');
    renderHUD();
    renderPoolPreview();
    renderCollection();
  } else {
    document.getElementById('login-error').textContent = res.message;
  }
  toggleLoader(false);
});

document.getElementById('logout-btn').addEventListener('click', () => {
  state = { student: null, pool: [], inventory: [], pullCost: 10 };
  document.getElementById('dashboard-view').classList.add('hidden');
  document.getElementById('login-view').classList.remove('hidden');
  document.getElementById('student-login-form').reset();
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
  if (state.student.points < state.pullCost) {
    return alert(`You need ${state.pullCost} ⭐ to summon!`);
  }

  const egg = document.getElementById('portal-placeholder');
  const wonSprite = document.getElementById('won-sprite');
  const wonBanner = document.getElementById('won-banner');
  const summonBtn = document.getElementById('summon-btn');

  // Start shaking egg animation
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

    // Reveal captured Miscrit sprite
    egg.classList.add('hidden');
    wonSprite.src = res.wonItem.imageUrl;
    wonSprite.classList.remove('hidden');

    const badge = document.getElementById('won-rarity-badge');
    badge.className = `badge ${res.wonItem.rarity}`;
    badge.textContent = res.wonItem.rarity;
    wonBanner.classList.remove('hidden');

    renderHUD();
    renderCollection();
  } else {
    alert(res.message || 'Summon failed!');
    renderHUD();
  }
});

// --- POOL PREVIEW ---
function renderPoolPreview() {
  const grid = document.getElementById('pool-preview-grid');
  if (!state.pool.length) {
    grid.innerHTML = '<p style="color:#a5b4fc;font-size:13px;">No creatures in pool yet.</p>';
    return;
  }
  grid.innerHTML = state.pool.map((item, idx) => `
    <div class="mini-card">
      <img src="${item.imageUrl}" class="mini-sprite" style="animation-delay: -${(idx * 0.3) % 2}s;" alt="Loot">
      <div style="margin-top:6px;">
        <span class="badge ${item.rarity}">${item.rarity}</span>
      </div>
    </div>
  `).join('');
}

// --- COLLECTION (GROUPED BY CREATURE WITH DUPLICATE COUNT) ---
function renderCollection() {
  document.getElementById('collection-count').textContent = state.inventory.length;
  const grid = document.getElementById('collection-grid');

  if (!state.inventory.length) {
    grid.innerHTML = '<div class="game-box" style="grid-column:1/-1;text-align:center;">No creatures captured yet! Go summon your first companion!</div>';
    return;
  }

  // Group duplicates by itemId
  const grouped = {};
  state.inventory.forEach(entry => {
    if (!grouped[entry.itemId]) {
      grouped[entry.itemId] = { ...entry, count: 1 };
    } else {
      grouped[entry.itemId].count++;
    }
  });

  grid.innerHTML = Object.values(grouped).map((item, idx) => `
    <div class="item-card">
      ${item.count > 1 ? `<span class="dupe-badge">x${item.count}</span>` : ''}
      <img src="${item.imageUrl}" class="creature-sprite" style="animation-delay: -${(idx * 0.4) % 2}s;" alt="Creature">
      <span class="badge ${item.rarity}">${item.rarity}</span>
    </div>
  `).join('');
}
