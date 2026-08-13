import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { tokens } from '../theme/tokens';
import { uploadFile } from '../services/storage';
import useUserStore, { PRIME_WEEKLY_UPLOADS } from '../store/userStore';
import useAuthStore from '../store/authStore';
import { auth } from '../services/firebase';
import PrimeLimitSheet from './PrimeLimitSheet';

const UploadModal = ({
  visible,
  onClose,
  onUploadSuccess,
  pathPrefix,
  // Filing a file under a subject is what lets the Mochila group by subject.
  // Opening the sheet from inside a subject pre-selects it.
  subjects = [],
  initialSubjectId = null,
}) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [subjectId, setSubjectId] = useState(initialSubjectId);
  const [limitSheetVisible, setLimitSheetVisible] = useState(false);
  const canUpload = useUserStore((state) => state.canUpload);
  const recordUpload = useUserStore((state) => state.recordUpload);
  const weeklyUploadLimit = useUserStore((state) => state.weeklyUploadLimit);
  const isPrime = useAuthStore((state) => state.isPrime);
  const router = useRouter();

  useEffect(() => {
    if (visible) setSubjectId(initialSubjectId);
  }, [visible, initialSubjectId]);

  // Prime has its own (much higher) cap purely against server abuse, not a
  // marketing moment — a plain alert there, the Prime sheet only for free.
  const handleLimitReached = () => {
    if (isPrime) {
      const limit = weeklyUploadLimit();
      Alert.alert(
        'Límite semanal alcanzado',
        `Has llegado a tus ${limit} subidas de esta semana. Vuelve a intentarlo en unos días.`
      );
      return;
    }
    setLimitSheetVisible(true);
  };

  const goToPrime = () => {
    setLimitSheetVisible(false);
    onClose();
    router.push('/plus');
  };

  const handlePickImage = async () => {
    if (!canUpload()) {
      handleLimitReached();
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
      console.error('Pick image error:', error);
      Alert.alert('Error', 'No se pudo seleccionar la imagen');
    }
  };

  const handlePickCamera = async () => {
    if (!canUpload()) {
      handleLimitReached();
      return;
    }

    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permiso denegado',
          'Activa el acceso a la cámara en los ajustes del sistema para poder hacer fotos.'
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (!result.canceled) {
        processUpload(result.assets[0].uri, 'image');
      }
    } catch (error) {
      console.error('Camera error:', error);
      Alert.alert('Error', 'No se pudo abrir la cámara');
    }
  };

  const handlePickDocument = async () => {
    if (!canUpload()) {
      handleLimitReached();
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'], // Allow PDFs and images
        copyToCacheDirectory: true,
      });

      if (!result.canceled) {
        processUpload(result.assets[0].uri, 'document', result.assets[0].name);
      }
    } catch (error) {
      console.error('Pick doc error:', error);
      Alert.alert('Error', 'No se pudo seleccionar el documento');
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
        const subject = subjects.find((s) => s.id === subjectId) || null;
        onUploadSuccess({
          url: downloadURL,
          path: storagePath,
          type: type,
          name: name,
          createdAt: new Date().toISOString(),
          // Null is a real answer here — the Mochila files those under
          // "Sin materia" rather than hiding them.
          subjectId: subject?.id ?? null,
          subjectName: subject?.name ?? null,
          subjectColor: subject?.color ?? null,
        });
      }

      onClose();
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert('Error', 'Falló la subida del archivo.');
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <View style={styles.container}>
        <BlurView
          intensity={Platform.OS === 'ios' ? 20 : 100}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />

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

              {subjects.length > 0 && (
                <View style={styles.subjectBlock}>
                  <Text style={styles.subjectLabel}>Materia</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.subjectRow}
                  >
                    {subjects.map((subject) => {
                      const active = subject.id === subjectId;
                      return (
                        <TouchableOpacity
                          key={subject.id}
                          activeOpacity={0.8}
                          onPress={() => setSubjectId(active ? null : subject.id)}
                          style={[styles.subjectChip, active && styles.subjectChipActive]}
                        >
                          <View
                            style={[
                              styles.subjectDot,
                              { backgroundColor: subject.color || tokens.colors.accent },
                            ]}
                          />
                          <Text
                            style={[styles.subjectChipText, active && styles.subjectChipTextOn]}
                          >
                            {subject.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              <View style={styles.actions}>
                <TouchableOpacity style={styles.actionButton} onPress={handlePickCamera}>
                  <View
                    style={[styles.iconContainer, { backgroundColor: 'rgba(90, 185, 138, 0.1)' }]}
                  >
                    <Ionicons name="camera" size={26} color="#5AB98A" />
                  </View>
                  <Text style={styles.actionText}>Cámara</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionButton} onPress={handlePickImage}>
                  <View
                    style={[styles.iconContainer, { backgroundColor: 'rgba(255, 159, 10, 0.1)' }]}
                  >
                    <Ionicons name="images" size={26} color="#FF9F0A" />
                  </View>
                  <Text style={styles.actionText}>Galería</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.actionButton} onPress={handlePickDocument}>
                  <View
                    style={[styles.iconContainer, { backgroundColor: 'rgba(74, 144, 226, 0.1)' }]}
                  >
                    <Ionicons name="document-text" size={26} color="#4A90E2" />
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
                    Límite: 3 archivos/semana. Con Prime, {PRIME_WEEKLY_UPLOADS}/semana.
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      </View>

      <PrimeLimitSheet
        visible={limitSheetVisible}
        onClose={() => setLimitSheetVisible(false)}
        title={`Has alcanzado el límite de ${weeklyUploadLimit()} archivos semanales`}
        description={`Con Schedio Prime tienes hasta ${PRIME_WEEKLY_UPLOADS} subidas por semana para tu Mochila.`}
        onUpgrade={goToPrime}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1C1C1E',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 24,
    lineHeight: 20,
  },
  closeButton: {
    padding: 4,
  },
  subjectBlock: {
    marginBottom: 20,
  },
  subjectLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    marginBottom: 8,
  },
  subjectRow: {
    gap: 8,
    paddingRight: 8,
  },
  subjectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.colors.borderDefault,
  },
  subjectChipActive: {
    backgroundColor: tokens.colors.accentSoftBg,
    borderColor: tokens.colors.accentSoftBorder,
  },
  subjectDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  subjectChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8E8E93',
  },
  subjectChipTextOn: {
    color: '#FFFFFF',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#2C2C2E',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  actionText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  progressContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  progressText: {
    color: '#8E8E93',
    marginTop: 12,
    marginBottom: 12,
    fontWeight: '600',
  },
  progressBarBg: {
    width: '100%',
    height: 6,
    backgroundColor: '#2C2C2E',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4A90E2',
    borderRadius: 3,
  },
  primeBanner: {
    backgroundColor: 'rgba(255, 214, 10, 0.1)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 214, 10, 0.3)',
  },
  primeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  primeTitle: {
    color: '#FFD60A',
    fontWeight: '700',
    fontSize: 14,
  },
  primeText: {
    color: '#FFFFFF',
    fontSize: 12,
    opacity: 0.8,
    lineHeight: 16,
  },
});

export default UploadModal;
