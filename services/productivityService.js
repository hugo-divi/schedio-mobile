/**
 * Productivity Analysis Service
 * Logic to derive insights from study sessions (Golden Hour, Recommended Technique, etc.)
 */

/**
 * Calculates the "Golden Hour" - the hour of the day when the user study most.
 * @param {Array} sessions - Array of session objects
 * @returns {Object} - { hour: number, count: number }
 */
export const calculateGoldenHour = (sessions) => {
  if (!sessions || sessions.length === 0) return null;

  const hourCounts = {};
  sessions.forEach((session) => {
    const date = new Date(session.date);
    const hour = date.getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });

  let goldenHour = 0;
  let maxCount = 0;

  for (const hour in hourCounts) {
    if (hourCounts[hour] > maxCount) {
      maxCount = hourCounts[hour];
      goldenHour = parseInt(hour);
    }
  }

  return { hour: goldenHour, count: maxCount };
};

/**
 * Recommends a study technique based on average session duration.
 * @param {Array} sessions - Array of session objects
 * @returns {Object} - { technique: string, description: string }
 */
export const recommendTechnique = (sessions) => {
  if (!sessions || sessions.length === 0) {
    return {
      name: 'Pomodoro',
      description: '25 min de estudio + 5 min de descanso. ¡Ideal para empezar!',
    };
  }

  const avgDuration = sessions.reduce((acc, s) => acc + s.duration, 0) / sessions.length;

  if (avgDuration < 20) {
    return {
      name: 'Micro-learning',
      description: 'Ráfagas cortas e intensas. Perfecto para tu ritmo actual.',
    };
  } else if (avgDuration < 45) {
    return {
      name: 'Pomodoro Clásico',
      description: 'Bloques de 25-30 min. Maximiza tu concentración sin agotarte.',
    };
  } else if (avgDuration < 90) {
    return {
      name: 'Flowtime',
      description: 'Estudia mientras mantengas el foco, sin cronómetros rígidos.',
    };
  } else {
    return {
      name: 'Deep Work',
      description: 'Sesiones largas y profundas. Ideal para temas complejos.',
    };
  }
};

/**
 * Gets a productivity tip based on recent performance.
 * @param {Array} sessions - Array of session objects
 * @returns {string} - A motivational or instructional tip
 */
export const getProductivityTip = (sessions) => {
  if (!sessions || sessions.length === 0)
    return '¡Completa tu primera sesión para recibir consejos personalizados!';

  const lastSixMonths = sessions.filter((s) => {
    const diff = new Date() - new Date(s.date);
    return diff < 1000 * 60 * 60 * 24 * 7; // Last 7 days
  });

  if (lastSixMonths.length === 0)
    return 'Hace tiempo que no estudias. ¡Retoma el ritmo con 10 minutitos!';

  const avgFocus =
    lastSixMonths.reduce((acc, s) => acc + (s.focusScore || 5), 0) / lastSixMonths.length;

  if (avgFocus > 4) return 'Tu concentración es excelente. Prueba con retos más difíciles.';
  if (lastSixMonths.length > 5) return 'Estás estudiando mucho, ¡no olvides hidratarte!';

  return 'La consistencia es la clave. ¡Vas por buen camino!';
};

/**
 * Groups session duration by day of the week for the last 7 days.
 * @param {Array} sessions - Array of session objects
 * @returns {Array} - Array of objects { day: string, minutes: number }
 */
export const getWeeklyStats = (sessions) => {
  const last7Days = [];
  const today = new Date();

  // Initialize days
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    last7Days.push({
      dateStr: d.toISOString().split('T')[0],
      dayName: d.toLocaleDateString('es-ES', { weekday: 'short' }).toUpperCase(),
      minutes: 0,
    });
  }

  sessions.forEach((session) => {
    const sessionDate = new Date(session.date).toISOString().split('T')[0];
    const dayMatch = last7Days.find((d) => d.dateStr === sessionDate);
    if (dayMatch) {
      dayMatch.minutes += session.duration;
    }
  });

  return last7Days;
};

/**
 * Calculates time spent per subject.
 * @param {Array} sessions - Array of session objects
 * @returns {Array} - Array of objects { subjectId: string, minutes: number }
 */
export const getSubjectDistribution = (sessions) => {
  const distribution = {};

  sessions.forEach((session) => {
    if (!session.subjectId) return;
    distribution[session.subjectId] = (distribution[session.subjectId] || 0) + session.duration;
  });

  return Object.entries(distribution)
    .map(([id, mins]) => ({
      subjectId: id,
      minutes: mins,
    }))
    .sort((a, b) => b.minutes - a.minutes);
};

