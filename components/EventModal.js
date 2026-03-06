import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Alert, TouchableWithoutFeedback } from 'react-native';
import { useState, useEffect } from 'react';
import { X, Calendar as CalendarIcon, Check } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur'; // Metric: User asked for "glassmorphism", BlurView is best for this if available, otherwise dark translucent bg.
import { tokens } from '../theme/tokens';

export default function EventModal({ visible, onClose, selectedDate, existingEvent, onSave, onDelete, subjects = [] }) {
    const [name, setName] = useState('');
    const [selectedSubjectId, setSelectedSubjectId] = useState(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [editingDate, setEditingDate] = useState(false);
    const [internalDate, setInternalDate] = useState(new Date());
    const [dayInput, setDayInput] = useState('');
    const [monthInput, setMonthInput] = useState('');
    const [yearInput, setYearInput] = useState('');

    useEffect(() => {
        if (visible) {
            setShowDeleteConfirm(false);
            setEditingDate(false);
            const base = selectedDate ? new Date(selectedDate) : new Date();
            setInternalDate(base);
            setDayInput(String(base.getDate()));
            setMonthInput(String(base.getMonth() + 1));
            setYearInput(String(base.getFullYear()));
            if (existingEvent) {
                setName(existingEvent.name || '');
                setSelectedSubjectId(existingEvent.subjectId || 'undefined');
            } else {
                setName('');
                setSelectedSubjectId(null);
            }
        }
    }, [visible, existingEvent, selectedDate]);

    const applyDateInput = () => {
        const d = parseInt(dayInput, 10);
        const m = parseInt(monthInput, 10);
        const y = parseInt(yearInput, 10);
        if (!isNaN(d) && !isNaN(m) && !isNaN(y) && d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 2024) {
            const newDate = new Date(y, m - 1, d);
            setInternalDate(newDate);
        }
        setEditingDate(false);
    };

    const handleSave = () => {
        if (!name.trim()) {
            Alert.alert('Falta información', 'Por favor escribe un nombre para el evento.');
            return;
        }
        if (!selectedSubjectId) {
            Alert.alert('Falta información', 'Por favor selecciona una materia.');
            return;
        }

        const eventData = {
            id: existingEvent ? existingEvent.id : null,
            name,
            subjectId: selectedSubjectId,
            date: internalDate.toISOString(),
            type: 'exam',
        };

        onSave(eventData);
        onClose();
    };

    const formattedDate = internalDate.toLocaleDateString('es-ES', {
        weekday: 'short',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    style={styles.modalOverlay}
                >
                    <TouchableWithoutFeedback>
                        <View style={styles.modalContainer}>
                            {/* Header */}
                            <View style={styles.header}>
                                <Text style={styles.title}>
                                    {existingEvent ? 'Editar evento' : 'Nuevo evento'}
                                </Text>
                                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                    <X size={20} color="#8E8E93" />
                                </TouchableOpacity>
                            </View>

                            {/* Content */}
                            <View style={styles.content}>

                                {/* Date Picker */}
                                {editingDate ? (
                                    <View style={styles.datePicker}>
                                        <Text style={styles.datePickerLabel}>Día</Text>
                                        <TextInput
                                            style={styles.datePickerInput}
                                            value={dayInput}
                                            onChangeText={setDayInput}
                                            keyboardType="number-pad"
                                            maxLength={2}
                                            placeholder="DD"
                                            placeholderTextColor="#636366"
                                        />
                                        <Text style={styles.datePickerSep}>/</Text>
                                        <Text style={styles.datePickerLabel}>Mes</Text>
                                        <TextInput
                                            style={styles.datePickerInput}
                                            value={monthInput}
                                            onChangeText={setMonthInput}
                                            keyboardType="number-pad"
                                            maxLength={2}
                                            placeholder="MM"
                                            placeholderTextColor="#636366"
                                        />
                                        <Text style={styles.datePickerSep}>/</Text>
                                        <Text style={styles.datePickerLabel}>Año</Text>
                                        <TextInput
                                            style={[styles.datePickerInput, { width: 60 }]}
                                            value={yearInput}
                                            onChangeText={setYearInput}
                                            keyboardType="number-pad"
                                            maxLength={4}
                                            placeholder="AAAA"
                                            placeholderTextColor="#636366"
                                        />
                                        <TouchableOpacity onPress={applyDateInput} style={styles.dateConfirmBtn}>
                                            <Check size={16} color="#fff" />
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <TouchableOpacity style={styles.dateContainer} onPress={() => setEditingDate(true)}>
                                        <CalendarIcon size={16} color="#4A90E2" />
                                        <Text style={styles.dateText}>{formattedDate}</Text>
                                        <Text style={styles.dateTap}>Cambiar</Text>
                                    </TouchableOpacity>
                                )}

                                {/* Name Input */}
                                <Text style={styles.label}>Nombre</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Ej. Examen de Cálculo"
                                    placeholderTextColor="#636366"
                                    value={name}
                                    onChangeText={setName}
                                    autoFocus={false}
                                />

                                {/* Subject Selector (Horizontal Slide) */}
                                <Text style={styles.label}>Materia</Text>
                                <View style={styles.subjectsContainer}>
                                    <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        contentContainerStyle={styles.subjectsContent}
                                    >
                                        {subjects.map((subject) => (
                                            <TouchableOpacity
                                                key={subject.id}
                                                style={[
                                                    styles.subjectChip,
                                                    selectedSubjectId === subject.id && { backgroundColor: subject.color || tokens.colors.primary, borderColor: subject.color || tokens.colors.primary }
                                                ]}
                                                onPress={() => setSelectedSubjectId(subject.id)}
                                            >
                                                <View style={[styles.colorDot, { backgroundColor: subject.color || '#fff' }]} />
                                                <Text style={[
                                                    styles.subjectText,
                                                    selectedSubjectId === subject.id && styles.subjectTextSelected
                                                ]}>
                                                    {subject.name}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                        {/* Undefined Option */}
                                        <TouchableOpacity
                                            style={[
                                                styles.subjectChip,
                                                selectedSubjectId === 'undefined' && styles.subjectChipSelected
                                            ]}
                                            onPress={() => setSelectedSubjectId('undefined')}
                                        >
                                            <View style={[styles.colorDot, { backgroundColor: '#8E8E93' }]} />
                                            <Text style={[
                                                styles.subjectText,
                                                selectedSubjectId === 'undefined' && styles.subjectTextSelected
                                            ]}>
                                                Indefinido
                                            </Text>
                                        </TouchableOpacity>
                                    </ScrollView>
                                </View>
                            </View>

                            {/* Footer Buttons */}
                            <View style={styles.footer}>
                                {showDeleteConfirm ? (
                                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255, 69, 58, 0.1)', padding: 12, borderRadius: 16 }}>
                                        <Text style={{ color: '#FF453A', fontSize: 13, fontWeight: '600', flex: 1 }}>¿Eliminar examen?</Text>
                                        <View style={{ flexDirection: 'row', gap: 12 }}>
                                            <TouchableOpacity onPress={() => setShowDeleteConfirm(false)}>
                                                <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>No</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={() => {
                                                if (!existingEvent?.id) {
                                                    console.error("No existingEvent.id for deletion");
                                                    return;
                                                }
                                                onDelete && onDelete(existingEvent.id);
                                            }}>
                                                <Text style={{ color: '#FF453A', fontSize: 13, fontWeight: '800' }}>SÍ, BORRAR</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ) : (
                                    <>
                                        {existingEvent ? (
                                            <TouchableOpacity
                                                style={styles.cancelBtn}
                                                onPress={() => setShowDeleteConfirm(true)}
                                            >
                                                <Text style={[styles.cancelText, { color: '#FF453A' }]}>Eliminar</Text>
                                            </TouchableOpacity>
                                        ) : (
                                            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                                                <Text style={styles.cancelText}>Cancelar</Text>
                                            </TouchableOpacity>
                                        )}

                                        <TouchableOpacity onPress={handleSave} style={styles.saveBtnWrapper}>
                                            <LinearGradient
                                                colors={['#4A90E2', '#357ABD']}
                                                style={styles.saveBtn}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 0 }}
                                            >
                                                <Text style={styles.saveText}>
                                                    {existingEvent ? 'Guardar cambios' : 'Añadir evento'}
                                                </Text>
                                            </LinearGradient>
                                        </TouchableOpacity>
                                    </>
                                )}
                            </View>
                        </View>
                    </TouchableWithoutFeedback>
                </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        padding: 20,
    },
    modalContainer: {
        backgroundColor: '#1C1C1E', // Dark theme background
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        padding: 24,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    closeBtn: {
        padding: 4,
    },
    content: {
        gap: 16,
    },
    dateContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(74, 144, 226, 0.1)',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(74, 144, 226, 0.2)',
    },
    dateText: {
        fontSize: 14,
        color: '#4A90E2',
        fontWeight: '600',
        flex: 1,
        textTransform: 'capitalize',
    },
    dateTap: {
        fontSize: 11,
        color: '#4A90E2',
        fontWeight: '800',
        textTransform: 'uppercase',
        opacity: 0.7,
    },
    datePicker: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2C2C2E',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        gap: 6,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: 'rgba(74, 144, 226, 0.3)',
    },
    datePickerLabel: {
        color: '#8E8E93',
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    datePickerInput: {
        backgroundColor: '#1C1C1E',
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
        paddingHorizontal: 6,
        paddingVertical: 6,
        borderRadius: 8,
        width: 38,
        textAlign: 'center',
    },
    datePickerSep: {
        color: '#636366',
        fontSize: 14,
        fontWeight: '700',
    },
    dateConfirmBtn: {
        backgroundColor: '#4A90E2',
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 2,
    },
    label: {
        fontSize: 14,
        color: '#8E8E93',
        fontWeight: '500',
        marginBottom: -8, // Tighten spacing
    },
    input: {
        backgroundColor: '#2C2C2E',
        borderRadius: 12,
        padding: 16,
        color: '#FFFFFF',
        fontSize: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    subjectsContainer: {
        height: 50, // Fixed height for scroll 
    },
    subjectsContent: {
        gap: 8,
        alignItems: 'center',
    },
    subjectChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#2C2C2E',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    subjectChipSelected: {
        backgroundColor: '#4A90E2',
        borderColor: '#4A90E2',
    },
    colorDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    subjectText: {
        fontSize: 13,
        color: '#FFFFFF',
    },
    subjectTextSelected: {
        fontWeight: '700',
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 16,
        marginTop: 32,
    },
    cancelBtn: {
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    cancelText: {
        fontSize: 16,
        color: '#8E8E93',
        fontWeight: '600',
    },
    saveBtnWrapper: {
        shadowColor: '#4A90E2',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
    },
    saveBtn: {
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 100,
    },
    saveText: {
        fontSize: 16,
        color: '#FFFFFF',
        fontWeight: '700',
    },
});
