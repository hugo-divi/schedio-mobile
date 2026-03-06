/**
 * notificationService.js
 * Handles web browser notifications for Schedio
 */

export const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
        console.log('This browser does not support desktop notification');
        return false;
    }

    if (Notification.permission === 'granted') {
        return true;
    }

    const permission = await Notification.requestPermission();
    return permission === 'granted';
};

export const sendNotification = (title, body, tag = 'general') => {
    if (Notification.permission === 'granted') {
        const options = {
            body,
            icon: '/icon-192.png', // Assuming we have a PWA icon or similar
            tag, // Prevents duplicate notifications with same tag
            vibrate: [200, 100, 200]
        };

        new Notification(title, options);
    }
};

/**
 * Checks for upcoming exams and sends notifications if needed
 * @param {Array} exams - List of upcoming exams
 * @param {string} lastCheckKey - LocalStorage key to debounce checks
 */
export const checkUpcomingExamNotifications = (exams) => {
    if (!exams || exams.length === 0) return;

    // Filter exams happening in the next 24 hours
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Filter exams happening tomorrow (roughly)
    const upcoming = exams.filter(exam => {
        const examDate = new Date(exam.date);
        return examDate > now && examDate <= tomorrow;
    });

    if (upcoming.length === 0) return;

    // Check if we already notified today to avoid spam
    const lastNotified = localStorage.getItem('schedio_last_exam_notification');
    const todayStr = now.toDateString();

    if (lastNotified === todayStr) return;

    // Send notification
    const count = upcoming.length;
    const title = count === 1 ? '¡Examen Mañana!' : `¡Tienes ${count} eventos mañana!`;
    const body = count === 1
        ? `Prepárate para: ${upcoming[0].name}`
        : `No olvides repasar para tus exámenes de mañana.`;

    sendNotification(title, body, 'exam-reminder');

    // Save state
    localStorage.setItem('schedio_last_exam_notification', todayStr);
};
