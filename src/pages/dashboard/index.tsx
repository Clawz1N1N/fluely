import { t, useI18n } from "@/lib/i18n";
import { PageLayout } from "@/layouts";

const Dashboard = () => {
  useI18n();
  return (
    <PageLayout
      title={t("Dashboard")}
      description={t("Fluely local AI assistant.")}
    >
      <div className="text-sm text-muted-foreground">
        {t("Use the Dev Space to configure your own AI and STT providers.")}</div>
    </PageLayout>
  );
};

export default Dashboard;
