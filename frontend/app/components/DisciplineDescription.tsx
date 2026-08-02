type DisciplineDescriptionProps = {
  description?: string;
};

export default function DisciplineDescription({
  description,
}: DisciplineDescriptionProps) {
  if (!description?.trim()) {
    return (
      <p className="text-zinc-600 dark:text-gray-400">
        Brak opisu
      </p>
    );
  }

  return (
    <div className="mt-3 max-h-[34rem] overflow-auto rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm leading-7 text-zinc-700 shadow-inner whitespace-pre-wrap break-words [tab-size:4] dark:border-zinc-700 dark:bg-zinc-950/50 dark:text-gray-300 sm:text-base">
      {description}
    </div>
  );
}
