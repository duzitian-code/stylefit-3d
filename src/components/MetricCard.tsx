import type { ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme';

type IconComponent = ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;

type MetricCardProps = {
  label: string;
  value: string;
  Icon: IconComponent;
  accent?: string;
};

export function MetricCard({ label, value, Icon, accent = colors.moss }: MetricCardProps) {
  return (
    <View style={styles.card}>
      <View style={[styles.iconBox, { backgroundColor: `${accent}1A` }]}>
        <Icon color={accent} size={18} strokeWidth={2.4} />
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 104,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '800',
  },
  label: {
    color: colors.mutedInk,
    fontSize: 12,
    fontWeight: '600',
  },
});