import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { INVITE_TTL_MS, isInviteCode } from '../services/classInvite';

const STORAGE_KEY = 'schedio.pendingClassInvite';

/**
 * El código de un aula que alguien abrió, hasta que pueda usarse.
 *
 * El enlace llega casi siempre antes de que haya cuenta: lo abren desde el
 * grupo de clase, en el iPhone se abre la web y hay que registrarse,
 * verificar el correo y pasar el onboarding. El almacén de las
 * notificaciones (store/notificationRouteStore.js) olvida a los 10 minutos y
 * solo en memoria; aquí se guarda en el dispositivo una semana, para que el
 * aula siga esperando al terminar todo eso, aunque se cierre la pestaña.
 *
 * Quién lo usa: app/dashboard/_layout.js, cuando hay sesión y perfil, se lo
 * pasa al manejador que registre el código del aula con
 * `registerClassInviteHandler`. Sin manejador el código se queda guardado
 * (hasta que caduque), así que nada se pierde mientras se conecta.
 */
let handler = null;

/**
 * El aula se engancha aquí: `(code, { source }) => router.push(...)`.
 * Devuelve la función para soltarlo.
 */
export const registerClassInviteHandler = (fn) => {
  handler = typeof fn === 'function' ? fn : null;
  useClassInviteStore.setState({ hasHandler: !!handler });
  return () => {
    if (handler === fn) {
      handler = null;
      useClassInviteStore.setState({ hasHandler: false });
    }
  };
};

export const getClassInviteHandler = () => handler;

const fresh = (entry) =>
  entry && isInviteCode(entry.code) && Date.now() - Number(entry.at || 0) <= INVITE_TTL_MS;

const useClassInviteStore = create((set, get) => ({
  pending: null,
  hydrated: false,
  hasHandler: false,

  /** Lee lo guardado en un arranque anterior. */
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const entry = raw ? JSON.parse(raw) : null;
      if (fresh(entry)) {
        // Lo que haya llegado en este arranque (un enlace nuevo) gana.
        if (!get().pending) set({ pending: entry });
      } else if (raw) {
        await AsyncStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // Almacenamiento bloqueado (modo privado): se queda solo en memoria.
    }
    set({ hydrated: true });
  },

  /** `source`: 'link' | 'install_referrer' | 'paste' — para el aula, por si lo usa. */
  save: (code, source = 'link') => {
    if (!isInviteCode(code)) return;
    const entry = { code: code.trim(), source, at: Date.now() };
    set({ pending: entry });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entry)).catch(() => {});
  },

  /** Lo entrega una vez, si sigue valiendo. */
  take: () => {
    const { pending } = get();
    set({ pending: null });
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    return fresh(pending) ? pending : null;
  },
}));

export default useClassInviteStore;
