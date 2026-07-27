import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../theme/tokens';
import Button from './ui/Button';

const font = tokens.typography.families.inter;

/**
 * Bottom sheet for grading a finished exam.
 *
 * Only the grade is collected. The previous version also asked for a weight,
 * but the caller's handler signature is (examId, grade) — the weight was
 * discarded before it ever reached Firestore, and `updateAverageGrade` already
 * treats a missing weight as 1. Asking for a value we throw away is worse than
 * not asking.
 */
export default function GradeModal({ visible, onClose, exam, onSave }) {
  const insets = useSafeAreaInsets();
  const [grade, setGrade] = useState('');

  useEffect(() => {
    if (visible) setGrade('');
  }, [visible]);

  const numeric = parseFloat(grade.replace(',', '.'));
  const isEmpty = grade.trim() === '';
  const isValid = !isEmpty && !isNaN(numeric) && numeric >= 0 && numeric <= 10;
  const showError = !isEmpty && !isValid;

  const handleSave = () => {
    if (!isValid) return;
    onSave(exam.id, numeric);
    onClose();
  };

  const formattedDate = exam?.date
    ? new Date(exam.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    : '';

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      {/* Tapping the dimmed area dismisses; the sheet swallows its own taps. */}
      <Pressable style={styles.overlay} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          <Pressable onPress={() => {}}>
            <Animated.View
              entering={SlideInDown.duration(300)}
              style={[styles.sheet, { paddingBottom: 24 + insets.bottom }]}
            >
              <View style={styles.handle} />

              <Text style={styles.title}>Añadir nota</Text>
              <Text style={styles.subtitle}>
                {exam?.name}
                {formattedDate ? ` · Examen ${formattedDate}` : ''}
              </Text>

              <Text style={styles.label}>Nota obtenida (0–10)</Text>
              <TextInput
                style={[styles.input, showError && styles.inputError]}
                value={grade}
                onChangeText={setGrade}
                placeholder="Ej. 7,5"
                placeholderTextColor={tokens.colors.textDisabled}
                keyboardType="decimal-pad"
                autoFocus
                maxLength={4}
              />
              <Text style={[styles.helper, showError && styles.helperError]}>
                {showError
                  ? 'Introduce una nota entre 0 y 10.'
                  : 'Se usará para recalcular tu media de la asignatura.'}
              </Text>

              <View style={styles.actions}>
                <Button
                  title="Cancelar"
                  variant="secondary"
                  onPress={onClose}
                  style={styles.actionButton}
                />
                <Button
                  title="Guardar nota"
                  onPress={handleSave}
                  disabled={!isValid}
                  style={styles.actionButton}
                />
              </View>
            </Animated.View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  keyboardView: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: tokens.colors.surfaceCard,
    borderTopWidth: 1,
    borderTopColor: tokens.colors.borderDefault,
    borderTopLeftRadius: tokens.radius.sheet,
    borderTopRightRadius: tokens.radius.sheet,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.colors.borderDefault,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontFamily: font.bold,
    fontSize: 22,
    color: tokens.colors.textPrimary,
  },
  subtitle: {
    fontFamily: font.regular,
    fontSize: 15,
    color: tokens.colors.textSecondary,
    marginTop: 4,
    marginBottom: 24,
  },
  label: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: tokens.colors.background,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.btn,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: font.semibold,
    fontSize: 17,
    color: tokens.colors.textPrimary,
  },
  inputError: {
    borderColor: tokens.colors.danger,
  },
  helper: {
    fontFamily: font.regular,
    fontSize: 13,
    color: tokens.colors.textSecondary,
    marginTop: 8,
    marginBottom: 24,
  },
  helperError: {
    color: tokens.colors.danger,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },
});
