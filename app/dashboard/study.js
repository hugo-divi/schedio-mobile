





import { View, Image } from 'react-native';
import { Text } from 'react-native';
import { BlurView } from 'expo-blur';
import { StyleSheet, TouchableOpacity, ScrollView, TextInput, Dimensions, Platform, StatusBar, Modal, TouchableWithoutFeedback, PanResponder, Animated } from 'react-native';
import { ImageBackground } from 'react-native';
import { ActivityIndicator } from 'react-native';
import { useState, useMemo } from 'react';
// SHIFTED LINE 14
import { useEffect } from 'react';
import { useRef } from 'react';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Play, Pause, X, Check, Timer, Target, Award, ArrowLeft, MoreHorizontal, AlertCircle, Trash2, Brain, ChevronDown, Plus, Clock, BookOpen, Trophy } from 'lucide-react-native';
import { tokens } from '../../theme/tokens';
import { GlassCard } from '../../components/GlassView';
import InfoTooltip from '../../components/InfoTooltip';
import useAuthStore from '../../store/authStore';
import useThemeStore from '../../store/themeStore';
import useUserStore from '../../store/userStore';
import { db } from '../../services/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Circle as SvgCircle } from 'react-native-svg';
import Svg from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import Slider from '@react-native-community/slider';

// Only use KeepAwake on native to avoid web WakeLock errors
const activateKeepAwake = () => {
    if (Platform.OS !== 'web') {
        try {
            const { activateKeepAwakeAsync } = require('expo-keep-awake');
            activateKeepAwakeAsync();
        } catch (e) {
            console.warn('KeepAwake error:', e);
        }
    }
};

