/**
 * AI Service - Google Gemini Integration
 *
 * 🛡️ KNOWN LIMITATION: the key below ships inside the client bundle.
 * Any EXPO_PUBLIC_* value is extractable from a distributed APK, so this key
 * must be treated as public. The proper fix is routing calls through a server
 * (see USE_BACKEND_PROXY), which needs Firebase Cloud Functions and therefore
 * the Blaze plan — this project is on Spark, so it is not available yet.
 *
 * Until then the exposure is capped rather than closed, via Google Cloud
 * Console (outside this repo): usage quota + budget alerts on the Generative
 * Language API, key restricted to that single API, and periodic key rotation.
 *
 * When Blaze is enabled, flipping USE_BACKEND_PROXY to true and setting
 * BACKEND_URL is nearly the whole migration — only two call sites reach this
 * module's API-backed functions: app/dashboard/index.js and store/userStore.js.
 */

const GEMINI_API_KEY = process.env.EXPO_PUBLIC__GEMINI_API_KEY;
const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

// 🛡️ Requires a deployed Cloud Function (Blaze plan). See note above.
const USE_BACKEND_PROXY = false;
const BACKEND_URL = 'https://YOUR_BACKEND_REGION-YOUR_PROJECT.cloudfunctions.net/aiProxy';

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
 * Llama a la API de Gemini con un prompt
 * 🛡️ SECURITY: Supports both direct frontend calls and backend proxying
 */
const callGeminiAPI = async (prompt) => {
  if (USE_BACKEND_PROXY) {
    return callBackendProxy(prompt);
  }

  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') {
    console.warn(
      '🛡️ [Security] AI Service: API Key is missing or default. Falling back to local logic.'
    );
    throw new Error('GEMINI_API_KEY not configured properly');
  }

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!response.ok) {
      if (response.status === 503 || response.status === 500) {
        console.warn(`Gemini API ${response.status} (Service Unavailable). Retrying in 2s...`);
        await new Promise((r) => setTimeout(r, 2000));
        return callGeminiAPI(prompt);
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error('No response from API');
    }

    return text;
  } catch (error) {
    console.error('Gemini API error:', error);
    throw error;
  }
};

/**
 * 🛡️ Backend Proxy Caller (Placeholder for secure implementation)
 */
const callBackendProxy = async (prompt) => {
  try {
    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    if (!response.ok) throw new Error('Backend proxy error');
    const data = await response.json();
    return data.text;
  } catch (e) {
    console.error('🛡️ [Security] Backend Proxy failed:', e);
    throw e;
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
      `- ID: ${e.id}, Nombre: ${e.name} (${subjects?.find((s) => s.id === e.subjectId)?.name}), Fecha: ${new Date(e.date).toLocaleDateString('es-ES')}, Prioridad: ${e.priority}/10`
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
 * Recomendaciones de fallback cuando la API falla
 */
const getFallbackRecommendations = (userData) => {
  const { sessions, exams, subjects, streak } = userData;

  const weakSubjects = identifyWeakSubjects(sessions, subjects, exams);
  const upcomingExams =
    exams?.filter((e) => !e.completed && new Date(e.date) > new Date()).slice(0, 3) || [];

  return {
    mainRecommendation:
      streak?.currentStreak > 0
        ? `¡Llevas ${streak.currentStreak} días de racha! Mantén el impulso con una sesión hoy.`
        : '¡Comienza tu racha hoy! Una sesión de 25 minutos es todo lo que necesitas.',
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
