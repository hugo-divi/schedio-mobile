/**
 * AI Service - Google Gemini Integration
 *
 * Calls go through the `aiProxy` Cloud Function (functions/index.js) rather
 * than Gemini directly. It used to call Gemini with a key embedded in the
 * client bundle — extractable from any distributed APK, so effectively
 * public, and nothing stopped someone who pulled it out from calling it
 * outside the app with no limit at all. The proxy keeps the key server-side
 * and enforces a 5-per-day quota per signed-in user (see AI_DAILY_LIMIT in
 * functions/index.js) — real enforcement, since it's tied to a verified
 * Firebase Auth token rather than anything the client claims about itself.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

const callAiProxy = httpsCallable(functions, 'aiProxy');

// Cache para evitar llamadas excesivas a la API
const cache = {
  recommendations: null,
  timestamp: null,
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutos
};

/**
 * Verifica si el cache es válido
 */
const isCacheValid = () => {
  if (!cache.recommendations || !cache.timestamp) return false;
  return Date.now() - cache.timestamp < cache.CACHE_DURATION;
};

/**
 * Sends a prompt through the aiProxy Cloud Function. Retries and the daily
 * quota are enforced server-side now (see functions/index.js) — this just
 * surfaces whatever it returns. A `limited: true, text: null` response (quota
 * hit on the very first call of the day, so there's nothing yet to replay)
 * throws the same as any other failure, so every caller's existing
 * catch-and-fall-back-to-local-logic path handles it without changes.
 */
const callGeminiAPI = async (prompt) => {
  try {
    const result = await callAiProxy({ prompt });
    const text = result.data?.text;
    if (!text) {
      throw new Error('No response from AI proxy');
    }
    return text;
  } catch (error) {
    console.error('AI proxy error:', error);
    throw error;
  }
};

/**
 * Construye contexto del usuario para el prompt
 */
const buildUserContext = (userData) => {
  const { profile, subjects, sessions, exams, streak, gamification } = userData;

  // Calcular estadísticas
  const totalStudyTime = sessions?.reduce((acc, s) => acc + s.duration, 0) || 0;
  const avgSessionDuration = sessions?.length > 0 ? totalStudyTime / sessions.length : 0;
  const upcomingExamsCount =
    exams?.filter((e) => !e.completed && new Date(e.date) > new Date()).length || 0;

  // Materias por dificultad
  const subjectsByDifficulty = subjects?.sort((a, b) => b.difficulty - a.difficulty) || [];

  return `
Usuario: ${profile?.displayName || 'Estudiante'}
Nivel educativo: ${profile?.course || 'No especificado'} - ${profile?.grade || ''}
Nivel de organización: ${profile?.organizationLevel || 3}/5

Racha actual: ${streak?.currentStreak || 0} días
Racha máxima: ${streak?.maxStreak || 0} días
Nivel de gamificación: ${gamification?.level || 1}
XP total: ${gamification?.xp || 0}

Materias (${subjects?.length || 0}):
${subjectsByDifficulty
  .slice(0, 5)
  .map((s) => `- ${s.name} (Dificultad: ${s.difficulty}/5)`)
  .join('\n')}

Sesiones de estudio recientes: ${sessions?.length || 0} sesiones
Tiempo total de estudio: ${Math.round(totalStudyTime)} minutos
Duración promedio por sesión: ${Math.round(avgSessionDuration)} minutos

Exámenes próximos: ${upcomingExamsCount}
${exams
  ?.slice(0, 3)
  .map(
    (e) =>
      `- ${e.name} (${subjects?.find((s) => s.id === e.subjectId)?.name}) - ${new Date(e.date).toLocaleDateString('es-ES')}`
  )
  .join('\n')}
    `.trim();
};

/**
 * Genera recomendaciones personalizadas completas
 */
