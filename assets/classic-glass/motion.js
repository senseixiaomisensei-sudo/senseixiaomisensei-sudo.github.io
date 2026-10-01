// Analytical spring adapted from the user-provided QQ page (k=510, c=43).
// It settles exactly and runs only while a value changes.
export class Spring {
  constructor(value) { this.value = this.target = value; this.velocity = 0; }
  step(dt, reduced = false) {
    if (reduced) { this.value = this.target; this.velocity = 0; return false; }
    dt = Math.min(.04, Math.max(0, dt));
    const x = this.value - this.target, g = 21.5, k = 510;
    const w = Math.sqrt(k - g * g), e = Math.exp(-g * dt);
    const co = Math.cos(w * dt), si = Math.sin(w * dt), v = this.velocity;
    this.value = this.target + e * (x * co + (v + g * x) / w * si);
    this.velocity = e * (v * co - (g * v + k * x) / w * si);
    if (Math.abs(this.value - this.target) < .0007 && Math.abs(this.velocity) < .008) {
      this.value = this.target; this.velocity = 0; return false;
    }
    return true;
  }
}
export function rangeFraction(input) {
  const min = Number(input.min || 0), max = Number(input.max || 100), value = Number(input.value);
  return Number.isFinite(value) && max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
}
