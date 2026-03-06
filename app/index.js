import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { LoadingScreen } from '../components/LoadingScreen';

export default function Home() {
    const router = useRouter();

    useEffect(() => {
        // Small delay to ensure router is ready and show branding
        const timer = setTimeout(() => {
            router.replace('/login');
        }, 1500);

        return () => clearTimeout(timer);
    }, []);

    return <LoadingScreen />;
}