export const generateRecommendations = async (userData) => {
  // Verificar cache
  if (isCacheValid()) {
    console.log('Returning cached recommendations');
    return cache.recommendations;
  }

  const context = buildUserContext(userData);

  const prompt = `Eres un coach de productividad académica experto. Analiza el siguiente perfil de estudiante y genera recomendaciones personalizadas.

${context}

Genera un análisis en formato JSON con la siguiente estructura:
{
  "mainRecommendation": "Recomendación principal del día (1-2 frases motivadoras y accionables)",
  "studyPlan": [
    {
      "subject": "Nombre de la materia",
      "duration": "Duración sugerida en minutos",
      "priority": "Alta/Media/Baja",
      "reason": "Por qué estudiar esto ahora"
    }
  ],
  "patterns": {
    "strengths": ["Fortaleza 1", "Fortaleza 2"],
    "improvements": ["Área de mejora 1", "Área de mejora 2"]
  },
  "motivationalInsight": "Mensaje motivacional personalizado basado en su progreso",
  "alerts": ["Alerta 1 si hay materias descuidadas o riesgo de sobrecarga"]
}

Responde SOLO con el JSON, sin texto adicional.`;

  try {
    const response = await callGeminiAPI(prompt);

    // Limpiar respuesta para obtener solo el JSON válido
    let jsonText = response.trim();

    // Estrategia 1: Buscar bloque de código JSON
    const codeBlockMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1];
    } else {
      // Estrategia 2: Buscar llaves extremas si no hay bloque de código
      const firstBrace = jsonText.indexOf('{');
      const lastBrace = jsonText.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonText = jsonText.substring(firstBrace, lastBrace + 1);
      }
    }

    try {
      const recommendations = JSON.parse(jsonText);
      // Guardar en cache
      cache.recommendations = recommendations;
      cache.timestamp = Date.now();
      return recommendations;
    } catch (parseError) {
      console.error('Error parsing JSON from Gemini:', parseError);
      console.log('Raw text received:', response);
      // Si falla el parseo, devolver fallback pero registrando el error
      return getFallbackRecommendations(userData);
    }
  } catch (error) {
    if (error.message.includes('429')) {
      console.warn('Gemini API Rate Limit reached. Using offline recommendations.');
    } else {
      console.error('Error generating recommendations:', error);
    }
    // Fallback recommendations
    return getFallbackRecommendations(userData);
  }
};

/**
 * Genera un plan de estudio sugerido
 */
/**
 * Genera un plan de estudio personalizado con IA
 * Compatible con la estructura del store de microplans
 */
export const getStudyPlanSuggestion = async (exams, subjects, sessions) => {
  const context = `
Exámenes próximos:
${exams
  ?.slice(0, 5)
  .map(
    (e) =>
      // `e.priority` no longer exists on new exams — the student's pick moved to
      // `manualPriority` when scoring was centralised in services/priority.js.
      // Reading both keeps older docs working; without the fallback this line
      // was about to start telling Gemini "Prioridad: undefined/10".
      `- ID: ${e.id}, Nombre: ${e.name} (${subjects?.find((s) => s.id === e.subjectId)?.name}), Fecha: ${new Date(e.date).toLocaleDateString('es-ES')}, Prioridad elegida por el alumno: ${e.manualPriority ?? e.priority ?? 5}/10`
  )
  .join('\n')}

Materias y IDs:
${subjects?.map((s) => `- ID: ${s.id}, Nombre: ${s.name} (Dificultad: ${s.difficulty}/5)`).join('\n')}

Sesiones recientes: ${sessions?.length || 0}
    `.trim();

  const prompt = `Eres un coach académico experto. Genera una lista de micro-tareas de estudio para los próximos 3 días (HOY incluido) basadas en los exámenes próximos.

${context}

Genera un JSON con una lista plana de tareas. Cada tarea debe tener:
- id: Un string único (ej: "ai-task-1")
- examId: El ID del examen relacionado (si aplica)
- subjectId: El ID exacto de la materia (de la lista proporcionada)
- subjectName: El nombre exacto de la materia
- text: Descripción motivadora de la tarea (ej: "Repaso profundo de Álgebra")
- date: Fecha en formato ISO string (ej: "2024-03-20T...") - Distribuye las tareas en Hoy, Mañana y Pasado.
- duration: Duración en minutos (entre 20 y 60)
- type: 'read', 'practice', o 'test'
- phase: 'Repaso Final', 'Práctica', 'Teoría'
- completed: false

Ejemplo de estructura esperada (ARRAY plano):
[
  {
    "id": "ai-task-001",
    "subjectId": "...",
    "text": "...",
    ...
  }
]

Responde SOLO con el JSON.`;

  try {
    const response = await callGeminiAPI(prompt);
    let jsonText = response.trim();

    // Extracción robusta de JSON
    const codeBlockMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1];
    } else {
      const firstBrace = jsonText.indexOf('[');
      const lastBrace = jsonText.lastIndexOf(']');
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonText = jsonText.substring(firstBrace, lastBrace + 1);
      }
    }

    const tasks = JSON.parse(jsonText);

    // Enriquecer con colores de materias si faltan
    return tasks.map((task) => {
      const subject = subjects?.find((s) => s.id === task.subjectId);
      return {
        ...task,
        subjectColor: subject?.color || '#4F46E5',
        subjectName: subject?.name || task.subjectName,
      };
    });
  } catch (error) {
    console.error('Error generating AI study plan:', error);
    return null; // El store manejará el fallback si es null
  }
};

