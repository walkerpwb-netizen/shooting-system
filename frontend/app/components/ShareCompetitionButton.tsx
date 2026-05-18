"use client";

import { useEffect, useState } from "react";

type ShareCompetitionButtonProps = {
  competitionId: number;
  className?: string;
};

function copyWithFallback(value: string) {
  const textArea = document.createElement("textarea");

  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
}

export default function ShareCompetitionButton({
  competitionId,
  className = "ui-button bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-xl font-semibold transition",
}: ShareCompetitionButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCopied(false);
    }, 2200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [copied]);

  async function copyCompetitionLink() {
    const link = `${window.location.origin}/competitions/${competitionId}`;

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(link);
      } else {
        copyWithFallback(link);
      }

      setCopied(true);
    } catch (error) {
      console.error(error);
      copyWithFallback(link);
      setCopied(true);
    }
  }

  return (
    <button
      type="button"
      onClick={copyCompetitionLink}
      className={className}
      title="Skopiuj link do zawodów"
    >
      {copied
        ? "Link skopiowany"
        : "Udostępnij"}
    </button>
  );
}
