"use client";

import { useEffect, useRef } from "react";

import { apiUrl } from "@/lib/api";

type AdSlot = "home_desktop_left" | "home_desktop_right" | "home_mobile_top";
type AdDevice = "desktop" | "mobile";

type TrackedAdSlotProps = {
  slot: AdSlot;
  device: AdDevice;
  placement: string;
  className?: string;
};

function sendAdEvent(slot: AdSlot, device: AdDevice, eventType: "impression" | "click") {
  fetch(apiUrl("/ad-events"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      slot,
      device,
      event_type: eventType,
    }),
    keepalive: true,
  }).catch((error) => {
    console.error(error);
  });
}

export default function TrackedAdSlot({
  slot,
  device,
  placement,
  className = "",
}: TrackedAdSlotProps) {
  const elementRef = useRef<HTMLElement | null>(null);
  const impressionSentRef = useRef(false);

  useEffect(() => {
    const element = elementRef.current;

    if (!element || impressionSentRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5) {
          return;
        }

        impressionSentRef.current = true;
        sendAdEvent(slot, device, "impression");
        observer.disconnect();
      },
      {
        threshold: [0.5],
      }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [device, slot]);

  return (
    <aside
      ref={elementRef}
      aria-label={placement}
      className={`flex items-center justify-center border border-dashed border-green-600/70 bg-green-50 px-4 text-center text-green-900 dark:border-green-700/60 dark:bg-green-950/35 dark:text-green-50 ${className}`}
    >
      <button
        type="button"
        onClick={() => sendAdEvent(slot, device, "click")}
        className="flex h-full w-full items-center justify-center text-center"
      >
        <span>
          <span className="block text-xs font-bold uppercase tracking-wide text-green-700 dark:text-green-300">
            Reklama
          </span>

          <span className="mt-1 block text-sm font-semibold">
            Tu może pojawić się Twoja reklama
          </span>
        </span>
      </button>
    </aside>
  );
}
