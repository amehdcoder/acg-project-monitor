import * as React from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import type { SortDirection } from "@/hooks/useSortableTable";
import { cn } from "@/lib/utils";

interface SortableTableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  sortKey: string;
  currentSortKey: string;
  currentDirection: SortDirection;
  onSort: (key: string) => void;
  children: React.ReactNode;
}

const SortIcon = ({ direction }: { direction: SortDirection }) => {
  if (direction === "asc") return <ArrowUp className="ml-1 h-3.5 w-3.5 text-primary" />;
  if (direction === "desc") return <ArrowDown className="ml-1 h-3.5 w-3.5 text-primary" />;
  return <ArrowUpDown className="ml-1 h-3.5 w-3.5 text-muted-foreground/50" />;
};

const SortableTableHead = React.forwardRef<HTMLTableCellElement, SortableTableHeadProps>(
  ({ sortKey, currentSortKey, currentDirection, onSort, children, className, ...props }, ref) => {
    const isActive = currentSortKey === sortKey;

    return (
      <TableHead
        ref={ref}
        className={cn(
          "cursor-pointer select-none hover:bg-muted/70 transition-colors",
          isActive && "text-primary",
          className
        )}
        onClick={() => onSort(sortKey)}
        {...props}
      >
        <span className="inline-flex items-center">
          {children}
          <SortIcon direction={isActive ? currentDirection : null} />
        </span>
      </TableHead>
    );
  }
);
SortableTableHead.displayName = "SortableTableHead";

export { SortableTableHead };
