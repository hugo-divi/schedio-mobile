import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from './firebase';

/**
 * Uploads a file (blob/uri) to Firebase Storage
 * @param {string} uri - Local file URI
 * @param {string} path - Storage path (e.g. 'users/uid/resources/filename.jpg')
 * @param {function} onProgress - Callback for upload progress (0-100)
 * @returns {Promise<string>} - Download URL
 */
export const uploadFile = async (uri, path, onProgress) => {
    try {
        const response = await fetch(uri);
        const blob = await response.blob();

        const storageRef = ref(storage, path);
        const uploadTask = uploadBytesResumable(storageRef, blob);

        return new Promise((resolve, reject) => {
            uploadTask.on(
                'state_changed',
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    if (onProgress) onProgress(progress);
                },
                (error) => {
                    reject(error);
                },
                async () => {
                    const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                    resolve(downloadURL);
                }
            );
        });
    } catch (error) {
        console.error("Error uploading file:", error);
        throw error;
    }
};

/**
 * Deletes a file from Firebase Storage
 * @param {string} path - Storage path or full URL
 */
export const deleteFile = async (path) => {
    try {
        // Create a reference to the file to delete
        // If path is a full URL, ref() handles it correctly in newer SDKs, 
        // but it's safer to use refFromURL or just the path if we have it.
        // Assuming 'path' is the relative path in bucket.
        const storageRef = ref(storage, path);
        await deleteObject(storageRef);
    } catch (error) {
        console.error("Error deleting file:", error);
        throw error;
    }
};
