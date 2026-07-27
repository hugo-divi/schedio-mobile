import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import React, { useState } from 'react';
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
import { tokens } from '../theme/tokens';

const WEEK_DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/**
 * Month grid for the home screen. Renders bare (no surface of its own) — the
 * caller wraps it in a `Card`, matching the design system's calendar card.
 */
const MiniCalendar = ({ exams = [], subjects = [], onDayClick }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const calendarDays = React.useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

  const getExamsForDay = (day) => exams.filter((exam) => isSameDay(new Date(exam.date), day));

  const handleDayPress = (day) => {
    if (!onDayClick) return;
    onDayClick(day);
    if (Platform.OS !== 'web') Haptics.selectionAsync();
  };

  return (
    <View>
      {/* Month navigation — arrows flank a centred label */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={prevMonth}
          style={styles.navBtn}
          accessibilityLabel="Mes anterior"
        >
          <ChevronLeft size={18} color={tokens.colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{format(currentMonth, 'MMMM yyyy', { locale: es })}</Text>
        <TouchableOpacity
          onPress={nextMonth}
          style={styles.navBtn}
          accessibilityLabel="Mes siguiente"
        >
          <ChevronRight size={18} color={tokens.colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.weekHeader}>
        {WEEK_DAYS.map((d, i) => (
          <View key={i} style={styles.cellSlot}>
            <Text style={styles.weekDayText}>{d}</Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {calendarDays.map((day, i) => {
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const dayExams = getExamsForDay(day);
          const isTodayDate = isToday(day);

          return (
            <View key={i} style={styles.cellSlot}>
              <TouchableOpacity
                style={[styles.dayCell, isTodayDate && styles.dayCellToday]}
                onPress={() => handleDayPress(day)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.dayText,
                    !isCurrentMonth && styles.dayTextOutside,
                    isTodayDate && styles.dayTextToday,
                  ]}
                >
                  {format(day, 'd')}
                </Text>

                {/* One dot per exam (max 3), tinted with the subject colour */}
                {dayExams.length > 0 && (
                  <View style={styles.dotsContainer}>
                    {dayExams.slice(0, 3).map((exam, idx) => {
                      const subject = subjects.find((s) => s.id === exam.subjectId);
                      return (
                        <View
                          key={idx}
                          style={[
                            styles.dot,
                            {
                              backgroundColor: isTodayDate
                                ? '#FFFFFF'
                                : subject?.color || tokens.colors.accent,
                            },
                          ]}
                        />
                      );
                    })}
                  </View>
                )}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </View>
  );
};

export default React.memo(MiniCalendar);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  navBtn: {
    padding: 4,
  },
  monthLabel: {
    fontFamily: tokens.typography.families.inter.semibold,
    fontSize: 15,
    color: tokens.colors.textPrimary,
    textTransform: 'capitalize',
  },
  weekHeader: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekDayText: {
    fontFamily: tokens.typography.families.inter.semibold,
    fontSize: 12,
    color: tokens.colors.textSecondary,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  // Fixed 7-column layout; the visual box lives inside with a small inset.
  cellSlot: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCell: {
    width: '92%',
    aspectRatio: 1,
    marginVertical: 2,
    borderRadius: tokens.radius.btn,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayCellToday: {
    backgroundColor: tokens.colors.accent,
  },
  dayText: {
    fontFamily: tokens.typography.families.inter.regular,
    fontSize: 13,
    color: tokens.colors.textPrimary,
  },
  dayTextOutside: {
    color: tokens.colors.textDisabled,
  },
  dayTextToday: {
    fontFamily: tokens.typography.families.inter.bold,
    color: '#FFFFFF',
  },
  dotsContainer: {
    flexDirection: 'row',
    gap: 2,
    position: 'absolute',
    bottom: 3,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
