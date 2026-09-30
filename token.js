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
