"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type ResultCategoryListItem = {
  id: string;
  name: string;
  type: "discipline" | "aggregate";
  discipline_ids: number[];
  disciplines_count: number;
};

type SortDirection = "asc" | "desc";

type ResultCategoryListProps = {
  categories: ResultCategoryListItem[];
  emptyMessage?: string;
  hrefPrefix: string;
};

function nextSortDirection(currentDirection: SortDirection) {
  return currentDirection === "asc"
    ? "desc"
    : "asc";
}

function categoryTypeLabel(category: ResultCategoryListItem) {
  return category.type === "discipline"
    ? "Konkurencja"
    : "Klasyfikacja";
}

function categoryDescription(category: ResultCategoryListItem) {
  if (category.type === "discipline") {
    return "Konkurencja dostępna w tych zawodach";
  }

  if (category.disciplines_count === 0) {
    return "Brak pasujących konkurencji";
  }

  if (category.disciplines_count === 1) {
    return "Suma z 1 konkurencji";
  }

  return `Suma z ${category.disciplines_count} konkurencji`;
}

export default function ResultCategoryList({
  categories,
  emptyMessage = "Brak pozycji do wyświetlenia.",
  hrefPrefix,
}: ResultCategoryListProps) {
  const [nameFilter, setNameFilter] = useState("");
  const [nameSortDirection, setNameSortDirection] = useState<SortDirection>("asc");

  const visibleCategories = useMemo(() => {
    const normalizedFilter = nameFilter.trim().toLowerCase();

    return categories
      .filter((category) =>
        category.name.toLowerCase().includes(normalizedFilter)
      )
      .sort((firstCategory, secondCategory) => {
        const sortResult = firstCategory.name.localeCompare(
          secondCategory.name,
          "pl",
          {
            sensitivity: "base",
          }
        );

        return nameSortDirection === "asc"
          ? sortResult
          : -sortResult;
      });
  }, [categories, nameFilter, nameSortDirection]);

  if (categories.length === 0) {
    return (
      <p className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-gray-400">
        {emptyMessage}
      </p>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
      <div className="flex flex-col gap-3 border-b border-zinc-800 p-4 md:flex-row md:items-center md:justify-between">
        <input
          value={nameFilter}
          onChange={(event) => setNameFilter(event.target.value)}
          placeholder="Filtruj po nazwie"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-green-700 focus:outline-none md:w-80"
        />

        <button
          type="button"
          onClick={() => setNameSortDirection((currentDirection) => nextSortDirection(currentDirection))}
          className="ui-button w-full rounded-lg bg-zinc-800 px-4 py-2 text-sm font-bold text-gray-200 transition hover:bg-zinc-700 md:w-auto"
        >
          Nazwa {nameSortDirection === "asc" ? "↑" : "↓"}
        </button>
      </div>

      <div className="hidden grid-cols-[1.5fr_0.8fr_1fr_1fr] gap-4 border-b border-zinc-800 bg-zinc-950/50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-gray-400 lg:grid">
        <button
          type="button"
          onClick={() => setNameSortDirection((currentDirection) => nextSortDirection(currentDirection))}
          className="text-left transition hover:text-white"
        >
          Nazwa {nameSortDirection === "asc" ? "↑" : "↓"}
        </button>

        <p>Typ</p>
        <p>Zakres</p>
        <p aria-hidden="true" />
      </div>

      {visibleCategories.length === 0 ? (
        <p className="px-4 py-5 text-gray-400">
          Brak pozycji pasujących do filtra.
        </p>
      ) : visibleCategories.map((category) => (
        <div
          key={category.id}
          className="grid gap-4 border-b border-zinc-800 px-4 py-4 text-sm last:border-b-0 lg:grid-cols-[1.5fr_0.8fr_1fr_1fr] lg:items-center"
        >
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-white">
              {category.name}
            </p>

            <p className="mt-1 text-xs text-gray-500">
              {categoryDescription(category)}
            </p>
          </div>

          <p className="text-gray-300">
            {categoryTypeLabel(category)}
          </p>

          <p className="text-gray-300">
            {category.disciplines_count === 1
              ? "1 konkurencja"
              : `${category.disciplines_count} konkurencji`}
          </p>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Link
              href={`${hrefPrefix}/${category.id}`}
              className="ui-button bg-green-800 hover:bg-green-700 transition text-white px-4 py-2 rounded-xl font-semibold"
            >
              Wyniki
            </Link>
          </div>
        </div>
      ))}
    </section>
  );
}
