export interface TYPE_PROVIDER {
  supportsImages?: boolean;
  id?: string;
  streaming?: boolean;
  responseContentPath?: string;
  isCustom?: boolean;
  curl: string;
}