/**
 * Detects study patterns and habits
 * @param {Array} sessions - Array of session objects
 * @returns {Object} - Pattern analysis
 */
export const detectStudyPatterns = (sessions) => {
  if (!sessions || sessions.length < 3) {
    return {
      hasEnoughData: false,
      consistency: 'Insuficiente',
      preferredTimeOfDay: null,
      averageDuration: 0,
      studyFrequency: 0,
    };
  }

  // Calcular consistencia (sesiones en los últimos 7 días)
  const last7Days = sessions.filter((s) => {
    const diff = new Date() - new Date(s.date);
    return diff < 1000 * 60 * 60 * 24 * 7;
  });

  const consistency = last7Days.length >= 5 ? 'Alta' : last7Days.length >= 3 ? 'Media' : 'Baja';

  // Detectar hora preferida
  const hourCounts = {};
  sessions.forEach((session) => {
    const hour = new Date(session.date).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });

  let preferredHour = 0;
  let maxCount = 0;
  for (const hour in hourCounts) {
    if (hourCounts[hour] > maxCount) {
      maxCount = hourCounts[hour];
      preferredHour = parseInt(hour);
    }
  }

  const preferredTimeOfDay = preferredHour < 12 ? 'Mañana' : preferredHour < 18 ? 'Tarde' : 'Noche';

  // Duración promedio
  const averageDuration = sessions.reduce((acc, s) => acc + s.duration, 0) / sessions.length;

  // Frecuencia: sesiones en los últimos 7 días. La fórmula anterior era
  // `sessions.length / (sessions.length / 7)`, que se cancela y devuelve
  // siempre 7 en cuanto hay 7 sesiones o más.
  const studyFrequency = last7Days.length;

  return {
    hasEnoughData: true,
    consistency,
    preferredTimeOfDay,
    preferredHour,
    averageDuration: Math.round(averageDuration),
    studyFrequency,
    totalSessions: sessions.length,
  };
};

/**
 * Calculates "health" of each subject based on study time, difficulty, and upcoming exams
 * @param {Array} sessions - Array of session objects
 * @param {Array} subjects - Array of subject objects
 * @param {Array} exams - Array of exam objects
 * @returns {Array} - Subject health analysis
 */
