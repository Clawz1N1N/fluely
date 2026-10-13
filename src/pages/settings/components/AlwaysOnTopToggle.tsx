import { t, useI18n } from "@/lib/i18n";
import { Switch, Label, Header } from "@/components";
import { useApp } from "@/contexts";

interface AlwaysOnTopToggleProps {
  className?: string;
}

export const AlwaysOnTopToggle = ({ className }: AlwaysOnTopToggleProps) => {
  useI18n();
  const { customizable, toggleAlwaysOnTop } = useApp();

  const handleSwitchChange = async (checked: boolean) => {
    await toggleAlwaysOnTop(checked);
  };

  return (
    <div id="always-on-top" className={`space-y-2 ${className}`}>
      <Header
        title={t("Always On Top Mode")}
        description={t("Control whether the window stays above all other applications")}
        isMainTitle
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div>
            <Label className="text-sm font-medium">
              {customizable.alwaysOnTop.isEnabled
                ? t("Disable Always On Top")
                : t("Enable Always On Top")}
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              {customizable.alwaysOnTop.isEnabled
                ? t("Window stays above all other applications (default)")
                : t("Window behaves like normal applications")}
            </p>
          </div>
        </div>
        <Switch
          checked={customizable.alwaysOnTop.isEnabled}
          onCheckedChange={handleSwitchChange}
          title={t(customizable.alwaysOnTop.isEnabled ? 'Disable always on top' : 'Enable always on top')}
          aria-label={t(customizable.alwaysOnTop.isEnabled ? 'Disable always on top' : 'Enable always on top')}
        />
      </div>
    </div>
  );
};
