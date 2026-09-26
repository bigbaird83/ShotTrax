import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COPY } from '@/src/domain/playerCopy';
import {
  planShareChoices,
  type ScorecardAudience,
  type ScorecardAudienceChoice,
  type ShareKind,
} from '@/src/domain/shareChoice';
import { BigButton } from './BigButton';
import { useColors } from './ColorThemeProvider';
import { type ColorPalette } from './theme';

/**
 * Whole group (default, first) or Just me. Shown only when the caller already
 * knows the round has a partner. Cancel does not share.
 */
export function ScorecardAudienceChoices({
  choices,
  onPick,
  onCancel,
}: {
  choices: readonly ScorecardAudienceChoice[];
  onPick: (audience: ScorecardAudience) => void;
  onCancel: () => void;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.wrap} testID="scorecard-audience" accessibilityRole="menu">
      <Text style={styles.title}>{COPY.shareScorecard}</Text>
      {choices.map((choice) => (
        <BigButton
          key={choice.audience}
          label={choice.label}
          variant={choice.default ? 'primary' : 'secondary'}
          testID={`scorecard-audience-${choice.audience}`}
          accessibilityLabel={choice.default ? `${choice.label}, default` : choice.label}
          accessibilityState={choice.default ? { selected: true } : undefined}
          onPress={() => onPick(choice.audience)}
        />
      ))}
      <BigButton label={COPY.cancel} variant="ghost" onPress={onCancel} />
    </View>
  );
}

/**
 * Saved-round Share scorecard. With no partner choices, the press shares
 * immediately — the same button as today, no extra prompt.
 */
export function ScorecardImageShareButton({
  label = COPY.shareScorecard,
  variant = 'secondary',
  choices,
  onShare,
}: {
  label?: string;
  variant?: 'secondary' | 'ghost';
  choices: readonly ScorecardAudienceChoice[] | null;
  onShare: (audience?: ScorecardAudience) => void;
}) {
  const [open, setOpen] = useState(false);
  if (choices && choices.length > 0 && open) {
    return (
      <ScorecardAudienceChoices
        choices={choices}
        onPick={(audience) => {
          setOpen(false);
          onShare(audience);
        }}
        onCancel={() => setOpen(false)}
      />
    );
  }
  return (
    <BigButton
      label={label}
      variant={variant}
      onPress={() => {
        if (choices && choices.length > 0) {
          setOpen(true);
          return;
        }
        onShare();
      }}
    />
  );
}

/** Share → Share scorecard / Share live round / Cancel, inline in the sheet. */
export function ShareChoice({
  onPick,
  variant = 'ghost',
  audiences = null,
}: {
  onPick: (kind: ShareKind, audience?: ScorecardAudience) => void;
  variant?: 'secondary' | 'ghost';
  /** Null when the round has no partner: scorecard share skips the extra prompt. */
  audiences?: readonly ScorecardAudienceChoice[] | null;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const [audienceStep, setAudienceStep] = useState(false);
  if (!open) {
    return <BigButton label={COPY.share} variant={variant} onPress={() => setOpen(true)} />;
  }
  if (audienceStep && audiences && audiences.length > 0) {
    return (
      <ScorecardAudienceChoices
        choices={audiences}
        onPick={(audience) => {
          setOpen(false);
          setAudienceStep(false);
          onPick('scorecard', audience);
        }}
        onCancel={() => setAudienceStep(false)}
      />
    );
  }
  return (
    <View style={styles.wrap} testID="share-choice">
      <Text style={styles.title}>{COPY.share}</Text>
      {planShareChoices().map((choice) => (
        <BigButton
          key={choice.kind}
          label={choice.label}
          variant="secondary"
          onPress={() => {
            if (choice.kind === 'scorecard' && audiences && audiences.length > 0) {
              setAudienceStep(true);
              return;
            }
            setOpen(false);
            setAudienceStep(false);
            onPick(choice.kind);
          }}
        />
      ))}
      <BigButton label={COPY.cancel} variant="ghost" onPress={() => setOpen(false)} />
    </View>
  );
}

function makeStyles(colors: ColorPalette) {
  return StyleSheet.create({
    wrap: {
      gap: 8,
      padding: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.bgElevated,
    },
    title: { color: colors.muted, fontSize: 13, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  });
}
