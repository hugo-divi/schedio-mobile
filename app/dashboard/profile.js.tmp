import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import useAuthStore from '../../store/authStore';
import useUserStore from '../../store/userStore';

export default function ProfileScreen() {
    const router = useRouter();
    const { user } = useAuthStore();
    const { profile, loadUserData } = useUserStore();

    useEffect(() => {
        if (user) loadUserData(user.uid);
    }, [user]);

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Perfil</Text>
            {user && <Text style={styles.email}>{user.email}</Text>}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
        padding: 20,
        paddingTop: 60
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#FFFFFF'
    },
    email: {
        fontSize: 16,
        color: '#8E8E93',
        marginTop: 10
    }
});
