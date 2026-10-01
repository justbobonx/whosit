class Roster {
  constructor(canvas, overlay) {
    this.canvas = canvas;
    this.nameOverlay = overlay.root;
    this.nameInput = overlay.input;
    this.nameOkBtn = overlay.ok;
    this.people = [];
    this.scroll = 0;
    this.editIndex = -1;
  }

  serialize() {
    return this.people.map(p => ({
      name: p.name,
      color: p.color,
      active: p.active,
      lockTeam: p.lockTeam,
      lockSlot: p.lockSlot
    }));
  }

  loadPeople(raw) {
    if (!Array.isArray(raw)) {
      this.people = [];
      return;
    }
    this.people = raw
      .filter(p => p && typeof p.name === 'string')
      .map((p, i) => new Person(
        p.name,
        Palette[i % Palette.length],
        p.active !== false,
        p.lockTeam,
        p.lockSlot
      ));
    this.clampScroll();
  }

  clear() {
    this.people = [];
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

  closeOverlay() {
    this.nameOverlay.classList.remove('show', 'editing');
    this.nameInput.blur();
    this.editIndex = -1;
  }

  cancelName() {
    this.closeOverlay();
  }

  commitName() {
    const name = this.nameInput.value.trim();
    const i = this.editIndex;
    this.closeOverlay();
    if (!name) return false;
    if (i >= 0 && i < this.people.length) {
      this.people[i].name = name.slice(0, 12);
    } else {
      this.people.push(new Person(name, this.nextColor(), true));
    }
    this.clampScroll();
    return true;
  }

  deleteEdited() {
    const i = this.editIndex;
    this.closeOverlay();
    if (i < 0 || i >= this.people.length) return false;
    this.people.splice(i, 1);
    this.clampScroll();
    return true;
  }

  toggleActive(i) {
    if (i < 0 || i >= this.people.length) return false;
    if (this.people[i].locked) return false;
    this.people[i].active = !this.people[i].active;
    return true;
  }

  dropLock(p) {
    p.lockTeam = -1;
    p.lockSlot = -1;
  }

  scrubLocks(teamN, eachN) {
    const seen = {};
    for (const p of this.people) {
      if (!p.locked) continue;
      if (p.lockTeam >= teamN || p.lockSlot >= eachN) {
        this.dropLock(p);
        continue;
      }
      const key = p.lockTeam + ':' + p.lockSlot;
      if (seen[key]) this.dropLock(p);
      else seen[key] = true;
    }
  }

  toggleSeatLock(tok) {
    if (!tok || !tok.person || tok.team < 0 || tok.slot < 0) return false;
    const p = tok.person;
    if (p.lockTeam === tok.team && p.lockSlot === tok.slot) this.dropLock(p);
    else {
      p.lockTeam = tok.team;
      p.lockSlot = tok.slot;
      p.active = true;
    }
    return true;
  }

  hitList(x, y) {
    if (y < Config.toolbarH) {
      if (x > this.canvas.width - 108) return { type: 'add' };
      if (x < 110) return { type: 'title' };
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
}
