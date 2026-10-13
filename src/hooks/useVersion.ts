import { t, useI18n } from "@/lib/i18n";
import { useState, useEffect } from "react";
import { getAppVersion } from "@/lib";

export const useVersion = () => {
  useI18n();
  const [version, setVersion] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        setIsLoading(true);
        const appVersion = await getAppVersion();
        setVersion(appVersion);
        setError(null);
      } catch (err) {
        console.error("Failed to fetch version:", err);
        setError(t("Failed to load version"));
        setVersion(t("Unknown"));
      } finally {
        setIsLoading(false);
      }
    };

    fetchVersion();
  }, []);

  return { version, isLoading, error };
};
