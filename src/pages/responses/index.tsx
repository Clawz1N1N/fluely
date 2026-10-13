import { t, useI18n } from "@/lib/i18n";
import {
  ResponseLength,
  LanguageSelector,
  AutoScrollToggle,
} from "./components";
import { PageLayout } from "@/layouts";

const Responses = () => {
  useI18n();
  return (
    <PageLayout
      title={t("Response Settings")}
      description={t("Customize how AI generates and displays responses")}
    >
      {/* Response Length */}
      <ResponseLength />

      {/* Language Selector */}
      <LanguageSelector />

      {/* Auto-Scroll Toggle */}
      <AutoScrollToggle />
    </PageLayout>
  );
};

export default Responses;
