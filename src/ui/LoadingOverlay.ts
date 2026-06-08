export class LoadingOverlay {
  private readonly el: HTMLElement;
  private readonly msgEl: HTMLElement;
  private readonly errEl: HTMLElement;

  constructor() {
    this.el    = document.getElementById('loading-overlay')!;
    this.msgEl = document.getElementById('loading-msg')!;
    this.errEl = document.getElementById('loading-error')!;
  }

  setMessage(msg: string): void {
    this.msgEl.textContent = msg;
  }

  showError(err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    this.errEl.style.display = 'block';
    this.errEl.textContent = `Error: ${msg}`;
    this.msgEl.textContent = 'No se pudo cargar la ciudad.';

    const spinner = this.el.querySelector<HTMLElement>('.spinner');
    if (spinner) spinner.style.display = 'none';
  }

  hide(): void {
    this.el.style.opacity = '0';
    this.el.addEventListener('transitionend', () => this.el.remove(), { once: true });
  }
}
