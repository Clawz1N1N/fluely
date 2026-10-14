import { t, useI18n } from "@/lib/i18n";
import {
  Settings,
  Code,
  MessagesSquare,
  WandSparkles,
  AudioLinesIcon,
  SquareSlashIcon,
  MonitorIcon,
  HomeIcon,
  PowerIcon,
  BugIcon,
  MessageSquareTextIcon,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { GithubIcon } from "@/components";

export const useMenuItems = () => {
  useI18n();


  const menu: {
    icon: React.ElementType;
    label: string;
    href: string;
    count?: number;
  }[] = [
    {
      icon: HomeIcon,
      label: t("Dashboard"),
      href: "/dashboard",
    },
    {
      icon: MessagesSquare,
      label: t("Chats"),
      href: "/chats",
    },
    {
      icon: WandSparkles,
      label: t("System prompts"),
      href: "/system-prompts",
    },
    {
      icon: Settings,
      label: t("App Settings"),
      href: "/settings",
    },
    {
      icon: MessageSquareTextIcon,
      label: t("Responses"),
      href: "/responses",
    },
    {
      icon: MonitorIcon,
      label: t("Screenshot"),
      href: "/screenshot",
    },
    {
      icon: AudioLinesIcon,
      label: t("Audio"),
      href: "/audio",
    },
    {
      icon: SquareSlashIcon,
      label: t("Cursor & Shortcuts"),
      href: "/shortcuts",
    },

    {
      icon: Code,
      label: t("AI settings"),
      href: "/dev",
    },
  ];

  const footerItems = [
    {
      icon: BugIcon,
      label: t("Report a bug"),
      href: "https://github.com/Clawz1N1N/fluely/issues/new?template=bug-report.yml",
    },
    {
      icon: PowerIcon,
      label: t("Quit Fluely"),
      action: async () => {
        await invoke("exit_app");
      },
    },
  ];

  const footerLinks: {
    title: string;
    icon: React.ElementType;
    link: string;
  }[] = [
    {
      title: t("Github"),
      icon: GithubIcon,
      link: "https://github.com/Clawz1N1N/fluely",
    },
  ];

  return {
    menu,
    footerItems,
    footerLinks,
  };
};
