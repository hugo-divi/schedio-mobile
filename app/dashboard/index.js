import { View, Image } from 'react-native';
import { Text } from 'react-native';
import { ScrollView } from 'react-native';
import { TouchableOpacity } from 'react-native';
import { RefreshControl } from 'react-native';
import { StyleSheet } from 'react-native';
import { ActivityIndicator } from 'react-native';
import { Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
// DIAGNOSTIC LINE 14 - IF ERROR PERSISTS AT 14:8 THIS FILE IS NOT THE SOURCE
import { Settings } from 'lucide-react-native';
import { Flame } from 'lucide-react-native';
import { Zap } from 'lucide-react-native';
import { Calendar as CalendarIcon } from 'lucide-react-native';
import { ChevronRight } from 'lucide-react-native';
import { AlertCircle, CheckCircle, HelpCircle, Trophy } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../../theme/tokens';
import { db } from '../../services/firebase';
import { auth } from '../../services/firebase';
import { collection, query, where, getDocs, limit, doc, getDoc } from 'firebase/firestore';
import { checkDailyStreak } from '../../services/streaks';
import { getUpcomingExams, getPendingExams, createExam, updateExam, deleteExam } from '../../services/exams';
import { getUserSubjects } from '../../services/userData';
import { generateRecommendations } from '../../services/aiService';
import useAuthStore from '../../store/authStore';
import useThemeStore from '../../store/themeStore';
import usePreferencesStore from '../../store/preferencesStore';
import { scheduleExamReminders, scheduleInactivityReminder, schedulePanicModeAlert } from '../../services/notificationService';
import { GlassCard } from '../../components/GlassView';
import { Modal } from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import useUserStore from '../../store/userStore';
import Skeleton from '../../components/Skeleton';
import GradeModal from '../../components/GradeModal';
import StreakModal from '../../components/StreakModal';
import LevelProgressModal from '../../components/LevelProgressModal';
import MiniCalendar from '../../components/MiniCalendar';
import EventModal from '../../components/EventModal';
import DayOptionsModal from '../../components/DayOptionsModal';
import InfoTooltip from '../../components/InfoTooltip';
import GuidedTour from '../../components/GuidedTour';

// Main Dashboard component - Refactored for global subject sync
export default function Dashboard() {
    const router = useRouter();
    const { isDarkMode } = useThemeStore();
    const { autoGradePrompt } = usePreferencesStore();
    const { updateAverageGrade } = useUserStore();

    const theme = isDarkMode ? tokens.colors.dark : tokens.colors.light;

    const [refreshing, setRefreshing] = useState(false);
    const [userData, setUserData] = useState({ streak: 0, level: 3, xp: 0, rank: 'Aprendiz' });
    const [profile, setProfile] = useState(null);
    const [exams, setExams] = useState([]);
    const [pendingExams, setPendingExams] = useState([]);
    const { subjects, loadUserData } = useUserStore();
    const [microplans, setMicroplans] = useState([]);
    const [loading, setLoading] = useState(true);

    const scrollViewRef = useRef(null);
    const heroCardRef = useRef(null);
    const examsSectionRef = useRef(null);
    const pendingSectionRef = useRef(null);
    const calendarSectionRef = useRef(null);
    const [aiRecommendation, setAiRecommendation] = useState(null);
    const [aiLoading, setAiLoading] = useState(false);

    // Modals state
    const [streakModalOpen, setStreakModalOpen] = useState(false);
    const [levelModalOpen, setLevelModalOpen] = useState(false);
    const [eventModalVisible, setEventModalVisible] = useState(false);
    const [dayOptionsVisible, setDayOptionsVisible] = useState(false);
    const [gradeModalVisible, setGradeModalVisible] = useState(false);
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [examToGrade, setExamToGrade] = useState(null);
    const [eventsForSelectedDay, setEventsForSelectedDay] = useState([]);
    const [examsExpanded, setExamsExpanded] = useState(false);
    const [tourVisible, setTourVisible] = useState(false);
    const [rankCelebrationVisible, setRankCelebrationVisible] = useState(false);
    const [newRank, setNewRank] = useState('');
    const previousRankRef = useRef(null);

    const clearUser = useAuthStore(state => state.clearUser);

    const calculateDaysLeft = (date) => {
        const now = new Date();
        const examDate = new Date(date);

        // Reset hours to compare only days
        now.setHours(0, 0, 0, 0);
        examDate.setHours(0, 0, 0, 0);

        const diffTime = examDate - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Hoy';
        if (diffDays === 1) return 'Mañana';
        if (diffDays < 0) return 'Pasado';
        return `En ${diffDays} días`;
    };

    const fetchData = async () => {
        try {
            const user = auth.currentUser;
            if (!user) return;

            if (!refreshing) setLoading(true);

            // Fetch user profile
            const profileDoc = await getDoc(doc(db, 'users', user.uid));
            const profileData = profileDoc.exists() ? profileDoc.data() : null;
            setProfile(profileData);

            const [streakData, examsData, pendingExamsData] = await Promise.all([
                checkDailyStreak(user.uid),
                getUpcomingExams(user.uid, 20),
                getPendingExams(user.uid),
            ]);

            // Load subjects and user details via store
            await loadUserData(user.uid);

            // Fetch microplans from profile (which is now in store or fetched above)
            // Wait, we can get profileData from the store if we want, but we already fetched it locally at line 84.
            const microplansData = profileData?.microplans || [];

            setUserData({
                streak: streakData.currentStreak || 0,
                level: profileData?.gamification?.level || 1,
                xp: profileData?.gamification?.xp || 0,
                rank: profileData?.gamification?.rank || 'Aprendiz',
            });

            setExams(examsData || []);
            setPendingExams(pendingExamsData || []);
            setMicroplans(microplansData);

            // --- Notification Scheduling ---
            if (user && profileData) {
                const log = profileData.notificationLog || [];
                // 1. Exam Reminders (3d, 1d, 0d)
                scheduleExamReminders(user.uid, examsData || [], log);

                // 2. Inactivity Reminder
                const hasExams = (examsData && examsData.length > 0) || (pendingExamsData && pendingExamsData.length > 0);
                const lastLogin = profileData.lastLogin || new Date().toISOString();
                scheduleInactivityReminder(user.uid, lastLogin, hasExams, log);

                // 3. Panic Mode (if nearest exam is <= 2 days)
                const nearestExam = examsData?.[0];
                if (nearestExam) {
                    const examDate = new Date(nearestExam.date);
                    const now = new Date();
                    const diffDays = (examDate - now) / (1000 * 60 * 60 * 24);
                    if (diffDays <= 2 && diffDays >= 0) {
                        schedulePanicModeAlert(user.uid, nearestExam);
                    }
                }
            }

            // --- Rank Celebration Check ---
            const currentRank = profileData?.gamification?.rank;
            if (previousRankRef.current && currentRank && previousRankRef.current !== currentRank) {
                // Skip celebration if moving "down" (though unlikely in Schedio)
                // or if it's the very first load of the session
                setNewRank(currentRank);
                setRankCelebrationVisible(true);
            }
            previousRankRef.current = currentRank;

            loadAIRecommendation(profileData, examsData, streakData);

            // Auto-Prompt logic
            if (pendingExamsData && pendingExamsData.length > 0 && autoGradePrompt) {
                setTimeout(() => {
                    setExamToGrade(pendingExamsData[0]);
                    setGradeModalVisible(true);
                }, 1000);
            }
        } catch (error) {
            console.error("Error fetching dashboard data:", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const loadAIRecommendation = async (profileData, examsData, streakData) => {
        try {
            setAiLoading(true);
            const recommendations = await generateRecommendations({
                profile: profileData,
                exams: examsData,
                streak: streakData,
            });
            setAiRecommendation(recommendations?.mainRecommendation);
        } catch (error) {
            console.error('Error loading AI recommendation:', error);
            // Fallback recommendation
            if (examsData && examsData.length > 0) {
                const daysUntil = Math.ceil((new Date(examsData[0].date) - new Date()) / (1000 * 60 * 60 * 24));
                if (daysUntil <= 3) {
                    setAiRecommendation(`¡A por el examen de ${examsData[0].name} ! 🎯`);
                } else {
                    setAiRecommendation('¿Qué quieres aprender hoy? 🚀');
                }
            } else if (streakData?.currentStreak > 0) {
                setAiRecommendation(`🔥 ¡Llevas ${streakData.currentStreak} días de racha! Mantén el impulso.`);
            } else {
                setAiRecommendation('¡Comienza tu racha hoy! Una sesión de 25 minutos es todo lo que necesitas.');
            }
        } finally {
            setAiLoading(false);
        }
    };

    const examRefreshTrigger = useUserStore(state => state.examRefreshTrigger);

    useEffect(() => {
        fetchData();
    }, [examRefreshTrigger]);

    // Independent effect for the tour to prevent render loops
    useEffect(() => {
        if (profile && profile.isNewAccount && !profile.hasSeenTour) {
            setTourVisible(true);
        }
    }, [profile]);

    const handleTourComplete = async () => {
        setTourVisible(false);
        try {
            const user = auth.currentUser;
            if (user) {
                const { doc, updateDoc } = await import('firebase/firestore');
                await updateDoc(doc(db, "users", user.uid), {
                    hasSeenTour: true,
                    isNewAccount: false
                });
            }
        } catch (error) {
            console.error("Error updating tour status:", error);
        }
    };

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchData();
    }, []);

    const handleLogout = async () => {
        try {
            await auth.signOut();
            clearUser();
            router.replace('/login');
        } catch (error) {
            console.error('Error logging out:', error);
        }
    };

    // Calendar Handlers
    const handleDayClick = (date) => {
        const dateStr = date.toISOString().split('T')[0];
        const eventsOnDay = exams.filter(e => {
            const eDate = new Date(e.date).toISOString().split('T')[0];
            return eDate === dateStr;
        });

        setSelectedDate(date);

        if (eventsOnDay.length > 0) {
            setEventsForSelectedDay(eventsOnDay);
            setDayOptionsVisible(true);
        } else {
            setSelectedEvent(null);
            setEventModalVisible(true);
        }
    };

    const handleDeleteEvent = async (eventId) => {
        if (!eventId) {
            console.error("No eventId provided for deletion");
            return;
        }
        try {
            await deleteExam(eventId);
            setEventModalVisible(false);
            setDayOptionsVisible(false);
            fetchData();
            if (Platform.OS !== 'web') {
                const Haptics = require('expo-haptics');
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
        } catch (error) {
            console.error("Error deleting event:", error);
            Alert.alert("Error", "No se pudo eliminar el evento.");
        }
    };

    const handleSaveEvent = async (eventData) => {
        try {
            const user = auth.currentUser;
            if (!user) return;

            const newEvent = {
                ...eventData,
                userId: user.uid,
                priority: 5,
                completed: false,
            };

            if (selectedEvent) {
                await updateExam(selectedEvent.id, newEvent);
            } else {
                await createExam(newEvent);
            }

            // Refresh data
            fetchData();
        } catch (error) {
            console.error("Error saving event:", error);
            Alert.alert("Error", "No se pudo guardar el evento.");
        }
    };

    // Grading Handlers
    const handleOpenGradeModal = (exam) => {
        setExamToGrade(exam);
        setGradeModalVisible(true);
    };

    const handleSaveGrade = async (examId, grade) => {
        if (!examId) {
            console.error("Cannot save grade: examId is null");
            Alert.alert("Error", "Ocurrió un error al identificar el examen. Intenta recargar.");
            return;
        }

        try {
            await updateExam(examId, {
                grade: grade,
                completed: true
            });

            // 2. Trigger Average Recalculation (Global & Subject)
            const user = auth.currentUser;
            if (user) {
                await updateAverageGrade(user.uid);
            }

            await fetchData();
        } catch (error) {
            console.error("Error saving grade:", error);
            Alert.alert("Error", "No se pudo guardar la nota.");
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            {/* Header - Fixed at top */}
            <View style={[styles.header, { backgroundColor: theme.background }]}>
                <View style={{
                    width: 144,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: '#FFF',
                    justifyContent: 'center',
                    alignItems: 'center',
                    overflow: 'hidden'
                }}>
                    <Image
                        source={require('../../assets/images/schedio-icon.png')}
                        style={{ width: 130, height: 42 }}
                        resizeMode="cover"
                    />
                </View>
                <View style={styles.headerRight}>
                    <Text style={styles.greeting}>Hola, {profile?.displayName || 'Usuario'}</Text>
                    <TouchableOpacity
                        style={[styles.iconButton, { backgroundColor: theme.cardSecondary, marginRight: 8 }]}
                        onPress={() => setTourVisible(true)}
                    >
                        <HelpCircle size={20} color={tokens.colors.primary} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.iconButton, { backgroundColor: theme.cardSecondary }]}
                        onPress={() => router.push('/settings')}
                    >
                        <Settings size={20} color="#8E8E93" />
                    </TouchableOpacity>

                    {/* Plus Button */}
                    <TouchableOpacity
                        style={styles.plusButton}
                        onPress={() => router.push('/plus')}
                    >
                        <LinearGradient
                            colors={['#FFD60A', '#FF9F0A']}
                            style={styles.plusGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                        >
                            <Text style={styles.plusText}>PRIME</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                ref={scrollViewRef}
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.colors.primary} />}
            >

                {/* Hero Card */}
                <View ref={heroCardRef} style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                    {loading ? (
                        <>
                            <Skeleton width={120} height={24} style={{ marginBottom: 20 }} />
                            <Skeleton width="80%" height={32} style={{ marginBottom: 8 }} />
                            <Skeleton width="60%" height={32} style={{ marginBottom: 8 }} />
                            <Skeleton width="40%" height={16} style={{ marginBottom: 24 }} />
                            <Skeleton width="100%" height={50} borderRadius={25} />
                        </>
                    ) : (
                        <>
                            {/* Badges - Clickable */}
                            <View style={styles.badgesRow}>
                                <View style={styles.badgeWrapper}>
                                    <TouchableOpacity
                                        style={[
                                            styles.badge,
                                            { backgroundColor: isDarkMode ? 'rgba(255, 159, 10, 0.15)' : 'rgba(255, 159, 10, 0.1)', borderColor: 'rgba(255, 159, 10, 0.3)' }
                                        ]}
                                        onPress={() => setStreakModalOpen(true)}
                                        activeOpacity={0.7}
                                    >
                                        <Flame size={14} color="#FF9F0A" fill="#FF9F0A" />
                                        <Text style={[styles.badgeText, { color: theme.text }]}>{userData.streak} días</Text>
                                    </TouchableOpacity>
                                    <InfoTooltip
                                        title="Tu Racha 🔥"
                                        content="Mantén tu racha estudiando al menos 5 minutos cada día. ¡No dejes que se apague!"
                                        style={styles.floatingHelp}
                                        iconSize={14}
                                    />
                                </View>

                                <View style={styles.badgeWrapper}>
                                    <TouchableOpacity
                                        style={[
                                            styles.badge,
                                            { backgroundColor: isDarkMode ? 'rgba(74, 144, 226, 0.15)' : 'rgba(74, 144, 226, 0.1)', borderColor: 'rgba(74, 144, 226, 0.3)' }
                                        ]}
                                        onPress={() => setLevelModalOpen(true)}
                                        activeOpacity={0.7}
                                    >
                                        <Zap size={14} color="#4A90E2" fill="#4A90E2" />
                                        <Text style={[styles.badgeText, { color: theme.text }]}>Nivel {userData.level}</Text>
                                    </TouchableOpacity>
                                    <InfoTooltip
                                        title="Nivel y XP ⚡"
                                        content="Ganas XP por cada minuto de estudio y por completar objetivos. ¡Sube de nivel para desbloquear rangos!"
                                        style={styles.floatingHelp}
                                        iconSize={14}
                                    />
                                </View>
                            </View>

                            {/* AI-Generated Title */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                {aiLoading ? (
                                    <>
                                        <Text style={[styles.heroTitle, { color: theme.text }]}>Analizando tu día...</Text>
                                        <ActivityIndicator size="small" color={theme.textSecondary} style={{ alignSelf: 'flex-start', marginBottom: 16 }} />
                                    </>
                                ) : (
                                    <Text style={[styles.heroTitle, { color: theme.text, flex: 1 }]}>{aiRecommendation || '¿Qué quieres aprender hoy? 🚀'}</Text>
                                )}
                                <InfoTooltip
                                    title="Recomendación IA 🧠"
                                    content="Schedio Prime analiza tus próximos exámenes y tu historial para sugerirte qué estudiar en cada momento."
                                    iconSize={20}
                                />
                            </View>
                            <Text style={styles.heroSubtitle}>
                                {exams.length > 0 ? 'Es lo mas urgente ahora mismo' : 'Comienza una sesión de estudio'}
                            </Text>

                            {/* CTA Button - Navigate to session */}
                            <TouchableOpacity
                                style={styles.ctaButton}
                                onPress={() => router.push('/dashboard/study')}
                                activeOpacity={0.8}
                            >
                                <Zap size={20} color={isDarkMode ? "#000000" : "#FFFFFF"} strokeWidth={2.5} fill={isDarkMode ? "#000000" : "#FFFFFF"} />
                                <Text style={[styles.ctaButtonText, { color: isDarkMode ? "#000000" : "#FFFFFF" }]}>Estudiar ahora</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>

                {/* Próximos exámenes */}
                <View ref={examsSectionRef} style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <View style={styles.sectionTitleRow}>
                            <CalendarIcon size={18} color={theme.text} />
                            <Text style={[styles.sectionTitle, { color: theme.text }]}>Próximos exámenes</Text>
                            <InfoTooltip
                                title="Gestión de Exámenes 🗓️"
                                content="Mantén pulsado cualquier examen para editarlo o eliminarlo. Pulsa para ver el plan de estudio."
                                style={{ marginLeft: 8 }}
                            />
                        </View>
                        {!loading && exams.length > 3 && (
                            <TouchableOpacity onPress={() => setExamsExpanded(!examsExpanded)}>
                                <Text style={styles.sectionLink}>
                                    {examsExpanded ? 'Ver menos' : 'Ver más'}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {loading ? (
                        <>
                            <Skeleton width="100%" height={70} style={{ marginBottom: 12 }} borderRadius={16} />
                            <Skeleton width="100%" height={70} style={{ marginBottom: 12 }} borderRadius={16} />
                        </>
                    ) : exams.length === 0 ? (
                        <View style={[styles.emptyState, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <CalendarIcon size={48} color={theme.textSecondary} strokeWidth={1.5} />
                            <Text style={[styles.emptyStateTitle, { color: theme.text }]}>No hay exámenes próximos</Text>
                            <Text style={styles.emptyStateText}>
                                Agrega tus exámenes y tareas para mantener tu calendario organizado
                            </Text>
                        </View>
                    ) : (
                        (examsExpanded ? exams : exams.slice(0, 3)).map((exam, index) => {
                            const daysLeft = calculateDaysLeft(exam.date);
                            return (
                                <TouchableOpacity
                                    key={exam.id}
                                    style={[styles.examCard, { backgroundColor: theme.card, borderColor: theme.border }]}
                                    onPress={() => router.push({
                                        pathname: '/dashboard/plans',
                                        params: { highlightId: exam.id }
                                    })}
                                    onLongPress={() => {
                                        setSelectedEvent(exam);
                                        setSelectedDate(new Date(exam.date));
                                        setEventModalVisible(true);
                                    }}
                                >
                                    <View style={styles.examLeft}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                            {/* Indicator dot */}
                                            <View style={{
                                                width: 8, height: 8, borderRadius: 4,
                                                backgroundColor: subjects.find(s => s.id === exam.subjectId)?.color || '#4A90E2'
                                            }} />
                                            <Text style={[styles.examTitle, { color: theme.text }]}>{exam.name}</Text>
                                        </View>
                                        <Text style={styles.examDate}>
                                            {new Date(exam.date).toLocaleDateString('es-ES', {
                                                day: 'numeric',
                                                month: 'long'
                                            })}
                                        </Text>
                                    </View>

                                    {/* Days Left Badge */}
                                    <View style={[styles.daysLeftBadge, { backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }]}>
                                        <Text style={[styles.daysLeftText, { color: theme.text }]}>{daysLeft}</Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })
                    )}
                </View>

                {/* Pendientes de Calificar Section */}
                {!loading && pendingExams.length > 0 && (
                    <View ref={pendingSectionRef} style={styles.section}>
                        <View style={[styles.sectionHeader, { marginBottom: 12 }]}>
                            <View style={styles.sectionTitleRow}>
                                <AlertCircle size={18} color="#FF9F0A" />
                                <Text style={[styles.sectionTitle, { color: theme.text }]}>Pendientes de Calificar</Text>
                                <InfoTooltip
                                    title="Notas y Promedios ✍️"
                                    content="Pon nota a tus exámenes pasados para que Schedio pueda calcular tu media y ajustar tus planes de estudio."
                                    style={{ marginLeft: 8 }}
                                />
                            </View>
                        </View>

                        {pendingExams.map((exam) => (
                            <TouchableOpacity
                                key={exam.id}
                                style={[
                                    styles.pendingCard,
                                    { backgroundColor: '#1C1C1E', borderColor: theme.border }
                                ]}
                                onLongPress={() => {
                                    Alert.alert(
                                        'Eliminar examen',
                                        `¿Estás seguro de que quieres eliminar "${exam.name}"?`,
                                        [
                                            { text: 'Cancelar', style: 'cancel' },
                                            {
                                                text: 'Eliminar',
                                                style: 'destructive',
                                                onPress: async () => {
                                                    try {
                                                        const { deleteExam } = await import('../../services/exams');
                                                        await deleteExam(exam.id);
                                                        fetchData();
                                                    } catch (e) {
                                                        Alert.alert('Error', 'No se pudo eliminar el examen.');
                                                    }
                                                }
                                            }
                                        ]
                                    );
                                }}
                                delayLongPress={500}
                                activeOpacity={0.9}
                            >
                                {/* Orange left border indicator */}
                                <View style={styles.pendingIndicator} />

                                <View style={styles.pendingContent}>
                                    <Text style={[styles.pendingTitle, { color: '#FFFFFF' }]}>{exam.name}</Text>
                                    <Text style={styles.pendingSubtitle}>
                                        {subjects.find(s => s.id === exam.subjectId)?.name || 'Asignatura'} • Finalizó el {new Date(exam.date).toLocaleDateString('es-ES')}
                                    </Text>
                                </View>

                                <TouchableOpacity
                                    style={styles.gradeButton}
                                    onPress={() => handleOpenGradeModal(exam)}
                                >
                                    <Text style={styles.gradeButtonText}>Poner Nota</Text>
                                </TouchableOpacity>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {/* Monthly Calendar */}
                <View ref={calendarSectionRef} style={[styles.section, { marginBottom: 32 }]}>
                    <Text style={[styles.sectionTitle, { marginBottom: 16, color: theme.text }]}>Tu Calendario</Text>
                    {loading ? (
                        <Skeleton width="100%" height={300} borderRadius={20} />
                    ) : (
                        <MiniCalendar
                            exams={exams}
                            subjects={subjects}
                            onDayClick={handleDayClick}
                            isDarkMode={isDarkMode}
                        />
                    )}
                </View>

            </ScrollView>

            {tourVisible && (
                <GuidedTour
                    onComplete={handleTourComplete}
                    tourRefs={{ scrollViewRef, heroCardRef, examsSectionRef, pendingSectionRef, calendarSectionRef }}
                    hasPendingExams={pendingExams.length > 0}
                />
            )}

            {/* Modals */}
            <StreakModal
                visible={streakModalOpen}
                onClose={() => setStreakModalOpen(false)}
                currentStreak={userData.streak}
                studyHistory={[]}
            />

            <LevelProgressModal
                visible={levelModalOpen}
                onClose={() => setLevelModalOpen(false)}
                gamification={{
                    level: userData.level,
                    xp: userData.xp,
                    rank: userData.rank,
                }}
            />

            <EventModal
                visible={eventModalVisible}
                onClose={() => setEventModalVisible(false)}
                selectedDate={selectedDate}
                existingEvent={selectedEvent}
                onSave={handleSaveEvent}
                onDelete={handleDeleteEvent}
                subjects={subjects}
            />

            <DayOptionsModal
                visible={dayOptionsVisible}
                onClose={() => setDayOptionsVisible(false)}
                date={selectedDate}
                events={eventsForSelectedDay}
                onAddNew={() => {
                    setDayOptionsVisible(false); // Close options
                    setSelectedEvent(null); // Clear selected event
                    setTimeout(() => setEventModalVisible(true), 100); // Open new event modal
                }}
                onEditEvent={(event) => {
                    setDayOptionsVisible(false); // Close options
                    setSelectedEvent(event); // Set event to edit
                    setTimeout(() => setEventModalVisible(true), 100); // Open edit modal
                }}
            />

            <GradeModal
                visible={gradeModalVisible}
                onClose={() => setGradeModalVisible(false)}
                exam={examToGrade}
                onSave={handleSaveGrade}
            />

            {/* Rank Celebration Modal */}
            <Modal
                visible={rankCelebrationVisible}
                transparent={true}
                animationType="fade"
            >
                <View style={styles.celebrationOverlay}>
                    <GlassCard style={styles.celebrationCard}>
                        <Trophy size={60} color="#FFD700" style={{ marginBottom: 16 }} />
                        <Text style={styles.celebrationTitle}>¡NUEVO RANGO!</Text>
                        <Text style={styles.celebrationRank}>{newRank}</Text>
                        <Text style={styles.celebrationText}>
                            Tu esfuerzo está dando sus frutos. ¡Sigue así para desbloquear más ventajas!
                        </Text>
                        <TouchableOpacity
                            style={styles.celebrationButton}
                            onPress={() => setRankCelebrationVisible(false)}
                        >
                            <Text style={styles.celebrationButtonText}>¡Vamos!</Text>
                        </TouchableOpacity>
                    </GlassCard>
                    {rankCelebrationVisible && (
                        <ConfettiCannon
                            count={200}
                            origin={{ x: -10, y: 0 }}
                            fadeOut={true}
                        />
                    )}
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loadingContainer: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollView: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 12, // Reduced top padding
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingTop: 60, // Fixed header top padding
        paddingBottom: 20,
        zIndex: 10,
    },
    celebrationOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 30,
    },
    celebrationCard: {
        width: '100%',
        padding: 32,
        alignItems: 'center',
        borderRadius: 32,
    },
    celebrationTitle: {
        fontSize: 14,
        fontWeight: '900',
        color: '#FFD700',
        letterSpacing: 2,
        marginBottom: 8,
    },
    celebrationRank: {
        fontSize: 32,
        fontWeight: '900',
        color: '#FFFFFF',
        textAlign: 'center',
        marginBottom: 16,
    },
    celebrationText: {
        fontSize: 16,
        color: '#CCCCCC',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 32,
    },
    celebrationButton: {
        backgroundColor: '#FFFFFF',
        paddingVertical: 16,
        paddingHorizontal: 48,
        borderRadius: 100,
    },
    celebrationButtonText: {
        color: '#000000',
        fontSize: 16,
        fontWeight: '800',
    },
    logo: {
        fontSize: 24,
        fontWeight: '700',
        fontFamily: tokens.typography.families.sans,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    greeting: {
        fontSize: 13,
        color: '#8E8E93',
        fontFamily: tokens.typography.families.sans,
    },
    iconButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    logoutText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#4A90E2',
    },
    plusButton: {
        shadowColor: '#FF9F0A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    plusGradient: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 100,
    },
    plusText: {
        fontSize: 12,
        fontWeight: '800',
        color: '#000000',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    badgeWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    floatingHelp: {
        opacity: 0.8,
    },
    heroCard: {
        borderRadius: 24,
        padding: 24,
        marginBottom: 32,
        borderWidth: 1,
    },
    badgesRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 20,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        borderWidth: 1,
    },
    badgeBlue: {
        // These styles are overridden by inline style based on isDarkMode
    },
    badgeText: {
        fontSize: 12,
        fontWeight: '700',
    },
    heroTitle: {
        fontSize: 28,
        fontWeight: '700',
        marginBottom: 8,
        lineHeight: 34,
    },
    heroSubtitle: {
        fontSize: 15,
        color: '#8E8E93',
        marginBottom: 24,
    },
    ctaButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#4A90E2',
        paddingVertical: 16,
        borderRadius: 100,
    },
    ctaButtonText: {
        fontSize: 16,
        fontWeight: '700',
    },
    section: {
        marginBottom: 32,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        fontFamily: tokens.typography.families.sans,
    },
    sectionLink: {
        fontSize: 14,
        fontWeight: '600',
        color: '#4A90E2',
    },
    emptyState: {
        borderRadius: 20,
        padding: 32,
        alignItems: 'center',
        borderWidth: 1,
    },
    emptyStateTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginTop: 16,
        marginBottom: 8,
    },
    emptyStateText: {
        fontSize: 14,
        color: '#8E8E93',
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 20,
    },
    emptyStateButton: {
        backgroundColor: '#4A90E2',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 100,
    },
    emptyStateButtonText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#000000',
    },
    examCard: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
    },
    examLeft: {
        flex: 1,
    },
    examTitle: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    examDate: {
        fontSize: 13,
        color: '#8E8E93',
    },
    daysLeftBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 100,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    daysLeftText: {
        fontSize: 13,
        fontWeight: '600',
    },
    badgeWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    floatingHelp: {
        opacity: 0.8,
    },
    // Pending Grading Styles
    pendingCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
        overflow: 'hidden',
        position: 'relative',
    },
    pendingIndicator: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        width: 4,
        backgroundColor: '#FF9F0A',
    },
    pendingContent: {
        flex: 1,
        paddingLeft: 12,
    },
    pendingTitle: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 4,
    },
    pendingSubtitle: {
        fontSize: 13,
        color: '#8E8E93',
    },
    gradeButton: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: '#4A90E2',
        backgroundColor: 'rgba(74, 144, 226, 0.1)',
    },
    gradeButtonText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#4A90E2',
    },
});
