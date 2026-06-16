import type { ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';

type IconComponent = ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

type SectionHeaderProps = {
  title: string;
  eyebrow?: string;
  Icon: IconComponent;
};

export function SectionHeader({ title, eyebrow, Icon }: SectionHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.titleRow}>
        <Icon color={colors.moss} size={18} strokeWidth={2.4} />
        <Text style={styles.title}>{title}</Text>
      </View>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: '800',
  },
  eyebrow: {
    color: colors.mutedInk,
    fontSize: 13,
    lineHeight: 18,
  },
});