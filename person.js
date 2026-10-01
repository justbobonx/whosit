class Person {
  constructor(name, color, active = true, lockTeam = -1, lockSlot = -1) {
    this.name = String(name).slice(0, 12);
    this.color = color || Palette[0];
    this.active = active !== false;
    const team = Number(lockTeam);
    const slot = Number(lockSlot);
    this.lockTeam = Number.isFinite(team) && team >= 0 ? team | 0 : -1;
    this.lockSlot = Number.isFinite(slot) && slot >= 0 ? slot | 0 : -1;
    if (this.lockTeam < 0 || this.lockSlot < 0) {
      this.lockTeam = -1;
      this.lockSlot = -1;
    }
  }

  get locked() {
    return this.lockTeam >= 0 && this.lockSlot >= 0;
  }
}
