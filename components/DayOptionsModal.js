import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Plus, ChevronRight, GraduationCap, ClipboardList } from 'lucide-react-native';
import { tokens } from '../theme/tokens';
import BottomSheet from './ui/BottomSheet';
import Button from './ui/Button';

const font = tokens.typography.families.inter;

const capitalise = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : '');

const formatDate = (date) =>
  date
    ? capitalise(
        new Date(date).toLocaleDateString('es-ES', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })
      )
    : '';

const isExam = (event) => (event?.type || 'exam') === 'exam';

/**
 * What a day on the calendar opens into when it already has something on it:
 * either add another exam or task, or pick one of the existing ones to edit.
 * Both routes hand off to EventModal — this only decides which.
 */
export default function DayOptionsModal({
  visible,
  onClose,
  events = [],
  date,
  subjects = [],
  onAddNew,
  onEditEvent,
}) {
  const colourOf = (event) =>
    subjects.find((s) => s.id === event.subjectId)?.color || tokens.colors.textDisabled;

  return (
    <BottomSheet visible={visible} onClose={onClose} title={formatDate(date)}>
      <Text style={styles.lead}>
        {events.length === 1
          ? 'Ya tienes algo este día. Tócalo para editarlo, o añade otro.'
          : `Ya tienes ${events.length} cosas este día. Toca una para editarla, o añade otra.`}
      </Text>

      <View style={styles.list}>
        {events.map((event, index) => {
          const exam = isExam(event);
          const Icon = exam ? GraduationCap : ClipboardList;
          return (
            <TouchableOpacity
              key={event.id || index}
              activeOpacity={0.8}
              onPress={() => onEditEvent(event)}
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel={`Editar ${event.name}`}
            >
              <View style={[styles.icon, { backgroundColor: colourOf(event) }]}>
                <Icon size={17} color="#FFFFFF" strokeWidth={2} />
              </View>
              <View style={styles.body}>
                <Text style={styles.name} numberOfLines={1}>
                  {event.name}
                </Text>
                <Text style={styles.meta}>{exam ? 'Examen' : 'Tarea o entrega'}</Text>
              </View>
              <ChevronRight size={18} color={tokens.colors.textSecondary} strokeWidth={1.75} />
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={{ marginTop: 20 }}>
        <Button
          title="Añadir examen o tarea"
          fullWidth
          icon={<Plus size={17} color="#FFFFFF" />}
          onPress={onAddNew}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  lead: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    color: tokens.colors.textSecondary,
    marginTop: 4,
  },
  list: {
    gap: 8,
    marginTop: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: tokens.colors.surfaceCard,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    borderRadius: tokens.radius.card,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: font.medium,
    fontSize: 15,
    color: tokens.colors.textPrimary,
  },
  meta: {
    fontFamily: font.medium,
    fontSize: 12,
    color: tokens.colors.textSecondary,
    marginTop: 2,
  },
});
