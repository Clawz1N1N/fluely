import {
  buildDynamicMessages,
  deepVariableReplacer,
  extractVariables,
  getByPath,
  getStreamingContent,
} from "./common.function";
import { Message, TYPE_PROVIDER } from "@/types";
import { providerFetch, ProviderHttpError, readEventStream } from "../overlay/network";
import curl2Json from "@bany/curl-to-json";
import { getResponseSettings, RESPONSE_LENGTHS, LANGUAGES } from "@/lib";
import { MARKDOWN_FORMATTING_INSTRUCTIONS } from "@/config/constants";
import { boundedChatQuestion } from '../overlay/chat-context';
import { cachedChatPreferences } from '../overlay/chat-preferences';
import { responseInstructions } from '../overlay/chat-preferences-core';

export function buildEnhancedSystemPrompt(baseSystemPrompt?: string): string {
  const shared=cachedChatPreferences();
  if(shared)return [baseSystemPrompt,responseInstructions(shared),MARKDOWN_FORMATTING_INSTRUCTIONS].filter(Boolean).join('\n\n');
  const responseSettings = getResponseSettings();
  const prompts: string[] = [];

  if (baseSystemPrompt) {
    prompts.push(baseSystemPrompt);
  }

  const lengthOption = RESPONSE_LENGTHS.find(
    (l) => l.id === responseSettings.responseLength
  );
  if (lengthOption?.prompt?.trim()) {
    prompts.push(lengthOption.prompt);
  }

  const languageOption = LANGUAGES.find(
    (l) => l.id === responseSettings.language
  );
  if (languageOption?.prompt?.trim()) {
    prompts.push(languageOption.prompt);
  }

  // Add markdown formatting instructions
  prompts.push(MARKDOWN_FORMATTING_INSTRUCTIONS);

  return prompts.join(" ");
}

