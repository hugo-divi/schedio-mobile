import { Platform } from 'react-native';

export const tokens = {
  colors: {
    primary: '#4A90E2',
    secondary: '#50E3C2',
    blue: '#0A84FF',
    purple: '#BF5AF2',
    background: '#000000',
    card: '#1C1C1E',
    text: '#FFFFFF',
    textSecondary: '#8E8E93',
    border: 'rgba(255, 255, 255, 0.1)',
    success: '#30D158',
    warning: '#FF9F0A',
    error: '#FF453A',

    // Dark Mode Palette (Default)
    dark: {
      background: '#000000',
      card: '#1C1C1E',
      cardSecondary: '#2C2C2E',
      text: '#FFFFFF',
      textSecondary: '#8E8E93',
      border: 'rgba(255, 255, 255, 0.1)',
      input: '#2C2C2E',
      tabBar: '#1C1C1E',
    },

    // Light Mode Palette
    light: {
      background: '#F2F2F7',
      card: '#FFFFFF',
      cardSecondary: '#E5E5EA',
      text: '#000000',
      textSecondary: '#8E8E93',
      border: 'rgba(0, 0, 0, 0.1)',
      input: '#E5E5EA',
      tabBar: '#FFFFFF',
    },
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },

  radius: {
    xs: 12, // Standard Small
    sm: 16, // Medium
    md: 20, // Large
    lg: 24, // Standard Schedio Card (Matches Web --radius-lg)
    xl: 32, // Large Card / Modal (Matches Web --radius-xl)
    hero: 28,
    full: 9999,
  },

  typography: {
    families: {
      sans: Platform.select({
        ios: '-apple-system',
        android: 'sans-serif',
        default: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
      }),
      serif: Platform.select({
        ios: 'Georgia',
        android: 'serif',
        default: 'Lyon-Text, Georgia, YuMincho, serif',
      }),
    },
    xs: 12, // Caption 2
    sm: 13, // Footnote
    base: 17, // Body (iOS Standard)
    lg: 20, // Title 3
    xl: 22, // Title 2
    xxl: 28, // Title 1
    extra: 34, // Large Title
  },

  blur: {
    base: 24,
    nav: 24,
  },

  animations: {
    primary: [0.2, 0.8, 0.2, 1], // Schedio Bezier
    toast: [0.2, 0.9, 0.2, 1],
  },

  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.3,
      shadowRadius: 15,
      elevation: 5,
    },
    lg: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 15 },
      shadowOpacity: 0.5,
      shadowRadius: 35,
      elevation: 10,
    },
  },
};
