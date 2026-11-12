export const colors = {
  bg: '#0A0C12',
  bgElevated: '#121621',
  card: '#181D2A',
  cardHigh: '#222839B0',
  border: '#272E40',
  text: '#F4F6FB',
  textDim: '#B0B8CC',
  textMuted: '#768099',
  accent: '#3D8BFF',
  accent2: '#25D0C0',
  like: '#2EE59D',
  nope: '#FF4D67',
  cooked: '#A07CFF',
  gold: '#FFC94D',
  tg: '#2AABEE',
  reddit: '#FF5700',
  overlay: 'rgba(10,12,18,0.72)',
};

export const gradients = {
  brand: ['#3D8BFF', '#25C6D0'] as const,
  like: ['#21D4A0', '#2EE59D'] as const,
  nope: ['#FF4D67', '#FF7A59'] as const,
  cooked: ['#7C5CFF', '#A07CFF'] as const,
  cardFade: ['transparent', 'rgba(10,12,18,0.6)', 'rgba(10,12,18,0.98)'] as const,
};

export const radius = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 };

export const space = (n: number) => n * 4;

export const TAB_BAR_HEIGHT = 64;
