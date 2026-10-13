import { t, useI18n } from "@/lib/i18n";
import { Switch, Label, Header } from "@/components";
import { useState, useEffect } from "react";
import { getResponseSettings, updateAutoScroll } from "@/lib";

export const AutoScrollToggle = () => {
  useI18n();
 const [autoScroll, setAutoScroll] = useState<boolean>(true);

  useEffect(() => {
    const settings = getResponseSettings();
    setAutoScroll(settings.autoScroll);
  }, []);

  const handleSwitchChange = (checked: boolean) => {
    setAutoScroll(checked);
    updateAutoScroll(checked);
  };

  return (
    <div className="space-y-4">
      <Header
        title={t("Auto-Scroll Behavior")}
        description={t("Control whether responses automatically scroll to the bottom. This setting applies immediately and controls whether responses automatically scroll to the latest content as it streams")}
        isMainTitle
      />

      <div className="flex items-center justify-between p-4 border rounded-xl">
        <div className="flex items-center space-x-3">
          <div>
            <Label className="text-sm font-medium">
              {autoScroll ? t("Auto-Scroll Enabled") : t("Auto-Scroll Disabled")}
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              {autoScroll
                ? t("Responses will automatically scroll to the bottom as they arrive")
                : t("Responses will stay at your current scroll position")}
            </p>
          </div>
        </div>
        <Switch
          checked={autoScroll}
          onCheckedChange={handleSwitchChange}
          disabled={false}
          title={t(autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll')}
          aria-label={t(autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll')}
        />
      </div>
    </div>
  );
};