/**
 * Analiza patrones de estudio
 */
export const analyzeStudyPatterns = async (sessions) => {
  if (!sessions || sessions.length < 3) {
    return {
      hasEnoughData: false,
      message: 'Necesitas al menos 3 sesiones para analizar patrones',
    };
  }

  const context = `
Sesiones de estudio (últimas ${sessions.length}):
${sessions
  .slice(0, 20)
  .map(
    (s) =>
      `- ${s.duration} min, ${new Date(s.date).toLocaleDateString('es-ES')} ${new Date(s.date).getHours()}:00`
  )
  .join('\n')}
    `.trim();

  const prompt = `Analiza estos patrones de estudio y genera insights.

${context}

Responde en JSON:
{
  "consistency": "Alta/Media/Baja",
  "preferredTime": "Mañana/Tarde/Noche",
  "averageDuration": 45,
  "strengths": ["Patrón positivo 1"],
  "suggestions": ["Sugerencia de mejora 1"]
}

Responde SOLO con el JSON.`;

  try {
    const response = await callGeminiAPI(prompt);
    let jsonText = response
      .trim()
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '');
    return JSON.parse(jsonText);
  } catch (error) {
    console.error('Error analyzing patterns:', error);
    return null;
  }
};

/**
 * Genera insight motivacional
 */
