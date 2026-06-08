export class LoadingOverlay {
    el;
    msgEl;
    errEl;
    constructor() {
        this.el = document.getElementById('loading-overlay');
        this.msgEl = document.getElementById('loading-msg');
        this.errEl = document.getElementById('loading-error');
    }
    setMessage(msg) {
        this.msgEl.textContent = msg;
    }
    showError(err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.errEl.style.display = 'block';
        this.errEl.textContent = `Error: ${msg}`;
        this.msgEl.textContent = 'No se pudo cargar la ciudad.';
        const spinner = this.el.querySelector('.spinner');
        if (spinner)
            spinner.style.display = 'none';
    }
    hide() {
        this.el.style.opacity = '0';
        this.el.addEventListener('transitionend', () => this.el.remove(), { once: true });
    }
}
