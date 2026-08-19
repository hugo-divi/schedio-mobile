'use no memo';
import React from 'react';
import { FlexWidget, TextWidget, IconWidget } from 'react-native-android-widget';
import { tokens } from '../theme/tokens';
import { daysBetween } from '../services/priority';

const c = tokens.colors;

const OPEN_APP = 'OPEN_APP';
const openUri = (uri) => ({ clickAction: 'OPEN_URI', clickActionData: { uri } });

const daysLabel = (n) => {
  if (n <= 0) return 'hoy';
  if (n === 1) return 'día';
  return 'días';
};

const formatExamDate = (iso) => {
  if (!iso) return '';
  return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })
    .format(new Date(iso))
    .replace('.', '');
};

function StreakPill({ streak }) {
  return (
    <FlexWidget
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: c.surfaceHover,
        borderRadius: 100,
        paddingVertical: 4,
        paddingHorizontal: 10,
      }}
    >
      <IconWidget font="material" icon="whatshot" size={13} color={c.premiumText} />
      <TextWidget
        text={String(streak)}
        style={{ fontSize: 12, fontWeight: 'bold', color: c.textPrimary, marginLeft: 4 }}
      />
    </FlexWidget>
  );
}

function SubjectDots({ exams, size }) {
  if (exams.length <= 1) {
    return (
      <FlexWidget
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: exams[0]?.color || c.textSecondary,
        }}
      />
    );
  }
  return (
    <FlexWidget style={{ flexDirection: 'row' }}>
      {exams.slice(0, 3).map((exam, index) => (
        <FlexWidget
          key={exam.id}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: exam.color,
            marginLeft: index === 0 ? 0 : -Math.round(size * 0.45),
          }}
        />
      ))}
    </FlexWidget>
  );
}

/** Header row shared by Medium and Large: subject dot(s) + label, streak pill. */
function ExamHeader({ model }) {
  const multi = model.exams.length > 1;
  return (
    <FlexWidget
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: 'match_parent',
        marginBottom: 14,
      }}
    >
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
        <SubjectDots exams={model.exams} size={14} />
        <TextWidget
          text={multi ? `${model.exams.length} exámenes` : model.exams[0]?.name || ''}
          style={{ fontSize: 13, fontWeight: 'bold', color: c.textSecondary, marginLeft: 8 }}
        />
      </FlexWidget>
      <StreakPill streak={model.streak} />
    </FlexWidget>
  );
}

/** Big countdown number + días + date subtitle. */
function Countdown({ model }) {
  const n = daysBetween(new Date(), new Date(model.examDateIso));
  const multi = model.exams.length > 1;
  const subtitle = multi
    ? `${formatExamDate(model.examDateIso)} · mismo día`
    : formatExamDate(model.examDateIso);
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 14 }}>
      <TextWidget
        text={String(Math.max(n, 0))}
        style={{ fontSize: 46, fontWeight: 'bold', color: c.textPrimary }}
      />
      <FlexWidget style={{ flexDirection: 'column', marginLeft: 10, marginBottom: 4 }}>
        <TextWidget
          text={daysLabel(n)}
          style={{ fontSize: 13, fontWeight: 'bold', color: c.textSecondary }}
        />
        <TextWidget text={subtitle} style={{ fontSize: 12, color: c.textSecondary }} />
      </FlexWidget>
    </FlexWidget>
  );
}

function Divider() {
  return (
    <FlexWidget
      style={{
        height: 1,
        width: 'match_parent',
        backgroundColor: c.borderDefault,
        marginBottom: 12,
      }}
    />
  );
}

/**
 * Empty state: no exam within the exams the app tracks. Same "sin culpa"
 * tone as the reengagement notifications. `streak` is optional — Medium
 * shows its own streak pill separately in the footer next to the CTA, so it
 * omits this prop; Large has no separate footer for it, so it passes
 * `streak` to keep the racha visible even with no exam to count down.
 */
function NoExamMessage({ streak }) {
  return (
    <FlexWidget style={{ flexDirection: 'column', marginBottom: 14 }}>
      <FlexWidget
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <IconWidget font="material" icon="menu_book" size={16} color={c.textSecondary} />
          <TextWidget
            text="Sin exámenes próximos"
            style={{ fontSize: 14, fontWeight: 'bold', color: c.textPrimary, marginLeft: 8 }}
          />
        </FlexWidget>
        {streak != null && <StreakPill streak={streak} />}
      </FlexWidget>
      <TextWidget
        text="Buen momento para repasar lo que peor llevas."
        style={{ fontSize: 13, color: c.textSecondary }}
      />
    </FlexWidget>
  );
}

function CardShell({ children, style }) {
  return (
    <FlexWidget
      style={{
        flexDirection: 'column',
        justifyContent: 'center',
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: c.surfaceCard,
        borderRadius: 20,
        padding: 16,
        ...style,
      }}
      clickAction={OPEN_APP}
    >
      {children}
    </FlexWidget>
  );
}

