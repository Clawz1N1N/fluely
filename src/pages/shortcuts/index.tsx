import { t, useI18n } from "@/lib/i18n";
import { CursorSelection, ShortcutManager } from "./components";
import { PageLayout } from "@/layouts";

const Shortcuts = () => {
  useI18n();
  return (
    <PageLayout
      title={t("Cursor & Keyboard Shortcuts")}
      description={t("Manage your cursor and keyboard shortcuts")}
    >
      <div className="flex flex-col gap-6 pb-8">
        {/* Cursor Selection */}
        <CursorSelection />

        {/* Keyboard Shortcuts */}
        <ShortcutManager />
      </div>
    </PageLayout>
  );
};

export default Shortcuts;
