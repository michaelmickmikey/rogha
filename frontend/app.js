const POSITION_MAX = { GK:1, RCB:1, FB:1, LCB:1, RHB:1, CHB:1, LHB:1, MF:2, RHF:1, CHF:1, LHF:1, RCF:1, FF:1, LCF:1 };

const SLOT_CANDIDATES = {
  GK:  ['GK'],
  RCB: ['RCB','FB','LCB'], FB: ['FB','RCB','LCB'], LCB: ['LCB','FB','RCB'],
  RHB: ['RHB','CHB','LHB'], CHB: ['CHB','RHB','LHB'], LHB: ['LHB','CHB','RHB'],
  MF:  ['MF-0','MF-1'],
  RHF: ['RHF','CHF','LHF'], CHF: ['CHF','RHF','LHF'], LHF: ['LHF','CHF','RHF'],
  RCF: ['RCF','FF','LCF'], FF: ['FF','RCF','LCF'], LCF: ['LCF','FF','RCF'],
};

const COUNTY_COLORS = {
  'Armagh':    '#FF6633',
  'Cavan':     '#00538A',
  'Cork':      '#CC0000',
  'Derry':     '#CC0000',
  'Donegal':   '#F0A500',
  'Down':      '#CC0000',
  'Dublin':    '#003DA5',
  'Fermanagh': '#007A33',
  'Galway':    '#8B0000',
  'Kerry':     '#007A33',
  'Kildare':   '#2c2c2c',
  'Laois':     '#003DA5',
  'Leitrim':   '#007A33',
  'Longford':  '#003DA5',
  'Louth':     '#CC0000',
  'Mayo':      '#2ecc71',
  'Meath':     '#007A33',
  'Monaghan':  '#003DA5',
  'Offaly':    '#007A33',
  'Roscommon': '#F5C518',
  'Sligo':     '#2c2c2c',
  'Tipperary': '#003DA5',
  'Tyrone':    '#E30E0E',
  'Westmeath': '#8B0000',
};

const POS_ORDER = ["GK","RCB","FB","LCB","RHB","CHB","LHB","MF","RHF","CHF","LHF","RCF","FF","LCF"];
const SLOT_DISPLAY_ORDER = ["GK","RCB","FB","LCB","RHB","CHB","LHB","MF","MF","RHF","CHF","LHF","RCF","FF","LCF"];

let usedKeys = [];
let myTeam = [];
let currentTeam = null;
let filledSlots = {};
let rerollsLeft = 3;

// ── HELPERS ───────────────────────────────────────────────────────────────────
function positionFull(pos) {
  return myTeam.filter(p => p.position === pos).length >= (POSITION_MAX[pos] ?? 1);
}
function alreadyPicked(name) {
  return myTeam.some(p => p.name === name);
}
function countyColor(county) {
  return COUNTY_COLORS[county] || '#888';
}
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── SCREENS ───────────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── SPIN ──────────────────────────────────────────────────────────────────────
async function spin(params = {}) {
  const spinArea = document.getElementById('drawn-header');
  spinArea.classList.add('spinning');
  document.getElementById('squad-list').innerHTML = '';
  document.getElementById('spin-county').textContent = '...';
  document.getElementById('spin-year').textContent = '';
  document.getElementById('spin-status').textContent = '';
  setRerollBtns(false);

  await delay(500);

  const qs = new URLSearchParams();
  if (usedKeys.length) qs.set('used_keys', usedKeys.join(','));
  if (params.county)   qs.set('county', params.county);
  if (params.year)     qs.set('year', params.year);

  const res = await fetch(`/api/spin?${qs}`);
  const data = await res.json();

  spinArea.classList.remove('spinning');

  if (data.done) {
    const what = params.county ? `No more ${params.county} teams` : params.year ? `No more ${params.year} teams` : 'All teams used!';
    document.getElementById('spin-status').textContent = what;
    if (params.county || params.year) showToast(`No more teams available — try a different re-roll`);
    return;
  }

  currentTeam = data.team;
  usedKeys.push(`${currentTeam.year}-${currentTeam.county}`);

  const color = countyColor(currentTeam.county);
  document.getElementById('county-color-dot').style.background = color;
  document.getElementById('spin-county').textContent = currentTeam.county;
  document.getElementById('spin-year').textContent = `Championship ${currentTeam.year}`;
  document.getElementById('spin-status').textContent = 'Pick one player for your XV';

  setRerollBtns(true);
  renderSquad(currentTeam.players);
}

