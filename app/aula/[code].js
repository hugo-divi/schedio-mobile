import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import useClassInviteStore from '../../store/classInviteStore';
import { parseInviteCode } from '../../services/classInvite';
import { tokens } from '../../theme/tokens';

/**
 * Donde aterriza el enlace de un aula: app.schedio.es/aula/CODIGO en la web
 * (el PWA del iPhone) y schedio://aula/CODIGO en Android.
 *
 * Antes caía en "pantalla no encontrada". Ahora guarda el código y sigue por
 * `/`, que decide si toca bienvenida, login, onboarding o el dashboard; el
 * código espera en store/classInviteStore.js hasta que hay cuenta y perfil,
 * y entonces el dashboard lo entrega al aula.
 */
export default function ClassInviteLink() {
  const { code } = useLocalSearchParams();
  const router = useRouter();

  useEffect(() => {
    const parsed = parseInviteCode(Array.isArray(code) ? code[0] : code);
    if (parsed) useClassInviteStore.getState().save(parsed, 'link');
    router.replace('/');
  }, [code, router]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: tokens.colors.background,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ActivityIndicator color={tokens.colors.textSecondary} />
    </View>
  );
}
