import { useState, useRef, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, Animated, Dimensions, Platform, PanResponder } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ArrowRight, Check, ChevronRight, TrendingUp, Calendar, Plus, X, Trash2 } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { auth } from '../services/firebase';
import { saveOnboardingData } from '../services/userData';

const levels = ['ESO', 'Bachillerato', 'Universidad', 'Otro'];

// Plantillas de asignaturas
const subjectTemplates = {
    'ESO': [
        'Matemáticas', 'Lengua Castellana', 'Inglés',
        'Geografía e Historia', 'Física y Química', 'Biología',
        'Educación Física'
    ],
    'Bachillerato - Ciencias': [
        'Matemáticas', 'Física', 'Química',
        'Biología', 'Dibujo Técnico', 'Lengua Castellana', 'Inglés'
    ],
    'Bachillerato - Humanidades/Sociales': [
        'Matemáticas CCSS', 'Economía', 'Latín',
        'Griego', 'Historia del Arte', 'Lengua Castellana', 'Inglés'
    ],
    'Bachillerato - Artes': [
        'Fundamentos del Arte', 'Cultura Audiovisual', 'Diseño',
        'Historia de España', 'Lengua Castellana', 'Inglés'
    ],
    'Bachillerato - General': [
        'Matemáticas Generales', 'Ciencias Generales',
        'Lengua Castellana', 'Inglés', 'Filosofía'
    ]
};

const bachBranches = ['Ciencias', 'Humanidades/Sociales', 'Artes', 'General'];

