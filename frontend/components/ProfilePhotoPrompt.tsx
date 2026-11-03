import Link from "next/link";

type ProfilePhotoPromptProps = {
  className?: string;
  onClick?: () => void;
};

export default function ProfilePhotoPrompt({ className = "", onClick }: ProfilePhotoPromptProps) {
  const classes = `flex shrink-0 flex-col items-center justify-center gap-3 border border-dashed border-red-300 bg-red-50 p-3 text-center text-red-700 transition hover:border-red-600 hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300 dark:hover:border-red-400 dark:hover:bg-red-950/60 ${className}`;
  const content = (
    <>
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-12 w-12">
        <path d="M29 36H9a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4h7l3-5h10l3 5h7a4 4 0 0 1 4 4v10" />
        <circle cx="24" cy="23" r="8" />
        <circle cx="38" cy="36" r="9" />
        <path d="M38 32v8m-4-4h8" />
      </svg>
      <span className="text-sm font-bold leading-5">Dodaj swoje zdjęcie</span>
    </>
  );

  return onClick ? (
    <button type="button" onClick={onClick} className={classes}>
      {content}
    </button>
  ) : (
    <Link href="/profile?edit=photo#profile-photo" className={classes}>
      {content}
    </Link>
  );
}