export const calculateSubjectHealth = (sessions, subjects, exams) => {
  if (!subjects || subjects.length === 0) return [];

  return subjects
    .map((subject) => {
      // Tiempo dedicado
      const subjectSessions = sessions?.filter((s) => s.subjectId === subject.id) || [];
      const totalTime = subjectSessions.reduce((acc, s) => acc + s.duration, 0);

      // Exámenes próximos
      const upcomingExams =
        exams?.filter(
          (e) => e.subjectId === subject.id && !e.completed && new Date(e.date) > new Date()
        ) || [];

      // Días desde última sesión
      const lastSession = subjectSessions[0];
      const daysSinceLastStudy = lastSession
        ? Math.floor((Date.now() - new Date(lastSession.date).getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      // Calcular "salud" (0-100)
      let health = 50; // Base

      // Factores positivos
      if (totalTime > 120)
        health += 20; // Más de 2 horas
      else if (totalTime > 60) health += 10; // Más de 1 hora

      if (daysSinceLastStudy < 3)
        health += 15; // Estudiado recientemente
      else if (daysSinceLastStudy < 7) health += 5;

      // Factores negativos
      // La dificultad se mide de 1 a 10 (es lo que pide el formulario de
      // materia, y la escala que documenta services/priority.js). El umbral
      // era `>= 4`, que penalizaba hasta a una materia de dificultad media —
      // y el onboarding escribe un 5 fijo, así que penalizaba a casi todas.
      if (subject.difficulty >= 7) health -= 10; // Materia difícil
      if (upcomingExams.length > 0) health -= 15 * upcomingExams.length; // Exámenes próximos
      if (daysSinceLastStudy > 14) health -= 20; // No estudiado en 2 semanas
      if (totalTime < 30 && upcomingExams.length > 0) health -= 15; // Poco tiempo y examen próximo

      health = Math.max(0, Math.min(100, health)); // Limitar entre 0-100

      // Determinar estado
      let status = 'Excelente';
      if (health < 30) status = 'Crítico';
      else if (health < 50) status = 'Necesita atención';
      else if (health < 70) status = 'Regular';
      else if (health < 85) status = 'Bien';

      return {
        ...subject,
        health: Math.round(health),
        status,
        totalTime,
        sessionCount: subjectSessions.length,
        upcomingExamsCount: upcomingExams.length,
        daysSinceLastStudy,
      };
    })
    .sort((a, b) => a.health - b.health); // Ordenar por salud (peores primero)
};

/**
 * Detects if the student is at risk of overload
 * @param {Array} sessions - Array of session objects
 * @param {Array} exams - Array of exam objects
 * @returns {Object} - Overload risk analysis
 */
export const detectOverloadRisk = (sessions, exams) => {
  const last7Days =
    sessions?.filter((s) => {
      const diff = new Date() - new Date(s.date);
      return diff < 1000 * 60 * 60 * 24 * 7;
    }) || [];

  const totalMinutesLastWeek = last7Days.reduce((acc, s) => acc + s.duration, 0);
  const avgMinutesPerDay = totalMinutesLastWeek / 7;

  const upcomingExams =
    exams?.filter((e) => {
      const daysUntil = (new Date(e.date) - new Date()) / (1000 * 60 * 60 * 24);
      return !e.completed && daysUntil > 0 && daysUntil < 7;
    }) || [];

  let riskLevel = 'Bajo';
  let reasons = [];

  // Detectar sobrecarga
  if (avgMinutesPerDay > 180) {
    // Más de 3 horas diarias
    riskLevel = 'Alto';
    reasons.push('Estás estudiando más de 3 horas diarias en promedio');
  } else if (avgMinutesPerDay > 120) {
    // Más de 2 horas
    riskLevel = 'Medio';
    reasons.push('Estás estudiando intensamente');
  }

  if (upcomingExams.length >= 3) {
    riskLevel = riskLevel === 'Alto' ? 'Alto' : 'Medio';
    reasons.push(`Tienes ${upcomingExams.length} exámenes esta semana`);
  }

  // Detectar falta de descanso
  const consecutiveDays = last7Days.length;
  if (consecutiveDays >= 7 && avgMinutesPerDay > 90) {
    riskLevel = 'Alto';
    reasons.push('Has estudiado todos los días sin descanso');
  }

  return {
    riskLevel,
    reasons,
    avgMinutesPerDay: Math.round(avgMinutesPerDay),
    upcomingExamsCount: upcomingExams.length,
    recommendation:
      riskLevel === 'Alto'
        ? 'Considera tomar un descanso para evitar el agotamiento'
        : riskLevel === 'Medio'
          ? 'Mantén un equilibrio entre estudio y descanso'
          : 'Buen ritmo de estudio',
  };
};

/**
 * Suggests optimal duration for a specific subject
 * @param {string} subjectId - Subject ID
 * @param {Array} sessions - Array of session objects
 * @returns {number} - Suggested duration in minutes
 */
export const suggestOptimalDuration = (subjectId, sessions) => {
  const subjectSessions = sessions?.filter((s) => s.subjectId === subjectId) || [];

  if (subjectSessions.length === 0) {
    return 45; // Default Pomodoro + break
  }

  // Calcular duración promedio histórica
  const avgDuration =
    subjectSessions.reduce((acc, s) => acc + s.duration, 0) / subjectSessions.length;

  // Ajustar basándose en el promedio
  if (avgDuration < 25) return 25; // Micro-learning
  if (avgDuration < 45) return 45; // Pomodoro clásico
  if (avgDuration < 90) return 60; // Sesión estándar
  return 90; // Deep work
};

/**
 * Gets subjects that haven't been studied in a while
 * @param {Array} sessions - Array of session objects
 * @param {Array} subjects - Array of subject objects
 * @param {number} days - Number of days threshold
 * @returns {Array} - Neglected subjects
 */
export const getNeglectedSubjects = (sessions, subjects, days = 7) => {
  if (!subjects || subjects.length === 0) return [];

  const now = Date.now();
  const threshold = days * 24 * 60 * 60 * 1000;

  return subjects
    .filter((subject) => {
      const subjectSessions = sessions?.filter((s) => s.subjectId === subject.id) || [];

      if (subjectSessions.length === 0) return true; // Nunca estudiada

      const lastSession = subjectSessions[0];
      const timeSinceLastStudy = now - new Date(lastSession.date).getTime();

      return timeSinceLastStudy > threshold;
    })
    .map((subject) => {
      const subjectSessions = sessions?.filter((s) => s.subjectId === subject.id) || [];
      const lastSession = subjectSessions[0];
      const daysSince = lastSession
        ? Math.floor((now - new Date(lastSession.date).getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      return {
        ...subject,
        daysSinceLastStudy: daysSince,
        neverStudied: subjectSessions.length === 0,
      };
    })
    .sort((a, b) => b.daysSinceLastStudy - a.daysSinceLastStudy);
};
