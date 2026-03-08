import { useState, useMemo, useCallback } from "react";

export function useTablePagination<T>(data: T[], pageSize = 20) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalItems = data.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Clamp page if data shrinks
  const safePage = Math.min(currentPage, totalPages);
  if (safePage !== currentPage) setCurrentPage(safePage);

  const startIndex = (safePage - 1) * pageSize;
  const paginatedData = useMemo(
    () => data.slice(startIndex, startIndex + pageSize),
    [data, startIndex, pageSize]
  );

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);

  const nextPage = useCallback(() => goToPage(safePage + 1), [goToPage, safePage]);
  const prevPage = useCallback(() => goToPage(safePage - 1), [goToPage, safePage]);
  const resetPage = useCallback(() => setCurrentPage(1), []);

  return {
    currentPage: safePage,
    totalPages,
    totalItems,
    startIndex,
    pageSize,
    paginatedData,
    goToPage,
    nextPage,
    prevPage,
    resetPage,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
  };
}
