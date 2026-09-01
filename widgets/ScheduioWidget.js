'use no memo';
import React from 'react';
import { FlexWidget, TextWidget, SvgWidget } from 'react-native-android-widget';
import { tokens } from '../theme/tokens';
import { daysBetween } from '../services/priority';

const c = tokens.colors;

const openUri = (uri) => ({ clickAction: 'OPEN_URI', clickActionData: { uri } });

/** Where each part of a widget takes you. Home owns the countdown and the
 *  exams, so it's the default; the streak pill has had its own screen since
 *  the racha moved out of a bottom sheet. */
const URI_HOME = 'schedio://dashboard';
/** The root runs the full session/onboarding decision, unlike a deep link
 *  straight into a tab — the right destination when there may be no data
 *  because there may be no session. */
const URI_ROOT = 'schedio://';
const URI_STREAK = 'schedio://dashboard/streak';
const URI_PLANS = 'schedio://dashboard/plans';

/* ────────────────────────────── Icons ──────────────────────────────
 *
 * Inline SVG, not `IconWidget`. IconWidget does not draw an icon: it sets
 * `icon` as the TEXT of a TextView and applies a typeface it looks up in
 * `android/app/src/main/assets/fonts/<font>.ttf`. That font has never been
 * bundled with the app, so every icon reached the home screen as its own
 * name in plain letters — "whatshot", "school", "chevron_right". SvgWidget
 * draws the path natively, and a path it cannot parse costs an icon rather
 * than the whole widget.
 */
const svgIcon = (size, color, path) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"><path fill="${color}" d="${path}"/></svg>`;

const PATH_FLAME =
  'M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z';
const PATH_CAP = 'M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z';
const PATH_CHEVRON = 'M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z';

function Icon({ path, size, color, marginLeft, marginRight, marginTop }) {
  return (
    <SvgWidget
      svg={svgIcon(size, color, path)}
      style={{ width: size, height: size, marginLeft, marginRight, marginTop }}
    />
  );
}

/* ────────────────────────────── Formatting ────────────────────────────── */

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** No `Intl`: this also runs in the headless process Android wakes every 30
 *  minutes, and a date label is not worth depending on ICU being there. */
const formatExamDate = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
};

const daysLabel = (n) => (n === 1 ? 'día' : 'días');

/** Days left, or `null` when there is no date to count to. `hasExam` can
 *  come back `true` with a null `examDateIso` from an older cached model:
 *  that used to render "HOY" (the epoch) instead of admitting it can't say. */
const examDays = (model) => {
  if (!model?.hasExam || !model.examDateIso) return null;
  const date = new Date(model.examDateIso);
  if (Number.isNaN(date.getTime())) return null;
  return daysBetween(new Date(), date);
};

/** Three digits at 46sp do not fit a 2x2. The number is the point, so it
 *  shrinks rather than getting clipped. */
const countdownSize = (n, base) => {
  if (n >= 100) return Math.round(base * 0.66);
  if (n >= 10) return Math.round(base * 0.88);
  return base;
};

const examTitle = (model) =>
  model.exams?.length > 1 ? `${model.exams.length} exámenes` : model.exams?.[0]?.name || 'Examen';

/** Red only shows up when there really is nothing left: today or tomorrow. */
const countdownColor = (n) => (n <= 1 ? c.danger : c.textPrimary);

/* ────────────────────────────── Pieces ────────────────────────────── */

function SubjectDots({ exams, size }) {
  const list = exams?.length ? exams.slice(0, 3) : [{ id: 'none', color: c.textSecondary }];
  if (list.length === 1) {
    return (
      <FlexWidget
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: list[0].color || c.textSecondary,
        }}
      />
    );
  }
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
      {list.map((exam, index) => (
        <FlexWidget
          key={exam.id}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: exam.color || c.textSecondary,
            marginLeft: index === 0 ? 0 : -Math.round(size * 0.45),
          }}
        />
      ))}
    </FlexWidget>
  );
}

function StreakPill({ streak }) {
  return (
    <FlexWidget
      {...openUri(URI_STREAK)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: c.surfaceHover,
        borderRadius: 100,
        paddingVertical: 4,
        paddingHorizontal: 9,
      }}
    >
      <Icon path={PATH_FLAME} size={12} color={c.premiumText} />
      <TextWidget
        text={String(streak)}
        maxLines={1}
        style={{ fontSize: 12, fontWeight: 'bold', color: c.textPrimary, marginLeft: 4 }}
      />
    </FlexWidget>
  );
}

/** The same streak without the pill: in a 2x2 the chip's background steals
 *  width the date needs. */
