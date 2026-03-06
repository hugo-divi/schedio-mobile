









import { View } from 'react-native';
import { Text } from 'react-native';
import { ScrollView } from 'react-native';
import { TouchableOpacity } from 'react-native';
import { TextInput } from 'react-native';
import { StyleSheet } from 'react-native';
import { Platform } from 'react-native';
import { ImageBackground } from 'react-native';
import { Dimensions } from 'react-native';
import { Modal } from 'react-native';
import { Animated } from 'react-native';
import { ActivityIndicator } from 'react-native';
import { useState } from 'react';
// SHIFTED LINE 14
import { useEffect } from 'react';
import { useRef } from 'react';
import { useRouter } from 'expo-router';
import { useNavigation } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Play, Pause, Square, Check, Plus, Circle, Clock, Trophy, X, BookOpen } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';
import useAuthStore from '../../store/authStore';
import useThemeStore from '../../store/themeStore';
import useUserStore from '../../store/userStore';
import { db } from '../../services/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Circle as SvgCircle } from 'react-native-svg';
import Svg from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import Slider from '@react-native-community/slider';

const { width } = Dimensions.get('window');

// Messages
const CONGRATS_MESSAGES = [
    "¡Increíble trabajo!",
    "Sesión legendaria.",
    "¡Lo has logrado!",
    "Gran enfoque hoy.",
    "Imparable."
];

// Simple Confetti Component
const ConfettiPiece = ({ index }) => {
    const anim = useRef(new Animated.Value(-100)).current;

    useEffect(() => {
        const delay = Math.random() * 1000;
        const duration = 2000 + Math.random() * 1000;

        Animated.loop(
            Animated.sequence([
                Animated.timing(anim, {
                    toValue: Dimensions.get('window').height,
                    duration: duration,
                    delay: delay,
                    useNativeDriver: true // Change to false if transform issues occur depending on RN version for layout props, but transform is fine
                }),
                Animated.timing(anim, {
                    toValue: -100,
                    duration: 0,
                    useNativeDriver: true
                })
            ])
        ).start();
    }, []);

    const left = Math.random() * Dimensions.get('window').width;
    const bg = [tokens.colors.primary, tokens.colors.secondary, '#FFD700', '#FF3B30'][index % 4];

    return (
        <Animated.View
            style={{
                position: 'absolute',
                top: 0,
                left: left,
                width: 10,
                height: 10,
                backgroundColor: bg,
                borderRadius: 5,
                transform: [{ translateY: anim }]
            }}
        />
    );
};