function setRerollBtns(enabled) {
  const hasRolls = rerollsLeft > 0;
  document.getElementById('btn-same-county').disabled = !enabled || !hasRolls;
  document.getElementById('btn-same-year').disabled   = !enabled || !hasRolls;
  document.getElementById('rerolls-left').textContent = rerollsLeft;
}

async function reroll(type) {
  if (rerollsLeft <= 0) return;
  const savedTeam = currentTeam;
  const params = type === 'county' ? { county: currentTeam.county } : { year: currentTeam.year };

  // Peek — check if any teams are available before spending the roll
  const qs = new URLSearchParams();
  if (usedKeys.length) qs.set('used_keys', usedKeys.join(','));
  if (params.county) qs.set('county', params.county);
  if (params.year)   qs.set('year', params.year);
  const peek = await fetch(`/api/spin?${qs}`).then(r => r.json());

  if (peek.done) {
    const label = type === 'county' ? `No other ${savedTeam.county} teams available` : `No other ${savedTeam.year} teams available`;
    showToast(label + ' — roll not spent');
    return;
  }

  rerollsLeft--;
  setRerollBtns(false);
  await spin(params);
}

// ── SQUAD RENDER ──────────────────────────────────────────────────────────────
function renderSquad(players) {
  const list = document.getElementById('squad-list');
  list.innerHTML = '';

  const sorted = [...players].sort((a, b) =>
    POS_ORDER.indexOf(a.position) - POS_ORDER.indexOf(b.position)
  );

  sorted.forEach((player, i) => {
    const full = positionFull(player.position);
    const dup  = alreadyPicked(player.name);
    const blocked = full || dup;

    const card = document.createElement('div');
    card.className = 'squad-card' + (blocked ? ' pos-full' : '');

    const blockTag = dup ? `<span class="card-blocked-tag">In XV</span>`
                        : full ? `<span class="card-blocked-tag">Full</span>` : '';

    card.innerHTML = `
      <span class="card-num">${String(i + 1).padStart(2, '0')}</span>
      <span class="card-name">${player.name}</span>
      ${blockTag}
      <span class="card-pos-tag">${player.position}</span>
      <span class="card-rating">${player.rating}</span>
    `;

    card.addEventListener('click', () => {
      if (blocked) {
        showToast(dup ? `${player.name} already in your XV` : `${player.position} position is full`);
        return;
      }
      pickPlayer(player);
    });

    list.appendChild(card);
  });
}

// ── PICK ──────────────────────────────────────────────────────────────────────
function findSlot(position) {
  const candidates = SLOT_CANDIDATES[position] || [position];
  return candidates.find(s => !filledSlots[s]) || null;
}

function pickPlayer(player) {
  const picked = { ...player, county: currentTeam.county, year: currentTeam.year };
  const slot = findSlot(player.position);
  if (!slot) { showToast('No available slot'); return; }

  myTeam.push(picked);
  filledSlots[slot] = picked;

  fillPitchSlot(slot, picked);
  addToSquadPanel(slot, picked);

  document.querySelectorAll('.squad-card').forEach(c => c.classList.add('picked'));
  document.getElementById('pick-count').textContent = myTeam.length;
  updateMobPickCount(myTeam.length);

  // briefly show pitch on mobile so user sees their pick land
  if (window.innerWidth <= 768) setMobileTab('pitch');
  setTimeout(() => { if (window.innerWidth <= 768) setMobileTab('squad'); }, 1000);

  if (myTeam.length >= 15) {
    document.getElementById('sim-btn').disabled = false;
    document.getElementById('sim-btn-mob').disabled = false;
    document.getElementById('spin-status').textContent = '✓ Your XV is complete';
    document.getElementById('squad-list').innerHTML = '';
    document.getElementById('spin-county').textContent = 'Done';
    document.getElementById('spin-year').textContent = '';
    setRerollBtns(false);
    return;
  }

  setTimeout(() => spin(), 700);
}

