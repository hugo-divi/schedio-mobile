import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, TextInput, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { BlurView } from 'expo-blur';
import { X, Check } from 'lucide-react-native';
import { tokens } from '../theme/tokens';
import useThemeStore from '../store/themeStore';

export default function GradeModal({ visible, onClose, exam, onSave }) {
    const { isDarkMode } = useThemeStore();
    const theme = isDarkMode ? tokens.colors.dark : tokens.colors.light;
    const [grade, setGrade] = useState('');
    const [weight, setWeight] = useState('100'); // Default 100%
    const [error, setError] = useState('');
    const gradeInputRef = useRef(null);
    const weightInputRef = useRef(null);

    useEffect(() => {
        if (visible) {
            setGrade('');
            setWeight('100');
            setError('');
        }
    }, [visible]);

    const handleSave = () => {
        const numGrade = parseFloat(grade.replace(',', '.'));
        const numWeight = parseFloat(weight.replace(',', '.')) / 100;

        if (isNaN(numGrade) || numGrade < 0 || numGrade > 10) {
            setError('La nota debe estar entre 0 y 10');
            return;
        }

        if (isNaN(numWeight) || numWeight <= 0) {
            setError('El peso debe ser superior al 0%');
            return;
        }

        onSave(exam.id, numGrade, numWeight);
        onClose();
    };

    if (!visible) return null;

    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={styles.overlay}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />

                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={styles.keyboardView}
                    >
                        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                            <View style={[styles.modalContainer, { backgroundColor: theme.card, borderColor: theme.border }]}>
                                {/* Header */}
                                <View style={styles.header}>
                                    <Text style={[styles.title, { color: theme.text }]}>Calificar Examen</Text>
                                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                                        <X size={20} color={theme.textSecondary} />
                                    </TouchableOpacity>
                                </View>

                                {/* Content */}
                                <View style={styles.content}>
                                    <Text style={[styles.examName, { color: theme.text }]}>{exam?.name}</Text>
                                    <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
                                        <TouchableOpacity
                                            style={[styles.inputContainer, { flex: 2, backgroundColor: isDarkMode ? '#1C1C1E' : '#F2F2F7', borderColor: error ? '#FF453A' : theme.border }]}
                                            activeOpacity={1}
                                            onPress={() => gradeInputRef.current?.focus()}
                                        >
                                            <Text style={styles.inputMiniLabel}>NOTA (0-10)</Text>
                                            <TextInput
                                                ref={gradeInputRef}
                                                style={[styles.input, { color: theme.text }]}
                                                value={grade}
                                                onChangeText={(text) => {
                                                    setGrade(text);
                                                    setError('');
                                                }}
                                                placeholder="8.5"
                                                placeholderTextColor={theme.textSecondary}
                                                keyboardType="decimal-pad"
                                                autoFocus
                                                maxLength={4}
                                            />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.inputContainer, { flex: 1, backgroundColor: isDarkMode ? '#1C1C1E' : '#F2F2F7', borderColor: theme.border }]}
                                            activeOpacity={1}
                                            onPress={() => weightInputRef.current?.focus()}
                                        >
                                            <Text style={styles.inputMiniLabel}>PESO %</Text>
                                            <TextInput
                                                ref={weightInputRef}
                                                style={[styles.input, { color: theme.text }]}
                                                value={weight}
                                                onChangeText={(text) => {
                                                    setWeight(text);
                                                    setError('');
                                                }}
                                                placeholder="100"
                                                placeholderTextColor={theme.textSecondary}
                                                keyboardType="numeric"
                                                maxLength={3}
                                            />
                                        </TouchableOpacity>
                                    </View>

                                    {error ? <Text style={styles.errorText}>{error}</Text> : null}
                                </View>

                                {/* Footer */}
                                <View style={styles.footer}>
                                    <TouchableOpacity
                                        style={[styles.cancelButton, { borderColor: theme.border }]}
                                        onPress={onClose}
                                    >
                                        <Text style={[styles.cancelButtonText, { color: theme.textSecondary }]}>Cancelar</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={[styles.saveButton, { opacity: grade ? 1 : 0.5 }]}
                                        onPress={handleSave}
                                        disabled={!grade}
                                    >
                                        <Text style={styles.saveButtonText}>Guardar Nota</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </TouchableWithoutFeedback>
                    </KeyboardAvoidingView>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    keyboardView: {
        width: '100%',
        alignItems: 'center',
    },
    modalContainer: {
        width: '100%',
        maxWidth: 340,
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
    },
    closeButton: {
        padding: 4,
    },
    content: {
        alignItems: 'center',
        marginBottom: 24,
    },
    examName: {
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 8,
        textAlign: 'center',
    },
    label: {
        fontSize: 14,
        color: '#8E8E93',
        marginBottom: 16,
    },
    inputContainer: {
        height: 64,
        borderRadius: 16,
        borderWidth: 1,
        justifyContent: 'center',
        paddingHorizontal: 16,
    },
    inputMiniLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: '#8E8E93',
        marginBottom: 2,
        letterSpacing: 0.5,
    },
    input: {
        fontSize: 20,
        fontWeight: '700',
        padding: 0,
    },
    errorText: {
        color: '#FF453A',
        fontSize: 12,
        marginTop: 8,
    },
    footer: {
        flexDirection: 'row',
        gap: 12,
    },
    cancelButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 100,
        borderWidth: 1,
        alignItems: 'center',
    },
    cancelButtonText: {
        fontWeight: '600',
        fontSize: 15,
    },
    saveButton: {
        flex: 1,
        backgroundColor: '#4A90E2',
        paddingVertical: 14,
        borderRadius: 100,
        alignItems: 'center',
    },
    saveButtonText: {
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: 15,
    },
});
