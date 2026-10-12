import { useState, useEffect, useRef } from "react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Header,
} from "@/components";
import { CheckCircle2, BotIcon } from "lucide-react";
import { useApp } from "@/contexts";
import { safeLocalStorage } from "@/lib";
import { STORAGE_KEYS } from "@/config";

interface PluelyPrompt {
  title: string;
  prompt: string;
  modelId: string;
  modelName: string;
}

const SELECTED_PLUELY_PROMPT_STORAGE_KEY = "selected_pluely_prompt";

// Local default presets (General, Interview, Coding, Translate, Meeting) + custom
const LOCAL_PRESETS: PluelyPrompt[] = [
  {
    title: "General",
    prompt: "You are a helpful AI assistant. Be concise, accurate, and friendly in your responses.",
    modelId: "general",
    modelName: "Default",
  },
  {
    title: "Interview",
    prompt: "You are assisting in a job interview. Listen carefully, answer briefly and confidently, and highlight relevant experience.",
    modelId: "interview",
    modelName: "Default",
  },
  {
    title: "Coding",
    prompt: "You are an expert coding assistant. Provide correct, minimal, production-quality code with brief explanations.",
    modelId: "coding",
    modelName: "Default",
  },
  {
    title: "Translate",
    prompt: "You are a translation assistant. Translate accurately and naturally, preserving tone and context.",
    modelId: "translate",
    modelName: "Default",
  },
  {
    title: "Meeting",
    prompt: "You are assisting in a meeting. Summarize key points, answer questions from context, and suggest action items.",
    modelId: "meeting",
    modelName: "Default",
  },
];

export const PluelyPrompts = () => {
  const { setSystemPrompt } = useApp();
  const [prompts,setPrompts] = useState<PluelyPrompt[]>(()=>{
    try{const parsed=JSON.parse(localStorage.getItem('local_default_presets')??'null');if(Array.isArray(parsed)&&parsed.every(p=>typeof p.title==='string'&&typeof p.prompt==='string'&&typeof p.modelId==='string'))return parsed;}catch{}
    return LOCAL_PRESETS;
  });
  const [editing,setEditing]=useState<PluelyPrompt|null>(null);
  const [selectedPluelyPrompt, setSelectedPluelyPrompt] =
    useState<PluelyPrompt | null>(() => {
      const stored = safeLocalStorage.getItem(
        SELECTED_PLUELY_PROMPT_STORAGE_KEY
      );
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          return null;
        }
      }
      return null;
    });
  const fetchInitiated = useRef(false);

  useEffect(() => {
    if (!fetchInitiated.current) {
      fetchInitiated.current = true;
    }
  }, []);

  useEffect(() => {
    const checkUserPromptSelection = () => {
      const userSelectedPromptId = safeLocalStorage.getItem(
        STORAGE_KEYS.SELECTED_SYSTEM_PROMPT_ID
      );
      if (userSelectedPromptId) {
        setSelectedPluelyPrompt(null);
      }
    };
    checkUserPromptSelection();
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.SELECTED_SYSTEM_PROMPT_ID) {
        checkUserPromptSelection();
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const handleSelectPluelyPrompt = (prompt: PluelyPrompt) => {
    setSystemPrompt(prompt.prompt);
    setSelectedPluelyPrompt(prompt);
    safeLocalStorage.removeItem(STORAGE_KEYS.SELECTED_SYSTEM_PROMPT_ID);
    safeLocalStorage.setItem(STORAGE_KEYS.SYSTEM_PROMPT, prompt.prompt);
    safeLocalStorage.setItem(
      SELECTED_PLUELY_PROMPT_STORAGE_KEY,
      JSON.stringify(prompt)
    );
    // Image support belongs to the selected provider/model.
  };

  const handleCardClick = (prompt: PluelyPrompt) => {
    handleSelectPluelyPrompt(prompt);
  };

  const isPromptSelected = (prompt: PluelyPrompt) => {
    return (
      selectedPluelyPrompt?.title === prompt.title &&
      selectedPluelyPrompt?.modelId === prompt.modelId
    );
  };

  if (prompts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 mt-6">
      <div className="flex items-start justify-between gap-3 border-t border-input/50 pt-6">
        <div className="flex items-start gap-3 w-full">
          <div className="flex flex-col gap-1 w-full">
            <Header
              title="Default Prompts"
              description="Pre-configured presets. Selecting a prompt sets the system prompt. Configure your own AI provider in Dev Space."
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 pb-4">
        {prompts.map((prompt, index) => {
          const isSelected = isPromptSelected(prompt);
          return (
            <Card
              key={`${prompt.title}-${index}`}
              className={`relative border lg:border-2 shadow-none p-4 pb-10 gap-0 group transition-all hover:shadow-sm cursor-pointer ${
                isSelected
                  ? "!bg-primary/5 dark:!bg-primary/10 border-primary"
                  : "!bg-black/5 dark:!bg-white/5 border-transparent"
              }`}
              onClick={() => handleCardClick(prompt)}
            >
              {isSelected && (
                <CheckCircle2 className="size-5 text-green-500 flex-shrink-0 absolute top-2 right-2" />
              )}
              <CardHeader className="p-0 pb-0 select-none">
                <button type="button" className="mb-2 self-end text-xs text-primary" onClick={event=>{event.stopPropagation();setEditing({...prompt});}}>Редагувати</button>
                <div className="flex items-start justify-between gap-2 relative">
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-[10px] text-base line-clamp-1 flex-1 pr-3">
                        {prompt.title}
                      </CardTitle>
                    </div>
                    <CardDescription className="h-14 line-clamp-3 text-xs leading-relaxed">
                      {prompt.prompt}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <div className="absolute bottom-2 left-4 w-full flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] lg:text-xs text-muted-foreground select-none">
                  <BotIcon className="size-3" />
                  <span className="line-clamp-1 max-w-[180px]">
                    {prompt.modelName}
                  </span>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      {editing&&<form className="space-y-2 rounded border p-3" onSubmit={event=>{
        event.preventDefault();const updated=prompts.map(prompt=>prompt.modelId===editing.modelId?editing:prompt);
        localStorage.setItem('local_default_presets',JSON.stringify(updated));setPrompts(updated);
        if(selectedPluelyPrompt?.modelId===editing.modelId)handleSelectPluelyPrompt(editing);setEditing(null);
      }}>
        <input aria-label="Назва шаблону" className="w-full rounded border p-2" required value={editing.title} onChange={event=>setEditing({...editing,title:event.target.value})}/>
        <textarea aria-label="Інструкція шаблону" className="min-h-32 w-full rounded border p-2" required value={editing.prompt} onChange={event=>setEditing({...editing,prompt:event.target.value})}/>
        <button type="submit" className="rounded bg-primary px-3 py-1 text-primary-foreground">Зберегти шаблон</button>
        <button type="button" className="ml-2" onClick={()=>setEditing(null)}>Скасувати</button>
      </form>}
    </div>
  );
};
