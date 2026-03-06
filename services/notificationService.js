import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { db } from './firebase';
import { doc, getDoc, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';

// Configure how notifications should be handled when the app is open
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

/**
 * Request permissions for push notifications
 */
export async function requestPermissions() {
    if (Platform.OS === 'web') return false;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        return false;
    }

    return true;
}

/**
 * Messaging Pools for unique/rotating notifications
 */
const MESSAGES = {
    exam_3days: [
        "Tu examen de [subject] es en 3 días 📖 ¿Ya tienes plan?",
        "3 días para [subject]. Schedio tiene tu plan listo 🧠",
        "¡Oye! Solo quedan 3 días para [subject]. Un empujón más 💪"
    ],
    exam_1day: [
        "Mañana es [subject] 😬 Un repaso esta noche marca la diferencia.",
        "Último día antes de [subject]. ¡Tú puedes! 💪",
        "Recta final para [subject]. Schedio está contigo 🚀"
    ],
    exam_today: [
        "Hoy es el día 🎯 Confía en lo que has estudiado.",
        "¡Hoy [subject]! Ya has hecho el trabajo duro 🚀",
        "Mucha suerte en [subject]. ¡A por todas! 🎖️"
    ],
    panic_mode: [
        "🔥 MODO PÁNICO: [subject] es pasado mañana. Tu plan de choque te espera.",
        "⚠️ [subject] se acerca peligrosamente. Entra para el plan de emergencia.",
        "🔥 No hay tiempo que perder con [subject]. Schedio ha priorizado lo vital."
    ],
    inactivity: [
        "Parece que llevas un tiempo fuera 👀 Tus exámenes no se han olvidado de ti.",
        "Tus próximos exámenes se acercan. ¿Seguimos? 📚",
        "No dejes que el trabajo se acumule. 5 minutos hoy ahorran horas mañana 🧠"
    ]
};

/**
 * Get a rotating message based on a log of sent notifications to avoid repetition
 */
function getUniqueMessage(type, subject, log = []) {
    const pool = MESSAGES[type] || ["¡Es hora de estudiar!"];
    // Use length of log to pick the next message
    const index = log.filter(l => l.type === type).length % pool.length;
    let msg = pool[index];
    if (subject) msg = msg.replace('[subject]', subject);
    return msg;
}

/**
 * Schedule exam reminders at 3d, 1d, and day-of
 */
export async function scheduleExamReminders(userId, exams, notificationLog = []) {
    if (Platform.OS === 'web' || !userId) return;

    // Cancel previous to avoid doubles (simplest way to sync)
    // In a real app we'd be more surgical but this is safe for a v1
    await Notifications.cancelAllScheduledNotificationsAsync();

    const now = new Date();

    for (const exam of exams) {
        if (exam.completed) continue;

        const examDate = new Date(exam.date);
        const diffDays = Math.ceil((examDate - now) / (1000 * 60 * 60 * 24));

        // Reminders: 3 days, 1 day, Today
        const targets = [
            { days: 3, type: 'exam_3days' },
            { days: 1, type: 'exam_1day' },
            { days: 0, type: 'exam_today' }
        ];

        for (const target of targets) {
            if (diffDays === target.days) {
                // Check if already sent in this specific instance (heuristic)
                const alreadySent = notificationLog.some(l =>
                    l.type === target.type &&
                    l.examId === exam.id &&
                    new Date(l.sentAt).toDateString() === now.toDateString()
                );

                if (!alreadySent) {
                    const body = getUniqueMessage(target.type, exam.subject, notificationLog);

                    await Notifications.scheduleNotificationAsync({
                        content: {
                            title: "Schedio: Recordatorio",
                            body,
                            data: { type: target.type, examId: exam.id },
                        },
                        trigger: { seconds: 1 }, // Immediate for this turn
                    });

                    // Log it in Firestore
                    await logNotification(userId, target.type, exam.id);
                }
            }
        }
    }
}

/**
 * Helper to log sent notifications in Firestore
 */
async function logNotification(userId, type, examId = null) {
    try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
            notificationLog: arrayUnion({
                type,
                examId,
                sentAt: new Date().toISOString()
            })
        });
    } catch (e) {
        console.error("Error logging notification:", e);
    }
}

/**
 * Schedule Panic Mode alert
 */
export async function schedulePanicModeAlert(userId, exam) {
    if (Platform.OS === 'web' || !userId) return;

    const body = getUniqueMessage('panic_mode', exam.subject);
    await Notifications.scheduleNotificationAsync({
        content: {
            title: "🔥 MODO PÁNICO",
            body,
            data: { type: 'panic_mode', examId: exam.id },
        },
        trigger: { seconds: 1 },
    });

    await logNotification(userId, 'panic_mode', exam.id);
}

/**
 * Schedule Inactivity Reminder
 */
export async function scheduleInactivityReminder(userId, lastLoginDate, hasActiveExams, log = []) {
    if (Platform.OS === 'web' || !userId || !hasActiveExams) return;

    const now = new Date();
    const lastLogin = new Date(lastLoginDate);
    const diffDays = Math.floor((now - lastLogin) / (1000 * 60 * 60 * 24));

    if (diffDays >= 2) {
        const body = getUniqueMessage('inactivity', null, log);
        await Notifications.scheduleNotificationAsync({
            content: {
                title: "Te echamos de menos",
                body,
                data: { type: 'inactivity' },
            },
            trigger: { seconds: 1 },
        });

        await logNotification(userId, 'inactivity');
    }
}
