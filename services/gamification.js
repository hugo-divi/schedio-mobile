/* Gamification Service
   Defines Ranks, Badges, and XP Logic
*/

import {
  Clock,
  Star,
  Zap,
  BookOpen,
  Crown,
  Moon,
  Flame,
  Trophy,
  Award,
  Sunrise,
  CalendarCheck,
  CalendarRange,
  FastForward,
  Mountain,
  Layers,
  Hourglass,
  GraduationCap,
  Medal,
  BookCheck,
  Shuffle,
  Backpack,
} from 'lucide-react-native';
import { BADGE_CATALOG, badgeById, catalogFor } from './badges';

// --- RANKS ---
export const RANKS = [
  {
    minLevel: 1,
    title: 'Novato',
    color: '#8E8E93',
    icon: 'Zap',
    description: 'Tus primeros pasos en el mundo del conocimiento. Sigue así!',
    requirements: 'Nivel 1+',
  },
  {
    minLevel: 5,
    title: 'Aprendiz',
    color: '#32ADE6',
    icon: 'BookOpen',
    description: 'Ya no eres un extraño para el estudio. Tus bases son sólidas.',
    requirements: 'Nivel 5+',
  },
  {
    minLevel: 10,
    title: 'Estudiante',
    color: '#30D158',
    icon: 'Star',
    description: 'Compromiso real. Has demostrado una constancia admirable.',
    requirements: 'Nivel 10+',
  },
  {
    minLevel: 25,
    title: 'Erudito',
    color: '#FF9500',
    icon: 'Crown',
    description: 'Tu conocimiento destaca. Eres un referente en Schedio.',
    requirements: 'Nivel 25+',
  },
  {
    minLevel: 50,
    title: 'Maestro',
    color: '#FF2D55',
    icon: 'Flame',
    description: 'Dominas el arte del aprendizaje. Nada te detiene.',
    requirements: 'Nivel 50+',
  },
  {
    minLevel: 100,
    title: 'Leyenda',
    color: '#BF5AF2',
    icon: 'Trophy',
    description: 'Has alcanzado la cima. Tu nombre será recordado.',
    requirements: 'Nivel 100+',
  },
];

export const getRankForLevel = (level) => {
  // Find the highest rank where level >= minLevel
  return [...RANKS].reverse().find((rank) => level >= rank.minLevel) || RANKS[0];
};

export const getNextRank = (level) => {
  return RANKS.find((rank) => rank.minLevel > level) || null;
};

// --- XP LOGIC ---
export const BASE_XP_PER_MINUTE = 10;
export const XP_PER_EXAM_GRADE = 100; // e.g. Grade 8 = 800 XP

export const calculateLevel = (xp) => {
  // Simple quadratic curve: XP = Level^2 * 100
  // Level = Sqrt(XP / 100)
  return Math.floor(Math.sqrt(xp / 100)) + 1;
};

export const calculateXpForNextLevel = (level) => {
  return Math.pow(level, 2) * 100;
};

export const calculateXpForLevel = (level) => {
  if (level <= 1) return 0;
  return Math.pow(level - 1, 2) * 100;
};

// --- BADGES ---
//
// The catalogue and the rules live in services/badges.js, without React
// Native, so scripts/check-badges.mjs can check them. `BADGES` stays the
// original nine for every screen that already lists them; beta accounts get
// `catalogFor({ beta: true })` instead.
export const BADGES = catalogFor({ beta: false });
export const ALL_BADGES = BADGE_CATALOG;
export { badgeById, catalogFor };

// Both RANKS and BADGES carry an `icon` string (lucide component name) rather
// than the component itself, so screens resolve it through this single map
// instead of each keeping its own — that's how a rank ended up rendering the
// same Award glyph everywhere despite RANKS already defining a distinct icon.
export const ICONS = {
  Clock,
  Star,
  Zap,
  BookOpen,
  Crown,
  Moon,
  Flame,
  Trophy,
  Sunrise,
  Award,
  CalendarCheck,
  CalendarRange,
  FastForward,
  Mountain,
  Layers,
  Hourglass,
  GraduationCap,
  Medal,
  BookCheck,
  Shuffle,
  Backpack,
};
export const getIcon = (name) => ICONS[name] || Award;
