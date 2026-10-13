import { Header, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components';
import { useI18n, type InterfaceLanguage } from '@/lib/i18n';

export function InterfaceLanguage() {
  const { language, setLanguage, t } = useI18n();
  return <section className="space-y-3" id="interface-language">
    <Header title={t('Interface Language')} description={t('Choose the language for menus and settings. The system language is used on first launch.')} isMainTitle />
    <Label htmlFor="interface-language-select">{t('Interface Language')}</Label>
    <Select value={language} onValueChange={value => setLanguage(value as InterfaceLanguage)}>
      <SelectTrigger id="interface-language-select" aria-label={t('Interface Language')}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="uk">Українська</SelectItem>
        <SelectItem value="ru">Русский</SelectItem>
        <SelectItem value="en">English</SelectItem>
      </SelectContent>
    </Select>
  </section>;
}
