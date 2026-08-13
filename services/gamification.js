/* Gamification Service
   Defines Ranks, Badges, and XP Logic
*/

import { Clock, Star, Zap, BookOpen, Crown, Moon, Flame, Trophy, Award } from 'lucide-react-native';

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
export const BADGES = [
  {
    id: 'first_steps',
    name: 'Primeros Pasos',
    description: 'Completa tu primera sesión de estudio.',
    icon: 'BookOpen',
    color: '#32ADE6',
    condition: (stats) => stats.totalSessions >= 1,
  },
  {
    id: 'marathon',
    name: 'Maratonista',
    description: 'Completa una sesión de más de 60 minutos.',
    icon: 'Clock',
    color: '#FF9500',
    condition: (stats, currentSession) => currentSession?.duration >= 60,
  },
  {
    id: 'night_owl',
    name: 'Búho Nocturno',
    description: 'Estudia entre las 22:00 y las 04:00.',
    icon: 'Moon',
    color: '#5856D6',
    condition: (stats, currentSession) => {
      const hour = new Date().getHours();
      return hour >= 22 || hour < 4;
    },
  },
  {
    id: 'excellence',
    name: 'Excelencia',
    description: 'Consigue un 10 en un examen.',
    icon: 'Star',
    color: '#FFD60A',
    condition: (stats, examGrade) => examGrade >= 10,
  },
  {
    id: 'streak_master',
    name: 'En Llamas',
    description: 'Mantén una racha de 7 días.',
    icon: 'Zap',
    color: '#FF3B30',
    condition: (stats) => stats.streak >= 7,
  },
];

// Both RANKS and BADGES carry an `icon` string (lucide component name) rather
// than the component itself, so screens resolve it through this single map
// instead of each keeping its own — that's how a rank ended up rendering the
// same Award glyph everywhere despite RANKS already defining a distinct icon.
export const ICONS = { Clock, Star, Zap, BookOpen, Crown, Moon, Flame, Trophy };
export const getIcon = (name) => ICONS[name] || Award;

export const checkNewBadges = (currentBadges, stats, context = {}) => {
  const unlocked = [];
  BADGES.forEach((badge) => {
    if (!currentBadges.includes(badge.id)) {
      if (badge.condition(stats, context)) {
        unlocked.push(badge.id);
      }
    }
  });
  return unlocked;
};
