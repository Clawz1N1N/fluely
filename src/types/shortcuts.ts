export interface ShortcutAction {
  id: string;
  name: string;
  description: string;
  defaultKey: {
    macos: string;
    windows: string;
    linux: string;
  };
}

export interface ShortcutBinding {
  action: string;
  key: string;
  enabled: boolean;
}

export interface ShortcutsConfig {
  defaultsVersion?: number;
  bindings: Record<string, ShortcutBinding>;
  customActions?: ShortcutAction[];
}

export interface ShortcutConflict {
  key: string;
  actions: string[];
}
