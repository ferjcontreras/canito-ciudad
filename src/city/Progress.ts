// Estado persistente del jugador (Fase 1 del sandbox): la moneda (huesos) y la
// reputación con los vecinos. Se guarda solo en localStorage, así la progresión
// sobrevive entre sesiones (clave del engagement).

const KEY = 'canito-progress-v1';

export class Progress {
  huesos = 0;          // moneda
  repVecinos = 0;      // -100..100

  load(): void {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || '{}');
      this.huesos = Math.max(0, s.huesos | 0);
      this.repVecinos = Math.max(-100, Math.min(100, s.repVecinos | 0));
    } catch { /* primera vez / storage bloqueado */ }
  }

  save(): void {
    try { localStorage.setItem(KEY, JSON.stringify({ huesos: this.huesos, repVecinos: this.repVecinos })); }
    catch { /* ignorar */ }
  }

  addHuesos(n: number): void { this.huesos = Math.max(0, this.huesos + n); this.save(); }
  addRep(n: number): void { this.repVecinos = Math.max(-100, Math.min(100, this.repVecinos + n)); this.save(); }

  /** Intenta gastar; devuelve true si alcanzaba. */
  spend(n: number): boolean {
    if (this.huesos < n) return false;
    this.huesos -= n; this.save();
    return true;
  }

  /** Etiqueta de reputación para el HUD. */
  repLabel(): string {
    const r = this.repVecinos;
    if (r >= 60) return 'Héroe del barrio';
    if (r >= 25) return 'Querido';
    if (r >= 0)  return 'Conocido';
    if (r >= -25) return 'Molesto';
    return 'Indeseable';
  }
}
