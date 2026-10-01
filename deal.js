class Deal {
  constructor(canvas) {
    this.canvas = canvas;
    this.tokens = [];
    this.teamN = 2;
    this.eachN = 2;
    this.phaseT = 0;
    this.fillCount = 0;
    this.holeOpen = true;
    this.showFunnel = false;
    this.finished = false;
  }

  needed() {
    return this.teamN * this.eachN;
  }

  geom() {
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

  start(people, teamN, eachN, chipAt) {
    this.teamN = teamN;
    this.eachN = eachN;
    this.finished = false;
    const need = this.needed();
    const locked = [];
    const movers = [];
    for (let i = 0; i < people.length; i++) {
      const p = people[i];
      if (p.locked) locked.push({ person: p, i });
      else if (p.active) movers.push({ person: p, i });
    }
    const empty = need - locked.length;
    if (movers.length < empty) {
      return { ok: false, msg: `Need ${empty} active names` };
    }

    const G = this.geom();
    this.tokens = [];
    for (const item of locked) {
      const dest = this.slotPos(item.person.lockTeam, item.person.lockSlot, G);
      const tok = new Token(item.person, dest.x, dest.y, dest.w, dest.h);
      tok.r = Config.ballR;
      tok.team = item.person.lockTeam;
      tok.slot = item.person.lockSlot;
      tok.tx = dest.x;
      tok.ty = dest.y;
      tok.startW = dest.w;
      tok.startH = dest.h;
      tok.w = dest.w;
      tok.h = dest.h;
      tok.morph = 1;
      tok.seated = true;
      tok.phase = 'seated';
      this.tokens.push(tok);
    }
    for (const item of movers) {
      const r = chipAt(item.i);
      this.tokens.push(new Token(item.person, r.x + r.w / 2, r.y + r.h / 2, r.w, r.h));
    }

    this.fillCount = locked.length;
    this.holeOpen = this.fillCount < need;
    this.showFunnel = true;
    this.phaseT = 0;
    if (!movers.length) this.finished = this.fillCount >= need;
    return { ok: true };
  }

  finish() {
    this.tokens = [];
    this.fillCount = 0;
    this.holeOpen = true;
    this.showFunnel = false;
    this.finished = false;
    this.phaseT = 0;
  }

  xDropPos(span, hole, p = 1.5) {
    const side = (span - hole) * 0.5;
    if (side <= 0) return span * 0.5;
    const u = Math.random();
    return u < 0.5
      ? side * (2 * u) ** p
      : span - side * (2 * (1 - u)) ** p;
  }

  releaseFromTop() {
    const movers = [];
    for (const tok of this.tokens) {
      if (tok.seated || tok.phase === 'seated') continue;
      movers.push(tok);
    }
    const w = this.canvas.width;
    const r = Config.ballR;
    const margin = r + 8;
    const span = Math.max(8, w - margin * 2);
    const order = movers.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const tmp = order[i];
      order[i] = order[j];
      order[j] = tmp;
    }
    for (let k = 0; k < order.length; k++) {
      const tok = movers[order[k]];
      tok.r = r;
      tok.w = r * 2;
      tok.h = r * 2;
      tok.morph = 0;
      tok.team = -1;
      tok.slot = -1;
      tok.seated = false;
      tok.frozen = false;
      tok.grounded = false;
      tok.x = margin + this.xDropPos(span, Config.gapW * 3);
      tok.y = -r - 16 - k * (r * 2 + 6) - Math.random() * 18;
      tok.vx = (Math.random() - 0.5) * 140;
      tok.vy = 20 + Math.random() * 50;
      tok.phase = 'play';
    }
    this.holeOpen = this.fillCount < this.needed();
    this.showFunnel = true;
    this.phaseT = 0;
  }

  claimSlot(tok) {
    const need = this.needed();
    if (this.fillCount >= need) return false;
    const G = this.geom();
    let place = null;
    for (let fillIndex = 0; fillIndex < need; fillIndex++) {
      const cand = this.slotFromFill(fillIndex);
      let used = false;
      for (const other of this.tokens) {
        if (other === tok) continue;
        if (other.team === cand.team && other.slot === cand.slot) {
          used = true;
          break;
        }
      }
      if (!used) {
        place = cand;
        break;
      }
    }
    if (!place) return false;
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

  hitDone(x, y) {
    for (let i = this.tokens.length - 1; i >= 0; i--) {
      const tok = this.tokens[i];
      if (!tok.seated) continue;
      const hw = tok.w / 2;
      const hh = tok.h / 2;
      if (x >= tok.x - hw && x <= tok.x + hw && y >= tok.y - hh && y <= tok.y + hh) {
        return tok;
      }
    }
    return null;
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

  update(dt) {
    this.phaseT += dt;
    const n = this.tokens.length;
    if (!n) return;
    const need = this.needed();

    const movers = [];
    for (const tok of this.tokens) {
      if (!tok.seated && tok.phase !== 'seated') movers.push(tok);
    }

    if (movers.length && movers[0].phase === 'shrink') {
      const u = Math.min(1, this.phaseT / (Config.shrinkMs / 1000));
      const e = 1 - Math.pow(1 - u, 3);
      for (const tok of movers) {
        const tw = tok.r * 2;
        const th = tok.r * 2;
        tok.w = tok.startW + (tw - tok.startW) * e;
        tok.h = tok.startH + (th - tok.startH) * e;
        tok.morph = 1 - e;
      }
      if (u >= 1) {
        this.phaseT = 0;
        for (const tok of movers) {
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

    if (movers.length && movers[0].phase === 'drop') {
      let gone = 0;
      for (const tok of movers) {
        tok.vy += Config.gravity * dt;
        tok.x += tok.vx * dt;
        tok.y += tok.vy * dt;
        if (tok.y - tok.r > this.canvas.height + Config.dropOffPad) gone++;
      }
      if (gone === movers.length) this.releaseFromTop();
      return;
    }

    const G = this.geom();
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

    const seatedN = this.tokens.filter(t => t.seated).length;
    if (seatedN >= need) {
      let popped = 0;
      for (const tok of this.tokens) {
        if (!tok.seated) continue;
        tok.morph = Math.min(1, tok.morph + dt * 2.6);
        tok.w = tok.r * 2 + (tok.startW - tok.r * 2) * tok.morph;
        tok.h = tok.r * 2 + (tok.startH - tok.r * 2) * tok.morph;
        if (tok.morph >= 1) popped++;
      }
      if (popped >= need) this.finished = true;
    }
  }
}
