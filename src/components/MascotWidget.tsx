'use client';

import React from 'react';
import type { MascotName, MascotState } from '@/lib/types';
import { useStore } from '@/lib/store';

interface MascotWidgetProps {
  mascot?: MascotName;
  state?: MascotState;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSpeechBubble?: boolean;
  speechText?: string;
  className?: string;
  interactive?: boolean;
  onClick?: () => void;
}

export function MascotWidget({
  mascot,
  state,
  size = 'md',
  showSpeechBubble = false,
  speechText,
  className = '',
  interactive = false,
  onClick,
}: MascotWidgetProps) {
  const storeMascot = useStore((s) => s.currentMascot);
  const storeState = useStore((s) => s.mascotState);

  const activeMascot = mascot ?? storeMascot ?? 'mochi';
  const activeState = state ?? storeState ?? 'idle';

  const sizeDimensions = {
    sm: { w: 48, h: 48, p: 'p-1' },
    md: { w: 80, h: 80, p: 'p-2' },
    lg: { w: 120, h: 120, p: 'p-3' },
    xl: { w: 160, h: 160, p: 'p-4' },
  }[size];

  return (
    <div
      onClick={onClick}
      className={`relative inline-flex flex-col items-center justify-center select-none ${
        interactive ? 'cursor-pointer hover:scale-105 active:scale-95 transition-transform' : ''
      } ${className}`}
    >
      {/* Optional Speech Bubble */}
      {showSpeechBubble && speechText && (
        <div className="absolute -top-10 bg-white text-[var(--ink)] text-xs font-heading font-semibold px-3 py-1 rounded-full border-2 border-[var(--ink)] shadow-[0_2px_0_var(--ink)] whitespace-nowrap z-20 animate-fade-in">
          {speechText}
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2 h-2 bg-white border-b-2 border-r-2 border-[var(--ink)] rotate-45" />
        </div>
      )}

      {/* Mascot SVG Container */}
      <div
        className={`mascot-state-${activeState} relative flex items-center justify-center`}
        style={{ width: sizeDimensions.w, height: sizeDimensions.h }}
      >
        {activeMascot === 'mochi' && <MochiSVG state={activeState} />}
        {activeMascot === 'boba' && <BobaSVG state={activeState} />}
        {activeMascot === 'pip' && <PipSVG state={activeState} />}

        {/* Sleeping Zzz effect */}
        {activeState === 'sleeping' && (
          <div className="floating-zzz absolute -top-2 right-0 text-sm font-heading font-bold text-[var(--ink)]">
            💤 zZ
          </div>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 🍡 MOCHI: Sweet, round pink mochi cake with sakura petal
// -------------------------------------------------------------
function MochiSVG({ state }: { state: MascotState }) {
  const isBlinking = state === 'idle' || state === 'branching';

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-sm overflow-visible">
      <defs>
        <radialGradient id="mochi-gradient" cx="40%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#FFF0F5" />
          <stop offset="60%" stopColor="#FFB7D5" />
          <stop offset="100%" stopColor="#FF8EB4" />
        </radialGradient>
      </defs>

      {/* Main squishy body */}
      <path
        d="M 18,65 C 15,35 32,20 50,20 C 68,20 85,35 82,65 C 80,82 68,88 50,88 C 32,88 20,82 18,65 Z"
        fill="url(#mochi-gradient)"
        stroke="#5B4B6B"
        strokeWidth="3"
        strokeLinejoin="round"
      />

      {/* Sakura flower petal accessory on top-right */}
      <g transform="translate(64, 16) scale(0.7) rotate(15)">
        <path
          d="M 10,10 C 14,0 26,0 30,10 C 35,16 25,25 20,28 C 15,25 5,16 10,10 Z"
          fill="#FFF"
          stroke="#5B4B6B"
          strokeWidth="2"
        />
        <circle cx="20" cy="18" r="3" fill="#FF7EB6" />
      </g>

      {/* Blushing cheeks */}
      <ellipse cx="28" cy="62" rx="5" ry="3" fill="#FF7EB6" opacity="0.65" />
      <ellipse cx="72" cy="62" rx="5" ry="3" fill="#FF7EB6" opacity="0.65" />

      {/* Expressive Eyes */}
      {state === 'sleeping' ? (
        <g stroke="#5B4B6B" strokeWidth="2.5" strokeLinecap="round" fill="none">
          <path d="M 32,54 Q 38,59 44,54" />
          <path d="M 56,54 Q 62,59 68,54" />
        </g>
      ) : state === 'thinking' ? (
        <g fill="#5B4B6B">
          {/* Eyes looking up-right */}
          <circle cx="38" cy="48" r="4.5" />
          <circle cx="68" cy="48" r="4.5" />
          <circle cx="40" cy="46" r="1.5" fill="#FFF" />
          <circle cx="70" cy="46" r="1.5" fill="#FFF" />
        </g>
      ) : state === 'error' ? (
        <g stroke="#5B4B6B" strokeWidth="2.5" strokeLinecap="round" fill="none">
          {/* Spiral / dizzy crosses */}
          <path d="M 33,48 L 43,58 M 43,48 L 33,58" />
          <path d="M 57,48 L 67,58 M 67,48 L 57,58" />
        </g>
      ) : (
        <g className={isBlinking ? 'mascot-eyes' : ''} fill="#5B4B6B">
          <ellipse cx="38" cy="52" rx="4.5" ry="5.5" />
          <ellipse cx="62" cy="52" rx="4.5" ry="5.5" />
          {/* Eye sparkles */}
          <circle cx="36.5" cy="50" r="1.8" fill="#FFF" />
          <circle cx="60.5" cy="50" r="1.8" fill="#FFF" />
        </g>
      )}

      {/* Mouth */}
      {state === 'writing' ? (
        <ellipse cx="50" cy="64" rx="3.5" ry="4" fill="#5B4B6B" />
      ) : state === 'thinking' ? (
        <path
          d="M 47,64 Q 50,61 53,64"
          stroke="#5B4B6B"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
      ) : state === 'success' ? (
        <path
          d="M 44,60 Q 50,72 56,60 Z"
          fill="#5B4B6B"
          stroke="#5B4B6B"
          strokeWidth="1.5"
        />
      ) : state === 'sleeping' ? (
        <ellipse cx="50" cy="64" rx="2" ry="1.5" fill="#5B4B6B" />
      ) : (
        <path
          d="M 46,62 Q 50,67 54,62"
          stroke="#5B4B6B"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
      )}

      {/* Writing Paws / Tiny Pencil */}
      {state === 'writing' && (
        <g transform="translate(68, 62) rotate(-25)">
          <rect x="0" y="0" width="6" height="18" rx="2" fill="#FFF1A8" stroke="#5B4B6B" strokeWidth="1.5" />
          <polygon points="0,18 6,18 3,24" fill="#FF7EB6" stroke="#5B4B6B" strokeWidth="1" />
          <circle cx="3" cy="24" r="1" fill="#5B4B6B" />
        </g>
      )}
    </svg>
  );
}

// -------------------------------------------------------------
// 🧋 BOBA: Kawaii Milk Tea Cup with bouncing tapioca pearls
// -------------------------------------------------------------
function BobaSVG({ state }: { state: MascotState }) {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-sm overflow-visible">
      <defs>
        <linearGradient id="boba-body" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#F5EEFF" />
          <stop offset="100%" stopColor="#D4C1F5" />
        </linearGradient>
      </defs>

      {/* Diagonal Striped Straw */}
      <g transform="translate(48, 4) rotate(12)">
        <rect x="0" y="0" width="9" height="28" rx="3" fill="#FFB7D5" stroke="#5B4B6B" strokeWidth="2.5" />
        <line x1="0" y1="8" x2="9" y2="4" stroke="#FFF" strokeWidth="2.5" />
        <line x1="0" y1="18" x2="9" y2="14" stroke="#FFF" strokeWidth="2.5" />
      </g>

      {/* Cup Dome Lid */}
      <path
        d="M 22,30 C 22,20 78,20 78,30 Z"
        fill="#FFFFFF"
        stroke="#5B4B6B"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <line x1="18" y1="30" x2="82" y2="30" stroke="#5B4B6B" strokeWidth="3" strokeLinecap="round" />

      {/* Cup Body */}
      <path
        d="M 24,30 L 32,84 C 33,88 67,88 68,84 L 76,30 Z"
        fill="url(#boba-body)"
        stroke="#5B4B6B"
        strokeWidth="3"
        strokeLinejoin="round"
      />

      {/* Tapioca Pearls */}
      <circle cx="38" cy="76" r="4.5" fill="#5B4B6B" />
      <circle cx="50" cy="78" r="4.5" fill="#5B4B6B" />
      <circle cx="62" cy="75" r="4.5" fill="#5B4B6B" />
      <circle cx="44" cy="70" r="4" fill="#5B4B6B" />
      <circle cx="56" cy="69" r="4" fill="#5B4B6B" />

      {/* Blushing cheeks */}
      <ellipse cx="36" cy="56" rx="4" ry="2.5" fill="#FF7EB6" opacity="0.65" />
      <ellipse cx="64" cy="56" rx="4" ry="2.5" fill="#FF7EB6" opacity="0.65" />

      {/* Face Eyes */}
      <g fill="#5B4B6B">
        <circle cx="42" cy="48" r="3.5" />
        <circle cx="58" cy="48" r="3.5" />
        <circle cx="41" cy="47" r="1.2" fill="#FFF" />
        <circle cx="57" cy="47" r="1.2" fill="#FFF" />
      </g>

      {/* Face Smile */}
      <path
        d="M 47,54 Q 50,58 53,54"
        stroke="#5B4B6B"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />

      {/* Branching icon tag when in branching mode */}
      {state === 'branching' && (
        <g transform="translate(68, 40) scale(0.6)">
          <circle cx="12" cy="12" r="12" fill="#FFF1A8" stroke="#5B4B6B" strokeWidth="2.5" />
          <path d="M 6,18 L 12,6 L 18,18" stroke="#5B4B6B" strokeWidth="3" strokeLinecap="round" fill="none" />
        </g>
      )}
    </svg>
  );
}

// -------------------------------------------------------------
// 🌸 PIP: Playful Cherry Blossom Bunny & Context Scout
// -------------------------------------------------------------
function PipSVG({ state }: { state: MascotState }) {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-sm overflow-visible">
      <defs>
        <radialGradient id="pip-body" cx="45%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="70%" stopColor="#C6F1DC" />
          <stop offset="100%" stopColor="#A3E7C6" />
        </radialGradient>
      </defs>

      {/* Bunny Ears */}
      <path
        d="M 34,36 C 26,10 38,4 42,30 Z"
        fill="#C6F1DC"
        stroke="#5B4B6B"
        strokeWidth="2.8"
        strokeLinejoin="round"
      />
      <path d="M 34,26 C 30,16 38,12 40,24 Z" fill="#FFB7D5" />

      <path
        d="M 66,36 C 74,10 62,4 58,30 Z"
        fill="#C6F1DC"
        stroke="#5B4B6B"
        strokeWidth="2.8"
        strokeLinejoin="round"
      />
      <path d="M 66,26 C 70,16 62,12 60,24 Z" fill="#FFB7D5" />

      {/* Round Chubby Face */}
      <circle cx="50" cy="56" r="30" fill="url(#pip-body)" stroke="#5B4B6B" strokeWidth="3" />

      {/* Tiny Sprout on head */}
      <path
        d="M 50,26 C 45,20 48,15 54,18 C 50,21 51,24 50,26 Z"
        fill="#FFB7D5"
        stroke="#5B4B6B"
        strokeWidth="1.5"
      />

      {/* Blushing cheeks */}
      <circle cx="32" cy="62" r="4.5" fill="#FF7EB6" opacity="0.65" />
      <circle cx="68" cy="62" r="4.5" fill="#FF7EB6" opacity="0.65" />

      {/* Big Kawaii Eyes */}
      <g fill="#5B4B6B">
        <circle cx="40" cy="52" r="4.5" />
        <circle cx="60" cy="52" r="4.5" />
        <circle cx="38.5" cy="50" r="1.6" fill="#FFF" />
        <circle cx="58.5" cy="50" r="1.6" fill="#FFF" />
      </g>

      {/* Cute Bunny Nose & Mouth */}
      <polygon points="49,58 51,58 50,60" fill="#FF7EB6" />
      <path
        d="M 46,62 Q 50,65 54,62"
        stroke="#5B4B6B"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />

      {/* Sniffing magnifying glass when searching context */}
      {state === 'sniffing' && (
        <g transform="translate(68, 52) rotate(20)">
          <circle cx="10" cy="10" r="8" fill="#BFE3FF" stroke="#5B4B6B" strokeWidth="2.2" opacity="0.9" />
          <line x1="16" y1="16" x2="24" y2="24" stroke="#5B4B6B" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
