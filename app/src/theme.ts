// Matchbook brand system — hex (RN) values per DESIGN.md.
// "a great wingperson's introduction at a house party — lipstick-red confidence,
//  champagne warmth, a wink not a swipe."

export const colors = {
  brand: '#BE1E5E', // primary actions, brand moments
  brandDeep: '#8A1244', // pressed states, dark-surface brand
  bg: '#FBF7F9', // light page background (barely-blush white)
  surface: '#FFFFFF', // cards, inputs
  ink: '#33222B', // body text
  muted: '#75606B', // secondary text
  line: '#E4DBE0', // hairline borders
  night: '#2B1B24', // party-mode (deck) background — deep plum
  nightInk: '#F5EDF2', // text on night
  nightMuted: '#B79FAC', // secondary text on night
  champagne: '#E3C08D', // rare garnish only — badges, deck highlight. Never backgrounds, never on light bg.
  nightElevated: '#3D2836', // derived: night surface raised one step (photo placeholder, prompt cards on deck)
  white: '#FFFFFF', // literal white for text/icons on brand/night surfaces
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
  borderRadius: radii.md,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

export const cardBase = {
  backgroundColor: colors.surface,
  borderRadius: radii.lg,
  borderWidth: 1,
  borderColor: colors.line,
};
