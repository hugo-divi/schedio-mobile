import React from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, TouchableWithoutFeedback } from 'react-native';
import { BlurView } from 'expo-blur';
import { tokens } from '../theme/tokens';
import useThemeStore from '../store/themeStore';

export default function CustomAlert({ visible, title, message, onCancel, onConfirm, cancelText = "Cancelar", confirmText = "OK", isDestructive = false, singleButton = false }) {
    const { isDarkMode } = useThemeStore();
    const theme = isDarkMode ? tokens.colors.dark : tokens.colors.light;

    if (!visible) return null;

    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={onCancel}
        >
            <TouchableWithoutFeedback onPress={onCancel}>
                <View style={[styles.overlay, { backgroundColor: isDarkMode ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.4)' }]}>
                    <TouchableWithoutFeedback>
                        <View style={[styles.alertBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
                            <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
                            <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>

                            <View style={[styles.buttonRow, { borderTopColor: theme.border }]}>
                                {!singleButton && (
                                    <TouchableOpacity
                                        style={[styles.button, styles.borderRight, { borderRightColor: theme.border }]}
                                        onPress={onCancel}
                                    >
                                        <Text style={styles.cancelText}>{cancelText}</Text>
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity
                                    style={styles.button}
                                    onPress={onConfirm || onCancel}
                                >
                                    <Text style={[styles.confirmText, isDestructive && styles.destructiveText]}>{confirmText}</Text>
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
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    alertBox: {
        width: 270,
        borderRadius: 14,
        borderWidth: 0.5,
        alignItems: 'center',
        paddingTop: 20,
        overflow: 'hidden',
    },
    title: {
        fontSize: 17,
        fontWeight: '600',
        marginBottom: 4,
        textAlign: 'center',
    },
    message: {
        fontSize: 13,
        textAlign: 'center',
        paddingHorizontal: 16,
        marginBottom: 20,
        lineHeight: 18,
    },
    buttonRow: {
        flexDirection: 'row',
        borderTopWidth: 0.5,
        width: '100%',
        height: 44,
    },
    button: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    borderRight: {
        borderRightWidth: 0.5,
    },
    cancelText: {
        fontSize: 17,
        color: '#4A90E2',
        fontWeight: '400',
    },
    confirmText: {
        fontSize: 17,
        color: '#4A90E2',
        fontWeight: '600',
    },
    destructiveText: {
        color: '#FF453A',
        fontWeight: '600',
    }
});
