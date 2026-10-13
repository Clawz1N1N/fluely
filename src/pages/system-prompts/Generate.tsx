import { t, useI18n } from "@/lib/i18n";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  Textarea,
} from "@/components";
import { SparklesIcon } from "lucide-react";
import { useState } from "react";
import { useApp } from "@/contexts";
import { fetchAIResponse } from "@/lib";

interface GenerateSystemPromptProps {
  onGenerate: (prompt: string, promptName: string) => void;
}

export const GenerateSystemPrompt = ({
  onGenerate,
}: GenerateSystemPromptProps) => {
  useI18n();
  const { allAiProviders, selectedAIProvider } = useApp();
  const [userPrompt, setUserPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleGenerate = async () => {
    if (!userPrompt.trim()) {
      setError(t("Please describe what you want"));
      return;
    }

    try {
      setIsGenerating(true);
      setError(null);

      const provider = allAiProviders.find(
        (p) => p.id === selectedAIProvider.provider
      );
      if (!provider && !('__TAURI_INTERNALS__' in window)) {
        setError(t("Please select an AI provider in Dev Space first"));
        return;
      }

      let generated = "";
      for await (const chunk of fetchAIResponse({
        provider,
        selectedProvider: selectedAIProvider,
        systemPrompt:
          "You generate concise system prompts for AI assistants. Return ONLY the generated system prompt text, nothing else.",
        userMessage: `Generate a system prompt for: ${userPrompt.trim()}`,
        imagesBase64: [],
        history: [],
      })) {
        generated += chunk;
      }

      const promptText = generated.trim();
      if (promptText) {
        const promptName = userPrompt
          .trim()
          .slice(0, 30)
          .replace(/\s+/g, " ");
        onGenerate(promptText, promptName);
        setIsOpen(false);
        setUserPrompt('');
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : t("Failed to generate prompt");
      setError(errorMessage);
      console.error("Error generating system prompt:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={t("Generate with AI")}
          size="sm"
          variant="outline"
          className="w-fit"
        >
          <SparklesIcon className="h-4 w-4" /> {t("Generate with AI")}</Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        className="w-96 p-4 border shadow-lg"
      >
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium mb-1">{t("Generate a system prompt")}</p>
            <p className="text-xs text-muted-foreground">
              {t("Describe the AI behavior you want, and we'll generate a prompt for you.")}</p>
          </div>

          <Textarea
            placeholder={t("e.g., I want an AI that helps me with code reviews and focuses on best practices...")}
            className="min-h-[100px] resize-none border-1 border-input/50 focus:border-primary/50 transition-colors"
            value={userPrompt}
            onChange={(e) => {
              setUserPrompt(e.target.value);
              setError(null);
            }}
            disabled={isGenerating}
          />

          {error && <p className="text-xs text-destructive">{t(error)}</p>}

          <Button
            className="w-full"
            onClick={handleGenerate}
            disabled={!userPrompt.trim() || isGenerating}
          >
            {isGenerating ? (
              <>
                <SparklesIcon className="h-4 w-4 animate-pulse" />
                {t("Generating...")}</>
            ) : (
              <>
                <SparklesIcon className="h-4 w-4" />
                {t("Generate")}</>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};
