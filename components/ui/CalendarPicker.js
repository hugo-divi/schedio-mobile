import { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns';
import { es } from 'date-fns/locale';
import * as Haptics from 'expo-haptics';
import { tokens } from '../../theme/tokens';

const WEEK_DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const font = tokens.typography.families.inter;

/**
 * In-app month grid for picking a date.
 *
 * Deliberately not the platform picker: that one arrives with the OS's own
 * colours and typography, which looks like a different app dropped into the
 * sheet. This mirrors the home screen's calendar instead.
 */
export function CalendarPicker({ value, onChange }) {
  const [cursor, setCursor] = useState(value ?? new Date());

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 }),
      }),
    [cursor]
  );

  const pick = (day) => {
    onChange(day);
    if (Platform.OS !== 'web') Haptics.selectionAsync();
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => setCursor(subMonths(cursor, 1))}
          style={styles.nav}
          accessibilityLabel="Mes anterior"
        >
          <ChevronLeft size={18} color={tokens.colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.month}>{format(cursor, 'MMMM yyyy', { locale: es })}</Text>
        <TouchableOpacity
          onPress={() => setCursor(addMonths(cursor, 1))}
          style={styles.nav}
          accessibilityLabel="Mes siguiente"
        >
          <ChevronRight size={18} color={tokens.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.row}>
        {WEEK_DAYS.map((d, i) => (
          <View key={i} style={styles.slot}>
            <Text style={styles.weekDay}>{d}</Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {days.map((day, i) => {
          const selected = value && isSameDay(day, value);
          const outside = !isSameMonth(day, cursor);
          const todayCell = isToday(day);

          return (
            <View key={i} style={styles.slot}>
              <TouchableOpacity
                style={[
                  styles.cell,
                  todayCell && !selected && styles.cellToday,
                  selected && styles.cellSelected,
                ]}
                onPress={() => pick(day)}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.day, outside && styles.dayOutside, selected && styles.daySelected]}
                >
                  {format(day, 'd')}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    padding: 12,
    borderRadius: tokens.radius.btn,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
    backgroundColor: tokens.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  nav: {
    padding: 4,
  },
  month: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: tokens.colors.textPrimary,
    textTransform: 'capitalize',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  slot: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDay: {
    fontFamily: font.semibold,
    fontSize: 12,
    color: tokens.colors.textSecondary,
  },
  cell: {
    width: '90%',
    aspectRatio: 1,
    marginVertical: 1,
    borderRadius: tokens.radius.btn,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cellToday: {
    borderColor: tokens.colors.accentSoftBorder,
  },
  cellSelected: {
    backgroundColor: tokens.colors.accent,
  },
  day: {
    fontFamily: font.regular,
    fontSize: 13,
    color: tokens.colors.textPrimary,
  },
  dayOutside: {
    color: tokens.colors.textDisabled,
  },
  daySelected: {
    fontFamily: font.bold,
    color: '#FFFFFF',
  },
});

export default CalendarPicker;