export async function* fetchAIResponse(params: {
  provider: TYPE_PROVIDER | undefined;
  selectedProvider: {
    provider: string;
    variables: Record<string, string>;
  };
  systemPrompt?: string;
  history?: Message[];
  userMessage: string;
  imagesBase64?: string[];
  signal?: AbortSignal;
  registryReserved?:boolean;
  requestOverrides?:Record<string,unknown>;
  resetReasoning?:boolean;
  resetAgentTools?:boolean;
  beforeSend?:(body:unknown)=>Promise<void>;
  onUsage?:(event:unknown)=>void;
}): AsyncIterable<string> {
  if(!params.registryReserved&&typeof window!=='undefined'&&'__TAURI_INTERNALS__' in window){
    const {requestServiceAnswer}=await import('../overlay/service-client');
    const current=localStorage.getItem('system_prompt');
    const instructions=params.systemPrompt&&params.systemPrompt!==current?`Додаткові інструкції для цього запиту:\n${params.systemPrompt}\n\n`:'';
    const question=boundedChatQuestion(instructions,params.history,params.userMessage);
    yield await requestServiceAnswer(question,params.imagesBase64,params.signal);return;
  }
  try {
    const {
      provider,
      selectedProvider,
      systemPrompt,
      history = [],
      userMessage,
      imagesBase64 = [],
      signal,
    } = params;

    // Check if already aborted
    if (signal?.aborted) {
      return;
    }

    const enhancedSystemPrompt = buildEnhancedSystemPrompt(systemPrompt);

    if (!provider) {
      throw new Error(`Provider not provided`);
    }
    if (!selectedProvider) {
      throw new Error(`Selected provider not provided`);
    }

    let curlJson;
    try {
      curlJson = curl2Json(provider.curl);
    } catch (error) {
      throw new Error(
        `Failed to parse curl: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    const extractedVariables = extractVariables(provider.curl);
    const requiredVars = extractedVariables.filter(
      ({ key }) => key !== "SYSTEM_PROMPT" && key !== "TEXT" && key !== "IMAGE"
    );
    for (const { key } of requiredVars) {
      if (
        !selectedProvider.variables?.[key] ||
        selectedProvider.variables[key].trim() === ""
      ) {
        throw new Error(
          `Missing required variable: ${key}. Please configure it in settings.`
        );
      }
    }

    if (!userMessage) {
      throw new Error("User message is required");
    }
    if (imagesBase64.length > 0 && !provider.curl.includes("{{IMAGE}}")) {
      throw new Error(
        `Provider ${provider?.id ?? "unknown"} does not support image input`
      );
    }

    let bodyObj: any = curlJson.data
      ? JSON.parse(JSON.stringify(curlJson.data))
      : {};
    const messagesKey = Object.keys(bodyObj).find((key) =>
      ["messages", "contents", "conversation", "history"].includes(key)
    );

    if (messagesKey && Array.isArray(bodyObj[messagesKey])) {
      const finalMessages = buildDynamicMessages(
        bodyObj[messagesKey],
        history,
        userMessage,
        imagesBase64
      );
      bodyObj[messagesKey] = finalMessages;
    }

    const allVariables = {
      ...Object.fromEntries(
        Object.entries(selectedProvider.variables).map(([key, value]) => [
          key.toUpperCase(),
          value,
        ])
      ),
      SYSTEM_PROMPT: enhancedSystemPrompt || "",
    };

    bodyObj = deepVariableReplacer(bodyObj, allVariables);
    if(params.resetAgentTools){delete bodyObj.tools;delete bodyObj.tool_choice;delete bodyObj.parallel_tool_calls;delete bodyObj.functions;delete bodyObj.function_call;}
    if(params.resetReasoning){
      delete bodyObj.reasoning_effort;
      delete bodyObj.reasoning;
      delete bodyObj.thinking;
      if(bodyObj.output_config&&typeof bodyObj.output_config==='object'){
        bodyObj.output_config={...bodyObj.output_config};delete bodyObj.output_config.effort;
      }
      if(bodyObj.generationConfig&&typeof bodyObj.generationConfig==='object'){
        bodyObj.generationConfig={...bodyObj.generationConfig};delete bodyObj.generationConfig.thinkingConfig;
      }
      if(bodyObj.chat_template_kwargs&&typeof bodyObj.chat_template_kwargs==='object'){
        bodyObj.chat_template_kwargs={...bodyObj.chat_template_kwargs};delete bodyObj.chat_template_kwargs.enable_thinking;
      }
    }
    if(params.requestOverrides){
      const overrides={...params.requestOverrides};
      // Templates retain their protocol's existing output field and generation settings.
      const ceiling=overrides.max_tokens??overrides.max_completion_tokens;
      if(ceiling!==undefined){
        const outputKey=['max_completion_tokens','max_tokens','max_output_tokens'].find(key=>key in bodyObj);
        if(outputKey){delete overrides.max_tokens;delete overrides.max_completion_tokens;overrides[outputKey]=ceiling;}
      }
      if(overrides.generationConfig)overrides.generationConfig={...bodyObj.generationConfig,...overrides.generationConfig as object};
      if(overrides.output_config)overrides.output_config={...bodyObj.output_config,...overrides.output_config as object};
      bodyObj={...bodyObj,...overrides};
    }
    let url = deepVariableReplacer(curlJson.url || "", allVariables);

    const headers = deepVariableReplacer(curlJson.header || {}, allVariables);
    headers["Content-Type"] = "application/json";

    if (provider?.streaming) {
      if (typeof bodyObj === "object" && bodyObj !== null) {
        const streamKey = Object.keys(bodyObj).find(
          (k) => k.toLowerCase() === "stream"
        );
        if (streamKey) {
          bodyObj[streamKey] = true;
        } else {
          bodyObj.stream = true;
        }
      }
    }

    await params.beforeSend?.(bodyObj);
    const response = await providerFetch(url, {
      method: curlJson.method || "POST", headers,
      body: curlJson.method === "GET" ? undefined : JSON.stringify(bodyObj), signal,
    });
    const secrets=Object.entries(allVariables).filter(([key])=>/key|token|secret|password/i.test(key)).map(([,value])=>String(value));
    if (!response.ok) throw await ProviderHttpError.fromResponseBody(response,secrets);
    if (!provider.streaming || response.headers.get('content-type')?.includes('application/json')) {
      const json=await response.json();params.onUsage?.(json);
      const error=ProviderHttpError.fromEvent(json,secrets);if(error)throw error;
      const content = getByPath(json, provider.responseContentPath || "");
      if (typeof content !== 'string') throw new Error('Провайдер повернув відповідь без тексту.');
      yield content;
      return;
    }
    if (!response.body) throw new Error('Провайдер не повернув потік відповіді.');
    for await (const event of readEventStream(response.body, signal)) {
      const error=ProviderHttpError.fromEvent(event,secrets);if(error)throw error;
      params.onUsage?.(event);
      const delta = getStreamingContent(event, provider.responseContentPath || '');
      if (delta) yield delta;
    }
  } catch (error) {
    if (params.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    throw error;
  }
}
