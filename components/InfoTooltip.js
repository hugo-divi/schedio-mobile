import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Dimensions, Platform, Pressable } from 'react-native';
import { HelpCircle, X } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { tokens } from '../theme/tokens';
import { GlassCard } from './GlassView';

const { width } = Dimensions.get('window');

const InfoTooltip = ({
    title,
    content,
    iconSize = 18,
    color = tokens.colors.textSecondary,
    style
}) => {
    const [visible, setVisible] = useState(false);

    return (
        <View style={[styles.container, style]}>
            <TouchableOpacity
                onPress={() => setVisible(true)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
                <HelpCircle size={iconSize} color={color} />
            </TouchableOpacity>

            <Modal
                transparent
                visible={visible}
                animationType="fade"
                onRequestClose={() => setVisible(false)}
            >
                <Pressable
                    style={styles.overlay}
                    onPress={() => setVisible(false)}
                >
                    {Platform.OS !== 'web' ? (
                        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    ) : (
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.5)' }]} />
                    )}

                    <Pressable onPress={(e) => e.stopPropagation()} style={styles.modalContent}>
                        <GlassCard style={styles.card}>
                            <View style={styles.header}>
                                <Text style={styles.title}>{title}</Text>
                                <TouchableOpacity onPress={() => setVisible(false)}>
                                    <X size={20} color={tokens.colors.textSecondary} />
                                </TouchableOpacity>
                            </View>
                            <Text style={styles.content}>{content}</Text>
                        </GlassCard>
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
};

export default InfoTooltip;

const styles = StyleSheet.create({
    container: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    modalContent: {
        width: '100%',
        maxWidth: 400,
    },
    card: {
        padding: 20,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(28, 28, 30, 0.8)',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFF',
    },
    content: {
        fontSize: 15,
        color: tokens.colors.textSecondary,
        lineHeight: 22,
    },
});
