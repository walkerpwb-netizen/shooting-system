"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type LogoPreviewLinkProps = {
  src: string;
  alt: string;
  title: string;
};

export default function LogoPreviewLink({
  src,
  alt,
  title,
}: LogoPreviewLinkProps) {
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!previewOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreviewOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [previewOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        title={title}
        className="relative flex h-full w-full cursor-zoom-in items-center justify-center"
      >
        <Image
          src={src}
          alt={alt}
          fill
          sizes="120px"
          className="object-contain p-2"
          unoptimized
        />
      </button>

      {previewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div className="inline-flex max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] flex-col items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 text-zinc-950 shadow-2xl dark:border-zinc-700 dark:bg-zinc-950 dark:text-white">
            <h2 className="text-center text-xl font-bold">
              {title}
            </h2>

            <Image
              src={src}
              alt={alt}
              width={1600}
              height={1200}
              sizes="90vw"
              className="block h-auto max-h-[75vh] w-auto max-w-[90vw] object-contain"
              unoptimized
            />

            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="rounded-xl bg-green-700 px-6 py-3 font-bold text-white transition hover:bg-green-600"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </>
  );
}
