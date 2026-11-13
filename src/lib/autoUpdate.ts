import { Platform } from 'react-native';

/**
 * Веб-версія: перевіряє, чи на сайті вийшла нова збірка, і перезавантажує сторінку.
 * GitHub Pages і телефони кешують сайт до ~10 хвилин, тож без цього оновлення
 * з'являлись би із затримкою.
 */
/** Підпис збірки: усі скрипти сторінки (entry часто не змінюється, а код лежить у __common-…). */
const SCRIPT_RE = /(?:__common|entry)-[a-f0-9]+\.js/g;
const currentBuild = () =>
  Array.from(document.scripts)
    .map((s) => s.src.match(/(?:__common|entry)-[a-f0-9]+\.js/)?.[0])
    .filter(Boolean)
    .sort()
    .join('|');

async function check() {
  try {
    const mine = currentBuild();
    if (!mine) return;
    const res = await fetch(`${location.pathname.split('/').slice(0, 2).join('/')}/?v=${Date.now()}`, { cache: 'no-store' });
    const html = await res.text();
    const latest = [...new Set(html.match(SCRIPT_RE) ?? [])].sort().join('|');
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
