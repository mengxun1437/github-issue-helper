export const LANGUAGES = [
  {
    label: '简体中文',
    value: 'zh-CN'
  },
  {
    label: '繁體中文',
    value: 'zh-TW'
  },
  {
    label: 'English',
    value: 'en'
  },
  {
    label: '日本語',
    value: 'ja'
  },
  {
    label: '한국어',
    value: 'ko'
  },
  {
    label: 'Français',
    value: 'fr'
  },
  {
    label: 'Deutsch',
    value: 'de'
  },
  {
    label: 'Español',
    value: 'es'
  },
  {
    label: 'Русский',
    value: 'ru'
  },
  {
    label: 'Português',
    value: 'pt'
  },
  {
    label: 'Italiano',
    value: 'it'
  }
] as const;

export type Language = (typeof LANGUAGES)[number]['value'];
