import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getAllExams } from './exams';

const ACCENT = '#2979FF';
const TEXT = '#000000';
const MUTED = '#6B6B70';
const BORDER = '#E5E5EA';

const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );

const formatDate = (date) =>
  new Date(date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

/**
 * Builds the printable HTML for a student's grade + exam report.
 * Kept deliberately plain (system fonts, one accent colour) rather than
 * matching every design-system token — this only ever renders inside
 * expo-print's offscreen WebView, never in the app itself.
 */
const buildReportHtml = ({ studentName, generatedAt, subjects, exams, averageGrade }) => {
  const subjectsById = new Map(subjects.map((s) => [s.id, s]));
  const upcoming = exams.filter((e) => !e.completed).sort((a, b) => a.date - b.date);

  const subjectSections = subjects
    .map((subject) => {
      const subjectExams = exams
        .filter(
          (e) =>
            e.subjectId === subject.id && e.completed && e.grade !== undefined && e.grade !== null
        )
        .sort((a, b) => b.date - a.date);

      if (subjectExams.length === 0) return '';

      const rows = subjectExams
        .map(
          (exam) => `
            <tr>
              <td>${escapeHtml(exam.name)}</td>
              <td>${formatDate(exam.date)}</td>
              <td class="num">${escapeHtml(exam.grade)}</td>
            </tr>`
        )
        .join('');

      return `
        <section class="subject">
          <div class="subject-head">
            <span class="dot" style="background:${escapeHtml(subject.color || ACCENT)}"></span>
            <h2>${escapeHtml(subject.name)}</h2>
            ${subject.average != null ? `<span class="avg">Media: ${escapeHtml(subject.average)}</span>` : ''}
          </div>
          <table>
            <thead><tr><th>Examen</th><th>Fecha</th><th class="num">Nota</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </section>`;
    })
    .join('');

  const upcomingRows = upcoming
    .map((exam) => {
      const subject = subjectsById.get(exam.subjectId);
      return `
        <tr>
          <td>${escapeHtml(exam.name)}</td>
          <td>${escapeHtml(subject?.name || '—')}</td>
          <td>${formatDate(exam.date)}</td>
        </tr>`;
    })
    .join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, Helvetica, Arial, sans-serif;
            color: ${TEXT};
            padding: 40px;
            font-size: 13px;
          }
          .brand { font-size: 13px; font-weight: 700; color: ${ACCENT}; letter-spacing: 0.02em; margin-bottom: 10px; }
          h1 { font-size: 22px; margin: 0 0 4px; }
          h2 { font-size: 15px; margin: 0; }
          .meta { color: ${MUTED}; font-size: 12px; margin-bottom: 24px; }
          .summary {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border: 1px solid ${BORDER};
            border-radius: 12px;
            padding: 16px 20px;
            margin-bottom: 28px;
          }
          .summary .label { color: ${MUTED}; font-size: 12px; }
          .summary .value { font-size: 24px; font-weight: 700; color: ${ACCENT}; }
          .subject { margin-bottom: 22px; }
          .subject-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
          .dot { width: 10px; height: 10px; border-radius: 5px; display: inline-block; }
          .avg { margin-left: auto; font-size: 12px; color: ${MUTED}; }
          table { width: 100%; border-collapse: collapse; }
          th, td {
            text-align: left;
            padding: 8px 6px;
            border-bottom: 1px solid ${BORDER};
            font-size: 12.5px;
          }
          th { color: ${MUTED}; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
          .num { text-align: right; }
          .section-title { font-size: 15px; margin: 28px 0 10px; }
          .footer { margin-top: 32px; color: ${MUTED}; font-size: 10.5px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="brand">Schedio</div>
        <h1>Informe académico</h1>
        <div class="meta">
          ${studentName ? `${escapeHtml(studentName)} · ` : ''}Generado el ${formatDate(generatedAt)}
        </div>

        <div class="summary">
          <div>
            <div class="label">Nota media global</div>
            <div class="value">${averageGrade != null && averageGrade !== 0 ? escapeHtml(averageGrade) : '—'}</div>
          </div>
          <div>
            <div class="label">Materias</div>
            <div class="value" style="color:${TEXT}">${subjects.length}</div>
          </div>
        </div>

        ${subjectSections || '<p style="color:' + MUTED + '">Todavía no hay notas registradas.</p>'}

        ${
          upcomingRows
            ? `<h2 class="section-title">Próximos exámenes</h2>
               <table>
                 <thead><tr><th>Examen</th><th>Materia</th><th>Fecha</th></tr></thead>
                 <tbody>${upcomingRows}</tbody>
               </table>`
            : ''
        }

        <div class="footer">Generado con Schedio Prime</div>
      </body>
    </html>`;
};

/**
 * Generates the notas + exámenes PDF and opens the native share sheet.
 * Caller is responsible for the Prime gate — this has no entitlement check
 * of its own, same split as the rest of the plan-limited features.
 */
export const exportGradesAndExamsPdf = async ({ userId, studentName, subjects, averageGrade }) => {
  const exams = await getAllExams(userId);
  const html = buildReportHtml({
    studentName,
    generatedAt: new Date(),
    subjects: subjects || [],
    exams,
    averageGrade,
  });

  const { uri } = await Print.printToFileAsync({ html, base64: false });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Exportar notas y exámenes',
      UTI: 'com.adobe.pdf',
    });
  }

  return uri;
};
