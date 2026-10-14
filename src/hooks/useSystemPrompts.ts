import { t, useI18n } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import {
  createSystemPrompt,
  getAllSystemPrompts,
  updateSystemPrompt,
  deleteSystemPrompt,
} from "@/lib/database";
import type {
  SystemPrompt,
  SystemPromptInput,
  UpdateSystemPromptInput,
} from "@/types";
import { DEFAULT_SYSTEM_PROMPT, STORAGE_KEYS } from "@/config";
import { safeLocalStorage } from "@/lib";
import { useApp } from "@/contexts";
import { listenChatPreferences, updateChatPreferences } from '@/lib/overlay/chat-preferences';

export const useSystemPrompts = () => {
  useI18n();
  const { setSystemPrompt } = useApp();
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPromptId, setSelectedPromptId] = useState<number | null>(
    () => {
      const stored = safeLocalStorage.getItem(
        STORAGE_KEYS.SELECTED_SYSTEM_PROMPT_ID
      );
      return stored ? Number(stored) : null;
    }
  );

  /**
   * Fetch all system prompts from database
   */
  const fetchPrompts = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await getAllSystemPrompts();
      setPrompts(result);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : t("Failed to fetch system prompts");
      setError(errorMessage);
      console.error("Error fetching system prompts:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Create a new system prompt
   */
  const createPrompt = useCallback(
    async (input: SystemPromptInput): Promise<SystemPrompt> => {
      try {
        setError(null);
        const result = await createSystemPrompt(input);
        await fetchPrompts(); // Refresh list
        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : t("Failed to create system prompt");
        setError(errorMessage);
        console.error("Error creating system prompt:", err);
        throw err;
      }
    },
    [fetchPrompts]
  );

  /**
   * Update an existing system prompt
   */
  const updatePrompt = useCallback(
    async (
      id: number,
      input: UpdateSystemPromptInput
    ): Promise<SystemPrompt> => {
      try {
        setError(null);
        const result = await updateSystemPrompt(id, input);
        if(selectedPromptId===id)await updateChatPreferences({prompt_id:`user:${id}`,system_prompt:result.prompt});
        await fetchPrompts(); // Refresh list
        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : t("Failed to update system prompt");
        setError(errorMessage);
        console.error("Error updating system prompt:", err);
        throw err;
      }
    },
    [fetchPrompts, selectedPromptId]
  );

  /**
   * Delete a system prompt
   */
  const deletePrompt = useCallback(
    async (id: number): Promise<void> => {
      try {
        setError(null);
        await deleteSystemPrompt(id);
        if(selectedPromptId===id)await updateChatPreferences({prompt_id:null});
        await fetchPrompts(); // Refresh list
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : t("Failed to delete system prompt");
        setError(errorMessage);
        console.error("Error deleting system prompt:", err);
        throw err;
      }
    },
    [fetchPrompts,selectedPromptId]
  );

  /**
   * Refresh prompts list
   */
  const refreshPrompts = useCallback(async () => {
    await fetchPrompts();
  }, [fetchPrompts]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Fetch prompts on mount
  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);
  useEffect(()=>{let disposed=false,off:(()=>void)|undefined;
    void listenChatPreferences(value=>{if(disposed)return;setSelectedPromptId(value.prompt_id?.startsWith('user:')?Number(value.prompt_id.slice(5)):null);setSystemPrompt(value.system_prompt);})
      .then(stop=>{if(disposed)stop();else off=stop;}).catch(err=>setError(String(err)));
    return()=>{disposed=true;off?.();};
  },[setSystemPrompt]);

  /**
   * Load selected prompt on mount and when prompts change
   */
  useEffect(() => {
    if (selectedPromptId && prompts.length > 0) {
      const selectedPrompt = prompts.find((p) => p.id === selectedPromptId);
      if (selectedPrompt) {
        setSystemPrompt(selectedPrompt.prompt);
      } else {
        // Selected prompt was deleted, reset to default
        setSelectedPromptId(null);
        safeLocalStorage.removeItem(STORAGE_KEYS.SELECTED_SYSTEM_PROMPT_ID);
        const currentPrompt = safeLocalStorage.getItem(
          STORAGE_KEYS.SYSTEM_PROMPT
        );
        if (!currentPrompt) {
          setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
          safeLocalStorage.setItem(
            STORAGE_KEYS.SYSTEM_PROMPT,
            DEFAULT_SYSTEM_PROMPT
          );
        }
      }
    }
  }, [prompts, selectedPromptId, setSystemPrompt]);

  /**
   * Handle selecting a prompt
   */
  const handleSelectPrompt = useCallback(
    (promptId: number, suppliedPrompt?:SystemPrompt) => {
      const selectedPrompt = suppliedPrompt??prompts.find((p) => p.id === promptId);
      if (selectedPrompt) {
        setSystemPrompt(selectedPrompt.prompt);
        setSelectedPromptId(promptId);
        safeLocalStorage.setItem(
          STORAGE_KEYS.SYSTEM_PROMPT,
          selectedPrompt.prompt
        );
        safeLocalStorage.setItem(
          STORAGE_KEYS.SELECTED_SYSTEM_PROMPT_ID,
          promptId.toString()
        );
        // Clear any selected Fluely prompt when user selects their own prompt
        safeLocalStorage.removeItem("selected_pluely_prompt");
        void updateChatPreferences({prompt_id:`user:${promptId}`,system_prompt:selectedPrompt.prompt}).catch(err=>setError(String(err)));
      }
    },
    [prompts, setSystemPrompt]
  );

  return {
    prompts,
    isLoading,
    error,
    selectedPromptId,
    createPrompt,
    updatePrompt,
    deletePrompt,
    refreshPrompts,
    clearError,
    handleSelectPrompt,
  };
};
