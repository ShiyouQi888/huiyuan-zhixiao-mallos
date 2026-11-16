export type ToastTone = 'default' | 'success' | 'danger' | 'warning';

const ICONS: Record<ToastTone, string> = {
  default:
    '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v4.5M12 16h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  success:
    '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m8.2 12.2 2.6 2.6 5-5.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  danger:
    '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.8v5M12 16.2h.01" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
  warning:
    '<path d="M12 3.8 21 19.5H3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 9.6v4M12 16.4h.01" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
};

let host: HTMLDivElement | null = null;
let timer: number | undefined;

function ensureHost(): HTMLDivElement {
  if (host?.isConnected) return host;
  host = document.createElement('div');
  host.className = 'app-toast-host';
  document.body.appendChild(host);
  return host;
}

export const Toast = (message: string, tone: ToastTone = 'default'): void => {
  if (!message) return;
  const container = ensureHost();
  container.replaceChildren();

  const card = document.createElement('div');
  card.className = `app-toast${tone === 'default' ? '' : ` app-toast--${tone}`}`;
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', 'polite');
  card.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">${ICONS[tone]}</svg><span></span>`;
  const label = card.querySelector('span');
  if (label) label.textContent = message;
  container.appendChild(card);

  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    card.classList.add('app-toast--leaving');
    window.setTimeout(() => {
      if (card.isConnected) card.remove();
    }, 190);
  }, 2400);
};
