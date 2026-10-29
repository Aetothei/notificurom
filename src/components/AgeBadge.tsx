import React from 'react';
import { getTaskAgeInfo } from '@/lib/date-utils';
import { StatBadge, StatBadgeVariant } from './StatBadge';

interface AgeBadgeProps {
  sourceCreatedAt: string;
  statusUpdatedAt: string;
  isDone?: boolean;
}

export function AgeBadge({ sourceCreatedAt, statusUpdatedAt, isDone = false }: AgeBadgeProps) {
  if (isDone) {
    return (
      <StatBadge
        icon="mdi:check-circle-outline"
        value="Done"
        variant="teal"
      />
    );
  }

  const { createdAgeText, stalledAgeText, urgency, totalDays, stalledDays } = getTaskAgeInfo(
    sourceCreatedAt,
    statusUpdatedAt,
    isDone
  );

  const variantMap: Record<string, StatBadgeVariant> = {
    fresh: 'teal',
    warning: 'amber',
    critical: 'red',
    archived: 'neutral',
  };

  return (
    <StatBadge
      icon={urgency === 'critical' ? 'mdi:alert-outline' : 'mdi:clock-outline'}
      value={`Age ${createdAgeText}`}
      variant={variantMap[urgency] || 'neutral'}
      title={`Age: ${createdAgeText} (${totalDays}d ago) • In this column: ${stalledAgeText} (${stalledDays}d)`}
    />
  );
}
