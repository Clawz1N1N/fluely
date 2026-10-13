import { t, useI18n } from "@/lib/i18n";
import { ScreenshotConfigs } from "./components";
import { useSettings } from "@/hooks";
import { PageLayout } from "@/layouts";

const Settings = () => {
  useI18n();
  const settings = useSettings();
  return (
    <PageLayout
      title={t("Screenshot")}
      description={t("Manage your screenshot settings")}
    >
      {/* Screenshot Configs */}
      <ScreenshotConfigs {...settings} />
    </PageLayout>
  );
};

export default Settings;
