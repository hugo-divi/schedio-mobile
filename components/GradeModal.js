import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { tokens } from '../theme/tokens';
import BottomSheet, { FieldLabel, sheetStyles } from './ui/BottomSheet';
import Button from './ui/Button';

const font = tokens.typography.families.inter;

/**
 * Bottom sheet for grading a finished exam.
 *
 * Collects both grade and weight, matching QuickActionsModal's "Nota de
 * examen" flow — `updateAverageGrade` weighs every completed exam
 * (`parseFloat(exam.weight) || 1`), so a grade saved from here without a
 * weight was silently averaging in at weight 1 regardless of what the
 * student actually entered, out of step with the one other place a grade
 * can be added.
 */
export default function GradeModal({ visible, onClose, exam, onSave }) {
  const [grade, setGrade] = useState('');
  const [weight, setWeight] = useState('100');

  useEffect(() => {
    if (visible) {
      setGrade('');
      setWeight('100');
    }
  }, [visible]);

  const numeric = parseFloat(grade.replace(',', '.'));
  const isEmpty = grade.trim() === '';
  const isValid = !isEmpty && !isNaN(numeric) && numeric >= 0 && numeric <= 10;
  const showError = !isEmpty && !isValid;

  const weightNumeric = parseFloat(weight.replace(',', '.'));
  const weightEmpty = weight.trim() === '';
  const isWeightValid = !weightEmpty && !isNaN(weightNumeric) && weightNumeric > 0;
  const showWeightError = !weightEmpty && !isWeightValid;

  const handleSave = () => {
    if (!isValid || !isWeightValid) return;
    onSave(exam.id, numeric, weightNumeric / 100);
    onClose();
  };

  const formattedDate = exam?.date
    ? new Date(exam.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    : '';

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
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
          {showError ? 'Introduce una nota entre 0 y 10.' : ' '}
        </Text>
      </View>

      <View style={styles.field}>
        <FieldLabel>Peso %</FieldLabel>
        <TextInput
          style={[styles.input, showWeightError && styles.inputError]}
          value={weight}
          onChangeText={setWeight}
          placeholder="Ej. 100"
          placeholderTextColor={tokens.colors.textDisabled}
          keyboardType="decimal-pad"
          maxLength={4}
        />
        <Text style={[sheetStyles.helper, showWeightError && sheetStyles.helperError]}>
          {showWeightError
            ? 'Introduce un peso válido (por ejemplo, 100).'
            : 'Cuánto cuenta este examen en la media de la asignatura.'}
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
          disabled={!isValid || !isWeightValid}
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
