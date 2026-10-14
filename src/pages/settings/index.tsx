import {Theme} from "./components";
import {InterfaceLanguage} from './components/InterfaceLanguage';
import {IdentitySettings} from './components/IdentitySettings';
import {LayoutEditor} from './components/LayoutEditor';
import {OverlayHotkeys} from './components/OverlayHotkeys';
import {t,useI18n} from '@/lib/i18n';
import { PageLayout } from "@/layouts";
import { OverlaySettings } from './components/OverlaySettings';

const Settings = () => {
  useI18n();
  return (
    <PageLayout title={t('Settings')} description={t('Manage your settings')}>
      <InterfaceLanguage />
      {/* Theme */}
      <Theme />
      <OverlayHotkeys />
      <OverlaySettings />
      <LayoutEditor />

      {/* Autostart Toggle */}
      <IdentitySettings />

    </PageLayout>
  );
};

export default Settings;
