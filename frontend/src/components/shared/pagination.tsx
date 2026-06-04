import { ChevronRight, ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const { t } = useTranslation();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-4 px-2 py-1 text-sm">
      <p className="text-muted-foreground">
        {start}-{end} {t('common.of')} {total}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronRight className="h-4 w-4 rtl:block ltr:hidden" />
          <ChevronLeft className="h-4 w-4 ltr:block rtl:hidden" />
        </Button>
        <span className="tabular-nums">
          {page} / {pages}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronLeft className="h-4 w-4 rtl:block ltr:hidden" />
          <ChevronRight className="h-4 w-4 ltr:block rtl:hidden" />
        </Button>
      </div>
    </div>
  );
}