export const getMotivationalInsight = async (streak, level, sessions) => {
  const prompt = `Genera un mensaje motivacional personalizado para un estudiante.

Racha: ${streak?.currentStreak || 0} días
Nivel: ${level || 1}
Sesiones totales: ${sessions?.length || 0}

Responde con un mensaje corto (1-2 frases) motivador y personalizado. Solo el texto, sin JSON.`;

  try {
    const response = await callGeminiAPI(prompt);
    return response.trim().replace(/['"]/g, '');
  } catch (error) {
    console.error('Error generating motivational insight:', error);
    return '¡Sigue así! Cada sesión te acerca más a tus objetivos. 🚀';
  }
};

/**
 * Identifica materias débiles que necesitan atención
 */
export const identifyWeakSubjects = (sessions, subjects, exams) => {
  if (!subjects || subjects.length === 0) return [];

  const subjectStats = {};

  // Calcular tiempo dedicado a cada materia
  subjects.forEach((subject) => {
    const subjectSessions = sessions?.filter((s) => s.subjectId === subject.id) || [];
    const totalTime = subjectSessions.reduce((acc, s) => acc + s.duration, 0);
    const upcomingExams =
      exams?.filter(
        (e) => e.subjectId === subject.id && !e.completed && new Date(e.date) > new Date()
      ) || [];

    subjectStats[subject.id] = {
      ...subject,
      totalTime,
      sessionCount: subjectSessions.length,
      upcomingExamsCount: upcomingExams.length,
      lastStudied: subjectSessions[0]?.date || null,
    };
  });

  // Identificar materias débiles
  const weakSubjects = Object.values(subjectStats).filter((stat) => {
    const hasUpcomingExams = stat.upcomingExamsCount > 0;
    const lowStudyTime = stat.totalTime < 60; // Menos de 1 hora
    const highDifficulty = stat.difficulty >= 4;
    const notStudiedRecently =
      !stat.lastStudied ||
      Date.now() - new Date(stat.lastStudied).getTime() > 7 * 24 * 60 * 60 * 1000; // 7 días

    return (hasUpcomingExams && lowStudyTime) || (highDifficulty && notStudiedRecently);
  });

  return weakSubjects.slice(0, 3); // Top 3 materias débiles
};

/**
 * Mensajes genéricos para cuando no hay recomendación de IA disponible —
 * porque falló la llamada, porque se acabó la cuota diaria del usuario sin
 * nada que repetir todavía, o porque el freno de presupuesto mensual
 * (MONTHLY_BUDGET_USD en functions/index.js) cortó las llamadas a Gemini
 * para todo el mundo. Con 15 variantes elegidas al azar, es poco probable
 * ver la misma dos veces seguidas sin tener que llevar la cuenta de cuál
 * tocó la última vez.
 */
const GENERIC_RECOMMENDATIONS = [
  'Cada sesión cuenta, por pequeña que sea. Sigue a tu ritmo.',
  'Organiza tu día con calma: un paso cada vez es suficiente.',
  'Revisa tu calendario y elige una tarea sencilla para empezar.',
  'La constancia pesa más que la intensidad. Sigue así.',
  'Tómate un momento para repasar tus próximos exámenes.',
  'Un buen descanso también forma parte de estudiar bien.',
  'Elige la asignatura que más se acerque y dale prioridad.',
  'Pequeños avances diarios suman más de lo que parece.',
  'Revisa tu Mochila: puede que tengas apuntes útiles ahí guardados.',
  'Hoy es un buen día para repasar algo que ya sabes bien.',
  'No hace falta un plan perfecto, solo empezar.',
  'Tu progreso hasta ahora ya dice mucho de ti.',
  'Dedica unos minutos a organizar lo que toca esta semana.',
  'Ir paso a paso también es avanzar.',
  'Confía en el trabajo que ya has hecho hasta ahora.',
];

const pickGenericRecommendation = () =>
  GENERIC_RECOMMENDATIONS[Math.floor(Math.random() * GENERIC_RECOMMENDATIONS.length)];

/**
 * Recomendaciones de fallback cuando la API falla
 */
const getFallbackRecommendations = (userData) => {
  const { sessions, exams, subjects } = userData;

  const weakSubjects = identifyWeakSubjects(sessions, subjects, exams);
  const upcomingExams =
    exams?.filter((e) => !e.completed && new Date(e.date) > new Date()).slice(0, 3) || [];

  return {
    mainRecommendation: pickGenericRecommendation(),
    studyPlan: upcomingExams.map((exam) => {
      const subject = subjects?.find((s) => s.id === exam.subjectId);
      const daysUntil = Math.ceil((new Date(exam.date) - new Date()) / (1000 * 60 * 60 * 24));
      return {
        subject: subject?.name || 'Materia',
        duration: daysUntil < 3 ? '60-90' : '45',
        priority: daysUntil < 3 ? 'Alta' : daysUntil < 7 ? 'Media' : 'Baja',
        reason: `Examen en ${daysUntil} días`,
      };
    }),
    patterns: {
      strengths:
        sessions?.length > 5
          ? ['Has completado varias sesiones', 'Muestras compromiso con tu aprendizaje']
          : ['Estás comenzando tu camino', 'Cada sesión cuenta'],
      improvements:
        weakSubjects.length > 0
          ? [`Dedica más tiempo a ${weakSubjects[0].name}`, 'Mantén un horario consistente']
          : ['Mantén la consistencia', 'Incrementa gradualmente la duración'],
    },
    motivationalInsight: 'La constancia es más importante que la intensidad. ¡Sigue adelante! 🎯',
    alerts: weakSubjects.length > 0 ? [`⚠️ ${weakSubjects[0].name} necesita más atención`] : [],
  };
};

/**
 * Limpia el cache (útil para forzar nuevas recomendaciones)
 */
export const clearCache = () => {
  cache.recommendations = null;
  cache.timestamp = null;
};
