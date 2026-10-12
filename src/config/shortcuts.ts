import { ShortcutAction } from "@/types";

export const DEFAULT_SHORTCUT_ACTIONS: ShortcutAction[] = [
  {
    id: 'find_buttons', name: 'Знайти кнопки / скинути розташування',
    description: 'Повернути панелі й кнопки на екран',
    defaultKey: { macos: 'cmd+shift+r', windows: 'ctrl+shift+r', linux: 'ctrl+shift+r' },
  },
  {
    id: 'ui_mode', name: 'Перемкнути вигляд панелей',
    description: 'Бічні смуги → верхня/нижня → кнопки',
    defaultKey: { macos: 'cmd+shift+u', windows: 'ctrl+shift+u', linux: 'ctrl+shift+u' },
  },
  {
    id: "toggle_dashboard",
    name: "Toggle Dashboard",
    description: "Open/Close the dashboard window",
    defaultKey: {
      macos: "cmd+shift+d",
      windows: "ctrl+shift+d",
      linux: "ctrl+shift+d",
    },
  },
  {
    id: "toggle_window",
    name: "Toggle Window",
    description: "Show/Hide all overlay windows",
    defaultKey: {
      macos: "cmd+backslash",
      windows: "ctrl+backslash",
      linux: "ctrl+backslash",
    },
  },
  {
    id: "focus_input",
    name: "Refocus Input Box",
    description: "Bring Pluely forward and place the cursor in the input area",
    defaultKey: {
      macos: "cmd+shift+i",
      windows: "ctrl+shift+i",
      linux: "ctrl+shift+i",
    },
  },
  {
    id: "move_window",
    name: "Move Window",
    description: "Move overlay with arrow keys (hold to move continuously)",
    defaultKey: {
      macos: "cmd",
      windows: "ctrl",
      linux: "ctrl",
    },
  },
  {
    id: "system_audio",
    name: "System Audio",
    description: "Toggle system audio capture",
    defaultKey: {
      macos: "cmd+shift+m",
      windows: "ctrl+shift+m",
      linux: "ctrl+shift+m",
    },
  },
  {
    id: "audio_recording",
    name: "Voice Input",
    description: "Start voice recording",
    defaultKey: {
      macos: "cmd+shift+a",
      windows: "ctrl+shift+a",
      linux: "ctrl+shift+a",
    },
  },
  {
    id: "screenshot",
    name: "Screenshot",
    description: "Capture screenshot",
    defaultKey: {
      macos: "cmd+shift+s",
      windows: "ctrl+shift+s",
      linux: "ctrl+shift+s",
    },
  },
  {
    id: "tts_toggle",
    name: "TTS Toggle",
    description: "Enable/disable text-to-speech entirely",
    defaultKey: {
      macos: "cmd+shift+t",
      windows: "ctrl+shift+t",
      linux: "ctrl+shift+t",
    },
  },
  {
    id: "tts_stop",
    name: "TTS Stop",
    description: "Stop TTS playback",
    defaultKey: {
      macos: "cmd+shift+o",
      windows: "ctrl+shift+o",
      linux: "ctrl+shift+o",
    },
  },
  {
    id: "tts_pause",
    name: "TTS Pause",
    description: "Pause/resume TTS playback",
    defaultKey: {
      macos: "cmd+shift+p",
      windows: "ctrl+shift+p",
      linux: "ctrl+shift+p",
    },
  },
  {
    id: "tts_seek_back",
    name: "TTS Seek Back",
    description: "Play the previous sentence",
    defaultKey: {
      macos: "cmd+shift+left",
      windows: "ctrl+shift+left",
      linux: "ctrl+shift+left",
    },
  },
  {
    id: "tts_seek_forward",
    name: "TTS Seek Forward",
    description: "Play the next sentence",
    defaultKey: {
      macos: "cmd+shift+right",
      windows: "ctrl+shift+right",
      linux: "ctrl+shift+right",
    },
  },
];
