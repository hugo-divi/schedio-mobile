import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { tokens } from '../theme/tokens';
import { uploadFile } from '../services/storage';
import useUserStore from '../store/userStore';
import { auth } from '../services/firebase';

const UploadModal = ({ visible, onClose, onUploadSuccess, pathPrefix }) => {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const { canUpload, recordUpload, isPrime } = useUserStore();

    const handlePickImage = async () => {
        if (!canUpload()) {
            Alert.alert("Límite Alcanzado", "Has alcanzado el límite de 3 archivos semanales. Pásate a Schedio Prime para subidas ilimitadas.");
            return;
        }

        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.8,
            });

            if (!result.canceled) {
                processUpload(result.assets[0].uri, 'image');
            }
        } catch (error) {
            console.error("Pick image error:", error);
            Alert.alert("Error", "No se pudo seleccionar la imagen");
        }
    };

    const handlePickDocument = async () => {
        if (!canUpload()) {
            Alert.alert("Límite Alcanzado", "Has alcanzado el límite de 3 archivos semanales. Pásate a Schedio Prime para subidas ilimitadas.");
            return;
        }

        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/pdf', 'image/*'], // Allow PDFs and images
                copyToCacheDirectory: true
            });

            if (!result.canceled) {
                processUpload(result.assets[0].uri, 'document', result.assets[0].name);
            }
        } catch (error) {
            console.error("Pick doc error:", error);
            Alert.alert("Error", "No se pudo seleccionar el documento");
        }
    };

    const processUpload = async (uri, type, fileName = null) => {
        const user = auth.currentUser;
        if (!user) return;

        setUploading(true);
        setProgress(0);

        try {
            // Generate path: users/{uid}/resources/{timestamp}_{filename}
            const name = fileName || uri.split('/').pop();
            const storagePath = `${pathPrefix || `users/${user.uid}/resources`}/${Date.now()}_${name}`;

            const downloadURL = await uploadFile(uri, storagePath, (prog) => {
                setProgress(prog);
            });

            // Record upload in store (history)
            await recordUpload(user.uid);

            if (onUploadSuccess) {
                onUploadSuccess({
                    url: downloadURL,
                    path: storagePath,
                    type: type,
                    name: name,
                    createdAt: new Date().toISOString()
                });
            }

            onClose();
        } catch (error) {
            console.error("Upload error:", error);
            Alert.alert("Error", "Falló la subida del archivo.");
        } finally {
            setUploading(false);
            setProgress(0);
        }
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <View style={styles.container}>
                <BlurView intensity={Platform.OS === 'ios' ? 20 : 100} tint="dark" style={StyleSheet.absoluteFill} />

                <View style={styles.modalContent}>
                    <View style={styles.header}>
                        <Text style={styles.title}>Mochila Digital</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color="#8E8E93" />
                        </TouchableOpacity>
                    </View>

                    {uploading ? (
                        <View style={styles.progressContainer}>
                            <ActivityIndicator size="large" color={tokens.colors.primary} />
                            <Text style={styles.progressText}>Subiendo... {Math.round(progress)}%</Text>
                            <View style={styles.progressBarBg}>
                                <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
                            </View>
                        </View>
                    ) : (
                        <>
                            <Text style={styles.subtitle}>
                                Sube apuntes, fotos o PDFs para tenerlos siempre a mano.
                            </Text>

                            <View style={styles.actions}>
                                <TouchableOpacity style={styles.actionButton} onPress={handlePickImage}>
                                    <View style={[styles.iconContainer, { backgroundColor: 'rgba(255, 159, 10, 0.1)' }]}>
                                        <Ionicons name="images" size={28} color="#FF9F0A" />
                                    </View>
                                    <Text style={styles.actionText}>Galería</Text>
                                </TouchableOpacity>

                                <TouchableOpacity style={styles.actionButton} onPress={handlePickDocument}>
                                    <View style={[styles.iconContainer, { backgroundColor: 'rgba(74, 144, 226, 0.1)' }]}>
                                        <Ionicons name="document-text" size={28} color="#4A90E2" />
                                    </View>
                                    <Text style={styles.actionText}>Documento</Text>
                                </TouchableOpacity>
                            </View>

                            {!isPrime && (
                                <View style={styles.primeBanner}>
                                    <View style={styles.primeHeader}>
                                        <Ionicons name="star" size={16} color="#FFD60A" />
                                        <Text style={styles.primeTitle}>Schedio Prime</Text>
                                    </View>
                                    <Text style={styles.primeText}>
                                        Límite: 3 archivos/semana. Actualiza para subidas ilimitadas y análisis con IA.
                                    </Text>
                                </View>
                            )}
                        </>
                    )}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: 20
    },
    modalContent: {
        width: '100%',
        maxWidth: 340,
        backgroundColor: '#1C1C1E',
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#FFFFFF'
    },
    subtitle: {
        fontSize: 14,
        color: '#8E8E93',
        marginBottom: 24,
        lineHeight: 20
    },
    closeButton: {
        padding: 4
    },
    actions: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 24
    },
    actionButton: {
        flex: 1,
        backgroundColor: '#2C2C2E',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)'
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12
    },
    actionText: {
        color: '#FFFFFF',
        fontWeight: '600',
        fontSize: 15
    },
    progressContainer: {
        alignItems: 'center',
        paddingVertical: 20
    },
    progressText: {
        color: '#8E8E93',
        marginTop: 12,
        marginBottom: 12,
        fontWeight: '600'
    },
    progressBarBg: {
        width: '100%',
        height: 6,
        backgroundColor: '#2C2C2E',
        borderRadius: 3,
        overflow: 'hidden'
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: '#4A90E2',
        borderRadius: 3
    },
    primeBanner: {
        backgroundColor: 'rgba(255, 214, 10, 0.1)',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(255, 214, 10, 0.3)'
    },
    primeHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4
    },
    primeTitle: {
        color: '#FFD60A',
        fontWeight: '700',
        fontSize: 14
    },
    primeText: {
        color: '#FFFFFF',
        fontSize: 12,
        opacity: 0.8,
        lineHeight: 16
    }
});

export default UploadModal;
