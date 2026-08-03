import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react-native';
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
  addWeeks,
  subWeeks,
} from 'date-fns';
import { es } from 'date-fns/locale';
import * as Haptics from 'expo-haptics';
import { tokens } from '../theme/tokens';

const WEEK_DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const WEEK_OPTS = { weekStartsOn: 1 };

/**
 * Calendar for the home screen. Opens on the current week — the horizon a
 * student actually plans against — and expands to the full month on demand.
 *
 * Renders bare (no surface of its own); the caller wraps it in a `Card`.
 */
const MiniCalendar = ({ exams = [], subjects = [], onDayClick }) => {
  const [expanded, setExpanded] = useState(false);
  const [cursor, setCursor] = useState(new Date());

  const days = React.useMemo(() => {
    if (expanded) {
      return eachDayOfInterval({
        start: startOfWeek(startOfMonth(cursor), WEEK_OPTS),
        end: endOfWeek(endOfMonth(cursor), WEEK_OPTS),
      });
    }
    return eachDayOfInterval({
      start: startOfWeek(cursor, WEEK_OPTS),
      end: endOfWeek(cursor, WEEK_OPTS),
    });
  }, [cursor, expanded]);

  // The arrows always step by whatever the grid is showing.
  const goBack = () => setCursor(expanded ? subMonths(cursor, 1) : subWeeks(cursor, 1));
  const goForward = () => setCursor(expanded ? addMonths(cursor, 1) : addWeeks(cursor, 1));

  const label = React.useMemo(() => {
    if (expanded) return format(cursor, 'MMMM yyyy', { locale: es });
    const from = days[0];
    const to = days[days.length - 1];
    // Only repeat the month when the week straddles two of them.
    return isSameMonth(from, to)
      ? `${format(from, 'd')} – ${format(to, 'd MMM', { locale: es })}`
      : `${format(from, 'd MMM', { locale: es })} – ${format(to, 'd MMM', { locale: es })}`;
  }, [cursor, days, expanded]);

  const getExamsForDay = (day) => exams.filter((exam) => isSameDay(new Date(exam.date), day));

  const handleDayPress = (day) => {
    if (!onDayClick) return;
    onDayClick(day);
    if (Platform.OS !== 'web') Haptics.selectionAsync();
  };

  const toggleExpanded = () => {
    setExpanded((prev) => !prev);
    // Snap back to today so collapsing never lands on an unrelated week.
    setCursor(new Date());
    if (Platform.OS !== 'web') Haptics.selectionAsync();
  };

  return (
    <View>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.navBtn} accessibilityLabel="Anterior">
          <ChevronLeft size={18} color={tokens.colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.label}>{label}</Text>
        <TouchableOpacity onPress={goForward} style={styles.navBtn} accessibilityLabel="Siguiente">
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
        {days.map((day, i) => {
          const dayExams = getExamsForDay(day);
          const isTodayDate = isToday(day);
          // Only the month view spills into neighbouring months.
          const isOutside = expanded && !isSameMonth(day, cursor);

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
                    isOutside && styles.dayTextOutside,
                    isTodayDate && styles.dayTextToday,
                  ]}
                >
                  {format(day, 'd')}
                </Text>

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

      <TouchableOpacity
        style={styles.expandToggle}
        onPress={toggleExpanded}
        activeOpacity={0.7}
        accessibilityRole="button"
      >
        <Text style={styles.expandText}>{expanded ? 'Ver semana' : 'Ver mes completo'}</Text>
        {expanded ? (
          <ChevronUp size={14} color={tokens.colors.textSecondary} />
        ) : (
          <ChevronDown size={14} color={tokens.colors.textSecondary} />
        )}
      </TouchableOpacity>
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
  label: {
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
  // Fixed 7-column layout; the visual box sits inside with a small inset.
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
  expandToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: 10,
    paddingBottom: 2,
  },
  expandText: {
    fontFamily: tokens.typography.families.inter.medium,
    fontSize: 13,
    color: tokens.colors.textSecondary,
  },
});
