import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronDown, Share2 } from 'lucide-react-native';
import { tokens } from '../theme/tokens';
import Button from './ui/Button';
import Skeleton from './Skeleton';
import { OverlineLabel } from './ui/SectionTitle';
import ClassDateCard from './ClassDateCard';

const font = tokens.typography.families.inter;

/**
 * Las fechas de un aula, por cuándo tocan. Pensado para ir tal cual en la
 * pantalla del aula: `<ClassDatesSection {...useClassDates(fechas)} />`.
 *
 *  · Arriba, lo que falta en tu calendario y un "Añadir todas": el aula vale
 *    lo que valen las fechas que acaban en tu plan.
 *  · "Esta semana" primero, luego "Más adelante"; lo pasado plegado.
 *  · Sin fechas: el primer paso, que es poner el próximo examen (un aula
 *    vacía no la abre nadie dos veces) e invitar a la clase.
 */
export default function ClassDatesSection({
  loading,
  busyId,
  now,
  groups,
  summary,
  rowFor,
  actions,
  onAddDate,
  onInvite,
}) {
  const [showPast, setShowPast] = useState(false);

  if (loading) {
    return (
      <View style={styles.wrap}>
        <Skeleton width={120} height={14} />
        <Skeleton width="100%" height={96} borderRadius={16} />
        <Skeleton width="100%" height={96} borderRadius={16} />
      </View>
    );
  }

  const empty = groups.thisWeek.length + groups.later.length === 0;
  const card = (d) => (
    <ClassDateCard
      key={d.id}
      row={rowFor(d.id)}
      now={now}
      busy={busyId === d.id || busyId === 'all'}
      onAdd={() => actions.add(d.id)}
      onLink={() => actions.link(d.id)}
      onAccept={() => actions.accept(d.id)}
      onKeep={() => actions.keep(d.id)}
    />
  );

  return (
    <View style={styles.wrap}>
      {empty ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyTitle}>Aún no hay fechas</Text>
          <Text style={styles.emptyText}>
            Pon el próximo examen y le saldrá a toda la clase. Quien lo añada a su calendario lo
            tendrá en su plan y en su aviso diario.
          </Text>
          {onAddDate ? (
            <Button title="Añadir el próximo examen" onPress={onAddDate} fullWidth />
          ) : null}
          {onInvite ? (
            <Button
              title="Invitar a la clase"
              variant="secondary"
              icon={<Share2 size={16} color={tokens.colors.textPrimary} />}
              onPress={onInvite}
              fullWidth
            />
          ) : null}
        </View>
      ) : null}

      {summary.changed > 0 ? (
        <Text style={styles.changedBanner}>
          {summary.changed === 1
            ? 'La clase ha cambiado una fecha que tienes en tu calendario.'
            : `La clase ha cambiado ${summary.changed} fechas que tienes en tu calendario.`}
        </Text>
      ) : null}

      {summary.missing > 1 ? (
        <View style={styles.missingRow}>
          <Text style={styles.missingText}>
            {summary.missing} fechas aún no están en tu calendario
          </Text>
          <TouchableOpacity
            onPress={actions.addAll}
            disabled={busyId === 'all'}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={styles.missingAction}>
              {busyId === 'all' ? 'Añadiendo…' : 'Añadir todas'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {groups.thisWeek.length > 0 ? (
        <View style={styles.group}>
          <OverlineLabel>Esta semana</OverlineLabel>
          {groups.thisWeek.map(card)}
        </View>
      ) : null}

      {groups.later.length > 0 ? (
        <View style={styles.group}>
          <OverlineLabel>Más adelante</OverlineLabel>
          {groups.later.map(card)}
        </View>
      ) : null}

      {groups.past.length > 0 ? (
        <View style={styles.group}>
          <TouchableOpacity
            style={styles.pastToggle}
            onPress={() => setShowPast((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showPast }}
          >
            <Text style={styles.pastLabel}>Pasadas ({groups.past.length})</Text>
            <ChevronDown
              size={16}
              color={tokens.colors.textSecondary}
              style={{ transform: [{ rotate: showPast ? '180deg' : '0deg' }] }}
            />
          </TouchableOpacity>
          {showPast ? groups.past.map(card) : null}
        </View>
      ) : null}

      {!empty && onInvite ? (
        <TouchableOpacity style={styles.inviteRow} onPress={onInvite} accessibilityRole="button">
          <Share2 size={15} color={tokens.colors.accent} />
          <Text style={styles.inviteText}>Invitar a la clase</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  group: { gap: 10 },
  emptyBox: {
    gap: 10,
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: tokens.colors.borderDefault,
  },
  emptyTitle: { fontFamily: font.semibold, fontSize: 16, color: tokens.colors.textPrimary },
  emptyText: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    color: tokens.colors.textSecondary,
  },
  changedBanner: {
    fontFamily: font.medium,
    fontSize: 13,
    lineHeight: 18,
    color: tokens.colors.premiumText,
    backgroundColor: tokens.colors.premiumBg,
    borderColor: tokens.colors.premiumBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  missingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: tokens.colors.accentSoftBg,
    borderWidth: 1,
    borderColor: tokens.colors.accentSoftBorder,
  },
  missingText: { flex: 1, fontFamily: font.medium, fontSize: 13, color: tokens.colors.textPrimary },
  missingAction: { fontFamily: font.semibold, fontSize: 13, color: tokens.colors.accent },
  pastToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  pastLabel: { fontFamily: font.medium, fontSize: 13, color: tokens.colors.textSecondary },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  inviteText: { fontFamily: font.semibold, fontSize: 14, color: tokens.colors.accent },
});
