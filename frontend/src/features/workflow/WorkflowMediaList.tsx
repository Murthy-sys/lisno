import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { Button } from "../../components/ui/Button";

const PAGE_SIZE = 25;

/** Pagination limits rendered rows only; the parent retains the complete evidence list. */
export function WorkflowMediaList<T>({ items, label, getKey, renderItem, busy = false }: {
  items: T[];
  label: string;
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  busy?: boolean;
}) {
  const id = useId();
  const [page, setPage] = useState(0);
  const lastPage = Math.max(0, Math.ceil(items.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * PAGE_SIZE;
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => { setPage((current) => Math.min(current, lastPage)); }, [lastPage]);
  const changePage = (next: number) => {
    setPage(next);
    list.current?.focus();
  };
  return <div className="workflow-stage-actions__media-page">
    {items.length > PAGE_SIZE ? <nav className="workflow-stage-actions__media-pagination" aria-label={`${label} pages`}>
      <p role="status">{start + 1}–{Math.min(start + PAGE_SIZE, items.length)} of {items.length} files</p>
      <div>
        <Button size="compact" variant="secondary" aria-label="Previous files" aria-controls={id} disabled={busy || currentPage === 0} onClick={() => changePage(currentPage - 1)}>Previous</Button>
        <Button size="compact" variant="secondary" aria-label="Next files" aria-controls={id} disabled={busy || currentPage === lastPage} onClick={() => changePage(currentPage + 1)}>Next</Button>
      </div>
    </nav> : null}
    <ul id={id} ref={list} tabIndex={-1} className="workflow-stage-actions__media-list" aria-label={label}>
      {items.slice(start, start + PAGE_SIZE).map((item) => <li className="workflow-stage-actions__media-row" key={getKey(item)}>{renderItem(item)}</li>)}
    </ul>
  </div>;
}
