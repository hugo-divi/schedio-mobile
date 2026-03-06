import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isToday, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import * as Haptics from 'expo-haptics';
import { tokens } from '../theme/tokens';

const MiniCalendar = ({ exams = [], subjects = [], onDayClick, isDarkMode }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const theme = isDarkMode ? tokens.colors.dark : tokens.colors.light;

    // Memoize calculating days to avoid re-calculation on every render if month doesn't change
    const { startDate, endDate, calendarDays } = React.useMemo(() => {
        const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
        const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
        return {
            startDate: start,
            endDate: end,
            calendarDays: eachDayOfInterval({ start, end })
        };
    }, [currentMonth]);

    const weekDays = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

    const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
    const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));

    const getExamsForDay = (day) => {
        return exams.filter(exam => isSameDay(new Date(exam.date), day));
    };

    const handleDayPress = (day) => {
        if (onDayClick) {
            onDayClick(day);
            if (Platform.OS !== 'web') Haptics.selectionAsync();
        }
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={[styles.monthLabel, { color: theme.text }]}>
                    {format(currentMonth, 'MMMM yyyy', { locale: es })}
                </Text>
                <View style={styles.navButtons}>
                    <TouchableOpacity
                        style={[styles.navBtn, { backgroundColor: theme.cardSecondary }]}
                        onPress={prevMonth}
                    >
                        <ChevronLeft size={16} color={theme.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.navBtn, { backgroundColor: theme.cardSecondary }]}
                        onPress={nextMonth}
                    >
                        <ChevronRight size={16} color={theme.textSecondary} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Week Headers */}
            <View style={styles.weekHeader}>
                {weekDays.map(d => (
                    <Text key={d} style={[styles.weekDayText, { color: theme.textSecondary }]}>{d}</Text>
                ))}
            </View>

            {/* Grid */}
            <View style={styles.grid}>
                {calendarDays.map((day, i) => {
                    const isCurrentMonth = isSameMonth(day, currentMonth);
                    const dayExams = getExamsForDay(day);
                    const hasExams = dayExams.length > 0;
                    const isTodayDate = isToday(day);

                    return (
                        <TouchableOpacity
                            key={i}
                            style={[
                                styles.dayCell,
                                isTodayDate && { backgroundColor: isDarkMode ? 'rgba(74, 144, 226, 0.2)' : 'rgba(74, 144, 226, 0.15)' }
                            ]}
                            onPress={() => handleDayPress(day)}
                            activeOpacity={0.7}
                        >
                            <Text style={[
                                styles.dayText,
                                { color: theme.text },
                                !isCurrentMonth && { color: theme.textSecondary, opacity: 0.5 },
                                isTodayDate && { color: tokens.colors.blue, fontWeight: 'bold' }
                            ]}>
                                {format(day, 'd')}
                            </Text>

                            {/* Dots */}
                            {hasExams && (
                                <View style={styles.dotsContainer}>
                                    {dayExams.slice(0, 3).map((exam, i) => {
                                        const subject = subjects.find(s => s.id === exam.subjectId);
                                        return (
                                            <View
                                                key={i}
                                                style={[
                                                    styles.dot,
                                                    { backgroundColor: subject?.color || tokens.colors.primary }
                                                ]}
                                            />
                                        );
                                    })}
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
};

export default React.memo(MiniCalendar);

const styles = StyleSheet.create({
    container: {
        borderRadius: 24,
        padding: 16,
        borderWidth: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        paddingHorizontal: 4,
    },
    monthLabel: {
        fontSize: 16,
        fontWeight: 'bold',
        textTransform: 'capitalize',
    },
    navButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    navBtn: {
        padding: 6,
        borderRadius: 8,
    },
    weekHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 12,
        paddingHorizontal: 4,
    },
    weekDayText: {
        fontSize: 12,
        fontWeight: '600',
        width: '13%',
        textAlign: 'center',
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    dayCell: {
        width: '13%',
        aspectRatio: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 4,
        borderRadius: 12,
    },
    dayText: {
        fontSize: 14,
        fontWeight: '500',
    },
    dotsContainer: {
        flexDirection: 'row',
        gap: 2,
        marginTop: 4,
        position: 'absolute',
        bottom: 6,
    },
    dot: {
        width: 3,
        height: 3,
        borderRadius: 1.5,
    },
});
