export const META_MODEL_CHAT = 'muse-spark-1.3';
export const META_API_URL = 'https://api.meta.ai/v1/chat/completions';
export const META_RESPONSES_URL = 'https://api.meta.ai/v1/responses';

export const SYSTEM_PROMPT_RESERVE = 500;
export const DEFAULT_CONTEXT_BUDGET = 30000;
export const STREAM_TIMEOUT_MS = 30000;
// Muse Spark counts hidden reasoning tokens against max_tokens, so leave generous headroom.
export const MAX_MESSAGE_TOKENS = 6000;
// Benchmarked (minimal vs low vs default): minimal starts streaming in ~1.7s vs 5-17s.
export const CHAT_REASONING_EFFORT = 'minimal';

export const MASCOTS = {
  mochi: {
    name: 'Mochi',
    title: 'Chief Sweetheart & Chat Guide',
    avatar: '🍡',
    color: '#FFB7D5',
  },
  boba: {
    name: 'Boba',
    title: 'Branch & Tangent Navigator',
    avatar: '🧋',
    color: '#D4C1F5',
  },
  pip: {
    name: 'Pip',
    title: 'Context Sniffer & Scout',
    avatar: '🌸',
    color: '#C6F1DC',
  },
} as const;
