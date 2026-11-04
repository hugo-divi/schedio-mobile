import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Share } from 'react-native';
import { auth } from '../services/firebase';
import useUserStore from '../store/userStore';
import {
  STATUS,
  normalizeClassDate,
  classDateStatus,
  groupByWhen,
  summarize,
} from '../services/classDates';
import { buildInviteMessage } from '../services/classInvite';

/**
 * Todo lo que la pantalla de un aula necesita para sus fechas, a partir de
 * las fechas tal cual las tenga el aula (ver el contrato en
 * services/classDates.js):
 *
 *   const { groups, summary, rowFor, actions } = useClassDates(fechasDelAula);
 *   <ClassDatesSection {...useClassDates(fechasDelAula)} />
 *
 * Lee tus exámenes al montarse y cada vez que el resto de la app avisa de un
 * cambio (`triggerExamRefresh`), y tras cada acción avisa a su vez, para que
 * el plan se rehaga con la fecha nueva.
 */
export default function useClassDates(rawDates, { now: nowOverride } = {}) {
  const subjects = useUserStore((state) => state.subjects);
  const refreshTrigger = useUserStore((state) => state.examRefreshTrigger);
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const classDates = useMemo(
    () => (rawDates || []).map(normalizeClassDate).filter(Boolean),
    [rawDates]
  );
  // Fijado por render: que todas las filas cuenten los días desde el mismo
  // instante.
  const now = useMemo(() => nowOverride || new Date(), [nowOverride, classDates, exams]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const { getAllExams } = await import('../services/exams');
    setExams((await getAllExams(uid)) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load, refreshTrigger]);

  const rows = useMemo(() => {
    const map = new Map();
    classDates.forEach((d) => {
      map.set(d.id, { classDate: d, ...classDateStatus(d, exams, { subjects, now }) });
    });
    return map;
  }, [classDates, exams, subjects, now]);

  // Un cambio de la clase que aún no has decidido se apunta en tu examen, una
  // vez, para que la notificación del día lo cuente si no vuelves.
  const marked = useRef(new Set());
  useEffect(() => {
    rows.forEach((row) => {
      if (row.status !== STATUS.CHANGED || !row.exam?.id) return;
      const key = `${row.exam.id}@${row.classDate.date.toISOString()}`;
      if (marked.current.has(key)) return;
      marked.current.add(key);
      import('../services/exams')
        .then(({ markPendingClassChange }) => markPendingClassChange(row.exam, row.classDate))
        .catch(() => marked.current.delete(key));
    });
  }, [rows]);

  const run = useCallback(
    async (id, action) => {
      setBusyId(id);
      try {
        await action();
        useUserStore.getState().triggerExamRefresh();
        await load();
      } finally {
        setBusyId(null);
      }
    },
    [load]
  );

  const actions = useMemo(() => {
    const row = (id) => rows.get(id);
    const userId = () => auth.currentUser?.uid;
    return {
      add: (id) =>
        run(id, async () => {
          const { addClassDateToCalendar } = await import('../services/exams');
          const r = row(id);
          if (r)
            await addClassDateToCalendar(r.classDate, { userId: userId(), subject: r.subject });
        }),
      addAll: () =>
        run('all', async () => {
          const { addAllClassDatesToCalendar } = await import('../services/exams');
          await addAllClassDatesToCalendar(classDates, exams, { userId: userId(), subjects });
        }),
      link: (id) =>
        run(id, async () => {
          const { linkClassDate } = await import('../services/exams');
          const r = row(id);
          if (r?.exam) await linkClassDate(r.exam.id, r.classDate);
        }),
      accept: (id) =>
        run(id, async () => {
          const { acceptClassDateChange } = await import('../services/exams');
          const r = row(id);
          if (r?.exam) await acceptClassDateChange(r.exam.id, r.classDate);
        }),
      keep: (id) =>
        run(id, async () => {
          const { keepMyExamDate } = await import('../services/exams');
          const r = row(id);
          if (r?.exam) await keepMyExamDate(r.exam.id, r.classDate);
        }),
    };
  }, [rows, run, classDates, exams, subjects]);

  return {
    loading,
    busyId,
    now,
    groups: useMemo(() => groupByWhen(classDates, { now }), [classDates, now]),
    summary: useMemo(
      () => summarize(classDates, exams, { subjects, now }),
      [classDates, exams, subjects, now]
    ),
    rowFor: (id) => rows.get(id),
    subjects,
    actions,
  };
}

/**
 * Compartir el aula por WhatsApp o donde sea. En el iPhone (PWA) usa la hoja
 * de compartir del sistema si la hay y, si no, copia el texto.
 *
 * @returns {Promise<'shared'|'copied'|'cancelled'>}
 */
export const shareClassInvite = async ({ aulaName, url, upcoming, total }) => {
  const message = buildInviteMessage({ aulaName, url, upcoming, total });
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (nav?.share) {
      try {
        await nav.share({ text: message });
        return 'shared';
      } catch {
        return 'cancelled';
      }
    }
    await nav?.clipboard?.writeText(message);
    return 'copied';
  }
  const result = await Share.share({ message });
  return result.action === Share.dismissedAction ? 'cancelled' : 'shared';
};
