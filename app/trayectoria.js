import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';

import { tokens } from '../theme/tokens';
import Card from '../components/ui/Card';
import SectionTitle from '../components/ui/SectionTitle';

const font = tokens.typography.families.inter;

/**
 * Hugo: reescribe esto con tus palabras. Lo he dejado corto y sin adornos a
 * propósito — es lo que sé del proyecto, no una historia inventada, y una
 * historia de origen se nota enseguida cuando no la ha escrito quien la vivió.
 */
const STORY = [
  'Schedio empezó como una herramienta para un problema propio: llegar a los exámenes sabiendo qué tocaba estudiar cada día, en vez de improvisar la semana anterior.',
  'No había nada que hiciera justo eso. Las apps de tareas te dejan una lista, los calendarios te dejan una fecha, y ninguno de los dos te dice qué hacer hoy. Esa es la parte que Schedio intenta resolver.',
  'Lo construye un equipo pequeño e independiente, y se sigue construyendo con lo que cuentan los estudiantes que la usan.',
];

/**
 * Only what has actually shipped, newest first. Nothing goes on this list
 * before it is in a build the students can install.
 *
 * Deliberately not a roadmap. A dated promise inside the app is a commitment,
 * and the paywall is one screen away — if someone pays expecting something
 * announced here, an announcement is what they bought. Anything still being
 * built belongs in `EXPLORING`, without a date, or nowhere at all.
 */
const RELEASES = [];

/** Ideas being explored. No dates, no commitments, and fine to drop. */
const EXPLORING = [];

function Release({ item }) {
  return (
    <View style={styles.release}>
      <View style={styles.releaseDot} />
      <View style={styles.releaseBody}>
        <Text style={styles.releaseDate}>{item.date}</Text>
        <Text style={styles.releaseTitle}>{item.title}</Text>
        <Text style={styles.releaseText}>{item.body}</Text>
      </View>
    </View>
  );
}

export default function TrayectoriaScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <ChevronLeft size={22} color={tokens.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trayectoria</Text>
        <View style={styles.back} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <SectionTitle>Cómo nació Schedio</SectionTitle>
          <Card padding={20}>
            {STORY.map((paragraph, index) => (
              <Text key={index} style={[styles.story, index > 0 && { marginTop: 14 }]}>
                {paragraph}
              </Text>
            ))}
          </Card>
        </View>

        <View>
          <SectionTitle>Novedades</SectionTitle>
          <Card padding={20}>
            {RELEASES.length === 0 ? (
              <Text style={styles.empty}>
                Todavía no hay ninguna. Schedio acaba de empezar — aquí irá apareciendo todo lo que
                vayamos añadiendo, con su fecha.
              </Text>
            ) : (
              RELEASES.map((item) => <Release key={item.date + item.title} item={item} />)
            )}
          </Card>
        </View>

        {EXPLORING.length > 0 ? (
          <View>
            <SectionTitle>En estudio</SectionTitle>
            <Card padding={20}>
              <Text style={styles.exploringNote}>
                Ideas en las que estamos trabajando. Sin fecha, y alguna se quedará por el camino.
              </Text>
              {EXPLORING.map((idea) => (
                <Text key={idea} style={styles.exploringItem}>
                  · {idea}
                </Text>
              ))}
            </Card>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.borderDefault,
  },
  back: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontFamily: font.semibold,
    fontSize: 17,
    color: tokens.colors.textPrimary,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
  },
  story: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 22,
    color: tokens.colors.textSecondary,
  },
  empty: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 21,
    color: tokens.colors.textSecondary,
  },
  release: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  releaseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    backgroundColor: tokens.colors.accent,
  },
  releaseBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  releaseDate: {
    fontFamily: font.medium,
    fontSize: 12,
    color: tokens.colors.textDisabled,
  },
  releaseTitle: {
    fontFamily: font.semibold,
    fontSize: 15,
    color: tokens.colors.textPrimary,
  },
  releaseText: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 21,
    color: tokens.colors.textSecondary,
  },
  exploringNote: {
    fontFamily: font.regular,
    fontSize: 13,
    lineHeight: 19,
    color: tokens.colors.textDisabled,
    marginBottom: 10,
  },
  exploringItem: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 22,
    color: tokens.colors.textSecondary,
  },
});