function StreakInline({ streak }) {
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }} {...openUri(URI_STREAK)}>
      <Icon path={PATH_FLAME} size={11} color={c.premiumText} />
      <TextWidget
        text={String(streak)}
        maxLines={1}
        style={{ fontSize: 11, fontWeight: 'bold', color: c.premiumText, marginLeft: 3 }}
      />
    </FlexWidget>
  );
}

function SubjectLine({ model, size, dotSize }) {
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
      <SubjectDots exams={model.exams} size={dotSize} />
      <TextWidget
        text={examTitle(model).toUpperCase()}
        maxLines={1}
        truncate="END"
        style={{
          fontSize: size,
          fontWeight: 'bold',
          color: c.textSecondary,
          letterSpacing: 0.6,
          marginLeft: 7,
        }}
      />
    </FlexWidget>
  );
}

function Divider({ marginBottom }) {
  return (
    <FlexWidget
      style={{
        height: 1,
        width: 'match_parent',
        backgroundColor: c.borderDefault,
        marginTop: 0,
        marginBottom: marginBottom ?? 9,
      }}
    />
  );
}

function TaskCheckbox() {
  return (
    <FlexWidget
      style={{
        width: 15,
        height: 15,
        borderRadius: 5,
        borderWidth: 1.5,
        borderColor: c.accent,
      }}
    />
  );
}

function TaskRow({ task, marginBottom }) {
  return (
    <FlexWidget
      style={{ flexDirection: 'row', alignItems: 'center', marginBottom }}
      {...openUri(`schedio://dashboard/study?taskId=${encodeURIComponent(task.id)}`)}
    >
      <TaskCheckbox />
      <TextWidget
        text={String(task.text ?? '')}
        maxLines={1}
        truncate="END"
        style={{ fontSize: 13, color: c.textPrimary, marginLeft: 8 }}
      />
    </FlexWidget>
  );
}

function CardShell({ children, style, padding }) {
  return (
    <FlexWidget
      style={{
        flexDirection: 'column',
        justifyContent: 'center',
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: c.surfaceCard,
        borderRadius: 20,
        padding: padding ?? 16,
        ...style,
      }}
      {...openUri(URI_HOME)}
    >
      {children}
    </FlexWidget>
  );
}

/**
 * Before the first sync there is nothing true to show — no exams, no streak,
 * no plan — so this says exactly that instead of reporting zeroes as facts.
 */
function NotReady({ compact }) {
  return (
    <FlexWidget
      {...openUri(URI_ROOT)}
      style={{
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: 'match_parent',
        width: 'match_parent',
      }}
    >
      <Icon path={PATH_CAP} size={compact ? 22 : 26} color={c.textSecondary} />
      {/* "Abre Schedio" read as an instruction to go find the icon, when the
          widget itself is the button. */}
      <TextWidget
        text="Toca para empezar"
        maxLines={1}
        style={{
          fontSize: compact ? 12 : 14,
          fontWeight: 'bold',
          color: c.accent,
          marginTop: 8,
        }}
      />
      <TextWidget
        text={compact ? 'y verás tus exámenes' : 'y esto se rellena solo'}
        maxLines={1}
        style={{ fontSize: compact ? 10 : 12, color: c.textSecondary, marginTop: 2 }}
      />
    </FlexWidget>
  );
}

/**
 * Empty state: no exam within the exams the app tracks. Same "sin culpa"
 * tone as the reengagement notifications. `streak` is optional — Medium
 * shows its own streak pill in the footer next to the CTA, so it omits this
 * prop; Large has no separate footer for it, so it passes `streak` to keep
 * the racha visible even with no exam to count down.
 */
function NoExamMessage({ streak }) {
  const header = [
    <FlexWidget key="left" style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Icon path={PATH_CAP} size={16} color={c.textSecondary} />
      <TextWidget
        text="Sin exámenes próximos"
        maxLines={1}
        truncate="END"
        style={{ fontSize: 14, fontWeight: 'bold', color: c.textPrimary, marginLeft: 8 }}
      />
    </FlexWidget>,
  ];
  if (streak > 0) header.push(<StreakPill key="streak" streak={streak} />);

  return (
    <FlexWidget style={{ flexDirection: 'column', marginBottom: 10 }}>
      <FlexWidget
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: header.length > 1 ? 'space-between' : 'flex-start',
          width: 'match_parent',
          marginBottom: 6,
        }}
      >
        {header}
      </FlexWidget>
      <TextWidget
        text="Buen momento para repasar lo que peor llevas."
        maxLines={2}
        style={{ fontSize: 13, color: c.textSecondary }}
      />
    </FlexWidget>
  );
}