function fillPitchSlot(slotKey, player) {
  const el = document.querySelector(`.pitch-slot[data-slot="${slotKey}"] .slot-content`);
  if (!el) return;
  el.classList.add('filled');
  const surname = player.name.split(' ').slice(-1)[0];
  const color = countyColor(player.county);
  el.innerHTML = `
    <div class="s-name">${surname}</div>
    <div class="s-county" style="color:${color};font-weight:700">${player.county.substring(0,3).toUpperCase()}</div>
    <div class="s-rating">${player.rating}</div>
  `;
}

function addToSquadPanel(slot, player) {
  const list = document.getElementById('my-squad-list');
  const displaySlot = slot.replace('-0','').replace('-1','');
  const color = countyColor(player.county);

  const row = document.createElement('div');
  row.className = 'my-squad-row';
  const abbr = player.county.substring(0, 3).toUpperCase();
  row.innerHTML = `
    <span class="ms-slot">${displaySlot}</span>
    <span class="ms-dot" style="background:${color}"></span>
    <span class="ms-name">${player.name}</span>
    <span class="ms-abbr" style="color:${color}">${abbr}</span>
    <span class="ms-rating">${player.rating}</span>
  `;
  list.appendChild(row);
}

// ── SIMULATE ──────────────────────────────────────────────────────────────────
let simResults = [];
let simIndex = 0;

const ROUND_BTN_LABELS = [
  'Simulate Quarter Final →',
  'Simulate Semi Final →',
  'Simulate All-Ireland Final →',
];

async function startSimulation() {
  document.getElementById('sim-btn').disabled = true;
  document.getElementById('sim-btn').textContent = 'Loading…';

  const res = await fetch('/api/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ players: myTeam }),
  });
  simResults = (await res.json()).results;
  simIndex = 0;

  document.getElementById('sim-matches').innerHTML = '';
  document.getElementById('sim-live').style.display = 'none';
  const outcome = document.getElementById('sim-outcome');
  if (outcome) outcome.remove();

  const btn = document.getElementById('sim-next-btn');
  btn.textContent = ROUND_BTN_LABELS[0];
  btn.disabled = false;
  btn.style.display = '';

  document.getElementById('sim-footer').querySelectorAll('.btn-sim-secondary').forEach(b => b.remove());

  showScreen('screen-sim');
}

function revealNextMatch() {
  if (simIndex >= simResults.length) return;
  document.getElementById('sim-next-btn').disabled = true;
  runLiveMatch(simResults[simIndex]);
}