export default function Onboarding() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);

    // Form Data
    const [studyLevel, setStudyLevel] = useState('');
    const [grade, setGrade] = useState('');
    const [branch, setBranch] = useState(''); // Specific to Bachillerato logic
    const [subjects, setSubjects] = useState([]); // List of { name, difficulty: custom/default }
    const [newSubject, setNewSubject] = useState('');
    const [organization, setOrganization] = useState(3);

    // Animation values
    const fadeAnim = useRef(new Animated.Value(1)).current;
    const progressAnim = useRef(new Animated.Value(0.25)).current;

    // Draggable Slider Logic
    const sliderWidth = useRef(0);
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: (evt) => {
                // updateSliderValue(evt.nativeEvent.locationX); 
                // Grant doesn't always have reliable locationX on some versions/platforms relative to view
            },
            onPanResponderMove: (evt, gestureState) => {
                // We need to calculate based on gestureState.moveX and view layout
                // simpler to just use locationX if reliable, but let's try a robust way if needed
                // For now, let's rely on the locationX from the event which is relative to the target
                updateSliderValue(evt.nativeEvent.locationX);
            },
            onPanResponderRelease: () => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            }
        })
    ).current;

    const updateSliderValue = (x) => {
        if (sliderWidth.current > 0) {
            let percentage = x / sliderWidth.current;
            percentage = Math.max(0, Math.min(1, percentage));
            const value = Math.round(percentage * 4) + 1; // 1 to 5
            setOrganization(value);
        }
    };

    // Initialize Subjects based on selection
    const initSubjects = (selectedLevel, selectedBranch = null) => {
        let templateKey = selectedLevel;
        if (selectedLevel === 'Bachillerato' && selectedBranch) {
            templateKey = `${selectedLevel} - ${selectedBranch}`;
        }

        const template = subjectTemplates[templateKey] || [];
        // Transform strings to object structure
        const initialSubjects = template.map(name => ({ name, difficulty: 5 })); // Default difficulty
        setSubjects(initialSubjects);
    };

    const addSubject = () => {
        if (newSubject.trim().length > 0) {
            setSubjects([...subjects, { name: newSubject.trim(), difficulty: 5 }]);
            setNewSubject('');
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
    };

    const removeSubject = (index) => {
        const newSubjects = [...subjects];
        newSubjects.splice(index, 1);
        setSubjects(newSubjects);
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const animateStep = (nextStep) => {
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
            Animated.timing(progressAnim, { toValue: (nextStep) / 4, duration: 300, useNativeDriver: false })
        ]).start(() => {
            setStep(nextStep);
            Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
        });
    };

    const handleNext = () => {
        // Step 1 Validation
        if (step === 1) {
            if (!studyLevel || !grade) return;
            // Pre-init subject logic for non-Bachillerato
            if (studyLevel !== 'Bachillerato') {
                initSubjects(studyLevel);
            }
        }

        // Step 2 Validation (Subjects)
        if (step === 2) {
            // If Bachillerato and no branch selected yet, don't advance, just set branch
            if (studyLevel === 'Bachillerato' && !branch) return;
            // Ensure at least 1 subject is selected if we are in the subject selection phase
            // (We might want to allow 0, but usually not helpful. Let's allowing 0 for "Skipping" but warn?)
            // For now, let's just proceed.
        }

        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        if (step < 4) {
            animateStep(step + 1);
        } else {
            handleSubmit();
        }
    };

    const handleBack = () => {
        if (step > 1) {
            // Logic to reset branch if going back from subject view in Bachillerato? 
            // Only if we want to change branch. For now simpler back.
            if (step === 2 && studyLevel === 'Bachillerato' && branch && subjects.length > 0) {
                // If we are in subjects view of Bach, allow going back to Branch selection?
                // For simplicity, just going back step involves re-selecting everything.
                // Or we can just go back to step 1.
            }

            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

            animateStep(step - 1);
        }
    };

    // Calculate Dopamine
    const calculatePotential = () => {
        const currentGrade = parseFloat(grade.replace(',', '.')) || 5.0;
        const orgFactor = (6 - organization) * 0.5;
        const baseImprovement = 1.5;

        // Bonus for having more subjects (more optimizations Schedio can do)
        const subjectsFactor = Math.min(0.5, subjects.length * 0.05);

        let improvement = baseImprovement + orgFactor + subjectsFactor;

        let potentialGrade = Math.min(10, currentGrade + improvement);
        let percentage = 0;
        if (currentGrade > 0) {
            percentage = ((potentialGrade - currentGrade) / currentGrade) * 100;
        } else {
            percentage = 100;
        }

        return {
            grade: potentialGrade.toFixed(1),
            percentage: Math.round(percentage)
        };
    };

    const handleSubmit = async () => {
        setLoading(true);
        try {
            const user = auth.currentUser;
            if (user) {
                const potential = calculatePotential();
                const finalGrade = parseFloat(grade.replace(',', '.')) || 0;

                const dataToSave = {
                    course: studyLevel,
                    branch: branch || 'General',
                    grade: finalGrade,
                    subjects: subjects, // { name, difficulty } objects
                    organizationLevel: organization,
                    potentialGrade: potential.grade,
                    potentialImprovement: potential.percentage,
                    onboardingCompleted: true,
                    completedAt: new Date().toISOString()
                };

                await saveOnboardingData(user.uid, dataToSave);

                if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                router.replace('/dashboard');
            }
        } catch (error) {
            console.error("Onboarding error:", error);
            setLoading(false);
        }
    };

    const potential = calculatePotential();

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                {step > 1 ? (
                    <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                        <ArrowRight size={24} color="#FFF" style={{ transform: [{ rotate: '180deg' }] }} />
                    </TouchableOpacity>
                ) : <View style={{ width: 40 }} />}

                <View style={styles.progressContainer}>
                    <Animated.View
                        style={[
                            styles.progressBar,
                            {
                                width: progressAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: ['0%', '100%']
                                })
                            }
                        ]}
                    />
                </View>

                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
                <Animated.View style={{ opacity: fadeAnim, flex: 1 }}>

                    {/* STEP 1: Level & Grade */}
                    {step === 1 && (
                        <>
                            <Text style={styles.title}>¿Qué estudias?</Text>
                            <Text style={styles.subtitle}>Para adaptar la dificultad</Text>

                            <View style={styles.optionsGrid}>
                                {levels.map((item) => (
                                    <TouchableOpacity
                                        key={item}
                                        style={[styles.optionCard, studyLevel === item && styles.optionCardSelected]}
                                        onPress={() => setStudyLevel(item)}
                                    >
                                        <Text style={[styles.optionText, studyLevel === item && styles.optionTextSelected]}>{item}</Text>
                                        {studyLevel === item && <Check size={16} color="#000" />}
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={[styles.label, { marginTop: 32 }]}>¿Cuál es tu nota media actual?</Text>
                            <View style={styles.inputContainer}>
                                <TextInput
                                    style={styles.gradeInput}
                                    value={grade}
                                    onChangeText={(text) => setGrade(text.replace(/[^0-9.,]/g, ''))}
                                    placeholder="Ej: 6.5"
                                    placeholderTextColor="#666"
                                    keyboardType="decimal-pad"
                                    maxLength={4}
                                />
                                <Text style={styles.gradeSuffix}>/ 10</Text>
                            </View>
                        </>
                    )}

                    {/* STEP 2: Subjects + Branch if needed */}
                    {step === 2 && (
                        <>
                            {/* Bachillerato Branch Selection State */}
                            {studyLevel === 'Bachillerato' && !branch ? (
                                <>
                                    <Text style={styles.title}>¿Qué modalidad?</Text>
                                    <Text style={styles.subtitle}>Cargaremos tus asignaturas troncales</Text>
                                    <View style={styles.listContainer}>
                                        {bachBranches.map((item) => (
                                            <TouchableOpacity
                                                key={item}
                                                style={styles.listItem}
                                                onPress={() => {
                                                    setBranch(item);
                                                    initSubjects('Bachillerato', item);
                                                }}
                                            >
                                                <Text style={styles.listItemText}>{item}</Text>
                                                <ChevronRight size={20} color="#666" />
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </>
                            ) : (
                                /* Subject List State (For ESO, Uni, or Bach after branch selected) */
                                <>
                                    <Text style={styles.title}>Tus asignaturas</Text>
                                    <Text style={styles.subtitle}>
                                        {subjects.length === 0 ? "Añade tus materias manualmente" : "Hemos preseleccionado estas, añade o quita según necesites"}
                                    </Text>

                                    {/* Subjects List */}
                                    <View style={styles.subjectsList}>
                                        {subjects.map((sub, index) => (
                                            <View key={index} style={styles.subjectTag}>
                                                <Text style={styles.subjectText}>{sub.name}</Text>
                                                <TouchableOpacity onPress={() => removeSubject(index)}>
                                                    <X size={16} color="#FF453A" />
                                                </TouchableOpacity>
                                            </View>
                                        ))}
                                        {subjects.length === 0 && (
                                            <Text style={styles.emptyText}>No hay asignaturas añadidas aún</Text>
                                        )}
                                    </View>

                                    {/* Add Input */}
                                    <View style={styles.addSubjectContainer}>
                                        <TextInput
                                            style={styles.addSubjectInput}
                                            value={newSubject}
                                            onChangeText={setNewSubject}
                                            placeholder="Nueva asignatura..."
                                            placeholderTextColor="#666"
                                            onSubmitEditing={addSubject}
                                        />
                                        <TouchableOpacity
                                            style={[styles.addButton, !newSubject.trim() && styles.addButtonDisabled]}
                                            onPress={addSubject}
                                            disabled={!newSubject.trim()}
                                        >
                                            <Plus size={24} color="#FFF" />
                                        </TouchableOpacity>
                                    </View>
                                </>
                            )}
                        </>
                    )}

                    {/* STEP 3: Organization (Draggable) */}
                    {step === 3 && (
                        <>
                            <View style={styles.iconHeader}>
                                <Calendar size={48} color="#4A90E2" />
                            </View>
                            <Text style={styles.title}>¿Cómo de organizado eres?</Text>
                            <Text style={styles.subtitle}>Arrastra la barra para definir tu nivel</Text>

                            <View style={styles.sliderLabelContainer}>
                                <Text style={styles.sliderValue}>{organization}</Text>
                                <Text style={styles.sliderValueLabel}>
                                    {organization === 1 ? "Caos total" :
                                        organization === 2 ? "Desorganizado" :
                                            organization === 3 ? "Normal" :
                                                organization === 4 ? "Bastante organizado" : "Muy organizado"}
                                </Text>
                            </View>

                            {/* Draggable Slider */}
                            <View
                                style={styles.sliderContainer}
                                onLayout={(e) => {
                                    sliderWidth.current = e.nativeEvent.layout.width;
                                }}
                                {...panResponder.panHandlers}
                            >
                                <View style={styles.sliderTrack} />
                                <View style={[styles.sliderFill, { width: `${(organization - 1) * 25}%` }]} />

                                {/* Thumb */}
                                <View style={[
                                    styles.sliderKnob,
                                    { left: `${(organization - 1) * 25}%`, marginLeft: -14 }
                                ]} />

                                {/* Steps Visuals */}
                                <View style={styles.sliderSteps}>
                                    {[1, 2, 3, 4, 5].map((num) => (
                                        <View key={num} style={styles.stepDot} />
                                    ))}
                                </View>
                            </View>

                            <Text style={styles.helperText}>Desliza para ajustar</Text>
                        </>
                    )}

                    {/* STEP 4: RESULT */}
                    {step === 4 && (
                        <View style={styles.resultContainer}>
                            <View style={styles.iconHeader}>
                                <TrendingUp size={64} color="#30D158" />
                            </View>

                            <Text style={styles.resultTitle}>Tu Potencial</Text>
                            <Text style={styles.resultSubtitle}>
                                Calculado con tus {subjects.length} asignaturas y nivel de organización.
                            </Text>

                            <LinearGradient
                                colors={['#1C1C1E', '#2C2C2E']}
                                style={styles.resultCard}
                            >
                                <View style={styles.statRow}>
                                    <View>
                                        <Text style={styles.statLabel}>Nota Actual</Text>
                                        <Text style={styles.statValue}>{grade || '-'}</Text>
                                    </View>
                                    <ArrowRight size={24} color="#666" />
                                    <View>
                                        <Text style={styles.statLabel}>Proyección</Text>
                                        <Text style={[styles.statValue, { color: '#30D158' }]}>{potential.grade}</Text>
                                    </View>
                                </View>

                                <View style={styles.divider} />

                                <View style={styles.improvementBadge}>
                                    <TrendingUp size={16} color="#000" />
                                    <Text style={styles.improvementText}>+{potential.percentage}% Mejora estimada</Text>
                                </View>
                            </LinearGradient>
                        </View>
                    )}

                </Animated.View>
            </ScrollView>

            {/* Footer Actions */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={[
                        styles.mainButton,
                        // Validation logic for disable
                        ((step === 1 && (!studyLevel || !grade)) ||
                            (step === 2 && studyLevel === 'Bachillerato' && !branch))
                        && styles.buttonDisabled
                    ]}
                    onPress={handleNext}
                    disabled={
                        ((step === 1 && (!studyLevel || !grade)) ||
                            (step === 2 && studyLevel === 'Bachillerato' && !branch))
                        || loading
                    }
                >
                    {loading ? (
                        <Text style={styles.mainButtonText}>Configurando...</Text>
                    ) : (
                        <Text style={styles.mainButtonText}>{step === 4 ? "Empezar Schedio" : "Continuar"}</Text>
                    )}
                    {!loading && <ChevronRight size={20} color={step === 4 ? "#000" : "#000"} />}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 20,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 20,
        backgroundColor: '#1C1C1E',
    },
    progressContainer: {
        flex: 1,
        height: 6,
        backgroundColor: '#1C1C1E',
        borderRadius: 3,
        marginHorizontal: 20,
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        backgroundColor: '#4A90E2',
        borderRadius: 3,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 24,
        paddingTop: 20,
    },
    title: {
        fontSize: 32,
        fontWeight: '800',
        color: '#FFFFFF',
        marginBottom: 8,
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 16,
        color: '#8E8E93',
        marginBottom: 32,
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
        marginBottom: 12,
    },
    // Step 1 Grid
    optionsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 24,
    },
    optionCard: {
        paddingVertical: 16,
        paddingHorizontal: 20,
        backgroundColor: '#1C1C1E',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#2C2C2E',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    optionCardSelected: {
        backgroundColor: '#FFFFFF',
        borderColor: '#FFFFFF',
    },
    optionText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    optionTextSelected: {
        color: '#000000',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1C1C1E',
        borderRadius: 16,
        paddingHorizontal: 20,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: '#2C2C2E',
    },
    gradeInput: {
        flex: 1,
        fontSize: 32,
        fontWeight: '700',
        color: '#FFFFFF',
        paddingVertical: 16,
    },
    gradeSuffix: {
        fontSize: 20,
        fontWeight: '600',
        color: '#8E8E93',
    },
    // Step 2 List (Branch or Subjects)
    listContainer: {
        gap: 12,
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        backgroundColor: '#1C1C1E',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#2C2C2E',
    },
    listItemText: {
        fontSize: 17,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    // Subjects Tags
    subjectsList: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 24,
    },
    subjectTag: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1C1C1E',
        borderRadius: 100,
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: '#333',
        gap: 8,
    },
    subjectText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '500',
    },
    emptyText: {
        color: '#666',
        fontStyle: 'italic',
        width: '100%',
        textAlign: 'center',
        marginVertical: 10,
    },
    addSubjectContainer: {
        flexDirection: 'row',
        gap: 12,
    },
    addSubjectInput: {
        flex: 1,
        backgroundColor: '#1C1C1E',
        borderRadius: 12,
        paddingHorizontal: 16,
        color: '#FFF',
        borderWidth: 1,
        borderColor: '#2C2C2E',
        height: 50,
    },
    addButton: {
        width: 50,
        height: 50,
        borderRadius: 12,
        backgroundColor: '#4A90E2',
        justifyContent: 'center',
        alignItems: 'center',
    },
    addButtonDisabled: {
        backgroundColor: '#333',
        opacity: 0.5,
    },
    // Step 3 Org
    iconHeader: {
        alignItems: 'center',
        marginBottom: 24,
    },
    sliderLabelContainer: {
        alignItems: 'center',
        marginBottom: 32,
    },
    sliderValue: {
        fontSize: 64,
        fontWeight: '800',
        color: '#4A90E2',
        lineHeight: 70,
    },
    sliderValueLabel: {
        fontSize: 18,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    sliderContainer: {
        height: 40,
        justifyContent: 'center',
        marginBottom: 16,
    },
    sliderTrack: {
        height: 6,
        backgroundColor: '#1C1C1E',
        borderRadius: 3,
        position: 'absolute',
        width: '100%',
    },
    sliderFill: {
        height: 6,
        backgroundColor: '#4A90E2',
        borderRadius: 3,
        position: 'absolute',
        left: 0,
    },
    sliderSteps: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        height: '100%',
        alignItems: 'center', // Center dots vertically
        paddingHorizontal: 0,
    },
    stepDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#666',
    },
    sliderKnob: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#FFFFFF',
        borderColor: '#4A90E2',
        borderWidth: 2,
        position: 'absolute',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 5,
        zIndex: 10,
    },
    helperText: {
        textAlign: 'center',
        color: '#666',
        fontSize: 13,
    },
    // Step 4 Result
    resultContainer: {
        flex: 1,
        alignItems: 'center',
        paddingTop: 20,
    },
    resultTitle: {
        fontSize: 36,
        fontWeight: '900',
        color: '#FFFFFF',
        marginBottom: 12,
        textAlign: 'center',
    },
    resultSubtitle: {
        fontSize: 16,
        color: '#8E8E93',
        textAlign: 'center',
        marginBottom: 40,
        paddingHorizontal: 20,
        lineHeight: 24,
    },
    resultCard: {
        width: '100%',
        padding: 24,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: '#333',
    },
    statRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    statLabel: {
        fontSize: 14,
        color: '#8E8E93',
        marginBottom: 4,
        textTransform: 'uppercase',
        fontWeight: '600',
    },
    statValue: {
        fontSize: 32,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    divider: {
        height: 1,
        backgroundColor: '#333',
        marginBottom: 24,
    },
    improvementBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#30D158',
        paddingVertical: 12,
        borderRadius: 16,
        gap: 8,
    },
    improvementText: {
        fontSize: 18,
        fontWeight: '800',
        color: '#000000',
    },
    // Footer
    footer: {
        padding: 24,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    },
    mainButton: {
        backgroundColor: '#FFFFFF',
        paddingVertical: 18,
        borderRadius: 100,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    buttonDisabled: {
        backgroundColor: '#333333',
        opacity: 0.8,
    },
    mainButtonText: {
        fontSize: 17,
        fontWeight: '700',
        color: '#000000',
    },
});
