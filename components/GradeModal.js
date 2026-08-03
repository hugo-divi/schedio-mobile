import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { tokens } from '../theme/tokens';
import BottomSheet, { FieldLabel, sheetStyles } from './ui/BottomSheet';
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
    <BottomSheet
      visible={visible}
      onClose={onClose}
      avoidKeyboard
      title="Añadir nota"
      subtitle={`${exam?.name ?? ''}${formattedDate ? ` · Examen ${formattedDate}` : ''}`}
    >
      <View style={styles.field}>
        <FieldLabel>Nota obtenida (0–10)</FieldLabel>
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
        <Text style={[sheetStyles.helper, showError && sheetStyles.helperError]}>
          {showError
            ? 'Introduce una nota entre 0 y 10.'
            : 'Se usará para recalcular tu media de la asignatura.'}
        </Text>
      </View>

      <View style={sheetStyles.actions}>
        <Button
          title="Cancelar"
          variant="secondary"
          onPress={onClose}
          style={sheetStyles.actionButton}
        />
        <Button
          title="Guardar nota"
          onPress={handleSave}
          disabled={!isValid}
          style={sheetStyles.actionButton}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  field: {
    marginTop: 24,
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
});
