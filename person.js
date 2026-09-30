class Person {
  constructor(name, color, active = true) {
    this.name = String(name).slice(0, 12);
    this.color = color || Palette[0];
    this.active = active !== false;
  }
}
