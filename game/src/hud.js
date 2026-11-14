// All DOM UI: HUD readouts, kill feed, minimap, buy menu, scoreboard, banners
// and overlays. Writes are cheap and only touch the DOM when a value changes.
import { GAME } from './config.js';
import { SITES } from './map.js';

function el(id) { return document.getElementById(id); }

const BUY_ITEMS = [
  { key: '1', id: 'smg', label: 'VK-9 Ripper SMG', price: 1200 },
  { key: '2', id: 'rifle', label: 'AR-77 Longshot', price: 2700 },
  { key: '3', id: 'marksman', label: 'LANCE-7 Marksman', price: 4500 },
  { key: '4', id: 'frag', label: 'Frag Grenade', price: 300 },
  { key: '5', id: 'smoke', label: 'Smoke Grenade', price: 300 },
  { key: '6', id: 'armor', label: 'Kevlar + Helmet', price: 650 },
];

export function createHud() {
  const cache = {};
  function setText(id, value) {
    if (cache[id] !== value) {
      cache[id] = value;
      const node = el(id);
      if (node) node.textContent = value;
    }
  }
  function setWidth(id, pct) {
    const key = `${id}:w`;
    const v = Math.round(pct);
    if (cache[key] !== v) {
      cache[key] = v;
      const node = el(id);
      if (node) node.style.width = `${v}%`;
    }
  }

  // Build the buy menu once.
  const buyList = el('buy-list');
  if (buyList) {
    for (const item of BUY_ITEMS) {
      const row = document.createElement('div');
      row.className = 'buy-row';
      row.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.label}</span><span class="buy-price">$${item.price}</span>`;
      buyList.appendChild(row);
    }
  }

  const minimap = el('minimap');
  const mctx = minimap ? minimap.getContext('2d') : null;
  let lastFeedLen = 0;
  let hitTimer = 0;

  return {
    setHealth(hp, armor) {
      setText('health-num', String(Math.max(0, Math.ceil(hp))));
      setText('armor-num', String(Math.max(0, Math.ceil(armor))));
      setWidth('health-bar', Math.max(0, hp));
      el('health').classList.toggle('low', hp <= 30 && hp > 0);
      el('crosshair').style.opacity = hp > 0 ? 1 : 0;
    },
    setAmmo(mag, reserve, name, reloading) {
      setText('ammo-mag', String(mag));
      setText('ammo-reserve', `/ ${reserve}`);
      setText('weapon-name', name + (reloading ? ' — RELOADING' : ''));
      el('ammo').classList.toggle('empty', mag === 0);
    },
    setGrenades(frag, smoke) {
      setText('grenade-count', `◉ ${frag}  ◎ ${smoke}`);
    },
    setMoney(money) { setText('money', `$${money}`); },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      const m = Math.floor(s / 60);
      setText('timer', `${m}:${String(s % 60).padStart(2, '0')}`);
      el('timer').classList.toggle('urgent', phase === 'live' && s <= 10);
      setText('phase-label', phase === 'freeze' ? 'BUY PHASE' : phase === 'live' ? 'ROUND LIVE' : phase === 'end' ? 'ROUND OVER' : '');
    },
    setScores(wins, round) {
      setText('score-v', String(wins.vanguard));
      setText('score-s', String(wins.sentinel));
      setText('round-label', `ROUND ${round} · FIRST TO ${GAME.roundsToWin}`);
    },
    setCrosshairGap(px) {
      const root = document.documentElement;
      const v = Math.round(px);
      if (cache.gap !== v) {
        cache.gap = v;
        root.style.setProperty('--ch-gap', `${v}px`);
      }
    },
    hitmarker(head) {
      const node = el('hitmarker');
      node.classList.toggle('head', head);
      node.classList.add('on');
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => node.classList.remove('on'), 110);
    },
    feed(lines) {
      if (lines.length === lastFeedLen) return;
      lastFeedLen = lines.length;
      const node = el('feed');
      node.innerHTML = '';
      for (const line of lines.slice(-5)) {
        const div = document.createElement('div');
        div.className = 'feed-line';
        div.textContent = line.text;
        node.appendChild(div);
      }
    },
    banner(text, sub, team) {
      const node = el('banner');
      setText('banner-title', text);
      setText('banner-sub', sub);
      node.className = `show ${team ?? ''}`;
      clearTimeout(this._bannerT);
      this._bannerT = setTimeout(() => { node.className = ''; }, 3400);
    },
    hideBanner() {
      clearTimeout(this._bannerT);
      el('banner').className = '';
    },
    setBomb(bomb) {
      const node = el('bomb-status');
      if (bomb.state === 'planted') {
        node.hidden = false;
        setText('bomb-text', `CHARGE ARMED — ${bomb.timer.toFixed(1)}s`);
        setWidth('bomb-bar', (bomb.timer / GAME.bombTimer) * 100);
        node.classList.add('armed');
      } else if (bomb.state === 'carried' && bomb.carrierId === 'v0') {
        node.hidden = false;
        setText('bomb-text', 'YOU CARRY THE CHARGE — plant at A or B (hold E)');
        node.classList.remove('armed');
      } else {
        node.hidden = true;
      }
    },
    setProgress(label, frac) {
      const node = el('progress');
      if (label === null) { node.hidden = true; return; }
      node.hidden = false;
      setText('progress-label', label);
      setWidth('progress-bar', frac * 100);
    },
    setHint(text) { setText('hint', text); },
    setVignette(on) { el('vignette').classList.toggle('on', on); },
    setSpectate(name) {
      const node = el('spectate');
      node.hidden = !name;
      if (name) setText('spectate-name', `Spectating ${name}`);
    },
    showBuy(money) {
      el('buy-menu').hidden = false;
      setText('buy-money', `$${money}`);
    },
    hideBuy() { el('buy-menu').hidden = true; },
    isBuyOpen() { return !el('buy-menu').hidden; },
    showScoreboard(state) {
      const node = el('scoreboard');
      node.hidden = false;
      const rows = [...state.players]
        .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
        .map((p) => `<tr class="${p.team}"><td>${p.name}${p.hasBomb ? ' ●' : ''}</td><td>${p.kills}</td><td>${p.deaths}</td><td>$${p.money}</td></tr>`)
        .join('');
      el('score-rows').innerHTML = rows;
      setText('score-title', `DEPOT 9 — Round ${state.round} · Vanguard ${state.wins.vanguard} : ${state.wins.sentinel} Sentinel`);
    },
    hideScoreboard() { el('scoreboard').hidden = true; },
    showOverlay(kind, data = {}) {
      const overlay = el('overlay');
      overlay.hidden = false;
      const title = el('overlay-title');
      const copy = el('overlay-copy');
      const btn = el('play');
      if (kind === 'start') {
        title.textContent = 'SANDLINE';
        copy.textContent = 'Depot 9 — a round-based tactical FPS. Plant the charge or eliminate Sentinel. Five rounds take the match.';
        btn.textContent = 'Click to deploy';
      } else if (kind === 'paused') {
        title.textContent = 'Paused';
        copy.textContent = 'The round keeps running. Click to get back in.';
        btn.textContent = 'Resume';
      } else if (kind === 'end') {
        title.textContent = data.matchWinner === 'vanguard' ? 'VANGUARD TAKES DEPOT 9' : 'SENTINEL HOLDS DEPOT 9';
        copy.textContent = `Final score ${data.wins.vanguard} — ${data.wins.sentinel}. Click to run it back.`;
        btn.textContent = 'Play again';
      }
    },
    hideOverlay() { el('overlay').hidden = true; },
    onPlay(cb) { el('play').addEventListener('click', cb); },
    drawMinimap(state, world, me) {
      if (!mctx) return;
      const W = minimap.width;
      const H = minimap.height;
      const sx = W / 104;
      const sy = H / 70;
      const X = (x) => (x + 52) * sx;
      const Z = (z) => (z + 35) * sy;
      mctx.fillStyle = 'rgba(12,14,18,0.82)';
      mctx.fillRect(0, 0, W, H);
      mctx.fillStyle = 'rgba(160,165,175,0.5)';
      for (const b of world.boxes) {
        mctx.fillRect(X(b.min[0]), Z(b.min[2]), (b.max[0] - b.min[0]) * sx, (b.max[2] - b.min[2]) * sy);
      }
      for (const key of ['A', 'B']) {
        const site = SITES[key];
        mctx.fillStyle = key === 'A' ? '#f0a830' : '#4fc3f7';
        mctx.beginPath();
        mctx.arc(X(site.x), Z(site.z), 5, 0, Math.PI * 2);
        mctx.fill();
      }
      if (state.bomb.state === 'dropped' && state.bomb.pos) {
        mctx.fillStyle = '#ff5252';
        mctx.beginPath();
        mctx.arc(X(state.bomb.pos.x), Z(state.bomb.pos.z), 4, 0, Math.PI * 2);
        mctx.fill();
      }
      for (const p of state.players) {
        if (!p.alive || p === me) continue;
        if (p.team !== me.team) continue;
        mctx.fillStyle = '#7ee787';
        mctx.beginPath();
        mctx.arc(X(p.pos.x), Z(p.pos.z), 3.5, 0, Math.PI * 2);
        mctx.fill();
      }
      // The player: a white wedge pointing along the view.
      mctx.save();
      mctx.translate(X(me.pos.x), Z(me.pos.z));
      mctx.rotate(Math.atan2(-Math.sin(me.yaw), -Math.cos(me.yaw)) + Math.PI / 2);
      mctx.fillStyle = '#ffffff';
      mctx.beginPath();
      mctx.moveTo(0, -6);
      mctx.lineTo(4.5, 5);
      mctx.lineTo(-4.5, 5);
      mctx.closePath();
      mctx.fill();
      mctx.restore();
    },
  };
}
