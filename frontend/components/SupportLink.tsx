"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { getAuthSnapshot, subscribeToAuthChange } from "@/lib/auth";

export default function SupportLink({
  className,
  onClick,
}: {
  className?: string;
  onClick?: () => void;
}) {
  const snapshot = useSyncExternalStore(subscribeToAuthChange, getAuthSnapshot, () => "");
  const [token, role, rolesText] = snapshot.split("|");
  const roles = (rolesText || role || "").split(",");

  // Keep this page private until its public launch is explicitly requested.
  if (!token || !roles.includes("admin")) return null;

  return (
    <Link href="/wesprzyj-nas" className={className} onClick={onClick} prefetch={false}>
      Wesprzyj nas
    </Link>
  );
}
