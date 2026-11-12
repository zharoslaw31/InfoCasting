import { Platform } from 'react-native';

/**
 * Веб-версія: перевіряє, чи на сайті вийшла нова збірка, і перезавантажує сторінку.
 * GitHub Pages і телефони кешують сайт до ~10 хвилин, тож без цього оновлення
 * з'являлись би із затримкою.
 */
const currentEntry = () =>
  Array.from(document.scripts)
    .map((s) => s.src.match(/entry-[a-f0-9]+\.js/)?.[0])
    .find(Boolean);

async function check() {
  try {
    const mine = currentEntry();
    if (!mine) return;
    const res = await fetch(`${location.pathname.split('/').slice(0, 2).join('/')}/?v=${Date.now()}`, { cache: 'no-store' });
    const html = await res.text();
    const latest = html.match(/entry-[a-f0-9]+\.js/)?.[0];
    if (latest && latest !== mine) {
      // оновлюємо кеш самої сторінки, інакше телефон може перезавантажити стару копію
      await Promise.all([location.href, `${location.pathname.split('/').slice(0, 2).join('/')}/`].map((u) => fetch(u, { cache: 'reload' }).catch(() => null)));
      location.reload();
    }
  } catch {}
}

export function startAutoUpdate() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  check();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  setInterval(check, 5 * 60 * 1000);
}
