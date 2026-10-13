import { t, useI18n } from "@/lib/i18n";
import { Header } from "@/components";
import { UseSettingsReturn } from "@/types";
import { Providers } from "./Providers";
import { CustomProviders } from "./CustomProvider";

export const STTProviders = (settings: UseSettingsReturn) => {
  useI18n();
  return (
    <div id="stt-providers" className="space-y-3">
      <Header
        title={t("STT Providers")}
        description={t("Select your preferred STT service provider to get started.")}
        isMainTitle
      />

      {/* Custom Provider */}
      <CustomProviders {...settings} />
      {/* Providers Selection */}
      <Providers {...settings} />
    </div>
  );
};
