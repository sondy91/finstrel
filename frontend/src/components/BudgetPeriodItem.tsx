import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import React from 'react';
import { models } from '../../wailsjs/go/models';

interface BudgetPeriodItemProps {
  period: models.BudgetPeriod;
  isSelected: boolean;
  onClick: (period: models.BudgetPeriod) => void;
}

const BudgetPeriodItem: React.FC<BudgetPeriodItemProps> = ({ period, isSelected, onClick }) => {
  const formatDate = (dateString: string | Date): string => {
    const day = dateString instanceof Date ? dateString.toISOString().slice(0,10) : String(dateString).slice(0,10);
    return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        isSelected ? "border-primary ring-1 ring-primary bg-accent" : "hover:bg-accent/50"
      )}
      onClick={() => onClick(period)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick(period)}
    >
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-1">
          <div className="font-semibold truncate pr-2">{period.name}</div>
          <div className={cn(
            "text-xs px-2 py-0.5 rounded-full font-medium shrink-0",
            period.status === 'Open' ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" :
              period.status === 'Closed' ? "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400" :
                "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
          )}>
            {period.status}
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {formatDate(period.startDate)} - {formatDate(period.endDate)}
        </div>
      </CardContent>
    </Card>
  );
};

export default BudgetPeriodItem;