const deactivateKeepAwake = () => {
    if (Platform.OS !== 'web') {
        try {
            const { deactivateKeepAwake } = require('expo-keep-awake');
            deactivateKeepAwake();
        } catch (e) {
            console.warn('KeepAwake deactivate error:', e);
        }
    }
};

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
    const router = useRouter();
    const navigation = useNavigation();
    const { user } = useAuthStore();
    const { isDarkMode } = useThemeStore();

    // ── Store Data ──
    const { subjects, loading: subjectsLoading } = useUserStore();

    // ── State Declarations ──
    const [step, setStep] = useState('setup');
    const [selectedSubject, setSelectedSubject] = useState(null);
    const [duration, setDuration] = useState(25);
    const [sessionGoals, setSessionGoals] = useState([]);
    const [newGoalText, setNewGoalText] = useState('');
    const [timeLeft, setTimeLeft] = useState(25 * 60);
    const [isActive, setIsActive] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [isZenMode, setIsZenMode] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isPanicMode, setIsPanicMode] = useState(false);
    const [showStopConfirm, setShowStopConfirm] = useState(false);
    const [isStopOverlayVisible, setIsStopOverlayVisible] = useState(false);
    const [sessionStats, setSessionStats] = useState(null);
    const [sessionNotes, setSessionNotes] = useState('');

    // ── Refs & Animations ──
    const timerRef = useRef(null);
    const translateY = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    // ── Params ──
    const params = useLocalSearchParams();
    const { autoStart, subjectId, duration: paramDuration, goal, taskId } = params || {};
    // ── Handlers & Logic ──

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
            message: CONGRATS_MESSAGES[Math.floor(Math.random() * CONGRATS_MESSAGES.length)]
        });

        if (early) {
            setStep('summary');
        } else {
            setStep('celebration');
            Animated.sequence([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    friction: 4,
                    useNativeDriver: true,
                }),
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 500,
                    useNativeDriver: true,
                })
            ]).start();

            setTimeout(() => {
                setStep('summary');
            }, 3500);
        }

        if (!early && Platform.OS !== 'web') {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }

        if (!early && taskId) {
            const { completeMicroTask } = useUserStore.getState();
            completeMicroTask(user.uid, taskId);
        }

        if (!early || timeInMins >= 1) {
            const { addSession } = useUserStore.getState();
            addSession(user.uid, {
                subjectId: selectedSubject,
                duration: timeInMins,
                goals: sessionGoals,
                focusScore: 5,
                notes: sessionNotes || ''
            });
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

    // ── Gestures & Memos ──

    const panResponder = useMemo(
        () => PanResponder.create({
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return isActive && !isStopOverlayVisible && gestureState.dy > 20;
            },
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    translateY.setValue(gestureState.dy);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 120) {
                    handleStopPress();
                    Animated.spring(translateY, {
                        toValue: 0,
                        useNativeDriver: true,
                    }).start();
                } else {
                    Animated.spring(translateY, {
                        toValue: 0,
                        useNativeDriver: true,
                    }).start();
                }
            },
        }),
        [isActive, isStopOverlayVisible]
    );

    // ── Effects ──

    useEffect(() => {
        activateKeepAwake();
        return () => deactivateKeepAwake();
    }, []);

    useEffect(() => {
        if (autoStart === 'true' && subjects.length > 0 && subjectId) {
            const sub = subjects.find(s => s.id === subjectId);
            if (sub) {
                setSelectedSubject(sub.id);
                if (paramDuration) setDuration(parseInt(paramDuration));
                if (goal) setSessionGoals([{ id: Date.now(), text: goal, completed: false }]);
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

    useEffect(() => {
        const theme = isDarkMode ? tokens.colors.dark : tokens.colors.light;
        if (isZenMode || step === 'timer') {
            navigation.setOptions({
                tabBarStyle: { display: 'none' },
                headerShown: false
            });
        } else {
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

    // --- Render Components ---

    const renderSetup = () => (
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
            {/* Custom Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, marginTop: 10 }}>
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
                <Text style={styles.headerTitle}>Enfocar</Text>
                <View style={{ width: 44 }} />
            </View>

            <Text style={styles.title}>Nueva Sesión</Text>

            <View style={{ marginBottom: 32 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <BookOpen size={18} color={tokens.colors.blue} />
                    <Text style={styles.conceptLabel}>MATERIA</Text>
                    <InfoTooltip
                        title="Selecciona Materia 📖"
                        content="Elige en qué vas a enfocar tu tiempo. Si no ves tu materia, puedes añadirla en tu perfil."
                        style={{ marginLeft: 'auto' }}
                    />
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subjectScroll} contentContainerStyle={{ paddingRight: 24 }}>
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
                                activeOpacity={0.8}
                                onPress={() => setSelectedSubject(sub.id)}
                                style={{ marginRight: 12 }}
                            >
                                <GlassCard
                                    style={[
                                        styles.subjectCard,
                                        selectedSubject === sub.id && { borderColor: tokens.colors.blue, borderWidth: 1 }
                                    ]}
                                >
                                    <View style={[styles.subjectIcon, { backgroundColor: sub.color + '30' }]}>
                                        <Text style={[styles.subjectInitial, { color: sub.color }]}>{sub.name.charAt(0)}</Text>
                                    </View>
                                    <Text
                                        style={[
                                            styles.subjectName,
                                            selectedSubject === sub.id && { color: '#FFF', fontWeight: '800' }
                                        ]}
                                        numberOfLines={1}
                                    >
                                        {sub.name}
                                    </Text>
                                    {selectedSubject === sub.id && (
                                        <View style={[styles.checkBadge, { backgroundColor: tokens.colors.blue }]}>
                                            <Check size={10} color="#FFF" strokeWidth={3} />
                                        </View>
                                    )}
                                </GlassCard>
                            </TouchableOpacity>
                        ))
                    )}
                </ScrollView>

                <View style={{ marginBottom: 32 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                        <Clock size={18} color={tokens.colors.blue} />
                        <Text style={styles.conceptLabel}>TIEMPO</Text>
                        <InfoTooltip
                            title="Gestion del Tiempo ⏳"
                            content="Ajusta cuánto tiempo quieres estar en zona de foco. Ganarás XP proporcional al tiempo que aguantes sin distraerte."
                            style={{ marginLeft: 'auto' }}
                        />
                    </View>

                    <GlassCard style={styles.sliderWrapper}>
                        <Text style={styles.durationLabelCentered}>
                            {duration}<Text style={styles.durationUnit}> min</Text>
                        </Text>
                        <Slider
                            style={{ width: '100%', height: 40 }}
                            minimumValue={15}
                            maximumValue={120}
                            step={5}
                            value={duration}
                            onValueChange={setDuration}
                            minimumTrackTintColor={tokens.colors.blue}
                            maximumTrackTintColor="#333"
                            thumbTintColor="#FFF"
                        />
                        <Text style={styles.durationMessage}>{getDurationMessage(duration)}</Text>
                    </GlassCard>
                </View>

                <View style={{ marginBottom: 32 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                        <Target size={18} color={tokens.colors.blue} />
                        <Text style={styles.conceptLabel}>OBJETIVOS</Text>
                    </View>

                    <GlassCard style={{ padding: 12 }}>
                        <View style={styles.inputRow}>
                            <TextInput
                                style={styles.input}
                                placeholder="¿Qué quieres lograr?"
                                placeholderTextColor="#666"
                                value={newGoalText}
                                onChangeText={setNewGoalText}
                                onSubmitEditing={addGoal}
                            />
                            <TouchableOpacity style={styles.addBtn} onPress={addGoal}>
                                <Plus size={24} color="#FFF" />
                            </TouchableOpacity>
                        </View>

                        {sessionGoals.length > 0 && (
                            <View style={styles.goalsList}>
                                {sessionGoals.map(g => (
                                    <View key={g.id} style={styles.goalItem}>
                                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tokens.colors.blue, marginRight: 12 }} />
                                        <Text style={styles.goalText}>{g.text}</Text>
                                        <TouchableOpacity onPress={() => setSessionGoals(doc => doc.filter(x => x.id !== g.id))}>
                                            <X size={18} color="#666" />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}
                    </GlassCard>
                </View>
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
        const progress = 100 - (timeLeft / (duration * 60)) * 100;
        const radius = width * 0.28; // Further reduced from 0.32
        const circumference = 2 * Math.PI * radius;
        const strokeDashoffset = circumference - (progress / 100) * circumference;
        const activeColor = tokens.colors.blue;

        return (
            <Animated.View
                style={[
                    styles.timerContainer,
                    { transform: [{ translateY: translateY }] }
                ]}
                {...panResponder.panHandlers}
            >
                <StatusBar hidden={isZenMode} />

                {/* Background Glow */}
                <View style={[styles.timerGlow, { backgroundColor: activeColor + '08' }]} />

                <View style={styles.timerHeader}>
                    <ChevronDown size={24} color={tokens.colors.textSecondary} style={{ marginBottom: 4, opacity: 0.5 }} />
                    <Text style={styles.timerSubjectName}>
                        {subjects.find(s => s.id === selectedSubject)?.name || 'Estudio'}
                    </Text>
                </View>

                <View style={styles.circleContainer}>
                    <Svg height={radius * 2 + 24} width={radius * 2 + 24}>
                        {/* Outer Soft Glow */}
                        <SvgCircle
                            cx={radius + 12}
                            cy={radius + 12}
                            r={radius}
                            stroke={activeColor}
                            strokeWidth="12"
                            strokeOpacity="0.04"
                            fill="transparent"
                        />
                        {/* Track */}
                        <SvgCircle
                            cx={radius + 12}
                            cy={radius + 12}
                            r={radius}
                            stroke="#1A1A1A"
                            strokeWidth="8"
                            fill="transparent"
                        />
                        {/* Progress Glow (Behind) */}
                        <SvgCircle
                            cx={radius + 12}
                            cy={radius + 12}
                            r={radius}
                            stroke={activeColor}
                            strokeWidth="12"
                            strokeOpacity="0.1"
                            fill="transparent"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                            rotation="-90"
                            origin={`${radius + 12}, ${radius + 12}`}
                        />
                        {/* Active Progress */}
                        <SvgCircle
                            cx={radius + 12}
                            cy={radius + 12}
                            r={radius}
                            stroke={activeColor}
                            strokeWidth="8"
                            fill="transparent"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                            rotation="-90"
                            origin={`${radius + 12}, ${radius + 12}`}
                        />
                    </Svg>
                    <View style={styles.timeTextContainer}>
                        <Text style={styles.timeDisplay}>{formatTime(timeLeft)}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 }}>
                            {!isPaused && <View style={styles.liveIndicator} />}
                            <Text style={styles.timeLabel}>{isPaused ? 'EN PAUSA' : 'ENFOQUE'}</Text>
                        </View>
                    </View>
                </View>

                {/* Goals */}
                <View style={styles.timerGoals}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                        <Target size={16} color={activeColor} />
                        <Text style={styles.timerGoalsTitle}>OBJETIVOS ACTIVOS</Text>
                    </View>
                    <ScrollView style={{ maxHeight: 150 }} showsVerticalScrollIndicator={false}>
                        {sessionGoals.map(g => (
                            <TouchableOpacity key={g.id} activeOpacity={0.7} style={styles.timerGoalItem} onPress={() => toggleGoal(g.id)}>
                                <GlassCard style={[styles.timerGoalCard, g.completed && { opacity: 0.5 }]}>
                                    <View style={[styles.checkbox, g.completed && { backgroundColor: activeColor, borderColor: activeColor }]}>
                                        {g.completed && <Check size={12} color="#FFF" strokeWidth={3} />}
                                    </View>
                                    <Text style={[styles.timerGoalText, g.completed && styles.completedText]}>{g.text}</Text>
                                </GlassCard>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* Controls */}
                <View style={styles.controls}>
                    <TouchableOpacity activeOpacity={0.8} style={styles.controlBtnSmall} onPress={handleStopPress}>
                        <X size={24} color="#666" />
                    </TouchableOpacity>

                    <TouchableOpacity activeOpacity={0.9} onPress={() => setIsPaused(!isPaused)}>
                        <LinearGradient
                            colors={[activeColor, '#1A73E8']}
                            style={styles.controlBtnLarge}
                        >
                            {isPaused ? <Play size={36} color="#FFF" fill="#FFF" /> : <Pause size={36} color="#FFF" fill="#FFF" />}
                        </LinearGradient>
                    </TouchableOpacity>

                    <View style={{ width: 56 }} />
                </View>

                {/* Stop Overlay */}
                {isStopOverlayVisible && (
                    <View style={styles.overlayContainer}>
                        <GlassCard style={styles.overlayContent}>
                            <View style={styles.warningIcon}>
                                <X size={28} color={tokens.colors.error} />
                            </View>
                            <Text style={styles.modalTitle}>¿Terminar sesión?</Text>
                            <Text style={styles.modalText}>
                                El progreso actual se guardará, pero tu racha podría verse afectada.
                            </Text>
                            <View style={styles.modalButtons}>
                                <TouchableOpacity style={styles.modalBtnCancel} onPress={cancelStop}>
                                    <Text style={styles.modalBtnCancelText}>Continuar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.modalBtnDestructive} onPress={confirmStop}>
                                    <Text style={styles.modalBtnDestructiveText}>Terminar</Text>
                                </TouchableOpacity>
                            </View>
                        </GlassCard>
                    </View>
                )}
            </Animated.View>
        );
    };

    const renderCelebration = () => (
        <View style={styles.celebrationContainer}>
            <LinearGradient
                colors={['#000', tokens.colors.blue + '20', '#000']}
                style={StyleSheet.absoluteFill}
            />
            {/* Confetti Effect Background */}
            {[...Array(20)].map((_, i) => (
                <ConfettiPiece key={i} index={i} />
            ))}

            <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                <LinearGradient
                    colors={[tokens.colors.blue, '#1A73E8']}
                    style={styles.celebrationCircle}
                >
                    <Trophy size={100} color="#FFF" />
                </LinearGradient>
            </Animated.View>
            <Animated.Text style={[styles.celebrationText, { opacity: fadeAnim }]}>
                ¡MISIÓN CUMPLIDA!
            </Animated.Text>
            <Animated.Text style={[styles.celebrationSubText, { opacity: fadeAnim }]}>
                Has ganado <Text style={{ color: tokens.colors.blue, fontWeight: '900' }}>{sessionStats?.xpEarned || 0} XP</Text>
            </Animated.Text>
        </View>
    );

    const renderSummary = () => {
        if (!sessionStats) return null;

        return (
            <ScrollView style={styles.container} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
                <View style={{ marginTop: 40, alignItems: 'center', marginBottom: 32 }}>
                    <LinearGradient
                        colors={[tokens.colors.blue, '#1A73E8']}
                        style={styles.dopamineGradient}
                    >
                        <Trophy size={48} color="#FFF" />
                    </LinearGradient>
                    <Text style={styles.summaryTitle}>Resumen de sesión</Text>
                </View>

                <GlassCard style={styles.summaryCard}>
                    <Text style={styles.congratsTitle}>{sessionStats.message}</Text>

                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 24 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: sessionStats.subjectColor }} />
                        <Text style={[styles.summarySubject, { color: sessionStats.subjectColor }]}>{sessionStats.subject}</Text>
                    </View>

                    <View style={styles.statsGrid}>
                        <View style={styles.statBox}>
                            <Clock size={20} color={tokens.colors.blue} style={{ marginBottom: 8 }} />
                            <Text style={styles.statLabelAesthetic}>TIEMPO</Text>
                            <Text style={styles.statValueAesthetic}>{sessionStats.timeDeducted} <Text style={styles.unitText}>min</Text></Text>
                        </View>
                        <View style={styles.verticalDivider} />
                        <View style={styles.statBox}>
                            <Check size={20} color={tokens.colors.success} style={{ marginBottom: 8 }} />
                            <Text style={styles.statLabelAesthetic}>OBJETIVOS</Text>
                            <Text style={styles.statValueAesthetic}>{sessionStats.completedGoalsCount}/{sessionStats.totalGoals}</Text>
                        </View>
                        <View style={styles.verticalDivider} />
                        <View style={styles.statBox}>
                            <Trophy size={20} color="#FFD700" style={{ marginBottom: 8 }} />
                            <Text style={styles.statLabelAesthetic}>RECOMPENSA</Text>
                            <Text style={[styles.statValueAesthetic, { color: tokens.colors.blue }]}>+{sessionStats.xpEarned} <Text style={styles.unitText}>XP</Text></Text>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={{ width: '100%', marginBottom: 16 }}>
                        <Text style={styles.label}>NOTAS DE LA SESIÓN</Text>
                        <TextInput
                            style={styles.summaryInput}
                            multiline
                            placeholder="¿Qué has aprendido hoy?"
                            placeholderTextColor="#666"
                            value={sessionNotes}
                            onChangeText={setSessionNotes}
                        />
                    </View>

                    <TouchableOpacity
                        style={[styles.startBtn, { backgroundColor: tokens.colors.success, width: '100%', marginTop: 8 }]}
                        onPress={() => {
                            setStep('setup');
                            router.replace('/dashboard');
                        }}
                    >
                        <Text style={styles.startBtnText}>Finalizar sesión</Text>
                    </TouchableOpacity>
                </GlassCard>
            </ScrollView>
        );
    };

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
    conceptLabel: {
        fontSize: 10,
        fontWeight: '900',
        color: tokens.colors.blue,
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    backButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#1A1A1A',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#333',
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: '#FFF',
        textTransform: 'uppercase',
        letterSpacing: 2,
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
        marginBottom: 24, // Reduced from 40
    },
    timeTextContainer: {
        position: 'absolute',
        alignItems: 'center',
    },
    timeDisplay: {
        fontSize: 34, // Further reduced from 40
        fontWeight: 'bold',
        color: tokens.colors.text,
        fontVariant: ['tabular-nums'],
    },
    timeLabel: {
        fontSize: 12, // Reduced from 14
        color: tokens.colors.textSecondary,
        marginTop: 2,
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
    timerGlow: {
        position: 'absolute',
        top: '10%',
        width: width * 1.2,
        height: width * 1.2,
        borderRadius: width * 0.6,
        zIndex: -1,
    },
    timerHeader: {
        marginTop: 4, // Reduced from 10
        marginBottom: 16, // Reduced from 24
        alignItems: 'center',
    },
    timerSubjectName: {
        fontSize: 14,
        fontWeight: '900',
        color: tokens.colors.blue,
        letterSpacing: 2,
        textTransform: 'uppercase',
    },
    liveIndicator: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: tokens.colors.success,
    },
    timerGoalCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        marginBottom: 8,
        borderRadius: 16,
    },
    warningIcon: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: tokens.colors.error + '20',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    overlayContainer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 24,
    },
    overlayContent: {
        width: '100%',
        borderRadius: 32,
        padding: 32,
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
    summaryTitle: {
        fontSize: 18,
        fontWeight: '900',
        color: '#FFF',
        marginTop: 16,
        letterSpacing: 3,
        textTransform: 'uppercase',
    },
    summaryCard: {
        borderRadius: 32,
        padding: 24,
        alignItems: 'center',
    },
    congratsTitle: {
        fontSize: 28,
        fontWeight: '900',
        color: '#FFF',
        marginBottom: 8,
        textAlign: 'center',
    },
    summarySubject: {
        fontSize: 12,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 2,
    },
    summaryInput: {
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 16,
        padding: 16,
        color: '#FFF',
        fontSize: 14,
        height: 100,
        textAlignVertical: 'top',
        marginTop: 8,
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
