class Whosit {
  constructor() {
    this.canvas = document.getElementById('c');
    this.ctx = this.canvas.getContext('2d');
    this.teamSel = document.getElementById('teamN');
    this.eachSel = document.getElementById('eachN');
    this.goBtn = document.getElementById('goBtn');

    this.roster = new Roster(this.canvas, {
      root: document.getElementById('nameOverlay'),
      input: document.getElementById('nameInput'),
      ok: document.getElementById('nameOk')
    });
    this.deal = new Deal(this.canvas);

    this.mode = 'list';
    this.teamN = 2;
    this.eachN = 2;
    this.nameHolding = -1;
    this.nameHoldStart = 0;
    this.nameDidLong = false;
    this.titleHolding = false;
    this.lastPointer = null;
    this.dragging = false;
    this.dragStartY = 0;
    this.dragScroll = 0;
    this.savePending = false;
    this.lastTime = performance.now();
    this.msg = '';
    this.msgUntil = 0;

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
        people: this.roster.serialize()
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
    let urlNames = null;
    const namesParam = new URLSearchParams(location.search).get('names');
    if (namesParam) {
      urlNames = namesParam.split(',').map(s => s.trim()).filter(Boolean);
      if (!urlNames.length) urlNames = null;
    }
    try {
      const raw = localStorage.getItem(Config.storageKey);
      const data = raw ? JSON.parse(raw) : null;
      if (urlNames) {
        this.roster.loadPeople(urlNames.map(name => ({ name })));
      } else if (data && Array.isArray(data.people)) {
        this.roster.loadPeople(data.people);
      }
      if (data) {
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
      }
      if (urlNames) {
        this.saveState();
        this.clearNamesParam();
      }
    } catch (e) {
      if (urlNames) {
        this.roster.loadPeople(urlNames.map(name => ({ name })));
        this.saveState();
        this.clearNamesParam();
      } else {
        this.roster.clear();
      }
    }
  }

  clearNamesParam() {
    const url = new URL(location.href);
    if (!url.searchParams.has('names')) return;
    url.searchParams.delete('names');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.roster.clampScroll();
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
    this.roster.scrubLocks(this.teamN, this.eachN);
    this.saveState();
    const result = this.deal.start(
      this.roster.people,
      this.teamN,
      this.eachN,
      i => this.roster.chipRect(i)
    );
    if (!result.ok) {
      this.msg = result.msg;
      this.msgUntil = performance.now() + 1600;
      return;
    }
    this.mode = 'deal';
    this.setGoBusy();
    if (this.deal.finished) {
      this.mode = 'done';
      this.setGoDone();
    }
  }

  finishDeal() {
    this.deal.finish();
    this.mode = 'list';
    this.setGoIdle();
  }

  pointerPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const src = e.touches && e.touches[0] ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  }

  clearHolds() {
    this.nameHolding = -1;
    this.titleHolding = false;
  }

  onPointerDown(e) {
    if (this.roster.nameOverlay.classList.contains('show')) return;
    if (this.mode !== 'list' && this.mode !== 'done') return;
    e.preventDefault();
    const { x, y } = this.pointerPos(e);
    this.lastPointer = { x, y };
    this.dragging = false;
    this.dragStartY = y;
    this.dragScroll = this.roster.scroll;
    this.nameDidLong = false;
    this.clearHolds();
    if (this.mode !== 'list') return;
    const hit = this.roster.hitList(x, y);
    if (hit && hit.type === 'chip') {
      this.nameHolding = hit.i;
      this.nameHoldStart = performance.now();
    } else if (hit && hit.type === 'title') {
      this.titleHolding = true;
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
      this.roster.scroll = this.dragScroll - dy;
      this.roster.clampScroll();
    } else if (this.nameHolding >= 0 && Math.hypot(x - this.lastPointer.x, y - this.lastPointer.y) > 20) {
      this.clearHolds();
    }
  }

  onPointerUp(e) {
    if (this.roster.nameOverlay.classList.contains('show')) return;
    if (this.mode !== 'list' && this.mode !== 'done') return;
    e.preventDefault();
    if (!this.lastPointer) return;
    const { x, y } = this.lastPointer;
    this.lastPointer = null;
    const wasDrag = this.dragging;
    this.dragging = false;
    if (this.mode === 'done') {
      if (!wasDrag) {
        const tok = this.deal.hitDone(x, y);
        if (tok && this.roster.toggleSeatLock(tok)) this.saveState();
      }
      return;
    }
    if (this.nameDidLong) {
      this.nameDidLong = false;
      this.clearHolds();
      return;
    }
    this.clearHolds();
    if (wasDrag) return;
    const hit = this.roster.hitList(x, y);
    if (!hit) return;
    if (hit.type === 'add') this.roster.addPerson();
    else if (hit.type === 'chip' && this.roster.toggleActive(hit.i)) this.saveState();
  }

  onWheel(e) {
    if (this.mode !== 'list') return;
    this.roster.scroll += e.deltaY;
    this.roster.clampScroll();
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

    document.getElementById('nameOk').addEventListener('click', () => {
      if (this.roster.commitName()) this.saveState();
    });
    document.getElementById('nameCancel').addEventListener('click', () => this.roster.cancelName());
    document.getElementById('nameDel').addEventListener('click', () => {
      if (this.roster.deleteEdited()) this.saveState();
    });
    this.roster.nameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.roster.commitName()) this.saveState();
      } else if (e.key === 'Escape') {
        this.roster.cancelName();
      }
    });

    this.teamSel.addEventListener('change', () => {
      if (this.mode !== 'list') {
        this.teamSel.value = String(this.teamN);
        return;
      }
      this.teamN = Number(this.teamSel.value) | 0;
      this.roster.scrubLocks(this.teamN, this.eachN);
      this.saveState();
    });
    this.eachSel.addEventListener('change', () => {
      if (this.mode !== 'list') {
        this.eachSel.value = String(this.eachN);
        return;
      }
      this.eachN = Number(this.eachSel.value) | 0;
      this.roster.scrubLocks(this.teamN, this.eachN);
      this.saveState();
    });
    this.goBtn.addEventListener('click', () => {
      if (this.mode === 'done') this.finishDeal();
      else if (this.mode === 'list') this.startDeal();
    });
  }

  update(dt, now) {
    if (this.nameHolding >= 0 && now - this.nameHoldStart >= Config.longMs) {
      const idx = this.nameHolding;
      this.nameHolding = -1;
      this.nameDidLong = true;
      this.roster.editPerson(idx);
    } else if (this.titleHolding && now - this.nameHoldStart >= Config.longMs) {
      this.titleHolding = false;
      this.nameDidLong = true;
      this.roster.clear();
      this.saveState();
    }
    if (this.mode === 'deal') {
      this.deal.update(dt);
      if (this.deal.finished) {
        this.mode = 'done';
        this.setGoDone();
      }
    } else if (this.mode === 'done') {
      this.deal.update(dt);
    }
  }

  drawChip(x, y, w, h, fill, name, active, lockMark) {
    const ctx = this.ctx;
    const r = Math.min(h * 0.45, Config.ballR);
    ctx.fillStyle = active ? fill : '#6a6a64';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, r);
    ctx.fill();
    if (!name) {
      ctx.beginPath();
      ctx.arc(x - r * 0.12, y - r * 0.14, r * 0.52, -Math.PI * 0.9, -Math.PI * 0.4);
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = Math.max(2, r * 0.26);
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.fillStyle = active ? 'rgba(255, 255, 255, 0.82)' : 'rgba(0, 0, 0, 0.7)';
    const label = lockMark ? String(lockMark) : '';
    const fs = Math.min(18, Math.max(11, w / Math.max(name.length * 0.62, 4)));
    ctx.font = `500 ${fs}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, x, y + 0.5);
    if (label) {
      const s = Math.min(11, h * 0.28);
      const left = x - w / 2 + 8;
      const showSeat = label !== 'lock';
      let lx = left + s * 0.42;
      if (showSeat) {
        ctx.font = `600 ${Math.max(9, Math.min(11, h * 0.28))}px system-ui, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, left, y + 0.5);
        lx = left + ctx.measureText(label).width + s * 0.55;
      }
      const ly = y - 3;
      ctx.strokeStyle = active ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.7)';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(lx, ly, s * 0.38, Math.PI, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(lx - s * 0.42, ly + 1, s * 0.84, s * 0.72, 1.5);
      ctx.fill();
    }
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
      ctx.roundRect(w - 98, 8, 88, 32, 6);
      ctx.fill();
      ctx.fillStyle = '#a8d0b0';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(' + Name', w - 54, Config.toolbarH / 2 + 1);
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
    if (!this.deal.holeOpen) {
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
    if (this.deal.holeOpen) {
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
    const roster = this.roster;
    const top = roster.listTop();
    const bot = roster.listBottom();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top - 2, this.canvas.width, bot - top + 4);
    ctx.clip();

    if (!roster.people.length) {
      ctx.fillStyle = '#4a6a50';
      ctx.font = '18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Tap + to add names', this.canvas.width / 2, (top + bot) / 2);
    } else {
      for (let i = 0; i < roster.people.length; i++) {
        const r = roster.chipRect(i);
        if (r.y + r.h < top || r.y > bot) continue;
        const p = roster.people[i];
        const lockMark = p.locked ? `${p.lockTeam + 1}:${p.lockSlot + 1}  ` : '';
        this.drawChip(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, p.color, p.name, p.active || p.locked, lockMark);
      }
    }
    ctx.restore();

    if (roster.maxScroll() > 0) {
      const trackH = bot - top;
      const view = trackH;
      const full = roster.contentH();
      const thumbH = Math.max(18, trackH * (view / full));
      const thumbY = top + (trackH - thumbH) * (roster.scroll / roster.maxScroll());
      ctx.fillStyle = 'rgba(168,208,176,0.35)';
      ctx.beginPath();
      ctx.roundRect(this.canvas.width - 6, thumbY, 3, thumbH, 2);
      ctx.fill();
    }
  }

  drawTokens() {
    for (const tok of this.deal.tokens) {
      if (tok.seated && !this.deal.showFunnel) continue;
      const name = tok.morph > 0.55 ? tok.person.name : '';
      const lockMark = tok.person.locked && tok.seated ? 'lock' : '';
      this.drawChip(tok.x, tok.y, tok.w, tok.h, tok.person.color, name, true, lockMark);
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
      if (this.deal.showFunnel) this.drawFunnel(this.deal.geom());
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

new Whosit();
