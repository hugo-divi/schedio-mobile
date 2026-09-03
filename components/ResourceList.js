import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { deleteFile } from '../services/storage';
import { BottomSheet, sheetStyles } from './ui/BottomSheet';
import { Button } from './ui/Button';

const ResourceList = ({ resources, onDelete, isDarkMode }) => {
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  // La imagen que se está mirando a pantalla completa.
  const [viewing, setViewing] = useState(null);
  const [imageLoading, setImageLoading] = useState(false);

  /**
   * Hasta ahora la tarjeta no tenía `onPress`: se podían guardar apuntes y no
   * abrirlos nunca. Las imágenes se ven dentro de la app; los PDF se delegan al
   * visor del sistema, que ya sabe hacerlo mejor que nosotros.
   */
  const openResource = async (resource) => {
    if (!resource?.url) return;

    if (resource.type === 'image') {
      setImageLoading(true);
      setViewing(resource);
      return;
    }

    try {
      const supported = await Linking.canOpenURL(resource.url);
      if (!supported) throw new Error('unsupported');
      await Linking.openURL(resource.url);
    } catch {
      Alert.alert(
        'No se pudo abrir',
        'No hay ninguna aplicación en el móvil que pueda abrir este archivo.'
      );
    }
  };

  if (!resources || resources.length === 0) return null;

  const closeConfirm = () => {
    if (deleting) return;
    setPendingDelete(null);
    setDeleteError(false);
  };

  const confirmDelete = async () => {
    const resource = pendingDelete;
    if (!resource) return;

    setDeleting(true);
    setDeleteError(false);
    try {
      await deleteFile(resource.path);
    } catch (error) {
      // storage/object-not-found means the file is already gone from
      // Storage (interrupted upload, an earlier failed delete) — the
      // stale record should still be cleared instead of getting stuck
      // forever. Any other error is a real failure.
      if (error?.code !== 'storage/object-not-found') {
        console.error('Error deleting resource:', error);
        setDeleting(false);
        setDeleteError(true);
        return;
      }
    }

    onDelete(resource);
    setDeleting(false);
    setPendingDelete(null);
  };

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: isDarkMode ? '#FFFFFF' : '#000000' }]}>
        Recursos ({resources.length})
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
      >
        {resources.map((resource, index) => (
          <TouchableOpacity
            key={resource.path || resource.id || index}
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => openResource(resource)}
            accessibilityRole="button"
            accessibilityLabel={`Abrir ${resource.name}`}
          >
            <View style={styles.preview}>
              {resource.type === 'image' ? (
                <Image source={{ uri: resource.url }} style={styles.image} />
              ) : (
                <View
                  style={[styles.pdfPlaceholder, { backgroundColor: 'rgba(255, 59, 48, 0.1)' }]}
                >
                  <Ionicons name="document-text" size={32} color="#FF3B30" />
                  <Text style={styles.pdfText}>PDF</Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => {
                  setDeleteError(false);
                  setPendingDelete(resource);
                }}
              >
                <Ionicons name="trash-outline" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <Text
              style={[styles.fileName, { color: isDarkMode ? '#FFFFFF' : '#000000' }]}
              numberOfLines={1}
            >
              {resource.name}
            </Text>
            <Text style={styles.date}>{new Date(resource.createdAt).toLocaleDateString()}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Modal
        visible={!!viewing}
        transparent
        animationType="fade"
        onRequestClose={() => setViewing(null)}
      >
        <View style={styles.viewerBackdrop}>
          <TouchableOpacity
            style={styles.viewerClose}
            onPress={() => setViewing(null)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
          >
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </TouchableOpacity>

          {imageLoading && <ActivityIndicator size="large" color="#FFFFFF" />}

          {viewing && (
            <Image
              source={{ uri: viewing.url }}
              style={styles.viewerImage}
              onLoadEnd={() => setImageLoading(false)}
            />
          )}

          <Text style={styles.viewerName} numberOfLines={2}>
            {viewing?.name}
          </Text>
        </View>
      </Modal>

      <BottomSheet
        visible={!!pendingDelete}
        onClose={closeConfirm}
        title="Eliminar recurso"
        subtitle={`¿Seguro que quieres eliminar "${pendingDelete?.name ?? ''}"? No podrás recuperarlo.`}
      >
        {deleteError && (
          <Text style={[sheetStyles.helper, sheetStyles.helperError]}>
            No se pudo eliminar el archivo. Inténtalo de nuevo.
          </Text>
        )}
        <View style={sheetStyles.actions}>
          <Button
            title="Cancelar"
            variant="secondary"
            onPress={closeConfirm}
            disabled={deleting}
            style={sheetStyles.actionButton}
          />
          <Button
            title="Eliminar"
            variant="danger"
            onPress={confirmDelete}
            loading={deleting}
            style={sheetStyles.actionButton}
          />
        </View>
      </BottomSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    paddingHorizontal: 4, // Match list padding if needed
  },
  list: {
    gap: 12,
    paddingRight: 24,
  },
  card: {
    width: 120,
    marginRight: 0,
  },
  preview: {
    width: 120,
    height: 120,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.2)',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  pdfPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pdfText: {
    marginTop: 4,
    fontWeight: '700',
    fontSize: 12,
    color: '#FF3B30',
  },
  deleteButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileName: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  date: {
    fontSize: 11,
    color: '#8E8E93',
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  viewerImage: {
    width: '100%',
    height: '80%',
    resizeMode: 'contain',
  },
  viewerClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerName: {
    position: 'absolute',
    bottom: 40,
    left: 24,
    right: 24,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default ResourceList;
