// Helper functions (Pure JS, no dependencies)
const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

const getDaysDiff = (date1, date2) => {
    const oneDay = 24 * 60 * 60 * 1000;
    const diff = Math.round((date2 - date1) / oneDay);
    return diff;
};

const formatDate = (date) => {
    return date.toISOString().split('T')[0];
};

/**
 * Intelligent Microplanning Algorithm (Pure JS Version)
 * Generates a phased study plan based on exam proximity.
 */
export const generateExamPlan = (exams, subjects) => {
    if (!exams || exams.length === 0) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let allPotentialTasks = [];

    exams.forEach(exam => {
        const examDate = new Date(exam.date);
        examDate.setHours(0, 0, 0, 0);

        const daysUntilExam = getDaysDiff(today, examDate);
        if (daysUntilExam < 0) return; // Past exam

        const subject = subjects.find(s => s.id === exam.subjectId);
        if (!subject) return;

        const isEmergency = daysUntilExam <= 2 && daysUntilExam > 0;

        for (let i = 0; i < daysUntilExam; i++) {
            const taskDate = addDays(today, i);
            const daysRemaining = getDaysDiff(taskDate, examDate);
            const dateKey = formatDate(taskDate);

            // Rest Days: No studying on Sundays if exam is > 7 days away
            if (daysRemaining > 7 && taskDate.getDay() === 0) continue;

            let taskType = null;
            let taskPhase = null;
            let taskText = "";
            let baseDuration = 30;
            let isPanicMode = false;
            let phasePriority = 0;

            if (isEmergency) {
                taskPhase = "MODO PÁNICO 🔥";
                taskType = "review";
                taskText = `Cramming: Esquemas y lectura rápida de ${subject.name}`;
                baseDuration = 45;
                isPanicMode = true;
                phasePriority = 100;
            } else if (daysRemaining <= 2) {
                taskPhase = "REPASO FINAL";
                taskType = "review";
                taskText = `Repaso relámpago de ${subject.name} (Conceptos Clave)`;
                baseDuration = 30;
                phasePriority = 80;
            } else if (daysRemaining <= 7) {
                taskPhase = "PRÁCTICA";
                taskType = "practice";
                taskText = `Ejercicios prácticos de ${subject.name}`;
                baseDuration = 45;
                phasePriority = 60;
                if (daysRemaining > 5 && i % 2 !== 0) continue;
            } else if (daysRemaining <= 14) {
                taskPhase = "ESTUDIO PROFUNDO";
                taskType = "study";
                taskText = `Estudio de temas complejos de ${subject.name}`;
                baseDuration = 50;
                phasePriority = 40;
                if (i % 3 !== 0) continue;
            } else {
                taskPhase = "INTRODUCCIÓN";
                taskType = "read";
                taskText = `Lectura ligera / Introducción a ${subject.name}`;
                baseDuration = 20;
                phasePriority = 20;
                if (i % 4 !== 0) continue;
            }

            if (taskType) {
                // Priority calculation:
                // Base priority from phase. 
                // Add difficulty bonus (if exists, assume 1-10 where 10 is hard). Subject.difficulty or 5.
                // Add grade penalty (if averageGrade is low, increase priority). Assume grade is 0-10.
                const diffBonus = (subject.difficulty || 5) * 2;
                const gradeBonus = subject.averageGrade ? (10 - subject.averageGrade) * 2 : 10;
                const totalPriority = phasePriority + diffBonus + gradeBonus - daysRemaining;

                const safeId = exam.id || `generated-${Math.random().toString(36).substr(2, 9)}`;
                allPotentialTasks.push({
                    id: `${safeId}-${dateKey}`,
                    examId: exam.id,
                    subjectId: subject.id,
                    subjectName: subject.name,
                    subjectColor: subject.color || '#4F46E5',
                    date: taskDate.toISOString(),
                    dateKey: dateKey,
                    text: taskText,
                    phase: taskPhase,
                    type: taskType,
                    completed: false,
                    duration: baseDuration,
                    isPanicMode: isPanicMode,
                    priority: totalPriority
                });
            }
        }
    });

    // Group by date
    const tasksByDate = {};
    allPotentialTasks.forEach(task => {
        if (!tasksByDate[task.dateKey]) tasksByDate[task.dateKey] = [];
        tasksByDate[task.dateKey].push(task);
    });

    // Process each day
    let finalTasks = [];
    Object.keys(tasksByDate).forEach(date => {
        let dayTasks = tasksByDate[date];

        // Sort by priority descending
        dayTasks.sort((a, b) => b.priority - a.priority);

        // Max 5 tasks per day total
        dayTasks = dayTasks.slice(0, 5);

        const taskCount = dayTasks.length;

        // Adjust durations based on load
        let durationMultiplier = 1;
        if (taskCount >= 4) durationMultiplier = 0.6; // Reduce by 40% if very heavy
        else if (taskCount === 3) durationMultiplier = 0.8; // Reduce by 20% if moderate

        dayTasks.forEach((task, index) => {
            // Apply duration reduction
            task.duration = Math.max(15, Math.round(task.duration * durationMultiplier));

            // Mark optional if it's beyond the 2nd task (unless it's panic mode)
            if (index >= 2 && !task.isPanicMode) {
                task.isOptional = true;
            } else {
                task.isOptional = false;
            }

            // Clean up temporary internal fields
            delete task.dateKey;
            delete task.priority;

            finalTasks.push(task);
        });
    });

    // Sort globally by date
    return finalTasks.sort((a, b) => new Date(a.date) - new Date(b.date));
};
