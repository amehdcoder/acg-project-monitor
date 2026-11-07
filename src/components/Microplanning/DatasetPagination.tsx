import TablePagination from "@/components/ui/table-pagination";
import { useTablePagination } from "@/hooks/useTablePagination";

export default function DatasetPagination({ pagination }: { pagination: ReturnType<typeof useTablePagination> }) {
  return <TablePagination {...pagination} onPrev={pagination.prevPage} onNext={pagination.nextPage} />;
}