export default function StudySessionScreen() {
    useKeepAwake(); // Prevent screen from sleeping
    const router = useRouter();
    const navigation = useNavigation();
    const { user } = useAuthStore();
    // Use theme store to restore tab bar style correctly
    const { isDarkMode } = useThemeStore();
    // Wait, useThemeStore is not imported. Let's import it.

    // Data From Store
    const { subjects, loading: subjectsLoading } = useUserStore();

    // Session State
    const [step, setStep] = useState('setup'); // setup, timer, summary
    const [selectedSubject, setSelectedSubject] = useState(null);
    const [duration, setDuration] = useState(25);
    const [sessionGoals, setSessionGoals] = useState([]);
    const [newGoalText, setNewGoalText] = useState('');

    // Timer State
    const [timeLeft, setTimeLeft] = useState(25 * 60);
    const [isActive, setIsActive] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [isZenMode, setIsZenMode] = useState(false);
    const timerRef = useRef(null);

    // Stop Overlay State (View based for instant speed)
    const [isStopOverlayVisible, setIsStopOverlayVisible] = useState(false);

    // Summary State
    const [sessionStats, setSessionStats] = useState(null);
    const [sessionNotes, setSessionNotes] = useState('');

    // State for route params
    const { autoStart, subjectId, duration: paramDuration, goal, taskId } = router.params || {};

    // ...

    useEffect(() => {
        if (autoStart === 'true' && subjects.length > 0 && subjectId) {
            // Find subject
            const sub = subjects.find(s => s.id === subjectId);
            if (sub) {
                setSelectedSubject(sub.id);
                if (paramDuration) setDuration(parseInt(paramDuration));
                if (goal) setSessionGoals([{ id: Date.now(), text: goal, completed: false }]);

                // Small delay to ensure state is set before starting
                setTimeout(() => {
                    handleStart();
                }, 500);
            }
        }
    }, [autoStart, subjectId, subjects]);

    useEffect(() => {
        if (user?.uid && subjects.length === 0) {
            useUserStore.getState().loadUserData(user.uid);
        }
    }, [user?.uid]);

    // Tab Bar Visibility for Zen Mode
    useEffect(() => {
        const theme = isDarkMode ? tokens.colors.dark : tokens.colors.light;

        if (isZenMode || step === 'timer') {
            navigation.setOptions({
                tabBarStyle: { display: 'none' },
                headerShown: false
            });
        } else {
            // Restore explicit styles to avoid white bar issue
            navigation.setOptions({
                tabBarStyle: {
                    height: 85,
                    paddingBottom: 25,
                    backgroundColor: theme.tabBar,
                    elevation: 0,
                    borderTopWidth: 0,
                    shadowColor: 'transparent',
                    shadowOpacity: 0,
                    borderTopColor: 'transparent',
                    display: 'flex'
                },
                headerShown: false
            });
        }
    }, [isZenMode, step, navigation, isDarkMode]);

    // Timer Logic
    useEffect(() => {
        if (isActive && !isPaused && timeLeft > 0) {
            timerRef.current = setInterval(() => {
                setTimeLeft((prev) => prev - 1);
            }, 1000);
        } else if (timeLeft === 0 && isActive) {
            handleComplete();
        }
        return () => clearInterval(timerRef.current);
    }, [isActive, isPaused, timeLeft]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const getDurationMessage = (mins) => {
        if (mins <= 30) return "Estudio de chill 🍵";
        if (mins <= 45) return "Alto foco ⚡";
        if (mins <= 60) return "Deep work 🧠";
        return "¡Modo Schedio activado! 🚀";
    };

    const handleStart = () => {
        if (!selectedSubject) return;
        setTimeLeft(duration * 60);
        setIsActive(true);
        setIsPaused(false);
        setStep('timer');
        setIsZenMode(true);
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    };

    const handleStopPress = () => {
        // Pausing visually might be distracting if the user cancels, 
        // but to "Stop" we typically pause.
        // Let's NOT pause the timer automatically to avoid UI jumps, unless they confirm.
        // Or if we do pause, we don't show the pause layout, just the modal.
        setIsPaused(true);
        setIsStopOverlayVisible(true);
    };

    const confirmStop = () => {
        setIsStopOverlayVisible(false);
        handleComplete(true);
    };

    const cancelStop = () => {
        setIsStopOverlayVisible(false);
        setIsPaused(false); // Resume
    };

    // Animation Values
    const scaleAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    const handleComplete = (early = false) => {
        clearInterval(timerRef.current);
        setIsActive(false);
        setIsZenMode(false);
        setIsPaused(false);

        const totalTime = duration * 60;
        const timeSpent = totalTime - timeLeft;
        const timeInMins = Math.floor(timeSpent / 60);
        const subject = subjects.find(s => s.id === selectedSubject);
        const completedGoalsCount = sessionGoals.filter(g => g.completed).length;
        const xpEarned = timeInMins * 10 + (completedGoalsCount * 50);

        setSessionStats({
            subject: subject?.name || 'Estudio',
            subjectColor: subject?.color || tokens.colors.primary,
            timeDeducted: timeInMins,
            completed: !early,
            xpEarned,
            completedGoalsCount,
            totalGoals: sessionGoals.length,
            message: CONGRATS_MESSAGES[Math.floor(Math.random() * CONGRATS_MESSAGES.length)] // Fix stable message
        });

        if (early) {
            setStep('summary');
        } else {
            setStep('celebration');
            // Trigger Animation
            Animated.sequence([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    friction: 4,
                    useNativeDriver: true, // Scale is supported by native driver
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 500,
                    useNativeDriver: true,
                })
            ]).start();

            // Auto transition
            setTimeout(() => {
                setStep('summary');
            }, 3500);
        }

        if (!early && Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        // Auto-Complete Task if linked
        if (!early && taskId) {
            const { completeMicroTask } = useUserStore.getState();
            completeMicroTask(user.uid, taskId);
        }
    };

    const addGoal = () => {
        if (!newGoalText.trim()) return;
        setSessionGoals([...sessionGoals, { id: Date.now(), text: newGoalText, completed: false }]);
        setNewGoalText('');
    };

    const toggleGoal = (id) => {
        setSessionGoals(sessionGoals.map(g =>
            g.id === id ? { ...g, completed: !g.completed } : g
        ));
        if (Platform.OS !== 'web') Haptics.selectionAsync();
    };

    // --- Render Components ---

    const renderSetup = () => (
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
            <Text style={styles.title}>Sesión de estudio</Text>

            <Text style={styles.label}>ELIGE MATERIA</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subjectScroll}>
                {subjectsLoading ? (
                    <View style={styles.emptySubjectsContainer}>
                        <ActivityIndicator color={tokens.colors.primary} />
                    </View>
                ) : subjects.length === 0 ? (
                    <TouchableOpacity
                        style={styles.emptySubjectsContainer}
                        onPress={() => router.push('/dashboard/profile')}
                    >
                        <Plus size={20} color={tokens.colors.textSecondary} />
                        <Text style={styles.emptySubjectsText}>Añadir Materias</Text>
                    </TouchableOpacity>
                ) : (
                    subjects.map(sub => (
                        <TouchableOpacity
                            key={sub.id}
                            style={[
                                styles.subjectCard,
                                selectedSubject === sub.id && { borderColor: '#4A90E2', backgroundColor: '#4A90E210' }
                            ]}
                            onPress={() => setSelectedSubject(sub.id)}
                        >
                            <View style={[styles.subjectIcon, { backgroundColor: sub.color }]}>
                                <Text style={styles.subjectInitial}>{sub.name.charAt(0)}</Text>
                            </View>
                            <Text style={[
                                styles.subjectName,
                                selectedSubject === sub.id && { color: '#4A90E2', fontWeight: 'bold' }
                            ]}>{sub.name}</Text>
                            {selectedSubject === sub.id && (
                                <View style={[styles.checkBadge, { backgroundColor: '#4A90E2' }]}>
                                    <Check size={10} color="#FFF" />
                                </View>
                            )}
                        </TouchableOpacity>
                    ))
                )}
            </ScrollView>

            <Text style={[styles.label, { marginTop: 24, marginBottom: 16 }]}>DURACIÓN</Text>
            <View style={styles.sliderWrapper}>
                <Text style={styles.durationLabelCentered}>
                    {duration}<Text style={styles.durationUnit}> min</Text>
                </Text>
                <Slider
                    style={{ width: '100%', height: 40 }}
                    minimumValue={15}
                    maximumValue={120}
                    step={5} // 5 min steps
                    value={duration}
                    onValueChange={setDuration}
                    minimumTrackTintColor={tokens.colors.primary}
                    maximumTrackTintColor={tokens.colors.border}
                    thumbTintColor={tokens.colors.primary}
                />
                <Text style={styles.durationMessage}>{getDurationMessage(duration)}</Text>
            </View>

            <Text style={[styles.label, { marginTop: 20 }]}>OBJETIVOS</Text>
            <View style={styles.inputRow}>
                <TextInput
                    style={styles.input}
                    placeholder="Añadir objetivo..."
                    placeholderTextColor={tokens.colors.textSecondary}
                    value={newGoalText}
                    onChangeText={setNewGoalText}
                    onSubmitEditing={addGoal}
                />
                <TouchableOpacity style={styles.addBtn} onPress={addGoal}>
                    <Plus size={24} color="#FFF" />
                </TouchableOpacity>
            </View>
            <View style={styles.goalsList}>
                {sessionGoals.map(g => (
                    <View key={g.id} style={styles.goalItem}>
                        <Circle size={16} color={tokens.colors.primary} />
                        <Text style={styles.goalText}>{g.text}</Text>
                        <TouchableOpacity onPress={() => setSessionGoals(doc => doc.filter(x => x.id !== g.id))}>
                            <X size={16} color={tokens.colors.textSecondary} />
                        </TouchableOpacity>
                    </View>
                ))}
            </View>

            <TouchableOpacity
                style={[styles.startBtn, !selectedSubject && styles.disabledBtn]}
                disabled={!selectedSubject}
                onPress={handleStart}
            >
                <Text style={styles.startBtnText}>Empezar sesión</Text>
                <Play size={20} color="#FFF" fill="#FFF" />
            </TouchableOpacity>
        </ScrollView>
    );

    const renderTimer = () => {
        const progress = 100 - (timeLeft / (duration * 60)) * 100; // 0 to 100
        const radius = width * 0.35;
        const circumference = 2 * Math.PI * radius;
        const strokeDashoffset = circumference - (progress / 100) * circumference;

        // FIXED COLOR: Use Blue (primary) always, regardless of subject
        const activeColor = tokens.colors.primary; // #4A90E2

        return (
            <View style={styles.timerContainer}>
                <StatusBar hidden={isZenMode} />

                <View style={{ height: 60 }} />

                <View style={styles.circleContainer}>
                    <Svg height={radius * 2 + 20} width={radius * 2 + 20}>
                        <SvgCircle
                            cx={radius + 10}
                            cy={radius + 10}
                            r={radius}
                            stroke={tokens.colors.border}
                            strokeWidth="10"
                            fill="transparent"
                        />
                        <SvgCircle
                            cx={radius + 10}
                            cy={radius + 10}
                            r={radius}
                            stroke={activeColor}
                            strokeWidth="10"
                            fill="transparent"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                            rotation="-90"
                            origin={`${radius + 10}, ${radius + 10}`}
                        />
                    </Svg>
                    <View style={styles.timeTextContainer}>
                        <Text style={styles.timeDisplay}>{formatTime(timeLeft)}</Text>
                        <Text style={styles.timeLabel}>{isPaused ? 'PAUSADO' : 'FOCUS'}</Text>
                        {/* SUBJECT NAME REMOVED as requested */}
                    </View>
                </View>

                {/* Goals Overlay in Timer */}
                <View style={styles.timerGoals}>
                    <Text style={styles.timerGoalsTitle}>Objetivos</Text>
                    <ScrollView style={{ maxHeight: 150 }}>
                        {sessionGoals.map(g => (
                            <TouchableOpacity key={g.id} style={styles.timerGoalItem} onPress={() => toggleGoal(g.id)}>
                                <View style={[styles.checkbox, g.completed && { backgroundColor: activeColor, borderColor: activeColor }]}>
                                    {g.completed && <Check size={12} color="#FFF" />}
                                </View>
                                <Text style={[styles.timerGoalText, g.completed && styles.completedText]}>{g.text}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* Controls */}
                <View style={styles.controls}>
                    <TouchableOpacity style={[styles.controlBtnLarge, { backgroundColor: activeColor }]} onPress={() => setIsPaused(!isPaused)}>
                        {isPaused ? <Play size={32} color="#FFF" fill="#FFF" /> : <Pause size={32} color="#FFF" fill="#FFF" />}
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.controlBtnSmall} onPress={handleStopPress}>
                        <Square size={24} color={tokens.colors.error} fill={tokens.colors.error} />
                    </TouchableOpacity>
                </View>

                {/* Custom Stop Overlay (Absolute Position for speed) */}
                {isStopOverlayVisible && (
                    <View style={styles.overlayContainer}>
                        <View style={styles.overlayContent}>
                            <Text style={styles.modalTitle}>¿Terminar sesión?</Text>
                            <Text style={styles.modalText}>
                                Si terminas ahora, tu progreso se guardará parcialmente pero perderás tu racha.
                            </Text>
                            <View style={styles.modalButtons}>
                                <TouchableOpacity style={styles.modalBtnCancel} onPress={cancelStop}>
                                    <Text style={styles.modalBtnCancelText}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.modalBtnDestructive} onPress={confirmStop}>
                                    <Text style={styles.modalBtnDestructiveText}>Terminar</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                )}
            </View>
        );
    };

    const renderCelebration = () => (
        <View style={styles.celebrationContainer}>
            {/* Confetti Effect Background */}
            {[...Array(20)].map((_, i) => (
                <ConfettiPiece key={i} index={i} />
            ))}

            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                <LinearGradient
                    colors={[tokens.colors.primary, '#9B51E0']}
                    style={styles.celebrationCircle}
                >
                    <Trophy size={80} color="#FFF" />
                </LinearGradient>
            </Animated.View>
            <Animated.Text style={[styles.celebrationText, { opacity: fadeAnim }]}>
                ¡SESIÓN COMPLETADA!
            </Animated.Text>
            <Animated.Text style={[styles.celebrationSubText, { opacity: fadeAnim }]}>
                Has ganado {sessionStats?.xpEarned || 0} XP
            </Animated.Text>
        </View>
    );

    const renderSummary = () => (
        <ScrollView style={styles.container}>
            {/* Dopamine Header */}
            <View style={styles.dopamineHeader}>
                <LinearGradient
                    colors={[tokens.colors.primary, '#9B51E0']}
                    style={styles.dopamineGradient}
                >
                    <Trophy size={48} color="#FFF" />
                </LinearGradient>
            </View>

            <View style={styles.summaryCard}>
                <Text style={styles.congratsTitle}>{sessionStats.message}</Text>
                <Text style={[styles.summarySubject, { color: sessionStats.subjectColor }]}>{sessionStats.subject}</Text>

                <View style={styles.statsRow}>
                    <View style={styles.statItemBig}>
                        <Text style={[styles.statValueBig, { color: tokens.colors.primary }]}>+{sessionStats.xpEarned}</Text>
                        <Text style={styles.statLabelBig}>XP GANADOS</Text>
                    </View>
                </View>

                {/* Aesthetic Improvements: Spaced labels, uppercase, smaller font */}
                <View style={styles.statsGrid}>
                    <View style={styles.statBox}>
                        <Clock size={24} color={tokens.colors.textSecondary} style={{ marginBottom: 8 }} />
                        <Text style={styles.statLabelAesthetic}>TIEMPO</Text>
                        <Text style={styles.statValueAesthetic}>{sessionStats.timeDeducted} <Text style={styles.unitText}>min</Text></Text>
                    </View>
                    <View style={styles.verticalDivider} />
                    <View style={styles.statBox}>
                        <Check size={24} color={tokens.colors.success} style={{ marginBottom: 8 }} />
                        <Text style={styles.statLabelAesthetic}>OBJETIVOS</Text>
                        <Text style={styles.statValueAesthetic}>{sessionStats.completedGoalsCount}/{sessionStats.totalGoals}</Text>
                    </View>
                </View>

                <View style={styles.divider} />

                <Text style={styles.labelCenter}>NOTAS DE LA SESIÓN</Text>
                <TextInput
                    style={[styles.input, { height: 80, marginTop: 8 }]}
                    multiline
                    placeholder="Escribe tus reflexiones..."
                    placeholderTextColor={tokens.colors.textSecondary}
                    value={sessionNotes}
                    onChangeText={setSessionNotes}
                />

                <TouchableOpacity
                    style={[styles.startBtn, { marginTop: 24, backgroundColor: tokens.colors.success, width: '100%' }]}
                    onPress={() => {
                        setStep('setup');
                        router.replace('/dashboard');
                    }}
                >
                    <Text style={styles.startBtnText}>Volver al inicio</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );

    return (
        <View style={styles.mainContainer}>
            {step === 'setup' && renderSetup()}
            {step === 'timer' && renderTimer()}
            {step === 'celebration' && renderCelebration()}
            {step === 'summary' && renderSummary()}
        </View>
    );
}

