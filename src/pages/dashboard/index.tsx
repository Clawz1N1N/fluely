import { PageLayout } from "@/layouts";

const Dashboard = () => {
  return (
    <PageLayout
      title="Dashboard"
      description="Pluely local AI assistant."
    >
      <div className="text-sm text-muted-foreground">
        Use the Dev Space to configure your own AI and STT providers.
      </div>
    </PageLayout>
  );
};

export default Dashboard;
