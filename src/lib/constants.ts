export const META_MODEL_CHAT = 'muse-spark-1.3';
export const META_API_URL = 'https://api.meta.ai/v1/chat/completions';

export const SYSTEM_PROMPT_RESERVE = 500;
export const DEFAULT_CONTEXT_BUDGET = 30000;
export const STREAM_TIMEOUT_MS = 30000;
export const MAX_MESSAGE_TOKENS = 2048;

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
