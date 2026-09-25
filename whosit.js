    const Config = {
      toolbarH: 48,
      barH: 56,
      listPad: 14,
      chipH: 44,
      chipGap: 10,
      listChipW: 176,
      slotChipW: 148,
      longMs: 400,
      storageKey: 'whosit_people_v1',
      gravity: 1500,
      bounceG: 1600,
      rest: 0.61,
      restTop: 0.88,
      restBot: 0.4,
      edgeRest: 0.94,
      ballRestAir: 0.95,
      ballRestGround: 0.42,
      rampFric: 0.01,
      slotSpeed: 540,
      ballR: 15,
      shrinkMs: 300,
      dropOffPad: 48,
      gapW: 56,
      chuteH: 26,
      funnelDeg: 30
    };

    const Palette = [
      '#c12b2b', '#cf7124', '#a99d2d', '#379856', '#2f61a7',
      '#893a9e', '#9a6532', '#339996', '#aa375e', '#406f9f',
      '#334da2', '#9e962e', '#bc592c', '#319b7d', '#5735a8'
    ];

    class Person {
      constructor(name, color, active = true) {
        this.name = String(name).slice(0, 12);
        this.color = color || Palette[0];
        this.active = active !== false;
      }
    }

    class Token {
      constructor(person, x, y, w, h) {
        this.person = person;
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.startW = w;
        this.startH = h;
        this.vx = 0;
        this.vy = 0;
        this.r = Config.ballR;
        this.morph = 1;
        this.team = -1;
        this.slot = -1;
        this.tx = x;
        this.ty = y;
        this.phase = 'shrink';
        this.seated = false;
        this.frozen = false;
        this.grounded = false;
      }
    }

    class App {
      constructor() {
        this.canvas = document.getElementById('c');
        this.ctx = this.canvas.getContext('2d');
        this.nameOverlay = document.getElementById('nameOverlay');
        this.nameInput = document.getElementById('nameInput');
        this.nameOkBtn = document.getElementById('nameOk');
        this.teamSel = document.getElementById('teamN');
        this.eachSel = document.getElementById('eachN');
        this.goBtn = document.getElementById('goBtn');

        this.people = [];
        this.tokens = [];
        this.mode = 'list';
        this.scroll = 0;
        this.editIndex = -1;
        this.nameHolding = -1;
        this.nameHoldStart = 0;
        this.nameDidLong = false;
        this.lastPointer = null;
        this.dragging = false;
        this.dragStartY = 0;
        this.dragScroll = 0;
        this.savePending = false;
        this.lastTime = performance.now();
        this.msg = '';
        this.msgUntil = 0;
        this.phaseT = 0;
        this.teamN = 2;
        this.eachN = 2;
        this.fillCount = 0;
        this.holeOpen = true;
        this.showFunnel = false;

        this.fillSelects();
        this.bindUi();
        this.resize();
        this.loadState();
        window.addEventListener('resize', () => this.resize());
        requestAnimationFrame(t => this.frame(t));
      }

      fillSelects() {
        for (const sel of [this.teamSel, this.eachSel]) {
          sel.innerHTML = '';
          for (let n = 1; n <= 9; n++) {
            const opt = document.createElement('option');
            opt.value = String(n);
            opt.textContent = String(n);
            sel.appendChild(opt);
          }
        }
        this.teamSel.value = '2';
        this.eachSel.value = '2';
      }

      saveState() {
        try {
          const data = {
            teamN: this.teamN,
            eachN: this.eachN,
            people: this.people.map(p => ({ name: p.name, color: p.color, active: p.active }))
          };
          localStorage.setItem(Config.storageKey, JSON.stringify(data));
        } catch (e) {}
      }

      scheduleSave() {
        if (this.savePending) return;
        this.savePending = true;
        requestAnimationFrame(() => {
          this.savePending = false;
          this.saveState();
        });
      }

      loadState() {
        try {
          const raw = localStorage.getItem(Config.storageKey);
          if (!raw) return;
          const data = JSON.parse(raw);
          if (!data || !Array.isArray(data.people)) return;
          this.people = data.people
            .filter(p => p && typeof p.name === 'string')
            .map((p, i) => new Person(
              p.name,
              Palette.includes(p.color) ? p.color : Palette[i % Palette.length],
              p.active !== false
            ));
          const tn = Number(data.teamN) | 0;
          const en = Number(data.eachN) | 0;
          if (tn >= 1 && tn <= 9) {
            this.teamN = tn;
            this.teamSel.value = String(tn);
          }
          if (en >= 1 && en <= 9) {
            this.eachN = en;
            this.eachSel.value = String(en);
          }
        } catch (e) {
          this.people = [];
        }
      }

      resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.clampScroll();
      }

      listTop() {
        return Config.toolbarH + 10;
      }

      listBottom() {
        return this.canvas.height - Config.barH - 8;
      }

      contentH() {
        if (!this.people.length) return 0;
        return this.people.length * (Config.chipH + Config.chipGap) - Config.chipGap;
      }

      maxScroll() {
        return Math.max(0, this.contentH() - (this.listBottom() - this.listTop()));
      }

      clampScroll() {
        this.scroll = Math.max(0, Math.min(this.scroll, this.maxScroll()));
      }

      chipRect(i) {
        const w = Math.min(Config.listChipW, this.canvas.width - Config.listPad * 2);
        const x = (this.canvas.width - w) / 2;
        const y = this.listTop() + i * (Config.chipH + Config.chipGap) - this.scroll;
        return { x, y, w, h: Config.chipH };
      }

      nextColor() {
        const used = {};
        for (const p of this.people) used[p.color] = (used[p.color] || 0) + 1;
        let best = Palette[0];
        let bestN = 1e9;
        for (const c of Palette) {
          const n = used[c] || 0;
          if (n < bestN) {
            best = c;
            bestN = n;
          }
        }
        return best;
      }

      openNameEditor(prefill, index) {
        this.editIndex = index;
        this.nameInput.value = prefill || '';
        this.nameOkBtn.textContent = index >= 0 ? 'Save' : 'Add';
        this.nameOverlay.classList.toggle('editing', index >= 0);
        this.nameOverlay.classList.add('show');
        requestAnimationFrame(() => {
          this.nameInput.focus();
          this.nameInput.select();
        });
      }

      addPerson() {
        this.openNameEditor('', -1);
      }

      editPerson(i) {
        if (i < 0 || i >= this.people.length) return;
        this.openNameEditor(this.people[i].name, i);
      }

      commitName() {
        const name = this.nameInput.value.trim();
        this.closeOverlay();
        if (!name) return;
        if (this.editIndex >= 0 && this.editIndex < this.people.length) {
          this.people[this.editIndex].name = name.slice(0, 12);
        } else {
          this.people.push(new Person(name, this.nextColor(), true));
        }
        this.editIndex = -1;
        this.saveState();
        this.clampScroll();
      }

      deleteEdited() {
        const i = this.editIndex;
        this.closeOverlay();
        if (i < 0 || i >= this.people.length) return;
        this.people.splice(i, 1);
        this.saveState();
        this.clampScroll();
      }

      closeOverlay() {
        this.nameOverlay.classList.remove('show', 'editing');
        this.nameInput.blur();
        this.editIndex = -1;
      }

      cancelName() {
        this.closeOverlay();
      }

      toggleActive(i) {
        if (i < 0 || i >= this.people.length) return;
        this.people[i].active = !this.people[i].active;
        this.saveState();
      }

      needed() {
        return this.teamN * this.eachN;
      }

      dealGeom() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        const chipH = Math.min(Config.chipH, 40);
        const gap = 8;
        const slotH = this.eachN * chipH + Math.max(0, this.eachN - 1) * gap;
        const slotPad = 10;
        const lineY = h - Config.barH - slotH - slotPad * 2 - 6;
        const chipW = Math.min(Config.slotChipW, Math.max(96, w / Math.max(this.teamN, 2) - 28));
        const cx = w * 0.5;
        const gapW = Config.gapW;
        const holeL = cx - gapW / 2;
        const holeR = cx + gapW / 2;
        const chuteH = Config.chuteH;
        const chuteTop = lineY - chuteH;
        const wantH = Math.tan(Config.funnelDeg * Math.PI / 180) * Math.max(24, holeL);
        const maxH = Math.max(36, chuteTop - Config.toolbarH - 8);
        const funnelH = Math.min(wantH, maxH);
        const xs = [];
        if (this.teamN === 1) {
          xs.push(w * 0.5);
        } else if (this.teamN === 2) {
          const inset = Math.max(chipW * 0.55, w * 0.2);
          xs.push(inset);
          xs.push(w - inset);
        } else {
          const pad = Math.max(16, chipW * 0.12);
          const span = w - pad * 2;
          for (let t = 0; t < this.teamN; t++) xs.push(pad + (t + 0.5) * (span / this.teamN));
        }
        const slotTop = lineY + slotPad + chipH / 2;
        return {
          w, h, cx, lineY, gapW, funnelH, chipW, chipH, gap, xs, slotTop,
          holeL, holeR, chuteH, chuteTop,
          rampLX: 0, rampLY: chuteTop - funnelH,
          rampRX: w, rampRY: chuteTop - funnelH
        };
      }

      slotPos(team, slotFromTop, G) {
        return {
          x: G.xs[team],
          y: G.slotTop + slotFromTop * (G.chipH + G.gap),
          w: G.chipW,
          h: G.chipH
        };
      }

      slotFromFill(fillIndex) {
        const team = fillIndex % this.teamN;
        const rowFromBottom = Math.floor(fillIndex / this.teamN);
        const slotFromTop = this.eachN - 1 - rowFromBottom;
        return { team, slot: slotFromTop };
      }

      setGoIdle() {
        this.goBtn.textContent = 'GO';
        this.goBtn.disabled = false;
      }

      setGoBusy() {
        this.goBtn.textContent = 'GO';
        this.goBtn.disabled = true;
      }

      setGoDone() {
        this.goBtn.textContent = 'DONE';
        this.goBtn.disabled = false;
      }

      startDeal() {
        if (this.mode !== 'list') return;
        this.teamN = Math.max(1, Math.min(9, Number(this.teamSel.value) | 0));
        this.eachN = Math.max(1, Math.min(9, Number(this.eachSel.value) | 0));
        this.saveState();

        const active = [];
        for (let i = 0; i < this.people.length; i++) {
          if (this.people[i].active) active.push({ person: this.people[i], i });
        }
        const need = this.needed();
        if (active.length < need) {
          this.msg = `Need ${need} active names`;
          this.msgUntil = performance.now() + 1600;
          return;
        }

        this.tokens = [];
        for (const item of active) {
          const r = this.chipRect(item.i);
          this.tokens.push(new Token(item.person, r.x + r.w / 2, r.y + r.h / 2, r.w, r.h));
        }

        this.mode = 'deal';
        this.phaseT = 0;
        this.fillCount = 0;
        this.holeOpen = true;
        this.showFunnel = false;
        this.setGoBusy();
      }

      finishDeal() {
        this.tokens = [];
        this.mode = 'list';
        this.fillCount = 0;
        this.holeOpen = true;
        this.showFunnel = false;
        this.setGoIdle();
      }

      releaseFromTop() {
        const w = this.canvas.width;
        const r = Config.ballR;
        const margin = r + 8;
        const span = Math.max(8, w - margin * 2);
        const order = this.tokens.map((_, i) => i);
        for (let i = order.length - 1; i > 0; i--) {
          const j = (Math.random() * (i + 1)) | 0;
          const tmp = order[i];
          order[i] = order[j];
          order[j] = tmp;
        }
        for (let k = 0; k < order.length; k++) {
          const tok = this.tokens[order[k]];
          tok.r = r;
          tok.w = r * 2;
          tok.h = r * 2;
          tok.morph = 0;
          tok.team = -1;
          tok.slot = -1;
          tok.seated = false;
          tok.frozen = false;
          tok.grounded = false;
          tok.x = margin + Math.random() * span;
          tok.y = -r - 16 - k * (r * 2 + 6) - Math.random() * 18;
          tok.vx = (Math.random() - 0.5) * 140;
          tok.vy = 20 + Math.random() * 50;
          tok.phase = 'play';
        }
        this.fillCount = 0;
        this.holeOpen = true;
        this.showFunnel = true;
        this.phaseT = 0;
      }

      claimSlot(tok) {
        const need = this.needed();
        if (this.fillCount >= need) return false;
        const G = this.dealGeom();
        const place = this.slotFromFill(this.fillCount);
        this.fillCount++;
        tok.team = place.team;
        tok.slot = place.slot;
        const dest = this.slotPos(place.team, place.slot, G);
        tok.tx = dest.x;
        tok.ty = dest.y;
        tok.startW = dest.w;
        tok.startH = dest.h;
        tok.phase = 'fallSlot';
        tok.vx = 0;
        tok.vy = Config.slotSpeed;
        tok.morph = 0;
        tok.w = tok.r * 2;
        tok.h = tok.r * 2;
        if (this.fillCount >= need) this.holeOpen = false;
        return true;
      }

      hitList(x, y) {
        if (y < Config.toolbarH) {
          if (x > this.canvas.width - 56) return { type: 'add' };
          return null;
        }
        if (y >= this.listBottom()) return null;
        for (let i = 0; i < this.people.length; i++) {
          const r = this.chipRect(i);
          if (y >= r.y && y <= r.y + r.h && x >= r.x && x <= r.x + r.w) {
            return { type: 'chip', i };
          }
        }
        return { type: 'listbg' };
      }

      pointerPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const src = e.touches && e.touches[0] ? e.touches[0] : e;
        return { x: src.clientX - rect.left, y: src.clientY - rect.top };
      }

      clearHolds() {
        this.nameHolding = -1;
      }

      onPointerDown(e) {
        if (this.nameOverlay.classList.contains('show')) return;
        if (this.mode !== 'list') return;
        e.preventDefault();
        const { x, y } = this.pointerPos(e);
        this.lastPointer = { x, y };
        this.dragging = false;
        this.dragStartY = y;
        this.dragScroll = this.scroll;
        this.nameDidLong = false;
        this.clearHolds();
        const hit = this.hitList(x, y);
        if (hit && hit.type === 'chip') {
          this.nameHolding = hit.i;
          this.nameHoldStart = performance.now();
        }
      }

      onPointerMove(e) {
        if (!this.lastPointer || this.mode !== 'list') return;
        const { x, y } = this.pointerPos(e);
        const dy = y - this.dragStartY;
        if (!this.dragging && Math.abs(dy) > 12) {
          this.dragging = true;
          this.clearHolds();
        }
        if (this.dragging) {
          this.scroll = this.dragScroll - dy;
          this.clampScroll();
        } else if (this.nameHolding >= 0 && Math.hypot(x - this.lastPointer.x, y - this.lastPointer.y) > 20) {
          this.clearHolds();
        }
      }

      onPointerUp(e) {
        if (this.nameOverlay.classList.contains('show')) return;
        if (this.mode !== 'list') return;
        e.preventDefault();
        if (!this.lastPointer) return;
        const { x, y } = this.lastPointer;
        this.lastPointer = null;
        const wasDrag = this.dragging;
        this.dragging = false;
        if (this.nameDidLong) {
          this.nameDidLong = false;
          this.clearHolds();
          return;
        }
        this.clearHolds();
        if (wasDrag) return;
        const hit = this.hitList(x, y);
        if (!hit) return;
        if (hit.type === 'add') this.addPerson();
        else if (hit.type === 'chip') this.toggleActive(hit.i);
      }

      onWheel(e) {
        if (this.mode !== 'list') return;
        this.scroll += e.deltaY;
        this.clampScroll();
      }

      bindUi() {
        const c = this.canvas;
        c.addEventListener('pointerdown', e => this.onPointerDown(e));
        c.addEventListener('pointerup', e => this.onPointerUp(e));
        c.addEventListener('pointercancel', () => {
          this.clearHolds();
          this.lastPointer = null;
          this.dragging = false;
        });
        c.addEventListener('pointermove', e => this.onPointerMove(e));
        c.addEventListener('wheel', e => {
          e.preventDefault();
          this.onWheel(e);
        }, { passive: false });
        c.addEventListener('touchstart', e => this.onPointerDown(e), { passive: false });
        c.addEventListener('touchend', e => this.onPointerUp(e), { passive: false });

        document.getElementById('nameOk').addEventListener('click', () => this.commitName());
        document.getElementById('nameCancel').addEventListener('click', () => this.cancelName());
        document.getElementById('nameDel').addEventListener('click', () => this.deleteEdited());
        this.nameInput.addEventListener('keydown', e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.commitName();
          } else if (e.key === 'Escape') {
            this.cancelName();
          }
        });

        this.teamSel.addEventListener('change', () => {
          if (this.mode !== 'list') {
            this.teamSel.value = String(this.teamN);
            return;
          }
          this.teamN = Number(this.teamSel.value) | 0;
          this.saveState();
        });
        this.eachSel.addEventListener('change', () => {
          if (this.mode !== 'list') {
            this.eachSel.value = String(this.eachN);
            return;
          }
          this.eachN = Number(this.eachSel.value) | 0;
          this.saveState();
        });
        this.goBtn.addEventListener('click', () => {
          if (this.mode === 'done') this.finishDeal();
          else if (this.mode === 'list') this.startDeal();
        });
      }

      inDrain(tok, G) {
        return tok.x > G.holeL && tok.x < G.holeR && tok.y + tok.r > G.chuteTop - 2;
      }

      bounceSegment(tok, x1, y1, x2, y2, nx, ny, rest, friction) {
        const sx = x2 - x1;
        const sy = y2 - y1;
        const len2 = sx * sx + sy * sy || 1;
        const rawT = ((tok.x - x1) * sx + (tok.y - y1) * sy) / len2;
        const t = Math.max(0, Math.min(1, rawT));
        const px = x1 + t * sx;
        const py = y1 + t * sy;
        const dx = tok.x - px;
        const dy = tok.y - py;
        let hx;
        let hy;
        if (rawT > 0 && rawT < 1) {
          const signed = dx * nx + dy * ny;
          if (signed >= tok.r) return false;
          hx = nx;
          hy = ny;
          const pen = tok.r - signed;
          tok.x += hx * pen;
          tok.y += hy * pen;
        } else {
          const dist = Math.hypot(dx, dy);
          if (dist >= tok.r || dist < 1e-8) return false;
          hx = dx / dist;
          hy = dy / dist;
          const pen = tok.r - dist;
          tok.x += hx * pen;
          tok.y += hy * pen;
        }
        const vn = tok.vx * hx + tok.vy * hy;
        if (vn < 0) {
          tok.vx -= (1 + rest) * vn * hx;
          tok.vy -= (1 + rest) * vn * hy;
        }
        if (friction > 0) {
          const tx = -hy;
          const ty = hx;
          const vt = tok.vx * tx + tok.vy * ty;
          const kill = Math.min(1, friction);
          tok.vx -= vt * kill * tx;
          tok.vy -= vt * kill * ty;
        }
        return true;
      }

      collidePlayBalls(G) {
        const list = this.tokens;
        for (let i = 0; i < list.length; i++) {
          const a = list[i];
          if (a.phase !== 'play' || a.frozen) continue;
          const aDrain = this.inDrain(a, G);
          for (let j = i + 1; j < list.length; j++) {
            const b = list[j];
            if (b.phase !== 'play' || b.frozen) continue;
            const bDrain = this.inDrain(b, G);
            if (aDrain && bDrain) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.hypot(dx, dy) || 0.0001;
            const min = a.r + b.r;
            if (dist >= min) continue;
            const nx = dx / dist;
            const ny = dy / dist;
            const overlap = min - dist;
            if (aDrain) {
              b.x += nx * overlap;
              b.y += ny * overlap;
            } else if (bDrain) {
              a.x -= nx * overlap;
              a.y -= ny * overlap;
            } else {
              a.x -= nx * overlap * 0.5;
              a.y -= ny * overlap * 0.5;
              b.x += nx * overlap * 0.5;
              b.y += ny * overlap * 0.5;
            }
            const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
            if (rel <= 0) continue;
            const air = !a.grounded && !b.grounded && !aDrain && !bDrain;
            const e = air ? Config.ballRestAir : Config.ballRestGround;
            const jn = -(1 + e) * rel * 0.5;
            a.vx += jn * nx;
            a.vy += jn * ny;
            b.vx -= jn * nx;
            b.vy -= jn * ny;
          }
        }
      }

      wallRestAt(y, G) {
        const topY = Math.min(G.rampLY, G.rampRY);
        const botY = G.chuteTop;
        const u = (y - topY) / Math.max(1, botY - topY);
        const t = 1 - Math.max(0, Math.min(1, u));
        return Config.restBot + (Config.restTop - Config.restBot) * t;
      }

      resolvePlayBounds(tok, G) {
        const left = tok.r + 2;
        const right = G.w - tok.r - 2;
        if (tok.x < left) {
          tok.x = left;
          if (tok.vx < 0) tok.vx = -tok.vx * Config.edgeRest;
          tok.grounded = true;
        } else if (tok.x > right) {
          tok.x = right;
          if (tok.vx > 0) tok.vx = -tok.vx * Config.edgeRest;
          tok.grounded = true;
        }

        const closed = !this.holeOpen;
        const drain = !closed && this.inDrain(tok, G);

        const lvx = G.holeL - G.rampLX;
        const lvy = G.chuteTop - G.rampLY;
        const llen = Math.hypot(lvx, lvy) || 1;
        const rvx = G.holeR - G.rampRX;
        const rvy = G.chuteTop - G.rampRY;
        const rlen = Math.hypot(rvx, rvy) || 1;
        const rest = this.wallRestAt(tok.y, G);
        const fric = Config.rampFric;

        if (!drain) {
          if (this.bounceSegment(tok, G.rampLX, G.rampLY, G.holeL, G.chuteTop, lvy / llen, -lvx / llen, rest, fric)) tok.grounded = true;
          if (this.bounceSegment(tok, G.rampRX, G.rampRY, G.holeR, G.chuteTop, -rvy / rlen, rvx / rlen, rest, fric)) tok.grounded = true;
          if (tok.y + tok.r > G.chuteTop) {
            this.bounceSegment(tok, G.holeL, G.chuteTop, G.holeL, G.lineY, 1, 0, 0, 0.02);
            this.bounceSegment(tok, G.holeR, G.chuteTop, G.holeR, G.lineY, -1, 0, 0, 0.02);
          }
        }

        if (closed) {
          if (this.bounceSegment(tok, 0, G.lineY, G.w, G.lineY, 0, -1, Config.restBot, 0.06)) tok.grounded = true;
        } else if (!drain) {
          if (this.bounceSegment(tok, 0, G.lineY, G.holeL, G.lineY, 0, -1, Config.restBot, 0.06)) tok.grounded = true;
          if (this.bounceSegment(tok, G.holeR, G.lineY, G.w, G.lineY, 0, -1, Config.restBot, 0.06)) tok.grounded = true;
        }

        if (drain) {
          if (tok.x - tok.r < G.holeL) tok.x = G.holeL + tok.r;
          if (tok.x + tok.r > G.holeR) tok.x = G.holeR - tok.r;
          tok.vx *= 0.9;
          if (tok.vy < 90) tok.vy = 90;
          if (tok.y + tok.r > G.lineY) this.claimSlot(tok);
        }
      }

      updateDeal(dt) {
        this.phaseT += dt;
        const n = this.tokens.length;
        if (!n) return;

        if (this.tokens[0].phase === 'shrink') {
          const u = Math.min(1, this.phaseT / (Config.shrinkMs / 1000));
          const e = 1 - Math.pow(1 - u, 3);
          for (const tok of this.tokens) {
            const tw = tok.r * 2;
            const th = tok.r * 2;
            tok.w = tok.startW + (tw - tok.startW) * e;
            tok.h = tok.startH + (th - tok.startH) * e;
            tok.morph = 1 - e;
          }
          if (u >= 1) {
            this.phaseT = 0;
            for (const tok of this.tokens) {
              tok.phase = 'drop';
              tok.morph = 0;
              tok.w = tok.r * 2;
              tok.h = tok.r * 2;
              tok.vy = 50;
              tok.vx = (Math.random() - 0.5) * 50;
            }
          }
          return;
        }

        if (this.tokens[0].phase === 'drop') {
          let gone = 0;
          for (const tok of this.tokens) {
            tok.vy += Config.gravity * dt;
            tok.x += tok.vx * dt;
            tok.y += tok.vy * dt;
            if (tok.y - tok.r > this.canvas.height + Config.dropOffPad) gone++;
          }
          if (gone === n) this.releaseFromTop();
          return;
        }

        const G = this.dealGeom();
        const need = this.needed();
        const steps = 4;
        const sdt = dt / steps;
        for (let s = 0; s < steps; s++) {
          for (const tok of this.tokens) {
            if (tok.phase !== 'play' || tok.frozen) continue;
            tok.grounded = false;
            tok.vy += Config.bounceG * sdt;
            tok.vx *= Math.pow(0.997, sdt * 60);
            tok.vy *= Math.pow(0.997, sdt * 60);
            tok.x += tok.vx * sdt;
            tok.y += tok.vy * sdt;
            this.resolvePlayBounds(tok, G);
          }
          this.collidePlayBalls(G);
          for (const tok of this.tokens) {
            if (tok.phase === 'play' && !tok.frozen) this.resolvePlayBounds(tok, G);
          }
        }

        const speed = Config.slotSpeed;
        for (const tok of this.tokens) {
          if (tok.phase !== 'fallSlot' && tok.phase !== 'slideSlot') continue;
          const dest = this.slotPos(tok.team, tok.slot, G);
          tok.tx = dest.x;
          tok.ty = dest.y;
          tok.startW = dest.w;
          tok.startH = dest.h;
          tok.morph = 0;
          tok.w = tok.r * 2;
          tok.h = tok.r * 2;
          if (tok.phase === 'fallSlot') {
            tok.vx = 0;
            tok.vy = speed;
            tok.y += speed * dt;
            if (tok.y >= tok.ty) {
              tok.y = tok.ty;
              tok.vy = 0;
              tok.phase = 'slideSlot';
            }
          }
          if (tok.phase === 'slideSlot') {
            const dx = tok.tx - tok.x;
            const step = speed * dt;
            if (Math.abs(dx) <= step) {
              tok.x = tok.tx;
              tok.y = tok.ty;
              tok.vx = 0;
              tok.vy = 0;
              tok.seated = true;
              tok.phase = 'seated';
            } else {
              tok.x += Math.sign(dx) * step;
              tok.y = tok.ty;
              tok.vx = Math.sign(dx) * speed;
              tok.vy = 0;
            }
          }
        }

        const target = Math.min(need, n);
        const seatedN = this.tokens.filter(t => t.seated).length;
        if (seatedN >= target) {
          let popped = 0;
          for (const tok of this.tokens) {
            if (!tok.seated) continue;
            tok.morph = Math.min(1, tok.morph + dt * 2.6);
            tok.w = tok.r * 2 + (tok.startW - tok.r * 2) * tok.morph;
            tok.h = tok.r * 2 + (tok.startH - tok.r * 2) * tok.morph;
            if (tok.morph >= 1) popped++;
          }
          if (popped >= target && this.mode === 'deal') {
            this.mode = 'done';
            this.setGoDone();
          }
        }
      }

      update(dt, now) {
        if (this.nameHolding >= 0 && now - this.nameHoldStart >= Config.longMs) {
          const idx = this.nameHolding;
          this.nameHolding = -1;
          this.nameDidLong = true;
          this.editPerson(idx);
        }
        if (this.mode === 'deal' || this.mode === 'done') this.updateDeal(dt);
      }

      drawChip(x, y, w, h, fill, name, active) {
        const ctx = this.ctx;
        const r = Math.min(h * 0.45, 14);
        ctx.fillStyle = active ? fill : '#6a6a64';
        ctx.beginPath();
        ctx.roundRect(x - w / 2, y - h / 2, w, h, r);
        ctx.fill();
        ctx.fillStyle = active ? '#eeeeee' : '#3a3a36';
        ctx.fillStyle = active ? 'rgba(255, 255, 255, 0.82)' : 'rgba(0, 0, 0, 0.7)';
        const fs = Math.min(18, Math.max(12, w / Math.max(name.length * 0.62, 4)));
        ctx.font = `500 ${fs}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, x, y + 0.5);
      }

      drawToolbar() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        ctx.fillStyle = '#0f2214';
        ctx.fillRect(0, 0, w, Config.toolbarH);
        ctx.strokeStyle = '#1a3a24';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, Config.toolbarH - 0.5);
        ctx.lineTo(w, Config.toolbarH - 0.5);
        ctx.stroke();

        ctx.fillStyle = '#a8d0b0';
        ctx.font = 'bold 18px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('whosit', 14, Config.toolbarH / 2 + 1);

        if (this.mode === 'list') {
          ctx.fillStyle = '#2a5a3a';
          ctx.beginPath();
          ctx.roundRect(w - 46, 8, 36, 32, 6);
          ctx.fill();
          ctx.fillStyle = '#a8d0b0';
          ctx.font = 'bold 24px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('+', w - 28, Config.toolbarH / 2 + 1);
        }
      }

      drawFunnel(G) {
        const ctx = this.ctx;
        ctx.fillStyle = '#222233';
        ctx.beginPath();
        ctx.moveTo(G.rampLX, G.rampLY);
        ctx.lineTo(G.holeL, G.chuteTop);
        ctx.lineTo(G.holeL, G.lineY);
        ctx.lineTo(0, G.lineY);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(G.rampRX, G.rampRY);
        ctx.lineTo(G.holeR, G.chuteTop);
        ctx.lineTo(G.holeR, G.lineY);
        ctx.lineTo(G.w, G.lineY);
        ctx.closePath();
        ctx.fill();
        if (!this.holeOpen) {
          ctx.fillRect(G.holeL, G.chuteTop, G.holeR - G.holeL, G.lineY - G.chuteTop);
        }

        ctx.strokeStyle = '#8a8a8a';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(G.rampLX, G.rampLY);
        ctx.lineTo(G.holeL, G.chuteTop);
        ctx.lineTo(G.holeL, G.lineY);
        ctx.moveTo(G.rampRX, G.rampRY);
        ctx.lineTo(G.holeR, G.chuteTop);
        ctx.lineTo(G.holeR, G.lineY);
        ctx.moveTo(0, G.lineY);
        if (this.holeOpen) {
          ctx.lineTo(G.holeL, G.lineY);
          ctx.moveTo(G.holeR, G.lineY);
          ctx.lineTo(G.w, G.lineY);
        } else {
          ctx.lineTo(G.w, G.lineY);
        }
        ctx.stroke();
      }

      drawList() {
        const ctx = this.ctx;
        const top = this.listTop();
        const bot = this.listBottom();
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, top - 2, this.canvas.width, bot - top + 4);
        ctx.clip();

        if (!this.people.length) {
          ctx.fillStyle = '#4a6a50';
          ctx.font = '18px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('Tap + to add names', this.canvas.width / 2, (top + bot) / 2);
        } else {
          for (let i = 0; i < this.people.length; i++) {
            const r = this.chipRect(i);
            if (r.y + r.h < top || r.y > bot) continue;
            const p = this.people[i];
            this.drawChip(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, p.color, p.name, p.active);
          }
        }
        ctx.restore();

        if (this.maxScroll() > 0) {
          const trackH = bot - top;
          const view = trackH;
          const full = this.contentH();
          const thumbH = Math.max(18, trackH * (view / full));
          const thumbY = top + (trackH - thumbH) * (this.scroll / this.maxScroll());
          ctx.fillStyle = 'rgba(168,208,176,0.35)';
          ctx.beginPath();
          ctx.roundRect(this.canvas.width - 6, thumbY, 3, thumbH, 2);
          ctx.fill();
        }
      }

      drawTokens() {
        for (const tok of this.tokens) {
          const name = tok.morph > 0.55 ? tok.person.name : '';
          this.drawChip(tok.x, tok.y, tok.w, tok.h, tok.person.color, name, true);
        }
      }

      drawMsg(now) {
        if (!this.msg || now > this.msgUntil) return;
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(15,34,20,0.88)';
        ctx.beginPath();
        ctx.roundRect(this.canvas.width / 2 - 130, this.canvas.height * 0.42 - 22, 260, 44, 10);
        ctx.fill();
        ctx.fillStyle = '#c8e8c8';
        ctx.font = '15px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.msg, this.canvas.width / 2, this.canvas.height * 0.42);
      }

      draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawToolbar();
        if (this.mode === 'list') {
          this.drawList();
        } else {
          if (this.showFunnel) this.drawFunnel(this.dealGeom());
          this.drawTokens();
        }
        this.drawMsg(performance.now());
      }

      frame(now) {
        const dt = Math.min((now - this.lastTime) / 1000, 0.05);
        this.lastTime = now;
        this.update(dt, now);
        this.draw();
        requestAnimationFrame(t => this.frame(t));
      }
    }

    new App();
  