// ── LIVE MATCH TICKER ─────────────────────────────────────────────────────────
async function runLiveMatch(match) {
  const liveEl   = document.getElementById('sim-live');
  const feed     = document.getElementById('sim-live-feed');
  const timerEl  = document.getElementById('sim-live-timer');
  const labelEl  = document.getElementById('sim-live-label');
  const statusEl = document.getElementById('sim-live-status');

  const oppColor = countyColor(match.opponent.county);

  // Reset live board
  feed.innerHTML = '';
  timerEl.textContent = "0'";
  document.getElementById('live-score-user').textContent = '0-00';
  document.getElementById('live-score-opp').textContent  = '0-00';
  document.getElementById('live-total-user').textContent = '(0)';
  document.getElementById('live-total-opp').textContent  = '(0)';
  document.getElementById('live-opp-name').textContent   = `${match.opponent.county} ${match.opponent.year}`;
  document.getElementById('live-opp-name').style.color   = oppColor;
  labelEl.innerHTML = `${match.round.toUpperCase()} &middot; <span id="sim-live-status">LIVE <span class="live-dot">●</span></span>`;

  liveEl.style.display = 'block';
  liveEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  let userG = 0, userP = 0, oppG = 0, oppP = 0;
  const timeline = match.timeline;

  // Tick 1→70
  for (let min = 1; min <= 70; min++) {
    await delay(110);
    timerEl.textContent = `${min}'`;

    const events = timeline.filter(e => e.minute === min);
    for (const ev of events) {
      const isUser = ev.team === 'user';

      if (ev.type === 'goal') { isUser ? userG++ : oppG++; }
      else                    { isUser ? userP++ : oppP++; }

      const scoreEl = document.getElementById(isUser ? 'live-score-user' : 'live-score-opp');
      const totalEl = document.getElementById(isUser ? 'live-total-user' : 'live-total-opp');
      const g = isUser ? userG : oppG;
      const p = isUser ? userP : oppP;

      scoreEl.textContent = `${g}-${String(p).padStart(2,'0')}`;
      totalEl.textContent = `(${g*3+p})`;

      // flash colour
      const flashClass = isUser ? 'flash-green' : 'flash-red';
      scoreEl.classList.add(flashClass);
      setTimeout(() => scoreEl.classList.remove(flashClass), 600);

      // feed entry
      const row = document.createElement('div');
      row.className = `feed-event ${isUser ? 'ev-user' : 'ev-opp'}`;
      const surname = ev.name.split(' ').slice(-1)[0];
      const team    = isUser ? 'Your XV' : match.opponent.county;
      row.innerHTML = `
        <span class="feed-min">${min}'</span>
        <span class="feed-icon">${ev.type === 'goal' ? '⚽' : '🏳️'}</span>
        <span class="feed-name">${surname} <span style="color:var(--muted);font-weight:400">(${team})</span></span>
        <span class="feed-type ${ev.type}">${ev.type === 'goal' ? 'GOAL' : 'POINT'}</span>
      `;
      feed.appendChild(row);
      feed.scrollTop = feed.scrollHeight;

      await delay(40);
    }
  }

  // Full time
  timerEl.textContent = 'FT';
  document.getElementById('sim-live-label').innerHTML =
    `${match.round.toUpperCase()} &middot; <span style="color:var(--text)">FULL TIME</span>`;

  await delay(1200);

  // Hide live, show result card
  liveEl.style.display = 'none';
  renderMatchCard(match);
  simIndex++;

  const btn = document.getElementById('sim-next-btn');

  if (!match.won) {
    showSimOutcome(false, match);
    btn.style.display = 'none';
    addPlayAgainBtn();
    return;
  }

  if (match.round === 'All-Ireland Final') {
    showSimOutcome(true, match);
    btn.style.display = 'none';
    addPlayAgainBtn();
    return;
  }

  btn.textContent = ROUND_BTN_LABELS[simIndex] || 'Continue →';
  btn.disabled = false;
}

function renderMatchCard(match) {
  const oppColor = countyColor(match.opponent.county);
  const us   = match.user_score;
  const them = match.opp_score;

  // Build scorer chips from timeline (user events only for the card)
  const userEvents = match.timeline.filter(e => e.team === 'user');
  const scorerHtml = userEvents.map(s => {
    const tag = s.type === 'goal'
      ? `<span class="s-type goal">G</span>`
      : `<span class="s-type">P</span>`;
    return `<span class="scorer-chip">${s.minute}' ${s.name.split(' ').slice(-1)[0]}${tag}</span>`;
  }).join('');

  const card = document.createElement('div');
  card.className = `sim-match-card ${match.won ? 'won' : 'lost'}`;
  card.innerHTML = `
    <div class="sim-match-header">
      <span class="sim-round-label">${match.round.toUpperCase()}</span>
      <div class="sim-opp">
        <span class="sim-opp-dot" style="background:${oppColor}"></span>
        <span class="sim-opp-name">${match.opponent.county}
          <span style="color:var(--muted);font-size:0.8rem">${match.opponent.year}</span>
        </span>
      </div>
      <div class="sim-score-block">
        <div class="sim-score">
          <div class="sim-score-main ${match.won ? 'won' : 'lost'}">${us.goals}-${String(us.points).padStart(2,'0')}</div>
          <div class="sim-score-total">${us.total} pts</div>
        </div>
        <span class="sim-vs">·</span>
        <div class="sim-score">
          <div class="sim-score-main opp">${them.goals}-${String(them.points).padStart(2,'0')}</div>
          <div class="sim-score-total">${them.total} pts</div>
        </div>
        <span class="sim-result-badge ${match.won ? 'w' : 'l'}">${match.won ? 'W' : 'L'}</span>
      </div>
    </div>
    ${scorerHtml ? `<div class="sim-scorers">${scorerHtml}</div>` : ''}
  `;

  document.getElementById('sim-matches').appendChild(card);
}

