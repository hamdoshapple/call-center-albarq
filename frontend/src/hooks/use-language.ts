import { useTranslation } from 'react-i18next';

export function useLanguage() {
  const { i18n } = useTranslation();
  const lang = i18n.language === 'en' ? 'en' : 'ar';
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  const setLanguage = (lng: 'ar' | 'en') => i18n.changeLanguage(lng);
  const toggleLanguage = () => i18n.changeLanguage(lang === 'ar' ? 'en' : 'ar');

  return { lang, dir, setLanguage, toggleLanguage };
}
