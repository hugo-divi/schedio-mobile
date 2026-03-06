import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Flame, X } from 'lucide-react-native';

// Helper functions to replace date-fns
const subDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() - days);
    return result;
};

const isSameDay = (date1, date2) => {
    return date1.getDate() === date2.getDate() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getFullYear() === date2.getFullYear();
};

const formatDay = (date) => {
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return days[date.getDay()];
};

export default function StreakModal({ visible, onClose, currentStreak, studyHistory = [] }) {
    const today = new Date();
    const daysToShow = Array.from({ length: 5 }).map((_, i) => subDays(today, 4 - i));

    const getMotivation = (streak) => {
        if (streak === 0) return "¡Cada día es una nueva oportunidad! Empieza hoy.";
        if (streak < 3) return "¡Buen comienzo! Mantén el ritmo.";
        if (streak < 7) return "¡Estás en racha! Una semana completa está cerca.";
        if (streak < 30) return "¡Imparable! Tu disciplina es legendaria.";
        return "¡Modo Dios activado! Eres un ejemplo a seguir.";
    };

    const hasStudiedOn = (date) => {
        return studyHistory.some(d => isSameDay(new Date(d), date));
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableOpacity
                style={styles.overlay}
                activeOpacity={1}
                onPress={onClose}
            >
                <TouchableOpacity
                    style={styles.modalContent}
                    activeOpacity={1}
                    onPress={(e) => e.stopPropagation()}
                >
                    <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                        <X size={24} color="#8E8E93" />
                    </TouchableOpacity>

                    <View style={styles.hero}>
                        <View style={styles.flameContainer}>
                            <Flame
                                size={64}
                                color={currentStreak > 0 ? "#FF9F0A" : "#48484A"}
                                fill={currentStreak > 0 ? "#FF9F0A" : "transparent"}
                            />
                            <Text style={styles.countLarge}>{currentStreak}</Text>
                        </View>
                        <Text style={styles.title}>Días en racha</Text>
                        <Text style={styles.motivation}>{getMotivation(currentStreak)}</Text>
                    </View>

                    <View style={styles.calendarRow}>
                        {daysToShow.map((date, idx) => {
                            const isStudied = hasStudiedOn(date) || (isSameDay(date, today) && currentStreak > 0);
                            const isToday = isSameDay(date, today);

                            return (
                                <View key={idx} style={styles.dayItem}>
                                    <Text style={styles.dayLabel}>
                                        {formatDay(date)}
                                    </Text>
                                    <View style={[
                                        styles.dayCircle,
                                        isStudied && styles.dayCircleStudied,
                                        isToday && styles.dayCircleToday
                                    ]}>
                                        {isStudied ? (
                                            <Flame size={16} color="#FFFFFF" fill="#FFFFFF" />
                                        ) : (
                                            <View style={styles.emptyDot} />
                                        )}
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalContent: {
        backgroundColor: '#1C1C1E',
        borderRadius: 24,
        padding: 32,
        width: '100%',
        maxWidth: 400,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    closeButton: {
        position: 'absolute',
        top: 16,
        right: 16,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#2C2C2E',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    hero: {
        alignItems: 'center',
        marginBottom: 32,
    },
    flameContainer: {
        position: 'relative',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    countLarge: {
        position: 'absolute',
        fontSize: 32,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#FFFFFF',
        marginBottom: 8,
    },
    motivation: {
        fontSize: 14,
        color: '#8E8E93',
        textAlign: 'center',
    },
    calendarRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    dayItem: {
        alignItems: 'center',
        gap: 8,
    },
    dayLabel: {
        fontSize: 12,
        color: '#8E8E93',
        textTransform: 'capitalize',
    },
    dayCircle: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#2C2C2E',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    dayCircleStudied: {
        backgroundColor: '#FF9F0A',
        borderColor: '#FF9F0A',
    },
    dayCircleToday: {
        borderColor: '#4A90E2',
    },
    emptyDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#48484A',
    },
});
