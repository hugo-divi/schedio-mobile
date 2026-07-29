import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Calendar as CalendarIcon, Trash2 } from 'lucide-react-native';
import { tokens } from '../theme/tokens';
import BottomSheet, { FieldLabel, sheetStyles } from './ui/BottomSheet';
import Button from './ui/Button';

const font = tokens.typography.families.inter;

const TYPES = [
  { key: 'exam', label: 'Examen' },
  { key: 'task', label: 'Tarea' },
];

// Stored on the exam as `priority` (1-10). The home screen flags anything from
// 8 up as high priority, so the three options map onto that scale.
const PRIORITIES = [
  { key: 3, label: 'Baja' },
  { key: 5, label: 'Normal' },
  { key: 9, label: 'Alta' },
];

const UNASSIGNED = 'undefined';

/**
 * Create/edit sheet for exams and tasks. Reached from the calendar, from a
 * long-press on an exam row, and from the central + button.
 *
 * Replaces the old three-field DD/MM/YYYY entry with the platform date picker,
 * and finally exposes `type` and `priority` — both were being written with
 * hardcoded values ('exam' and 5) that no user could ever change.
 */
export default function EventModal({
  visible,
  onClose,
  selectedDate,
  existingEvent,
  onSave,
  onDelete,
  subjects = [],
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState('exam');
  const [priority, setPriority] = useState(5);
  const [subjectId, setSubjectId] = useState(null);
  const [date, setDate] = useState(new Date());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setConfirmDelete(false);
    setPickerOpen(false);
    setTouched(false);
    setDate(selectedDate ? new Date(selectedDate) : new Date());
    if (existingEvent) {
      setName(existingEvent.name || '');
      setType(existingEvent.type === 'task' ? 'task' : 'exam');
      setPriority(existingEvent.priority ?? 5);
      setSubjectId(existingEvent.subjectId || UNASSIGNED);
    } else {
      setName('');
      setType('exam');
      setPriority(5);
      setSubjectId(null);
    }
  }, [visible, existingEvent, selectedDate]);

  const nameMissing = !name.trim();
  const subjectMissing = !subjectId;
  const canSave = !nameMissing && !subjectMissing;

  const handleSave = () => {
    setTouched(true);
    if (!canSave) return;
    onSave({
      id: existingEvent ? existingEvent.id : null,
      name: name.trim(),
      subjectId,
      date: date.toISOString(),
      type,
      priority,
    });
    onClose();
  };

  const onDateChange = (event, picked) => {
    // Android fires once and closes itself; iOS keeps the spinner mounted.
    setPickerOpen(Platform.OS === 'ios' && event.type !== 'dismissed');
    if (event.type === 'dismissed' || !picked) return;
    setDate(picked);
  };

  const formattedDate = date.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const typeNoun = type === 'task' ? 'tarea' : 'examen';

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      avoidKeyboard
      title={existingEvent ? `Editar ${typeNoun}` : 'Nuevo evento'}
      subtitle={
        existingEvent
          ? 'Cambia los datos o elimínalo.'
          : 'Añade un examen o una tarea a tu calendario.'
      }
    >
      <View style={styles.body}>
        {/* Type */}
        <View style={styles.segment}>
          {TYPES.map((t) => {
            const active = type === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.segmentItem, active && styles.segmentItemActive]}
                onPress={() => setType(t.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Name */}
        <View>
          <FieldLabel>Nombre</FieldLabel>
          <TextInput
            style={[styles.input, touched && nameMissing && styles.inputError]}
            placeholder={
              type === 'task' ? 'Ej. Entregar trabajo de Historia' : 'Ej. Examen de Cálculo'
            }
            placeholderTextColor={tokens.colors.textDisabled}
            value={name}
            onChangeText={setName}
          />
          {touched && nameMissing ? (
            <Text style={[sheetStyles.helper, sheetStyles.helperError]}>
              Ponle un nombre para reconocerlo.
            </Text>
          ) : null}
        </View>

        {/* Date */}
        <View>
          <FieldLabel>Fecha</FieldLabel>
          <TouchableOpacity
            style={styles.dateRow}
            onPress={() => setPickerOpen(true)}
            activeOpacity={0.7}
          >
            <CalendarIcon size={16} color={tokens.colors.accent} />
            <Text style={styles.dateText}>{formattedDate}</Text>
            <Text style={styles.dateAction}>Cambiar</Text>
          </TouchableOpacity>
          {pickerOpen ? (
            <DateTimePicker
              value={date}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={onDateChange}
              locale="es-ES"
              themeVariant="dark"
            />
          ) : null}
        </View>

        {/* Subject */}
        <View>
          <FieldLabel>Asignatura</FieldLabel>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {subjects.map((subject) => {
              const active = subjectId === subject.id;
              const color = subject.color || tokens.colors.accent;
              return (
                <TouchableOpacity
                  key={subject.id}
                  style={[styles.chip, active && { backgroundColor: color, borderColor: color }]}
                  onPress={() => setSubjectId(subject.id)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.chipDot, { backgroundColor: active ? '#FFFFFF' : color }]} />
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {subject.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.chip, subjectId === UNASSIGNED && styles.chipActiveNeutral]}
              onPress={() => setSubjectId(UNASSIGNED)}
              activeOpacity={0.8}
            >
              <View style={[styles.chipDot, { backgroundColor: tokens.colors.textSecondary }]} />
              <Text style={[styles.chipText, subjectId === UNASSIGNED && styles.chipTextActive]}>
                Sin asignatura
              </Text>
            </TouchableOpacity>
          </ScrollView>
          {touched && subjectMissing ? (
            <Text style={[sheetStyles.helper, sheetStyles.helperError]}>
              Elige una asignatura (o «Sin asignatura»).
            </Text>
          ) : null}
        </View>

        {/* Priority */}
        <View>
          <FieldLabel>Prioridad</FieldLabel>
          <View style={styles.segment}>
            {PRIORITIES.map((p) => {
              const active = priority === p.key;
              return (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.segmentItem, active && styles.segmentItemActive]}
                  onPress={() => setPriority(p.key)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {confirmDelete ? (
        <View style={styles.deleteConfirm}>
          <Text style={styles.deleteQuestion}>¿Eliminar «{name || typeNoun}»?</Text>
          <View style={sheetStyles.actions}>
            <Button
              title="Cancelar"
              variant="secondary"
              style={sheetStyles.actionButton}
              onPress={() => setConfirmDelete(false)}
            />
            <Button
              title="Eliminar"
              variant="danger"
              style={sheetStyles.actionButton}
              onPress={() => existingEvent?.id && onDelete?.(existingEvent.id)}
            />
          </View>
        </View>
      ) : (
        <View style={sheetStyles.actions}>
          {existingEvent ? (
            <Button
              title="Eliminar"
              variant="secondary"
              icon={<Trash2 size={16} color={tokens.colors.danger} />}
              textColor={tokens.colors.danger}
              style={sheetStyles.actionButton}
              onPress={() => setConfirmDelete(true)}
            />
          ) : (
            <Button
              title="Cancelar"
              variant="secondary"
              style={sheetStyles.actionButton}
              onPress={onClose}
            />
          )}
          <Button
            title={existingEvent ? 'Guardar' : 'Añadir'}
            style={sheetStyles.actionButton}
            onPress={handleSave}
          />
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 18,
    marginTop: 24,
  },
  segment: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: tokens.radius.btn,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    backgroundColor: tokens.colors.background,
    alignItems: 'center',
  },
  segmentItemActive: {
    backgroundColor: tokens.colors.accentSoftBg,
    borderColor: tokens.colors.accentSoftBorder,
  },
  segmentText: {
    fontFamily: font.semibold,
    fontSize: 14,
    color: tokens.colors.textSecondary,
  },
  segmentTextActive: {
    color: tokens.colors.accent,
  },
  input: {
    backgroundColor: tokens.colors.background,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.btn,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: font.regular,
    fontSize: 15,
    color: tokens.colors.textPrimary,
  },
  inputError: {
    borderColor: tokens.colors.danger,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.colors.background,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.btn,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dateText: {
    flex: 1,
    fontFamily: font.medium,
    fontSize: 15,
    color: tokens.colors.textPrimary,
    textTransform: 'capitalize',
  },
  dateAction: {
    fontFamily: font.semibold,
    fontSize: 13,
    color: tokens.colors.accent,
  },
  chipRow: {
    gap: 8,
    paddingRight: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    backgroundColor: tokens.colors.background,
  },
  chipActiveNeutral: {
    backgroundColor: tokens.colors.surfaceHover,
    borderColor: tokens.colors.textSecondary,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipText: {
    fontFamily: font.medium,
    fontSize: 13,
    color: tokens.colors.textPrimary,
  },
  chipTextActive: {
    fontFamily: font.semibold,
    color: '#FFFFFF',
  },
  deleteConfirm: {
    marginTop: 8,
  },
  deleteQuestion: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: tokens.colors.danger,
    textAlign: 'center',
  },
});