const styles = StyleSheet.create({
    mainContainer: {
        flex: 1,
        backgroundColor: tokens.colors.background,
        paddingTop: 50,
    },
    container: {
        flex: 1,
        paddingHorizontal: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: tokens.colors.text,
        marginBottom: 32,
        marginTop: 16,
    },
    label: {
        fontSize: 12,
        fontWeight: '700',
        color: tokens.colors.textSecondary,
        marginBottom: 8,
        letterSpacing: 1,
    },
    emptySubjectsContainer: {
        width: width - 48,
        height: 110,
        backgroundColor: tokens.colors.card,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: tokens.colors.border,
        borderStyle: 'dashed',
        flexDirection: 'row',
        gap: 12,
    },
    emptySubjectsText: {
        color: tokens.colors.textSecondary,
        fontSize: 14,
        fontWeight: '600',
    },
    labelCenter: {
        fontSize: 12,
        fontWeight: '700',
        color: tokens.colors.textSecondary,
        marginBottom: 8,
        letterSpacing: 1,
        textAlign: 'center',
        width: '100%',
    },
    subjectScroll: {
        marginBottom: 32,
        maxHeight: 120,
    },
    subjectCard: {
        width: 100,
        height: 110,
        backgroundColor: tokens.colors.card,
        borderRadius: 16,
        padding: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    subjectIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    subjectInitial: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FFF',
    },
    subjectName: {
        fontSize: 12,
        fontWeight: '600',
        color: tokens.colors.text,
        textAlign: 'center',
    },
    checkBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 16,
        height: 16,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#FFF',
    },
    // Slider & Duration
    durationLabelCentered: {
        fontSize: 48,
        fontWeight: 'bold',
        color: tokens.colors.text,
        textAlign: 'center',
        marginBottom: 4,
        fontVariant: ['tabular-nums'],
        width: '100%',
    },
    durationUnit: {
        fontSize: 18,
        color: tokens.colors.textSecondary,
        fontWeight: '600',
    },
    sliderWrapper: {
        backgroundColor: tokens.colors.card,
        padding: 16,
        borderRadius: 16,
        marginBottom: 24,
    },
    durationMessage: {
        textAlign: 'center',
        marginTop: 12,
        fontSize: 14,
        fontWeight: '600',
        color: tokens.colors.primary,
        fontStyle: 'italic',
    },
    // Inputs/Buttons
    inputRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    input: {
        flex: 1,
        backgroundColor: tokens.colors.card,
        borderRadius: 12,
        padding: 16,
        color: tokens.colors.text,
        fontSize: 16,
    },
    addBtn: {
        width: 56,
        height: 56,
        borderRadius: 16,
        backgroundColor: tokens.colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    goalsList: {
        marginBottom: 32,
    },
    goalItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: tokens.colors.border,
    },
    goalText: {
        flex: 1,
        fontSize: 16,
        color: tokens.colors.text,
    },
    startBtn: {
        backgroundColor: tokens.colors.primary,
        borderRadius: 16,
        paddingVertical: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        shadowColor: tokens.colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    disabledBtn: {
        opacity: 0.5,
    },
    startBtnText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    // Timer
    timerContainer: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    circleContainer: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 40,
    },
    timeTextContainer: {
        position: 'absolute',
        alignItems: 'center',
    },
    timeDisplay: {
        fontSize: 48,
        fontWeight: 'bold',
        color: tokens.colors.text,
        fontVariant: ['tabular-nums'],
    },
    timeLabel: {
        fontSize: 16,
        color: tokens.colors.textSecondary,
        marginTop: 8,
        fontWeight: '600',
        letterSpacing: 2,
    },
    timerGoals: {
        width: '100%',
        marginBottom: 32,
    },
    timerGoalsTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: tokens.colors.textSecondary,
        marginBottom: 12,
        letterSpacing: 1,
    },
    timerGoalItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 8,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: tokens.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    timerGoalText: {
        fontSize: 14,
        color: tokens.colors.text,
    },
    completedText: {
        textDecorationLine: 'line-through',
        color: tokens.colors.textSecondary,
    },
    controls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 24,
    },
    controlBtnLarge: {
        width: 80,
        height: 80,
        borderRadius: 40,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: tokens.colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    controlBtnSmall: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: tokens.colors.card,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: tokens.colors.border,
    },
    overlayContainer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.8)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
    },
    overlayContent: {
        width: '80%',
        backgroundColor: tokens.colors.card,
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: tokens.colors.text,
        marginBottom: 12,
    },
    modalText: {
        fontSize: 14,
        color: tokens.colors.textSecondary,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 20,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    modalBtnCancel: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
    },
    modalBtnCancelText: {
        color: tokens.colors.textSecondary,
        fontWeight: '600',
    },
    modalBtnDestructive: {
        flex: 1,
        backgroundColor: tokens.colors.error,
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
    },
    modalBtnDestructiveText: {
        color: '#FFF',
        fontWeight: 'bold',
    },
    celebrationContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    celebrationCircle: {
        width: 160,
        height: 160,
        borderRadius: 80,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 32,
    },
    celebrationText: {
        fontSize: 24,
        fontWeight: 'bold',
        color: tokens.colors.text,
        letterSpacing: 2,
        marginBottom: 8,
    },
    celebrationSubText: {
        fontSize: 16,
        color: tokens.colors.textSecondary,
    },
    dopamineHeader: {
        alignItems: 'center',
        marginTop: 40,
        marginBottom: 24,
    },
    dopamineGradient: {
        width: 100,
        height: 100,
        borderRadius: 50,
        alignItems: 'center',
        justifyContent: 'center',
    },
    summaryCard: {
        backgroundColor: tokens.colors.card,
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        marginBottom: 40,
    },
    congratsTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: tokens.colors.text,
        marginBottom: 8,
        textAlign: 'center',
    },
    summarySubject: {
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 24,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    statsRow: {
        marginBottom: 32,
    },
    statItemBig: {
        alignItems: 'center',
    },
    statValueBig: {
        fontSize: 48,
        fontWeight: 'bold',
    },
    statLabelBig: {
        fontSize: 12,
        fontWeight: '700',
        color: tokens.colors.textSecondary,
        letterSpacing: 2,
    },
    statsGrid: {
        flexDirection: 'row',
        width: '100%',
        justifyContent: 'space-around',
        marginBottom: 32,
    },
    statBox: {
        alignItems: 'center',
        flex: 1,
    },
    statLabelAesthetic: {
        fontSize: 10,
        fontWeight: '700',
        color: tokens.colors.textSecondary,
        letterSpacing: 1,
        marginBottom: 4,
    },
    statValueAesthetic: {
        fontSize: 20,
        fontWeight: 'bold',
        color: tokens.colors.text,
    },
    unitText: {
        fontSize: 12,
        color: tokens.colors.textSecondary,
    },
    verticalDivider: {
        width: 1,
        height: '60%',
        backgroundColor: tokens.colors.border,
        alignSelf: 'center',
    },
    divider: {
        width: '100%',
        height: 1,
        backgroundColor: tokens.colors.border,
        marginBottom: 24,
    },
});
