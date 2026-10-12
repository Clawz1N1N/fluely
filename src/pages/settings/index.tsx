import {
  Theme,
  AutostartToggle,
} from "./components";
import { PageLayout } from "@/layouts";
import { OverlaySettings } from './components/OverlaySettings';

const Settings = () => {
  return (
    <PageLayout title="Settings" description="Manage your settings">
      {/* Theme */}
      <Theme />
      <OverlaySettings />

      {/* Autostart Toggle */}
      <AutostartToggle />

    </PageLayout>
  );
};

export default Settings;