export function SmallWidget({ model }) {
  if (!model?.hasExam) {
    return (
      <CardShell style={{ alignItems: 'center' }}>
        <IconWidget font="material" icon="whatshot" size={28} color={c.premiumText} />
        <TextWidget
          text={String(model?.streak ?? 0)}
          style={{ fontSize: 34, fontWeight: 'bold', color: c.textPrimary, marginTop: 2 }}
        />
        <TextWidget text="días de racha" style={{ fontSize: 10, color: c.textSecondary }} />
      </CardShell>
    );
  }

  const n = daysBetween(new Date(), new Date(model.examDateIso));
  const multi = model.exams.length > 1;

  return (
    <CardShell style={{ justifyContent: 'space-between' }}>
      <FlexWidget
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <SubjectDots exams={model.exams} size={8} />
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
          <IconWidget font="material" icon="whatshot" size={11} color={c.premiumText} />
          <TextWidget
            text={String(model.streak)}
            style={{ fontSize: 10, fontWeight: 'bold', color: c.textPrimary, marginLeft: 2 }}
          />
        </FlexWidget>
      </FlexWidget>

      <FlexWidget style={{ flexDirection: 'column', alignItems: 'center' }}>
        <TextWidget
          text={String(Math.max(n, 0))}
          style={{ fontSize: 34, fontWeight: 'bold', color: c.textPrimary }}
        />
        <TextWidget
          text={daysLabel(n)}
          style={{ fontSize: 10, color: c.textSecondary, marginTop: 2 }}
        />
      </FlexWidget>

      <TextWidget
        text={
          multi
            ? `${model.exams.length} EXÁMENES`
            : model.exams[0]?.name?.toUpperCase().slice(0, 12) || ''
        }
        style={{ fontSize: 9.5, fontWeight: 'bold', color: c.accent, textAlign: 'center' }}
      />
    </CardShell>
  );
}

export function MediumWidget({ model }) {
  if (!model?.hasExam) {
    return (
      <CardShell>
        <NoExamMessage />
        <Divider />
        <FlexWidget
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <StreakPill streak={model.streak} />
          <FlexWidget
            style={{ flexDirection: 'row', alignItems: 'center' }}
            {...openUri('schedio://dashboard/plans')}
          >
            <TextWidget
              text="Ver plan de estudio"
              style={{ fontSize: 12, fontWeight: 'bold', color: c.accent }}
            />
            <IconWidget font="material" icon="chevron_right" size={14} color={c.accent} />
          </FlexWidget>
        </FlexWidget>
      </CardShell>
    );
  }

  const multi = model.exams.length > 1;
  const firstTask = model.tasksToday?.[0];

  return (
    <CardShell>
      <ExamHeader model={model} />
      <Countdown model={model} />
      {(multi || firstTask) && (
        <>
          <Divider />
          <FlexWidget
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            {multi ? (
              <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
                {model.exams.slice(0, 2).map((exam) => (
                  <FlexWidget
                    key={exam.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      backgroundColor: c.surfaceHover,
                      borderRadius: 100,
                      paddingVertical: 3,
                      paddingHorizontal: 8,
                      marginRight: 6,
                    }}
                  >
                    <FlexWidget
                      style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: exam.color }}
                    />
                    <TextWidget
                      text={exam.name}
                      style={{
                        fontSize: 11,
                        fontWeight: 'bold',
                        color: c.textPrimary,
                        marginLeft: 4,
                      }}
                    />
                  </FlexWidget>
                ))}
                {model.exams.length > 2 && (
                  <TextWidget
                    text={`+${model.exams.length - 2}`}
                    style={{ fontSize: 11, color: c.textDisabled }}
                  />
                )}
              </FlexWidget>
            ) : (
              <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
                <IconWidget
                  font="material"
                  icon="check_box_outline_blank"
                  size={16}
                  color={c.accent}
                />
                <TextWidget
                  text={firstTask.text}
                  style={{ fontSize: 13, color: c.textPrimary, marginLeft: 8 }}
                />
              </FlexWidget>
            )}
            {!multi && model.tasksToday.length > 1 && (
              <TextWidget
                text={`+${model.tasksToday.length - 1}`}
                style={{ fontSize: 12, color: c.textDisabled }}
              />
            )}
            {multi && (
              <IconWidget font="material" icon="chevron_right" size={14} color={c.textDisabled} />
            )}
          </FlexWidget>
        </>
      )}
    </CardShell>
  );
}

function PrimeUpsellBanner() {
  return (
    <FlexWidget
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: c.premiumBg,
        borderRadius: 12,
        padding: 10,
        marginTop: 4,
      }}
      {...openUri('schedio://plus')}
    >
      <TextWidget
        text="Tamaño grande incluido con Prime"
        style={{ fontSize: 12, fontWeight: 'bold', color: c.premiumText, flexShrink: 1 }}
      />
      <IconWidget font="material" icon="chevron_right" size={16} color={c.premiumText} />
    </FlexWidget>
  );
}

export function LargeWidget({ model }) {
  return (
    <CardShell>
      {model.hasExam ? (
        <>
          <ExamHeader model={model} />
          <Countdown model={model} />
        </>
      ) : (
        <NoExamMessage streak={model.streak} />
      )}
      <Divider />

      {model.availableWidgetSizes?.includes('large') ? (
        model.tasksToday.length > 0 ? (
          <FlexWidget style={{ flexDirection: 'column' }}>
            {model.tasksToday.map((task) => (
              <FlexWidget
                key={task.id}
                style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}
                {...openUri(`schedio://dashboard/study?taskId=${encodeURIComponent(task.id)}`)}
              >
                <IconWidget
                  font="material"
                  icon="check_box_outline_blank"
                  size={16}
                  color={c.accent}
                />
                <TextWidget
                  text={task.text}
                  style={{ fontSize: 13, color: c.textPrimary, marginLeft: 8 }}
                />
              </FlexWidget>
            ))}
          </FlexWidget>
        ) : (
          <TextWidget
            text="No hay tareas pendientes para hoy."
            style={{ fontSize: 12, color: c.textSecondary }}
          />
        )
      ) : (
        <PrimeUpsellBanner />
      )}
    </CardShell>
  );
}

const NAME_TO_COMPONENT = {
  Small: SmallWidget,
  Medium: MediumWidget,
  Large: LargeWidget,
};

export function renderWidgetForName(widgetName, model) {
  const Widget = NAME_TO_COMPONENT[widgetName];
  if (!Widget) return null;
  return <Widget model={model} />;
}
