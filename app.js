    const container = document.getElementById('wheel-container');
    const canvas = document.getElementById('wheel');
    const ctx = canvas.getContext('2d');
    const label = document.getElementById('wheel-label');
    const box1 = document.getElementById('box1');
    const box2 = document.getElementById('box2');
    const label1 = document.getElementById('label1');
    const label2 = document.getElementById('label2');
    const counterEl = document.getElementById('elimination-counter');

    const startBtn = document.getElementById('start-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const muteBtn = document.getElementById('mute-btn');
    const autoToggle = document.getElementById('auto-toggle');
    const nextSpinEl = document.getElementById('next-spin');

    const battleOverlay = document.getElementById('battle-overlay');
    const battleCanvas = document.getElementById('battle-canvas');
    const battleCtx = battleCanvas.getContext('2d');
    const battleHint = document.getElementById('battle-hint');


    class Pokemon {
      constructor(id, name, ball, imageUrl, type, stats) {
        this.id = id;
        this.name = name;
        this.ball = ball;
        this.type = type || 'unknown';
        this.stats = stats || { HP: 60, ATK: 60, DEF: 60, SPATK: 60, SPDEF: 60, SPD: 60 };
        this.image = new Image(); this.image.src = imageUrl;
        this.ballImage = new Image(); this.ballImage.src = `images/${ball.toLowerCase()}.png`;
      }
    }

    let items = [], eliminationCount = 0, totalCount = 0;
    let size, center;
    const buffer = document.createElement('canvas');
    const bctx = buffer.getContext('2d');

    // Battle selection state
    let selectedA = null;
    let selectedB = null;
    let battleRunning = false;

    function clamp(min, v, max) {
      return Math.max(min, Math.min(max, v));
    }

    function toInt(v, fallback = 0) {
      const n = Number.parseInt(String(v ?? ''), 10);
      return Number.isFinite(n) ? n : fallback;
    }

    function getPokemonBattleStats(pokemon) {
      const s = pokemon?.stats || {};
      return {
        HP: clamp(1, toInt(s.HP, 60), 255),
        ATK: clamp(1, toInt(s.ATK, 60), 255),
        DEF: clamp(1, toInt(s.DEF, 60), 255),
        SPATK: clamp(1, toInt(s.SPATK, 60), 255),
        SPDEF: clamp(1, toInt(s.SPDEF, 60), 255),
        SPD: clamp(1, toInt(s.SPD, 60), 255),
      };
    }

    function computeMaxHp(stats) {
      // Tankiness comes from HP plus both defenses, but we cap extremes.
      // Typical range lands ~140â€“320; very bulky mons capped.
      const raw = (stats.HP * 2.0) + ((stats.DEF + stats.SPDEF) * 0.60);
      return Math.round(clamp(80, raw, 420));
    }

    function computeCollisionDamage({ power, atk, def }) {
      // Pokemon-like damage curve tuned for an arcade collision game.
      // level and divisor chosen so fights usually end in ~6â€“12 collisions,
      // while still letting strong attackers punch through.
      const level = 35;
      const levelFactor = (2 * level) / 5 + 2; // 16 at level 35
      const divisor = 65;
      const base = (((levelFactor * power * (atk / Math.max(1, def))) / divisor) + 2);
      const variance = 0.90 + Math.random() * 0.20; // 0.90â€“1.10
      return Math.max(1, Math.floor(base * variance));
    }

    const TYPE_CHART = {
      normal: { rock: 0.5, ghost: 0, steel: 0.5 },
      fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
      water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
      electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
      grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
      ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
      fighting: { normal: 2, ice: 2, rock: 2, dark: 2, steel: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, fairy: 0.5, ghost: 0 },
      poison: { grass: 2, fairy: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0 },
      ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
      flying: { grass: 2, fighting: 2, bug: 2, electric: 0.5, rock: 0.5, steel: 0.5 },
      psychic: { fighting: 2, poison: 2, psychic: 0.5, steel: 0.5, dark: 0 },
      bug: { grass: 2, psychic: 2, dark: 2, fire: 0.5, fighting: 0.5, poison: 0.5, flying: 0.5, ghost: 0.5, steel: 0.5, fairy: 0.5 },
      rock: { fire: 2, ice: 2, flying: 2, bug: 2, fighting: 0.5, ground: 0.5, steel: 0.5 },
      ghost: { ghost: 2, psychic: 2, dark: 0.5, normal: 0 },
      dragon: { dragon: 2, steel: 0.5, fairy: 0 },
      dark: { psychic: 2, ghost: 2, fighting: 0.5, dark: 0.5, fairy: 0.5 },
      steel: { ice: 2, rock: 2, fairy: 2, fire: 0.5, water: 0.5, electric: 0.5, steel: 0.5 },
      fairy: { fighting: 2, dragon: 2, dark: 2, fire: 0.5, poison: 0.5, steel: 0.5 },
    };

    function normalizeType(t) {
      const s = String(t || '').trim().toLowerCase();
      if (!s || s === 'unknown') return '';
      return s;
    }

    function parseTypes(typeStr) {
      const raw = String(typeStr || '').trim();
      if (!raw) return [];
      return raw.split('/').map(normalizeType).filter(Boolean);
    }

    function getTypeMultiplier(attackerType, defenderType) {
      const row = TYPE_CHART[attackerType];
      if (!row) return 1;
      const m = row[defenderType];
      return (typeof m === 'number') ? m : 1;
    }

    function getBestTypeMultiplier(attackerTypeStr, defenderTypeStr) {
      const attackerTypes = parseTypes(attackerTypeStr);
      const defenderTypes = parseTypes(defenderTypeStr);
      if (!attackerTypes.length || !defenderTypes.length) return 1;

      let best = 1;
      for (const att of attackerTypes) {
        let mult = 1;
        for (const def of defenderTypes) {
          mult *= getTypeMultiplier(att, def);
        }
        if (mult > best) best = mult;
      }

      // Prevent soft-lock battles from 0x immunities in a collision-only game.
      if (best === 0) return 0.25;
      return best;
    }

    function setBanner(text, color = 'rgb(91, 169, 91)') {
      const banner = document.getElementById('comment-banner');
      banner.textContent = text;
      banner.style.backgroundColor = color;
    }

    function setControlsDisabled(disabled) {
      startBtn.disabled = disabled;
      autoToggle.disabled = disabled;
      pauseBtn.disabled = disabled || !autoToggle.checked;
      container.style.pointerEvents = disabled ? 'none' : 'auto';
      container.style.opacity = disabled ? '0.75' : '1';
    }

    function showBattleOverlay(show) {
      battleOverlay.classList.toggle('active', !!show);
      container.classList.toggle('battle-mode', !!show);
    }

    function resetSelectionBoxes() {
      eliminationCount = 0;
      selectedA = null;
      selectedB = null;
      box1.innerHTML = '';
      label1.textContent = '';
      box2.innerHTML = '';
      label2.textContent = '';
    }

    function removePokemonById(id) {
      const idx = items.findIndex(p => p.id === id);
      if (idx >= 0) items.splice(idx, 1);
      drawStaticWheel();
      // Refresh wheel visuals without audio ping.
      drawWheel(0, true);
      updateLabel(0);
    }

    function addPokemonIfMissing(pokemon) {
      if (!pokemon) return;
      if (items.some(p => p.id === pokemon.id)) return;
      items.push(pokemon);
      drawStaticWheel();
      drawWheel(0, true);
      updateLabel(0);
    }

    function pickRandomIndex(excludeId = null) {
      if (items.length === 0) return -1;
      if (excludeId === null) return Math.floor(Math.random() * items.length);
      const candidates = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].id !== excludeId) candidates.push(i);
      }
      if (!candidates.length) return -1;
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    // Stats are now loaded from pokeLIST.csv (TYPE + base stats). No network fetch needed.

    function resizeBattleCanvas() {
      const dpr = window.devicePixelRatio || 1;
      const rect = battleCanvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (battleCanvas.width !== w || battleCanvas.height !== h) {
        battleCanvas.width = w;
        battleCanvas.height = h;
      }
    }

    function drawBattleIdle() {
      resizeBattleCanvas();
      const w = battleCanvas.width;
      const h = battleCanvas.height;
      battleCtx.clearRect(0, 0, w, h);
      battleCtx.save();
      battleCtx.strokeStyle = 'rgba(255,255,255,0.25)';
      battleCtx.lineWidth = 6;
      battleCtx.strokeRect(12, 12, w - 24, h - 24);
      battleCtx.fillStyle = 'rgba(255,255,255,0.9)';
      battleCtx.font = `${Math.floor(18 * (window.devicePixelRatio || 1))}px system-ui, -apple-system, Segoe UI, Arial`;
      battleCtx.textAlign = 'center';
      battleCtx.textBaseline = 'middle';
      const msg = battleRunning ? 'Battle in progressâ€¦' : 'Waiting for two PokÃ©monâ€¦';
      battleCtx.fillText(msg, w / 2, h / 2);
      battleCtx.restore();
    }

    class BattleArena {
      constructor(ctx, canvas) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.rafId = null;
        this.running = false;
        this.lastTs = 0;
        this.lastHitAt = 0;
        this.hitCooldownMs = 220;
        this.hitCount = 0;
        this.minHitsToEnd = 5;
        this.onEnd = null;
        this.a = null;
        this.b = null;
      }

      stop() {
        this.running = false;
        if (this.rafId !== null) cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }

      async start(pokeA, pokeB, onEnd) {
        this.stop();
        this.onEnd = onEnd;
        this.running = true;
        this.lastTs = performance.now();
        this.lastHitAt = 0;
        this.hitCount = 0;

        resizeBattleCanvas();
        const w = this.canvas.width;
        const h = this.canvas.height;
        const pad = 18 * (window.devicePixelRatio || 1);

        const statsA = getPokemonBattleStats(pokeA);
        const statsB = getPokemonBattleStats(pokeB);

        try { await pokeA.image.decode(); } catch (_) {}
        try { await pokeB.image.decode(); } catch (_) {}

        const baseRadius = Math.min(w, h) * 0.09;
        // Speed affects movement, but we clamp to keep physics playable.
        const spdA = clamp(35, statsA.SPD, 140);
        const spdB = clamp(35, statsB.SPD, 140);

        const speedScale = 0.0045; // tuned for px/ms at typical dpr
        const randDir = () => {
          const a = Math.random() * Math.PI * 2;
          return { x: Math.cos(a), y: Math.sin(a) };
        };

        const dirA = randDir();
        const dirB = randDir();

        this.a = {
          poke: pokeA,
          name: pokeA.name,
          img: pokeA.image,
          x: pad + baseRadius + (w * 0.25),
          y: pad + baseRadius + (h * 0.5),
          vx: dirA.x * spdA * speedScale,
          vy: dirA.y * spdA * speedScale,
          r: baseRadius,
          type: pokeA.type,
          stats: statsA,
          maxHp: computeMaxHp(statsA),
          hp: computeMaxHp(statsA),
        };
        this.b = {
          poke: pokeB,
          name: pokeB.name,
          img: pokeB.image,
          x: w - (pad + baseRadius + (w * 0.25)),
          y: pad + baseRadius + (h * 0.5),
          vx: dirB.x * spdB * speedScale,
          vy: dirB.y * spdB * speedScale,
          r: baseRadius,
          type: pokeB.type,
          stats: statsB,
          maxHp: computeMaxHp(statsB),
          hp: computeMaxHp(statsB),
        };

        const tick = (ts) => {
          if (!this.running) return;
          const dt = Math.min(34, Math.max(0, ts - this.lastTs));
          this.lastTs = ts;
          this.step(dt);
          this.draw();
          this.rafId = requestAnimationFrame(tick);
        };
        this.rafId = requestAnimationFrame(tick);
      }

      step(dt) {
        resizeBattleCanvas();
        const w = this.canvas.width;
        const h = this.canvas.height;
        const dpr = window.devicePixelRatio || 1;
        const pad = 14 * dpr;

        const advance = (f) => {
          f.x += f.vx * dt;
          f.y += f.vy * dt;

          // Wall collisions
          if (f.x - f.r < pad) { f.x = pad + f.r; f.vx *= -1; playPing(); }
          if (f.x + f.r > w - pad) { f.x = (w - pad) - f.r; f.vx *= -1; playPing(); }
          if (f.y - f.r < pad) { f.y = pad + f.r; f.vy *= -1; playPing(); }
          if (f.y + f.r > h - pad) { f.y = (h - pad) - f.r; f.vy *= -1; playPing(); }

          // Keep energy (arcade feel). If you want slight stabilization, use 0.99995.
          // f.vx *= 0.99995;
          // f.vy *= 0.99995;
        };

        advance(this.a);
        advance(this.b);

        // Circle-circle collision
        const dx = this.b.x - this.a.x;
        const dy = this.b.y - this.a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = this.a.r + this.b.r;
        if (dist > 0 && dist < minDist) {
          const nx = dx / dist;
          const ny = dy / dist;

          // Separate overlap
          const overlap = (minDist - dist);
          this.a.x -= nx * overlap * 0.5;
          this.a.y -= ny * overlap * 0.5;
          this.b.x += nx * overlap * 0.5;
          this.b.y += ny * overlap * 0.5;

          // Relative velocity along normal
          const rvx = this.b.vx - this.a.vx;
          const rvy = this.b.vy - this.a.vy;
          const velAlongNormal = rvx * nx + rvy * ny;

          if (velAlongNormal < 0) {
            const restitution = 0.99;
            const j = -(1 + restitution) * velAlongNormal / 2; // masses = 1
            const ix = j * nx;
            const iy = j * ny;
            this.a.vx -= ix;
            this.a.vy -= iy;
            this.b.vx += ix;
            this.b.vy += iy;
          }

          const now = performance.now();
          if (now - this.lastHitAt >= this.hitCooldownMs) {
            this.lastHitAt = now;
            this.hitCount++;
            this.applyCollisionDamage(dx, dy);
            playTaDah();
          }
        }

        // End condition
        if ((this.a.hp <= 0 || this.b.hp <= 0) && this.hitCount >= this.minHitsToEnd) {
          const winner = (this.a.hp > 0) ? this.a : this.b;
          const loser = (this.a.hp > 0) ? this.b : this.a;
          this.stop();
          if (typeof this.onEnd === 'function') this.onEnd(winner, loser);
        }
      }

      applyCollisionDamage(dx, dy) {
        const dist = Math.max(1, Math.hypot(dx, dy));
        const nx = dx / dist;
        const ny = dy / dist;
        const rvx = this.b.vx - this.a.vx;
        const rvy = this.b.vy - this.a.vy;
        const relSpeed = Math.abs(rvx * nx + rvy * ny);

        // Convert collision speed into a move-like "power".
        // With current velocity scaling, relSpeed is usually ~0.2â€“0.8.
        const power = clamp(18, relSpeed * 180, 120);

        // Each fighter uses their stronger attacking stat (ATK vs SPATK),
        // and the defender uses matching defense (DEF vs SPDEF).
        const aAtkIsSpecial = this.a.stats.SPATK > this.a.stats.ATK;
        const bAtkIsSpecial = this.b.stats.SPATK > this.b.stats.ATK;

        const typeMultToA = getBestTypeMultiplier(this.b.type, this.a.type);
        const typeMultToB = getBestTypeMultiplier(this.a.type, this.b.type);

        let dmgToA = computeCollisionDamage({
          power,
          atk: bAtkIsSpecial ? this.b.stats.SPATK : this.b.stats.ATK,
          def: bAtkIsSpecial ? this.a.stats.SPDEF : this.a.stats.DEF,
        });
        let dmgToB = computeCollisionDamage({
          power,
          atk: aAtkIsSpecial ? this.a.stats.SPATK : this.a.stats.ATK,
          def: aAtkIsSpecial ? this.b.stats.SPDEF : this.b.stats.DEF,
        });

        dmgToA = Math.max(1, Math.floor(dmgToA * typeMultToA));
        dmgToB = Math.max(1, Math.floor(dmgToB * typeMultToB));

        this.a.hp = Math.max(0, this.a.hp - dmgToA);
        this.b.hp = Math.max(0, this.b.hp - dmgToB);

        // Guarantee the fight lasts at least `minHitsToEnd` collision hits.
        if (this.hitCount < this.minHitsToEnd) {
          this.a.hp = Math.max(1, this.a.hp);
          this.b.hp = Math.max(1, this.b.hp);
        }
      }

      drawHpBar(x, y, w, h, frac, color) {
        const ctx = this.ctx;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
        ctx.fillStyle = color;
        ctx.fillRect(x + 2, y + 2, Math.max(0, (w - 4) * frac), h - 4);
        ctx.restore();
      }

      draw() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const dpr = window.devicePixelRatio || 1;
        const pad = 14 * dpr;

        ctx.clearRect(0, 0, w, h);

        // Arena border
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 6 * dpr;
        ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
        ctx.restore();

        // Sprites
        const drawFighter = (f) => {
          const size = f.r * 2.2;
          if (f.img && f.img.complete) {
            ctx.drawImage(f.img, f.x - size / 2, f.y - size / 2, size, size);
          } else {
            ctx.save();
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            ctx.beginPath();
            ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        };
        drawFighter(this.a);
        drawFighter(this.b);

        // HUD
        ctx.save();
        ctx.font = `${Math.floor(12 * dpr)}px system-ui, -apple-system, Segoe UI, Arial`;
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.textBaseline = 'top';

        const barW = Math.floor(w * 0.38);
        const barH = Math.floor(12 * dpr);
        const topY = pad + Math.floor(10 * dpr);

        ctx.textAlign = 'left';
        ctx.fillText(this.a.name, pad + 2, topY);
        this.drawHpBar(pad, topY + Math.floor(16 * dpr), barW, barH, this.a.hp / this.a.maxHp, '#43a047');
        ctx.fillText(`${this.a.hp}/${this.a.maxHp}`, pad + 2, topY + Math.floor(32 * dpr));

        ctx.textAlign = 'right';
        ctx.fillText(this.b.name, w - pad - 2, topY);
        this.drawHpBar(w - pad - barW, topY + Math.floor(16 * dpr), barW, barH, this.b.hp / this.b.maxHp, '#e53935');
        ctx.fillText(`${this.b.hp}/${this.b.maxHp}`, w - pad - 2, topY + Math.floor(32 * dpr));

        ctx.restore();
      }
    }

    const arena = new BattleArena(battleCtx, battleCanvas);
    drawBattleIdle();

    fetch('pokeLIST.csv')
      .then(r => r.text())
      .then(csvText => {
        const lines = csvText.trim().split(/\r?\n/);
        const header = lines.shift();
        const hasStats = (header || '').includes('TYPE') && (header || '').includes('SPATK');
        items = lines.map(line => {
          const parts = line.split(',');
          if (!hasStats || parts.length < 11) {
            const [id, name, url, ball] = parts;
            return new Pokemon(parseInt(id), name, ball, url, 'unknown', null);
          }

          const [
            id,
            name,
            url,
            ball,
            type,
            hp,
            atk,
            def,
            spatk,
            spdef,
            spd,
          ] = parts;

          const stats = {
            HP: toInt(hp, 60),
            ATK: toInt(atk, 60),
            DEF: toInt(def, 60),
            SPATK: toInt(spatk, 60),
            SPDEF: toInt(spdef, 60),
            SPD: toInt(spd, 60),
          };

          return new Pokemon(parseInt(id), name, ball, url, type, stats);
        });
        setup();

        startBtn.disabled = false;
        startBtn.textContent = 'Start';
        updateCountdown();
      })
      .catch(err => console.error('Failed to load CSV', err));

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const masterGain = audioCtx.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(audioCtx.destination);

    let muted = (localStorage.getItem('pokesin_muted') === '1');
    function syncMuteUI() {
      muteBtn.textContent = muted ? 'Unmute' : 'Mute';
      try {
        masterGain.gain.setValueAtTime(muted ? 0 : 1, audioCtx.currentTime);
      } catch (_) {}
      localStorage.setItem('pokesin_muted', muted ? '1' : '0');
    }

    function playPing() {
      if (muted) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(masterGain);
      osc.frequency.value = 1000;
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.05);
    }

    function playTaDah() {
      if (muted) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(masterGain);
      const now = audioCtx.currentTime;
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.6);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      osc.start(now);
      osc.stop(now + 0.7);
    }

    syncMuteUI();

    const SPIN_PERIOD_MS = 15000;
    let started = false;
    let paused = false;
    let autoSpin = true;
    let spinIntervalId = null;
    let countdownIntervalId = null;
    let nextSpinAtMs = null;

    function stopAutoSpin() {
      if (spinIntervalId !== null) {
        clearInterval(spinIntervalId);
        spinIntervalId = null;
      }
      if (countdownIntervalId !== null) {
        clearInterval(countdownIntervalId);
        countdownIntervalId = null;
      }
      nextSpinAtMs = null;
    }

    function updateCountdown() {
      if (!items.length) {
        nextSpinEl.textContent = 'Loadingâ€¦';
        return;
      }
      if (!started) {
        nextSpinEl.textContent = 'Not started';
        return;
      }
      if (paused) {
        nextSpinEl.textContent = 'Paused';
        return;
      }
      if (!autoSpin) {
        nextSpinEl.textContent = 'Auto: off';
        return;
      }
      if (items.length <= 1) {
        nextSpinEl.textContent = 'Finished';
        return;
      }
      if (nextSpinAtMs === null) {
        nextSpinEl.textContent = 'Next spin in: --';
        return;
      }

      const remainingSec = Math.max(0, Math.ceil((nextSpinAtMs - Date.now()) / 1000));
      nextSpinEl.textContent = `Next spin in: ${remainingSec}s`;
    }

    function startAutoSpin() {
      stopAutoSpin();
      nextSpinAtMs = Date.now() + SPIN_PERIOD_MS;

      spinIntervalId = setInterval(() => {
        if (!started || paused || !autoSpin) return;
        if (items.length > 1) {
          startSpin();
          nextSpinAtMs = Date.now() + SPIN_PERIOD_MS;
        } else {
          stopAutoSpin();
        }
        updateCountdown();
      }, SPIN_PERIOD_MS);

      countdownIntervalId = setInterval(updateCountdown, 250);
      updateCountdown();
    }

    function setup() {
      size = Math.min(window.innerWidth, window.innerHeight) * 0.675;
      const dim = Math.floor(size);
      buffer.width = canvas.width = dim;
      buffer.height = canvas.height = dim;
      center = dim / 2;
      drawStaticWheel(); drawWheel(0); updateLabel(0);
      drawBattleIdle();
    }

    function drawStaticWheel() {
      if (!buffer.width) return;
      const seg = (2 * Math.PI) / items.length;
      const r = Math.max(center - 30, 0);
      bctx.clearRect(0,0,buffer.width,buffer.height);
      items.forEach((_,i)=>{
        const s = i*seg;
        bctx.beginPath(); bctx.moveTo(center,center);
        bctx.arc(center,center,r,s,s+seg);
        bctx.closePath();
        bctx.fillStyle = `hsl(${i*360/items.length},70%,60%)`;
        bctx.fill();
      });
      bctx.beginPath(); bctx.arc(center,center,30,0,2*Math.PI);
      bctx.fillStyle='#fff'; bctx.fill();
    }

    let lastIndex = -1;
    function drawWheel(a, silent = false) {
      if (!buffer.width) { setup(); return; }
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.save(); ctx.translate(center,center); ctx.rotate(a);
      ctx.drawImage(buffer,-center,-center);
      ctx.restore();
      const idx = getCurrentIndex(a);
      if (idx !== lastIndex) {
        if (!silent) playPing();
        lastIndex = idx;
      }
    }
    function getCurrentIndex(a) {
      const seg = (2*Math.PI)/items.length;
      let raw = -Math.PI/2 - a;
      raw = (raw%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
      return Math.floor(raw/seg);
    }
    function updateLabel(a) {
      if (!items.length) return;
      label.textContent = items[getCurrentIndex(a)].name;
    }

    let spinning = false;
    function startSpin() {
      if (battleRunning) return;
      if (spinning || !items.length) return;
      if (items.length <= 1) {
        setBanner(`Champion: ${items[0]?.name || 'Unknown'}!`, '#7b61ff');
        return;
      }

      spinning = true; label.textContent = 'SPINNING...'; label.classList.remove('result');
      const sd=4000, dd=3000, st=performance.now();
      let lt=st, ca=0;
      const ic=items.length, sg=(2*Math.PI)/ic;
      const ti = pickRandomIndex(null);
      if (ti < 0) { spinning = false; return; }
      const ch=items[ti];
      let sa, td; const ex=3, v=Math.random()*0.005+0.005;
      function reveal(box, labelElem, pokemon) {
        labelElem.style.color='#2c2c2c'; labelElem.textContent=''; box.innerHTML='';
        const img=pokemon.ballImage.cloneNode(); img.style.transition='transform 0.3s'; box.appendChild(img);
        setTimeout(()=>{img.style.transform='rotate(-30deg)'; playPing();}, 500);
        setTimeout(()=>{img.style.transform='rotate(30deg)'; playPing();}, 1000);
        setTimeout(()=>{img.style.transform='rotate(-30deg)'; playPing();}, 1500);
        setTimeout(()=>{img.style.transform='rotate(0deg)'; playTaDah();}, 2000);
        setTimeout(()=>{ box.innerHTML=''; box.appendChild(pokemon.image.cloneNode()); labelElem.style.color='#fff'; labelElem.textContent=pokemon.name; }, 2500);
      }

      async function beginBattleIfReady() {
        if (!selectedA || !selectedB || battleRunning) return;
        battleRunning = true;
        showBattleOverlay(true);
        setControlsDisabled(true);
        stopAutoSpin();
        paused = true;
        pauseBtn.textContent = 'Resume';

        battleHint.textContent = 'Battle started!';
        setBanner('Battle!', '#ff6f00');

        await arena.start(selectedA, selectedB, (winner, loser) => {
          battleRunning = false;
          showBattleOverlay(false);

          // Winner goes back into the wheel pool (both fighters were removed on selection).
          addPokemonIfMissing(winner.poke);
          totalCount++;
          counterEl.textContent = `Eliminated: ${totalCount}`;

          if (items.length <= 1) {
            setBanner(`Champion: ${winner.name}!`, '#7b61ff');
            battleHint.textContent = `Champion: ${winner.name}`;
            setControlsDisabled(true);
            drawBattleIdle();
            return;
          }

          setBanner(`Winner: ${winner.name}!`, '#1e88e5');
          battleHint.textContent = `Winner: ${winner.name}. Spin again for a new match.`;

          // Reset selection for next match
          resetSelectionBoxes();
          drawBattleIdle();

          // Re-enable controls (auto-spin stays paused; user can resume)
          setControlsDisabled(false);
          updateCountdown();
        });
      }

      function frame(now) {
        const e=now-st, dt=now-lt; lt=now;
        let pickedIdToRemove = null;
        if(e<sd) ca+=v*dt;
        else if(e<sd+dd) {
          if(sa===undefined) {
            sa=ca; const des=-Math.PI/2-(ti*sg+sg/2);
            let d=((des-sa)%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
            td=d+ex*2*Math.PI;
          }
          const t=(e-sd)/dd; ca=sa+td*(1-Math.pow(1-t,3));
        } else {
          ca=sa+td;
          if(eliminationCount===0) {
            selectedA = ch;
            reveal(box1,label1,ch);
            setBanner('First pick locked. Spin for the opponent!', 'rgb(91, 169, 91)');
            pickedIdToRemove = ch.id;
          }
          else if(eliminationCount===1) {
            selectedB = ch;
            reveal(box2,label2,ch);
            setBanner('Opponent locked. Starting battleâ€¦', '#ff6f00');
            setTimeout(beginBattleIfReady, 2600);
            pickedIdToRemove = ch.id;
          }
          eliminationCount++;
        }
        drawWheel(ca); updateLabel(ca);
        // Remove selected PokÃ©mon from the wheel pool AFTER drawing the final frame,
        // so we don't break angle/index math for this spin.
        if (pickedIdToRemove !== null) {
          setTimeout(() => removePokemonById(pickedIdToRemove), 0);
        }
        if(e<sd+dd) requestAnimationFrame(frame);
        else { label.classList.add('result'); playTaDah(); spinning=false; lastIndex=-1; }
      }
      requestAnimationFrame(frame);
    }

    // Allow manual spins by clicking the wheel, but only after Start.
    container.addEventListener('click', () => {
      if (!started) return;
      startSpin();
    });

    startBtn.addEventListener('click', async () => {
      // First click = start the show (and satisfy browser audio policies).
      if (!started) {
        started = true;
        paused = false;
        startBtn.textContent = 'Spin Now';
      }

      try { await audioCtx.resume(); } catch (_) {}
      syncMuteUI();

      // Immediate spin on Start/Spin Now.
      startSpin();

      // Manage auto-spin.
      autoSpin = autoToggle.checked;
      pauseBtn.disabled = !autoSpin;
      if (autoSpin && !paused) startAutoSpin();
      else stopAutoSpin();

      updateCountdown();
    });

    muteBtn.addEventListener('click', async () => {
      // Some browsers require user interaction; this click counts.
      try { await audioCtx.resume(); } catch (_) {}
      muted = !muted;
      syncMuteUI();
    });

    pauseBtn.addEventListener('click', () => {
      if (!started) return;

      if (!paused) {
        paused = true;
        pauseBtn.textContent = 'Resume';
        stopAutoSpin();
      } else {
        paused = false;
        pauseBtn.textContent = 'Pause';
        if (autoToggle.checked) startAutoSpin();
      }
      updateCountdown();
    });

    autoToggle.addEventListener('change', () => {
      autoSpin = autoToggle.checked;
      pauseBtn.disabled = !autoSpin;

      if (!started) {
        updateCountdown();
        return;
      }

      if (autoSpin && !paused) startAutoSpin();
      else stopAutoSpin();

      updateCountdown();
    });

    window.addEventListener('resize', setup);
    window.addEventListener('resize', () => drawBattleIdle());
    setup();
  