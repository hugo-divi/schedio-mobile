import { Modal, View, Text, TouchableOpacity, StyleSheet, TouchableWithoutFeedback } from 'react-native';
import { X, Calendar as CalendarIcon, Edit2, Plus } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { tokens } from '../theme/tokens';

export default function DayOptionsModal({ visible, onClose, events = [], date, onAddNew, onEditEvent }) {
    if (!visible) return null;

    const formattedDate = date ? new Date(date).toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    }) : '';

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={styles.modalOverlay}>
                    <TouchableWithoutFeedback>
                        <View style={styles.modalContainer}>
                            {/* Header */}
                            <View style={styles.header}>
                                <View>
                                    <Text style={styles.title}>Opciones del día</Text>
                                    <Text style={styles.subtitle}>{formattedDate}</Text>
                                </View>
                                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                    <X size={20} color="#8E8E93" />
                                </TouchableOpacity>
                            </View>

                            {/* Options List */}
                            <View style={styles.content}>
                                <Text style={styles.sectionLabel}>Eventos existentes</Text>
                                {events.map((event, index) => (
                                    <TouchableOpacity
                                        key={event.id || index}
                                        style={styles.optionCard}
                                        onPress={() => onEditEvent(event)}
                                    >
                                        <View style={styles.optionIcon}>
                                            <Edit2 size={18} color="#4A90E2" />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.optionTitle}>Editar "{event.name}"</Text>
                                            <Text style={styles.optionSubtitle}>Toca para modificar detalles</Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}

                                <View style={styles.divider} />

                                <TouchableOpacity
                                    style={[styles.optionCard, styles.addNewCard]}
                                    onPress={onAddNew}
                                >
                                    <View style={[styles.optionIcon, styles.addNewIcon]}>
                                        <Plus size={18} color="#FFFFFF" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[styles.optionTitle, { color: '#FFFFFF' }]}>Añadir nuevo evento</Text>
                                        <Text style={styles.optionSubtitle}>Crear un examen o tarea</Text>
                                    </View>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        padding: 24,
    },
    modalContainer: {
        backgroundColor: '#1C1C1E',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        padding: 24,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 24,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#FFFFFF',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 14,
        color: '#8E8E93',
        textTransform: 'capitalize',
    },
    closeBtn: {
        padding: 4,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 20,
    },
    content: {
        gap: 12,
    },
    sectionLabel: {
        fontSize: 13,
        color: '#8E8E93',
        fontWeight: '600',
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        backgroundColor: '#2C2C2E',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
    },
    addNewCard: {
        backgroundColor: 'rgba(74, 144, 226, 0.15)',
        borderColor: 'rgba(74, 144, 226, 0.3)',
    },
    optionIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(74, 144, 226, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    addNewIcon: {
        backgroundColor: '#4A90E2',
    },
    optionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
        marginBottom: 2,
    },
    optionSubtitle: {
        fontSize: 13,
        color: '#8E8E93',
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        marginVertical: 8,
    }
});
