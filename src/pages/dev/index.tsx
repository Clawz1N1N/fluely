import { t, useI18n } from "@/lib/i18n";
import { AIProviders, STTProviders } from "./components";
import { useSettings } from "@/hooks";
import { PageLayout } from "@/layouts";

const DevSpace = () => {
  useI18n();
  const settings = useSettings();

  return (
    <PageLayout title={t("Dev Space")} description={t("Manage your providers")}>
      {/* Provider Selection */}
      <AIProviders {...settings} />

      {/* STT Providers */}
      <STTProviders {...settings} />
    </PageLayout>
  );
};

export default DevSpace;
