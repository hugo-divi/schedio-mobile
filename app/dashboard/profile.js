import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, Image, Alert, Dimensions, TextInput, TouchableWithoutFeedback, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useRef, useMemo } from 'react';
import { Star, Zap, BookOpen, Crown, Moon, TrendingUp, Clock, Info, ChevronRight, Edit2, ArrowLeft, Plus, Check, X, FileText, Trash2 } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';

import useAuthStore from '../../store/authStore';
import useUserStore from '../../store/userStore';
import { GlassCard } from '../../components/GlassView';
import { RANKS, getNextRank } from '../../services/gamification';

const { width } = Dimensions.get('window');

// ─── Inline NotesSection Component ───────────────────────────────────────────
function NotesSection({ userId }) {
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadNotes = async () => {
        if (!userId) return;
        try {
            const { db } = await import('../../services/firebase');
            const { collection, getDocs, orderBy, query, deleteDoc, doc } = await import('firebase/firestore');
            const q = query(collection(db, 'users', userId, 'notes'), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            console.warn('Could not load notes', e);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (noteId) => {
        try {
            const { db } = await import('../../services/firebase');
            const { doc, deleteDoc } = await import('firebase/firestore');
            await deleteDoc(doc(db, 'users', userId, 'notes', noteId));
            setNotes(prev => prev.filter(n => n.id !== noteId));
        } catch (e) {
            Alert.alert('Error', 'No se pudo eliminar el apunte.');
        }
    };

    useEffect(() => { loadNotes(); }, [userId]);

    if (loading || notes.length === 0) return null;

    return (
        <View>
            <View style={styles.sectionHeader}>
                <View style={styles.rowBetween}>
                    <Text style={styles.sectionTitle}>Mis Apuntes Rápidos</Text>
                    <FileText size={18} color="#30D158" />
                </View>
            </View>
            {notes.map(note => (
                <GlassCard key={note.id} style={styles.noteCard}>
                    <View style={styles.noteRow}>
                        <Text style={styles.noteText} numberOfLines={3}>{note.content}</Text>
                        <TouchableOpacity onPress={() => handleDelete(note.id)} style={styles.noteDeleteBtn}>
                            <Trash2 size={15} color="#FF453A" />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.noteDate}>
                        {new Date(note.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                </GlassCard>
            ))}
        </View>
    );
}

export default function ProfileScreen() {
    const router = useRouter();
    const { user } = useAuthStore();
    const { profile, gamification, subjects, loadUserData, updateProfile, setUserPhoto, updateAverageGrade, addSubject, editSubject, removeSubject, updateExam } = useUserStore();

    const [showRankModal, setShowRankModal] = useState(false);
    const [showInsightsModal, setShowInsightsModal] = useState(false);
    const [showSubjectModal, setShowSubjectModal] = useState(false);
    const [selectedSubject, setSelectedSubject] = useState(null);
    const [isEditingName, setIsEditingName] = useState(false);
    const [newName, setNewName] = useState(profile?.displayName || '');

    // Subject editing state
    const [editSubName, setEditSubName] = useState('');
    const [editSubDifficulty, setEditSubDifficulty] = useState('5');
    const [subjectExams, setSubjectExams] = useState([]);
    const [editingExamId, setEditingExamId] = useState(null);
    const [tempGrade, setTempGrade] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [subjectToDelete, setSubjectToDelete] = useState(null);

    useEffect(() => {
        if (user) {
            loadUserData(user.uid);
            updateAverageGrade(user.uid);
        }
    }, [user]);

    useEffect(() => {
        if (profile?.displayName) setNewName(profile.displayName);
    }, [profile]);

    // Load exams for selected subject
    useEffect(() => {
        const loadExams = async () => {
            if (selectedSubject && user) {
                const { getCompletedExams } = await import('../../services/exams');
                const exams = await getCompletedExams(user.uid, 50);
                setSubjectExams(exams.filter(e => e.subjectId === selectedSubject.id));
            }
        };
        loadExams();
    }, [selectedSubject, user]);

    const handleSaveName = async () => {
        if (newName.trim() && user) {
            await updateProfile(user.uid, { displayName: newName });
            setIsEditingName(false);
        }
    };

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
        });

        if (!result.canceled && user) {
            setUserPhoto(user.uid, result.assets[0].uri);
        }
    };

    const handleSaveSubject = async () => {
        if (!editSubName.trim() || !user) return;
        const difficultyNum = parseInt(editSubDifficulty) || 5;

        try {
            if (selectedSubject) {
                // Edit existing
                await editSubject(user.uid, selectedSubject.id, {
                    name: editSubName,
                    difficulty: difficultyNum
                });
            } else {
                // Add new
                await addSubject(user.uid, {
                    name: editSubName,
                    difficulty: difficultyNum,
                    color: '#007AFF' // Default color
                });
            }
            setShowSubjectModal(false);
        } catch (error) {
            console.error("[Profile] Error saving subject:", error);
            Alert.alert("Error", "No se pudo guardar la materia.");
        }
    };

    const handleUpdateExamGrade = async (examId) => {
        if (!user || !tempGrade.trim()) return;
        try {
            await updateExam(user.uid, examId, { grade: tempGrade });
            // Refresh local list
            setSubjectExams(prev => prev.map(e => e.id === examId ? { ...e, grade: tempGrade } : e));
            setEditingExamId(null);
            setTempGrade('');
        } catch (error) {
            Alert.alert("Error", "No se pudo actualizar la nota.");
        }
    };

    const nextRank = useMemo(() => getNextRank(gamification?.level || 1), [gamification?.level]);
    const currentRank = useMemo(() => {
        if (!RANKS || RANKS.length === 0) return { title: 'Novato', color: '#8E8E93' };
        return RANKS.find(r => r.title === (gamification?.rank || 'Novato')) || RANKS[0];
    }, [gamification?.rank]);

    const confirmDelete = async (subject) => {
        if (!subject || !user?.uid) return;
        setIsDeleting(true);
        try {
            await removeSubject(user.uid, subject.id);
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            // Close both modals
            setShowDeleteModal(false);
            setShowSubjectModal(false);

            // Reset states properly
            setSelectedSubject(null);
            setSubjectToDelete(null);
        } catch (error) {
            console.error("[Profile] Error deleting subject:", error);
            Alert.alert("Error", "No se pudo eliminar la materia. Verifica tu conexión.");
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleDeleteSubject = (subject) => {
        setSubjectToDelete(subject);
        setShowDeleteModal(true);
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
            {/* Header / Avatar Section */}
            <View style={styles.header}>
                <TouchableOpacity onPress={pickImage} style={styles.avatarContainer}>
                    {profile?.photoURL ? (
                        <Image source={{ uri: profile.photoURL }} style={styles.avatar} />
                    ) : (
                        <View style={[styles.avatar, { backgroundColor: '#1C1C1E', justifyContent: 'center', alignItems: 'center' }]}>
                            <Edit2 size={32} color="#8E8E93" />
                        </View>
                    )}
                    <View style={styles.editBadge}>
                        <Plus size={12} color="#FFFFFF" strokeWidth={3} />
                    </View>
                </TouchableOpacity>



                <View style={styles.nameSection}>
                    {isEditingName ? (
                        <View style={styles.editNameRow}>
                            <TextInput
                                style={styles.nameInput}
                                value={newName}
                                onChangeText={setNewName}
                                autoFocus
                                placeholderTextColor="#48484A"
                            />
                            <TouchableOpacity onPress={handleSaveName} style={styles.saveBtn}>
                                <Check size={20} color="#30D158" />
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity onPress={() => setIsEditingName(true)} style={styles.nameRow}>
                            <Text style={styles.userName}>{profile?.displayName || 'Usuario'}</Text>
                            <Edit2 size={16} color="#8E8E93" style={{ marginLeft: 8 }} />
                        </TouchableOpacity>
                    )}
                </View>

                <TouchableOpacity
                    onPress={() => setShowRankModal(true)}
                    style={[styles.rankBadge, { backgroundColor: currentRank.color + '20', borderColor: currentRank.color }]}
                >
                    <Star size={14} color={currentRank.color} fill={currentRank.color} />
                    <Text style={[styles.rankText, { color: currentRank.color }]}>{gamification?.rank || 'Novato'}</Text>
                </TouchableOpacity>
            </View>

            {/* XP and Level Progress */}
            <GlassCard style={styles.progressCard}>
                <View style={styles.levelRow}>
                    <View style={styles.levelBadge}>
                        <Text style={styles.levelNumber}>{gamification?.level || '1'}</Text>
                    </View>
                    <View style={styles.xpInfo}>
                        <Text style={styles.xpTitle}>Nivel del Estudiante</Text>
                        <Text style={styles.xpSub}>{gamification?.xp || 0} XP acumulados</Text>
                    </View>
                </View>

                <View style={styles.progressBarBg}>
                    <LinearGradient
                        colors={['#007AFF', '#5856D6']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.progressBarFill, { width: `${Math.min(100, (gamification?.xp % 1000) / 10)}%` }]}
                    />
                </View>
                <View style={styles.xpLabels}>
                    <Text style={styles.xpProgressText}>{(gamification?.xp || 0) % 1000} / 1000 XP</Text>
                    <Text style={styles.xpPercentageText}>{Math.floor(((gamification?.xp || 0) % 1000) / 10)}%</Text>
                </View>
            </GlassCard>

            {/* Quick Stats Row */}
            <View style={styles.statsRow}>
                <GlassCard style={styles.statBox}>
                    <Text style={styles.statValue}>{profile?.averageGrade || '0.0'}</Text>
                    <Text style={styles.statLabel}>Promedio</Text>
                </GlassCard>
                <GlassCard style={styles.statBox}>
                    <Text style={styles.statValue}>{gamification?.level || '1'}</Text>
                    <Text style={styles.statLabel}>Nivel</Text>
                </GlassCard>
                <GlassCard style={styles.statBox}>
                    <Text style={styles.statValue}>{gamification?.xp || '0'}</Text>
                    <Text style={styles.statLabel}>XP Total</Text>
                </GlassCard>
            </View>

            {/* Insights Section */}
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Análisis de Desempeño</Text>
            </View>
            <GlassCard style={styles.insightsCard}>
                <View style={styles.insightItem}>
                    <TrendingUp size={20} color="#30D158" />
                    <View style={styles.insightContent}>
                        <Text style={styles.insightTitle}>Proyección Académica</Text>
                        <Text style={styles.insightText}>Basado en tus últimos exámenes, tu tendencia es positiva. ¡Vas por el buen camino!</Text>
                    </View>
                </View>
                <TouchableOpacity
                    style={styles.viewMoreBtn}
                    onPress={() => setShowInsightsModal(true)}
                >
                    <Text style={styles.viewMoreBtnText}>Ver detalles completos</Text>
                    <ChevronRight size={16} color="#007AFF" />
                </TouchableOpacity>
            </GlassCard>

            {/* Subjects Section */}
            <View style={styles.sectionHeader}>
                <View style={styles.rowBetween}>
                    <Text style={styles.sectionTitle}>Mis Materias</Text>
                    <TouchableOpacity
                        onPress={() => {
                            setSelectedSubject(null);
                            setEditSubName('');
                            setEditSubDifficulty(5);
                            setShowSubjectModal(true);
                        }}
                        style={styles.addBtn}
                    >
                        <Plus size={20} color="#007AFF" />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.subjectsGrid}>
                {Array.isArray(subjects) && subjects.length > 0 ? (
                    subjects.map((subject, index) => (
                        <TouchableOpacity
                            key={subject.id || index}
                            style={styles.subjectCard}
                            onPress={() => {
                                setSelectedSubject(subject);
                                setEditSubName(subject.name);
                                setEditSubDifficulty(String(subject.difficulty || 5));
                                setShowSubjectModal(true);
                            }}
                        >
                            <GlassCard style={styles.subjectGlass}>
                                <View style={[styles.subjectIcon, { backgroundColor: (subject.color || '#007AFF') + '20' }]}>
                                    <BookOpen size={20} color={subject.color || '#007AFF'} />
                                </View>
                                <Text style={styles.subjectName} numberOfLines={1}>{subject.name}</Text>
                                <Text style={styles.subjectGrade}>{subject.average || '0.0'}</Text>
                            </GlassCard>
                        </TouchableOpacity>
                    ))
                ) : (
                    <Text style={{ color: '#8E8E93', fontSize: 14, textAlign: 'center', width: '100%', marginTop: 10 }}>
                        No hay materias configuradas.
                    </Text>
                )}
            </View>

            {/* Quick Notes Section */}
            <NotesSection userId={user?.uid} />

            {/* Rank Modal */}
            <Modal visible={showRankModal} animationType="slide" transparent={true}>
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setShowRankModal(false)}
                >
                    <BlurView intensity={90} tint="dark" style={styles.modalContainer}>
                        <TouchableWithoutFeedback>
                            <View style={styles.modalContent}>
                                <View style={styles.modalHeader}>
                                    <Text style={styles.modalTitle}>Camino a la Maestría</Text>
                                    <TouchableOpacity onPress={() => setShowRankModal(false)} style={styles.closeIconBtn}>
                                        <X size={24} color="#8E8E93" />
                                    </TouchableOpacity>
                                </View>

                                <ScrollView showsVerticalScrollIndicator={false}>
                                    {RANKS.map((rank, index) => (
                                        <View key={index} style={[styles.rankItem, gamification?.rank === rank.title && styles.activeRankItem]}>
                                            <View style={[styles.rankIconContainer, { backgroundColor: rank.color + '20' }]}>
                                                <Star size={20} color={rank.color} fill={gamification?.level >= rank.minLevel ? rank.color : 'transparent'} />
                                            </View>
                                            <View style={styles.rankInfo}>
                                                <Text style={[styles.rankTitle, { color: gamification?.level >= rank.minLevel ? '#FFFFFF' : '#48484A' }]}>{rank.title}</Text>
                                                <Text style={styles.rankRequirements}>{rank.requirements}</Text>
                                            </View>
                                            {gamification?.level >= rank.minLevel && (
                                                <Zap size={16} color="#FFD60A" fill="#FFD60A" />
                                            )}
                                        </View>
                                    ))}
                                </ScrollView>
                            </View>
                        </TouchableWithoutFeedback>
                    </BlurView>
                </TouchableOpacity>
            </Modal>

            {/* Insights Detail Modal */}
            <Modal visible={showInsightsModal} animationType="fade" transparent={true}>
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => setShowInsightsModal(false)}
                >
                    <BlurView intensity={95} tint="dark" style={styles.modalContainer}>
                        <TouchableWithoutFeedback>
                            <View style={styles.fullModalContent}>
                                <View style={styles.modalHeader}>
                                    <Text style={styles.modalTitle}>Análisis</Text>
                                    <TouchableOpacity onPress={() => setShowInsightsModal(false)} style={styles.closeIconBtn}>
                                        <X size={24} color="#8E8E93" />
                                    </TouchableOpacity>
                                </View>
                                <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                                    <GlassCard style={styles.detailCard}>
                                        <Text style={styles.detailTitle}>Tendencia Semanal</Text>
                                        <Text style={styles.detailBody}>Has aumentado tus horas de estudio un 15% respecto a la semana pasada. La constancia es clave.</Text>
                                    </GlassCard>
                                    <GlassCard style={styles.detailCard}>
                                        <Text style={styles.detailTitle}>Fortalezas</Text>
                                        <Text style={styles.detailBody}>Destacas en el cumplimiento de tus micro-planes diarios. Tu tasa de éxito es del 92%.</Text>
                                    </GlassCard>
                                    <GlassCard style={styles.detailCard}>
                                        <Text style={styles.detailTitle}>Áreas de Mejora</Text>
                                        <Text style={styles.detailBody}>Las sesiones nocturnas parecen ser menos productivas para ti. Prueba a adelantar tus bloques de estudio.</Text>
                                    </GlassCard>
                                </ScrollView>
                            </View>
                        </TouchableWithoutFeedback>
                    </BlurView>
                </TouchableOpacity>
            </Modal>

            {/* Subject Edit Modal */}
            <Modal visible={showSubjectModal} animationType="slide" transparent={true}>
                <TouchableOpacity
                    style={styles.modalOverlay}
                    activeOpacity={1}
                    onPress={() => {
                        setShowSubjectModal(false);
                        setEditingExamId(null);
                    }}
                >
                    <BlurView intensity={90} tint="dark" style={styles.modalContainer}>
                        <TouchableWithoutFeedback>
                            <View style={styles.modalContent}>
                                <View style={styles.modalHeader}>
                                    <Text style={styles.modalTitle}>{selectedSubject ? 'Gestionar Materia' : 'Nueva Materia'}</Text>
                                    <TouchableOpacity onPress={() => setShowSubjectModal(false)} style={styles.closeIconBtn}>
                                        <X size={24} color="#8E8E93" />
                                    </TouchableOpacity>
                                </View>

                                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                                    <View style={styles.formGroup}>
                                        <Text style={styles.label}>Nombre de la Materia</Text>
                                        <TextInput
                                            style={styles.formInput}
                                            value={editSubName}
                                            onChangeText={setEditSubName}
                                            placeholder="E.g. Matemáticas"
                                            placeholderTextColor="#48484A"
                                        />
                                    </View>

                                    <View style={styles.formGroup}>
                                        <Text style={styles.label}>Dificultad (1-10)</Text>
                                        <TextInput
                                            style={styles.formInput}
                                            value={editSubDifficulty}
                                            onChangeText={setEditSubDifficulty}
                                            keyboardType="numeric"
                                            maxLength={2}
                                            placeholder="5"
                                            placeholderTextColor="#48484A"
                                        />
                                    </View>

                                    {selectedSubject && (
                                        <>
                                            <View style={styles.divider} />
                                            <View style={styles.subjectMetaRow}>
                                                <Text style={styles.subModalTitle}>Historial de Notas</Text>
                                                <View style={styles.avgBadge}>
                                                    <Text style={styles.avgBadgeText}>{selectedSubject.average || '0.0'}</Text>
                                                </View>
                                            </View>

                                            {subjectExams.length > 0 ? (
                                                subjectExams.map((exam) => (
                                                    <View key={exam.id} style={styles.examItem}>
                                                        <View style={styles.examInfo}>
                                                            <Text style={styles.examName}>{exam.name}</Text>
                                                            <Text style={styles.examDate}>
                                                                {exam.date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                                                            </Text>
                                                        </View>

                                                        {editingExamId === exam.id ? (
                                                            <View style={styles.examEditRow}>
                                                                <TextInput
                                                                    style={styles.gradeInput}
                                                                    value={tempGrade}
                                                                    onChangeText={setTempGrade}
                                                                    keyboardType="numeric"
                                                                    autoFocus
                                                                    placeholder="N"
                                                                />
                                                                <TouchableOpacity
                                                                    onPress={() => handleUpdateExamGrade(exam.id)}
                                                                    style={styles.examActionBtn}
                                                                >
                                                                    <Check size={18} color="#30D158" />
                                                                </TouchableOpacity>
                                                                <TouchableOpacity
                                                                    onPress={() => setEditingExamId(null)}
                                                                    style={styles.examActionBtn}
                                                                >
                                                                    <X size={18} color="#FF453A" />
                                                                </TouchableOpacity>
                                                            </View>
                                                        ) : (
                                                            <TouchableOpacity
                                                                style={styles.examGradeContainer}
                                                                onPress={() => {
                                                                    setEditingExamId(exam.id);
                                                                    setTempGrade(String(exam.grade || ''));
                                                                }}
                                                            >
                                                                <Text style={styles.examGrade}>{exam.grade || '-'}</Text>
                                                                <Edit2 size={12} color="#8E8E93" style={{ marginLeft: 4 }} />
                                                            </TouchableOpacity>
                                                        )}
                                                    </View>
                                                ))
                                            ) : (
                                                <Text style={styles.emptyExams}>No hay exámenes registrados aún.</Text>
                                            )}

                                            <TouchableOpacity
                                                style={[styles.deleteBtn, isDeleting && { opacity: 0.5 }]}
                                                onPress={() => handleDeleteSubject(selectedSubject)}
                                                disabled={isDeleting}
                                            >
                                                <Text style={styles.deleteBtnText}>
                                                    {isDeleting ? 'Eliminando...' : 'Eliminar Materia'}
                                                </Text>
                                            </TouchableOpacity>
                                        </>
                                    )}

                                    <TouchableOpacity
                                        style={[styles.saveFullBtn, isDeleting && { opacity: 0.5 }]}
                                        onPress={handleSaveSubject}
                                        disabled={isDeleting}
                                    >
                                        <Text style={styles.saveFullBtnText}>Guardar Todos los Cambios</Text>
                                    </TouchableOpacity>
                                </ScrollView>
                            </View>
                        </TouchableWithoutFeedback>
                    </BlurView>
                </TouchableOpacity>
            </Modal>

            {/* ── Custom Deletion Modal ── */}
            <Modal
                visible={showDeleteModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowDeleteModal(false)}
            >
                <BlurView intensity={20} tint="dark" style={styles.modalOverlay}>
                    <TouchableWithoutFeedback onPress={() => setShowDeleteModal(false)}>
                        <View style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }}>
                            <TouchableWithoutFeedback>
                                <GlassCard style={styles.deleteModalContent}>
                                    <View style={styles.warningIconContainer}>
                                        <Trash2 size={32} color="#FF453A" />
                                    </View>
                                    <Text style={styles.modalHeaderTitle}>¿Eliminar Materia?</Text>
                                    <Text style={styles.modalDescription}>
                                        ¿Estás seguro de que quieres eliminar <Text style={{ fontWeight: 'bold', color: '#FFF' }}>{subjectToDelete?.name}</Text>? Esta acción no se puede deshacer y perderás el progreso asociado.
                                    </Text>

                                    <View style={styles.modalFooter}>
                                        <TouchableOpacity
                                            style={styles.cancelModalBtn}
                                            onPress={() => setShowDeleteModal(false)}
                                            disabled={isDeleting}
                                        >
                                            <Text style={styles.cancelModalText}>Cancelar</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={styles.confirmDeleteBtn}
                                            onPress={() => confirmDelete(subjectToDelete)}
                                            disabled={isDeleting}
                                        >
                                            {isDeleting ? (
                                                <ActivityIndicator size="small" color="#FFF" />
                                            ) : (
                                                <Text style={styles.confirmDeleteText}>Eliminar</Text>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                </GlassCard>
                            </TouchableWithoutFeedback>
                        </View>
                    </TouchableWithoutFeedback>
                </BlurView>
            </Modal>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
    },
    header: {
        alignItems: 'center',
        paddingTop: 60,
        paddingBottom: 30,
    },
    avatarContainer: {
        position: 'relative',
        marginBottom: 15,
    },
    avatar: {
        width: 110,
        height: 110,
        borderRadius: 55,
        borderWidth: 3,
        borderColor: '#1C1C1E',
    },
    editBadge: {
        position: 'absolute',
        bottom: 5,
        right: 5,
        backgroundColor: '#007AFF',
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#000000',
    },
    userName: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    nameSection: {
        marginBottom: 8,
        width: '100%',
        alignItems: 'center',
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    editNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1C1C1E',
        borderRadius: 12,
        paddingHorizontal: 12,
        width: width * 0.7,
    },
    nameInput: {
        flex: 1,
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: 'bold',
        paddingVertical: 8,
    },
    saveBtn: {
        padding: 5,
    },
    rankBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
    },
    rankText: {
        fontSize: 14,
        fontWeight: 'bold',
        marginLeft: 6,
    },
    progressCard: {
        marginHorizontal: 20,
        padding: 20,
        marginBottom: 25,
    },
    levelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 15,
    },
    levelBadge: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#007AFF',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    levelNumber: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    xpInfo: {
        flex: 1,
    },
    xpTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    xpSub: {
        fontSize: 13,
        color: '#8E8E93',
    },
    progressBarBg: {
        height: 10,
        backgroundColor: '#1C1C1E',
        borderRadius: 5,
        overflow: 'hidden',
        marginBottom: 8,
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 5,
    },
    xpLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    xpProgressText: {
        fontSize: 12,
        color: '#8E8E93',
        fontWeight: '600',
    },
    xpPercentageText: {
        fontSize: 12,
        color: '#007AFF',
        fontWeight: 'bold',
    },
    statsRow: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        justifyContent: 'space-between',
        marginBottom: 30,
    },
    statBox: {
        width: (width - 60) / 3,
        alignItems: 'center',
        paddingVertical: 15,
    },
    statValue: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 12,
        color: '#8E8E93',
    },
    sectionHeader: {
        paddingHorizontal: 20,
        marginBottom: 15,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    insightsCard: {
        marginHorizontal: 20,
        padding: 20,
        marginBottom: 20,
    },
    insightItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 15,
    },
    insightContent: {
        marginLeft: 12,
        flex: 1,
    },
    insightTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
        marginBottom: 4,
    },
    insightText: {
        fontSize: 14,
        color: '#8E8E93',
        lineHeight: 20,
    },
    viewMoreBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderTopWidth: 1,
        borderTopColor: '#2C2C2E',
        paddingTop: 15,
    },
    viewMoreBtnText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#007AFF',
        marginRight: 4,
    },
    modalContainer: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    modalContent: {
        backgroundColor: '#1C1C1E',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        maxHeight: '90%',
        padding: 25,
        width: '100%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 25,
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#FFFFFF',
    },
    closeIconBtn: {
        padding: 5,
    },
    closeBtn: {
        backgroundColor: '#2C2C2E',
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: 15,
    },
    closeBtnText: {
        color: '#FFFFFF',
        fontWeight: '600',
    },
    rankItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#2C2C2E',
    },
    activeRankItem: {
        backgroundColor: '#2C2C2E20',
        borderRadius: 15,
    },
    rankIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
    },
    rankInfo: {
        flex: 1,
    },
    rankTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: '#FFFFFF',
        marginBottom: 2,
    },
    rankRequirements: {
        fontSize: 13,
        color: '#8E8E93',
    },
    divider: {
        height: 1,
        backgroundColor: '#2C2C2E',
        marginVertical: 10,
    },
    subjectMetaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
        marginTop: 10,
    },
    subModalTitle: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    avgBadge: {
        backgroundColor: '#007AFF20',
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#007AFF',
    },
    avgBadgeText: {
        color: '#007AFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
    examItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#1C1C1E',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#2C2C2E',
    },
    examInfo: {
        flex: 1,
    },
    examName: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '600',
    },
    examDate: {
        color: '#8E8E93',
        fontSize: 12,
        marginTop: 2,
    },
    examGradeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2C2C2E',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },
    examGrade: {
        color: '#30D158',
        fontSize: 16,
        fontWeight: 'bold',
    },
    emptyExams: {
        color: '#48484A',
        textAlign: 'center',
        marginVertical: 20,
        fontStyle: 'italic',
    },
    examEditRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    gradeInput: {
        backgroundColor: '#3A3A3C',
        color: '#FFFFFF',
        width: 40,
        height: 35,
        textAlign: 'center',
        borderRadius: 6,
        fontSize: 16,
        fontWeight: 'bold',
    },
    examActionBtn: {
        marginLeft: 8,
        padding: 5,
    },
    formGroup: {
        marginBottom: 20,
    },
    label: {
        color: '#8E8E93',
        fontSize: 14,
        marginBottom: 8,
        fontWeight: '600',
    },
    formInput: {
        backgroundColor: '#2C2C2E',
        borderRadius: 12,
        padding: 15,
        color: '#FFFFFF',
        fontSize: 16,
    },
    difficultyContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    difficultyBox: {
        width: (width - 82) / 5,
        height: 40,
        backgroundColor: '#2C2C2E',
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    activeDifficultyBox: {
        backgroundColor: '#007AFF20',
        borderColor: '#007AFF',
    },
    difficultyText: {
        color: '#8E8E93',
        fontWeight: 'bold',
    },
    activeDifficultyText: {
        color: '#007AFF',
    },
    rowBetween: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    addBtn: {
        padding: 5,
    },
    subjectsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 15,
        justifyContent: 'space-between',
    },
    subjectCard: {
        width: (width - 50) / 2,
        marginBottom: 15,
    },
    subjectGlass: {
        padding: 15,
        alignItems: 'center',
    },
    subjectIcon: {
        width: 40,
        height: 40,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
    },
    subjectInfoContainer: {
        flex: 1,
    },
    subjectName: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 4,
    },
    subjectGrade: {
        color: '#007AFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    fullModalContent: {
        backgroundColor: '#1C1C1E',
        borderTopLeftRadius: 30,
        borderTopRightRadius: 30,
        height: '92%',
        padding: 25,
        marginTop: 60,
    },
    detailCard: {
        padding: 20,
        marginBottom: 15,
    },
    detailTitle: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    detailBody: {
        color: '#8E8E93',
        fontSize: 14,
        lineHeight: 20,
    },
    deleteBtn: {
        backgroundColor: '#FF453A20',
        padding: 15,
        borderRadius: 15,
        alignItems: 'center',
        marginBottom: 15,
        borderWidth: 1,
        borderColor: '#FF453A',
    },
    deleteBtnText: {
        color: '#FF453A',
        fontWeight: 'bold',
    },
    saveFullBtn: {
        backgroundColor: '#007AFF',
        padding: 15,
        borderRadius: 15,
        alignItems: 'center',
    },
    saveFullBtnText: {
        color: '#FFFFFF',
        fontWeight: 'bold',
    },
    noteCard: {
        marginHorizontal: 16,
        marginBottom: 10,
        padding: 14,
    },
    noteRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
    },
    noteText: {
        flex: 1,
        color: '#FFFFFF',
        fontSize: 14,
        lineHeight: 20,
        fontWeight: '500',
    },
    noteDeleteBtn: {
        padding: 4,
        marginTop: 1,
    },
    noteDate: {
        marginTop: 8,
        color: '#636366',
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    deleteModalContent: {
        width: width - 48,
        maxWidth: 380,
        borderRadius: 32,
        padding: 32,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(28, 28, 30, 0.95)',
    },
    warningIconContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#FF453A20',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalHeaderTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#FFFFFF',
        marginBottom: 12,
        textAlign: 'center',
    },
    modalDescription: {
        fontSize: 15,
        color: '#8E8E93',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 30,
    },
    modalFooter: {
        flexDirection: 'row',
        gap: 16,
        width: '100%',
    },
    cancelModalBtn: {
        flex: 1,
        height: 50,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#38383A',
    },
    cancelModalText: {
        color: '#8E8E93',
        fontSize: 16,
        fontWeight: '600',
    },
    confirmDeleteBtn: {
        flex: 1,
        height: 50,
        backgroundColor: '#FF453A',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 14,
    },
    confirmDeleteText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
