// Matchbook brand system — "After Dark" (hex values per DESIGN.md).
// "the party itself — a dim room, warm skin tones glowing, one hot
//  lipstick-neon accent. The introduction happens at night."

export const colors = {
  brand: '#FF2E63', // primary actions, accents, vouch moments
  brandDeep: '#D91E4F', // pressed states
  onBrand: '#23060F', // text/icons on brand surfaces (never white — fails contrast)
  bg: '#17101A', // app background (deep plum-black)
  surface: '#221727', // cards, inputs
  elevated: '#2E1E33', // raised chips, prompt cards, photo placeholders
  ink: '#F4EDF6', // body text
  muted: '#A891B5', // secondary text
  line: '#3A2941', // hairline borders
  night: '#100A13', // deck (party mode) background — one step deeper than bg
  nightInk: '#F4EDF6', // text on night
  nightMuted: '#A891B5', // secondary text on night
  nightElevated: '#2E1E33', // raised surfaces on night
  champagne: '#E3C08D', // garnish only — vouched-by chip, deck highlight. Never backgrounds.
  white: '#FFFFFF', // rare: literal white (avatars ring, Apple button)
} as const;

export const radii = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 40,
} as const;

// Shared building blocks used across screens.
export const buttonBase = {
  minHeight: 52,
  borderRadius: radii.pill,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

export const cardBase = {
  backgroundColor: colors.surface,
  borderRadius: radii.lg,
  borderWidth: 1,
  borderColor: colors.line,
};

// Brand glow for primary CTAs (iOS shadow props).
export const brandGlow = {
  shadowColor: colors.brand,
  shadowOpacity: 0.35,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
} as const;
