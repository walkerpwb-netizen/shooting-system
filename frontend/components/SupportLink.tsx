"use client";

import Link from "next/link";

export default function SupportLink({
  className,
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  return (
    <Link href="/wesprzyj-nas" className={className} onClick={onClick} prefetch={false}>
      Wesprzyj nas
    </Link>
  );
}
