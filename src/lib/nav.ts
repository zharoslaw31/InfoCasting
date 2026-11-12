import { router } from 'expo-router';

/**
 * «Назад», який працює завжди: якщо сторінку відкрили напряму (за посиланням
 * чи після автооновлення сайту), історії немає — тоді повертаємось на головну.
 */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export function openArticle(id: string) {
  router.push(`/article/${id}` as never);
}
