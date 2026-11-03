"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

import { apiUrl } from "@/lib/api";

type AthleteProfileLinkProps = {
  href: string;
  name: string;
  photoUrl?: string;
  className?: string;
};

export default function AthleteProfileLink({
  href,
  name,
  photoUrl,
  className = "",
}: AthleteProfileLinkProps) {
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);
  const initials = name.trim().split(/\s+/).slice(0, 2)
    .map((part) => part[0]).join("").toLocaleUpperCase("pl-PL") || "?";

  return (
    <Link
      href={href}
      className={`inline-flex max-w-full items-center gap-3 rounded-sm align-middle focus-visible:outline-2 focus-visible:outline-offset-4 ${className}`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 text-xs font-bold text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
        {photoUrl && photoUrl !== failedPhotoUrl ? (
          <Image
            src={apiUrl(photoUrl)}
            alt=""
            width={36}
            height={36}
            unoptimized
            loading="lazy"
            onError={() => setFailedPhotoUrl(photoUrl)}
            className="h-full w-full object-cover"
          />
        ) : (
          <span aria-hidden="true">{initials}</span>
        )}
      </span>
      <span>{name}</span>
    </Link>
  );
}