/** Header row shared by Medium and Large: subject dot(s) + label, streak. */
function ExamHeader({ model }) {
  const children = [<SubjectLine key="subject" model={model} size={13} dotSize={13} />];
  if (model.streak > 0) children.push(<StreakPill key="streak" streak={model.streak} />);

  return (
    <FlexWidget
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: children.length > 1 ? 'space-between' : 'flex-start',
        width: 'match_parent',
        marginBottom: 10,
      }}
    >
      {children}
    </FlexWidget>
  );
}

/** Big countdown number + días + date subtitle. */
function Countdown({ model, days }) {
  const multi = model.exams?.length > 1;
  const subtitle = multi
    ? `${formatExamDate(model.examDateIso)} · mismo día`
    : formatExamDate(model.examDateIso);

  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 8 }}>
      {/* A 46px "0" over the word "hoy" read as a broken counter. On the day
          itself the word is the number. */}
      <TextWidget
        text={days <= 0 ? 'HOY' : String(days)}
        maxLines={1}
        style={{
          fontSize: days <= 0 ? 32 : countdownSize(days, 42),
          fontWeight: 'bold',
          color: countdownColor(days),
        }}
      />
      <FlexWidget style={{ flexDirection: 'column', marginLeft: 10, marginBottom: 5 }}>
        <TextWidget
          text={days <= 0 ? 'es el examen' : daysLabel(days)}
          maxLines={1}
          style={{ fontSize: 13, fontWeight: 'bold', color: c.textSecondary }}
        />
        <TextWidget
          text={subtitle}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 12, color: c.textDisabled }}
        />
      </FlexWidget>
    </FlexWidget>
  );
}

/* ────────────────────────────── 2x2 ──────────────────────────────
 *
 * The size that gets used the most, and the one with the least room: three
 * rows and not one more. Which subject (top), how long is left (the hero,
 * middle), when it is — with the streak if there is one (bottom).
 */

function SmallExam({ model, days }) {
  const footer = [
    <TextWidget
      key="date"
      text={formatExamDate(model.examDateIso)}
      maxLines={1}
      style={{ fontSize: 11, color: c.textDisabled }}
    />,
  ];
  if (model.streak > 0) footer.push(<StreakInline key="streak" streak={model.streak} />);

  const countdown = [
    <TextWidget
      key="number"
      text={days <= 0 ? 'HOY' : String(days)}
      maxLines={1}
      style={{
        fontSize: days <= 0 ? 32 : countdownSize(days, 44),
        fontWeight: 'bold',
        color: countdownColor(days),
      }}
    />,
  ];
  if (days > 0) {
    countdown.push(
      <TextWidget
        key="label"
        text={daysLabel(days)}
        maxLines={1}
        style={{ fontSize: 12, color: c.textSecondary, marginLeft: 6, marginBottom: 5 }}
      />
    );
  }

  return (
    <CardShell padding={14} style={{ justifyContent: 'space-between' }}>
      <SubjectLine model={model} size={10} dotSize={7} />

      <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end' }}>{countdown}</FlexWidget>

      <FlexWidget
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: footer.length > 1 ? 'space-between' : 'flex-start',
          width: 'match_parent',
        }}
      >
        {footer}
      </FlexWidget>
    </CardShell>
  );
}

export function SmallWidget({ model }) {
  if (!model?.synced) {
    return (
      <CardShell>
        <NotReady compact />
      </CardShell>
    );
  }

  const days = examDays(model);
  if (days !== null) return <SmallExam model={model} days={days} />;

  // A streak of zero is not a number worth showing at 34px — it's the one
  // value where the hero figure is the least motivating thing on screen.
  if (!model.streak) {
    return (
      <CardShell padding={14} style={{ alignItems: 'center' }}>
        <Icon path={PATH_FLAME} size={24} color={c.textSecondary} />
        <TextWidget
          text="Empieza tu racha"
          maxLines={1}
          style={{ fontSize: 12, fontWeight: 'bold', color: c.textPrimary, marginTop: 7 }}
        />
        <TextWidget
          text="con una sesión hoy"
          maxLines={1}
          style={{ fontSize: 10, color: c.textSecondary, marginTop: 2 }}
        />
      </CardShell>
    );
  }

  return (
    <CardShell padding={14} style={{ alignItems: 'center' }}>
      <Icon path={PATH_FLAME} size={26} color={c.premiumText} />
      <TextWidget
        text={String(model.streak)}
        maxLines={1}
        style={{ fontSize: 34, fontWeight: 'bold', color: c.textPrimary, marginTop: 2 }}
      />
      <TextWidget
        text={model.streak === 1 ? 'día de racha' : 'días de racha'}
        maxLines={1}
        style={{ fontSize: 10, color: c.textSecondary }}
      />
    </CardShell>
  );
}