function showSimOutcome(won, match) {
  const existing = document.getElementById('sim-outcome');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.id = 'sim-outcome';

  if (won) {
    el.innerHTML = `
      <div class="outcome-emoji">🏆</div>
      <h3>Sam Maguire Champions!</h3>
      <p>Your dream XV have won the All-Ireland. Legend.</p>
    `;
    el.style.borderColor = 'var(--green)';
  } else {
    el.innerHTML = `
      <div class="outcome-emoji">😔</div>
      <h3>Eliminated</h3>
      <p>Your run ended in the ${match.round}. Build a stronger XV next time.</p>
    `;
    el.style.borderColor = 'var(--red)';
  }

  document.getElementById('sim-matches').appendChild(el);
}

function addPlayAgainBtn() {
  const footer = document.getElementById('sim-footer');
  footer.querySelectorAll('.btn-sim-secondary').forEach(b => b.remove());
  const btn = document.createElement('button');
  btn.className = 'btn-sim-secondary';
  btn.textContent = '← Play Again';
  btn.addEventListener('click', () => { resetGame(); showScreen('screen-intro'); });
  footer.appendChild(btn);
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('toast-show'), 10);
  setTimeout(() => { t.classList.remove('toast-show'); setTimeout(() => t.remove(), 300); }, 2200);
}

// ── RESET ─────────────────────────────────────────────────────────────────────
function resetGame() {
  usedKeys = [];
  myTeam = [];
  currentTeam = null;
  filledSlots = {};
  rerollsLeft = 3;
  document.getElementById('pick-count').textContent = '0';
  updateMobPickCount(0);
  document.getElementById('sim-btn').disabled = true;
  document.getElementById('sim-btn').textContent = 'Simulate The Run →';
  document.getElementById('sim-btn-mob').disabled = true;
  document.getElementById('result-breakdown').innerHTML = '';
  document.getElementById('my-squad-list').innerHTML = '';
  document.getElementById('overall-score').textContent = '—';
  document.querySelectorAll('.slot-content').forEach(el => {
    el.classList.remove('filled');
    el.innerHTML = '';
  });
  setRerollBtns(false);
}

// ── MOBILE TABS ───────────────────────────────────────────────────────────────
function setMobileTab(tab) {
  document.querySelectorAll('.mob-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('team-panel').classList.toggle('mob-hidden', tab !== 'squad');
  document.getElementById('pitch-panel').classList.toggle('mob-hidden', tab !== 'pitch');
}

document.querySelectorAll('.mob-tab').forEach(btn => {
  btn.addEventListener('click', () => setMobileTab(btn.dataset.tab));
});

function updateMobPickCount(n) {
  const el = document.getElementById('mob-pick-count');
  if (el) el.textContent = n > 0 ? `${n}/15` : '';
}

// ── INIT ──────────────────────────────────────────────────────────────────────
document.getElementById('start-btn').addEventListener('click', () => {
  resetGame();
  showScreen('screen-game');
  spin();
});

document.getElementById('sim-btn').addEventListener('click', startSimulation);
document.getElementById('sim-btn-mob').addEventListener('click', startSimulation);

document.getElementById('sim-next-btn').addEventListener('click', revealNextMatch);

document.getElementById('play-again-btn').addEventListener('click', () => {
  resetGame();
  showScreen('screen-intro');
});
