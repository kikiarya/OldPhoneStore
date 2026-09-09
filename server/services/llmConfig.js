/**
 * OpenAI-compatible chat providers: OpenAI / DeepSeek / Kimi (Moonshot).
 * Set LLM_PROVIDER + LLM_API_KEY (or OPENAI_API_KEY), optionally override BASE_URL / MODEL.
 */
const PROVIDERS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    label: 'OpenAI'
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    label: 'DeepSeek'
  },
  kimi: {
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    label: 'Kimi'
  },
  // alias
  moonshot: {
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    label: 'Kimi'
  }
};

function normalizeProvider(name) {
  const key = String(name || 'openai')
    .trim()
    .toLowerCase();
  if (key === 'moonshot') return 'kimi';
  return key;
}

/**
 * @returns {{ enabled: boolean, provider: string, label: string, baseUrl: string, model: string, apiKey: string|null }}
 */
function resolveLlmConfig() {
  const provider = normalizeProvider(process.env.LLM_PROVIDER || process.env.OPENAI_PROVIDER || 'openai');
  const preset = PROVIDERS[provider] || PROVIDERS.openai;

  const apiKey =
    process.env.LLM_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.KIMI_API_KEY ||
    process.env.MOONSHOT_API_KEY ||
    null;

  const baseUrl = (
    process.env.LLM_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    preset.baseUrl
  ).replace(/\/$/, '');

  const model = process.env.LLM_MODEL || process.env.OPENAI_MODEL || preset.model;
  const label = preset.label || provider;

  return {
    enabled: Boolean(apiKey),
    provider: PROVIDERS[provider] ? provider : 'openai',
    label,
    baseUrl,
    model,
    apiKey
  };
}

function listProviders() {
  return ['openai', 'deepseek', 'kimi'];
}

module.exports = {
  PROVIDERS,
  resolveLlmConfig,
  listProviders
};