/* ────────────────────────────── 2x4 ────────────────────────────── */

function MediumExamFooter({ model }) {
  if (model.exams?.length > 1) {
    const chips = model.exams.slice(0, 2).map((exam) => (
      <FlexWidget
        key={exam.id}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: c.surfaceHover,
          borderRadius: 100,
          paddingVertical: 2,
          paddingHorizontal: 8,
          marginRight: 6,
        }}
      >
        <FlexWidget style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: exam.color }} />
        <TextWidget
          text={String(exam.name ?? '')}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 11, fontWeight: 'bold', color: c.textPrimary, marginLeft: 5 }}
        />
      </FlexWidget>
    ));
    if (model.exams.length > 2) {
      chips.push(
        <TextWidget
          key="rest"
          text={`+${model.exams.length - 2}`}
          maxLines={1}
          style={{ fontSize: 11, color: c.textDisabled }}
        />
      );
    }
    return <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>{chips}</FlexWidget>;
  }

  const rest = model.tasksToday.length - 1;
  const children = [<TaskRow key="task" task={model.tasksToday[0]} />];
  if (rest > 0) {
    children.push(
      <TextWidget
        key="rest"
        text={`+${rest}`}
        maxLines={1}
        style={{ fontSize: 12, color: c.textDisabled, marginLeft: 8 }}
      />
    );
  }

  return (
    <FlexWidget
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: children.length > 1 ? 'space-between' : 'flex-start',
        width: 'match_parent',
      }}
    >
      {children}
    </FlexWidget>
  );
}

export function MediumWidget({ model }) {
  if (!model?.synced) {
    return (
      <CardShell>
        <NotReady />
      </CardShell>
    );
  }

  const days = examDays(model);

  if (days === null) {
    const footer = [];
    if (model.streak > 0) footer.push(<StreakPill key="streak" streak={model.streak} />);
    footer.push(
      <FlexWidget
        key="plan"
        style={{ flexDirection: 'row', alignItems: 'center' }}
        {...openUri(URI_PLANS)}
      >
        <TextWidget
          text="Ver plan de estudio"
          maxLines={1}
          style={{ fontSize: 12, fontWeight: 'bold', color: c.accent }}
        />
        <Icon path={PATH_CHEVRON} size={14} color={c.accent} marginLeft={2} />
      </FlexWidget>
    );

    return (
      <CardShell>
        <NoExamMessage />
        <Divider />
        <FlexWidget
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: footer.length > 1 ? 'space-between' : 'flex-start',
            width: 'match_parent',
          }}
        >
          {footer}
        </FlexWidget>
      </CardShell>
    );
  }

  const showFooter = model.exams?.length > 1 || model.tasksToday?.length > 0;

  return (
    <CardShell>
      <ExamHeader model={model} />
      <Countdown model={model} days={days} />
      {showFooter && <Divider />}
      {showFooter && <MediumExamFooter model={model} />}
    </CardShell>
  );
}

/* ────────────────────────────── 4x4 ────────────────────────────── */

/** Los tres tamaños son gratis: el 4x4 enseña el plan a todo el mundo, no un
 *  anuncio de Prime a quien no paga. */
function LargeBody({ model }) {
  const tasks = model.tasksToday || [];
  if (tasks.length === 0) {
    return (
      <TextWidget
        text="No hay tareas pendientes para hoy."
        maxLines={2}
        style={{ fontSize: 12, color: c.textSecondary }}
      />
    );
  }

  return (
    <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} marginBottom={9} />
      ))}
    </FlexWidget>
  );
}

export function LargeWidget({ model }) {
  if (!model?.synced) {
    return (
      <CardShell>
        <NotReady />
      </CardShell>
    );
  }

  const days = examDays(model);

  return (
    <CardShell>
      {days !== null && <ExamHeader model={model} />}
      {days !== null && <Countdown model={model} days={days} />}
      {days === null && <NoExamMessage streak={model.streak} />}
      <Divider />
      <LargeBody model={model} />
    </CardShell>
  );
}

const NAME_TO_COMPONENT = {
  Small: SmallWidget,
  Medium: MediumWidget,
  Large: LargeWidget,
};

/** Never returns `null`: the tree is built inside the native process, and a
 *  `null` there is a blank rectangle on the home screen. */
export function renderWidgetForName(widgetName, model) {
  const Widget = NAME_TO_COMPONENT[widgetName] || SmallWidget;
  return <Widget model={model} />;
}
