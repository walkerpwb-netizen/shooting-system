"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";

type CameraDevice = {
  deviceId: string;
  label: string;
};

type ParsedQrPayload = {
  type: "json" | "url" | "text";
  rows: {
    label: string;
    value: string;
  }[];
};

type ScanHistoryItem = {
  value: string;
  scannedAt: string;
  parsed: ParsedQrPayload;
};

function parseQrPayload(value: string): ParsedQrPayload {
  try {
    const parsed = JSON.parse(value);

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return {
        type: "json",
        rows: Object.entries(parsed).map(([key, entryValue]) => ({
          label: key,
          value: typeof entryValue === "string"
            ? entryValue
            : JSON.stringify(entryValue),
        })),
      };
    }
  } catch {
    // Plain text and URLs are handled below.
  }

  try {
    const url = new URL(value);

    return {
      type: "url",
      rows: [
        {
          label: "adres",
          value: url.href,
        },
        {
          label: "host",
          value: url.host,
        },
      ],
    };
  } catch {
    return {
      type: "text",
      rows: [
        {
          label: "treść",
          value,
        },
      ],
    };
  }
}

function formatScanTime(value: string) {
  return new Intl.DateTimeFormat(
    "pl-PL",
    {
      dateStyle: "short",
      timeStyle: "medium",
    }
  ).format(new Date(value));
}

export default function QrCodeScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastScanValueRef = useRef("");
  const lastScanAtRef = useRef(0);

  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);

  const latestScan = history[0];

  async function loadCameras() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setMessage("Kamera nie jest dostępna w tej przeglądarce.");
      return;
    }

    const mediaDevices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = mediaDevices
      .filter((device) => device.kind === "videoinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Kamera ${index + 1}`,
      }));

    setDevices(videoDevices);

    if (!selectedDeviceId && videoDevices[0]) {
      setSelectedDeviceId(videoDevices[0].deviceId);
    }
  }

  function stopScanner() {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setScanning(false);
    setStarting(false);
  }

  function registerScan(value: string) {
    const now = Date.now();

    if (
      value === lastScanValueRef.current
      && now - lastScanAtRef.current < 2000
    ) {
      return;
    }

    lastScanValueRef.current = value;
    lastScanAtRef.current = now;

    const nextItem = {
      value,
      scannedAt: new Date(now).toISOString(),
      parsed: parseQrPayload(value),
    };

    setHistory((currentHistory) => [
      nextItem,
      ...currentHistory.filter((item) => item.value !== value),
    ].slice(0, 8));

    setMessage("Kod QR odczytany.");
    navigator.vibrate?.(80);
  }

  function scanFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", {
      willReadFrequently: true,
    });

    if (video && canvas && context && video.readyState >= video.HAVE_ENOUGH_DATA) {
      const width = video.videoWidth;
      const height = video.videoHeight;

      if (width > 0 && height > 0) {
        canvas.width = width;
        canvas.height = height;
        context.drawImage(video, 0, 0, width, height);

        const imageData = context.getImageData(0, 0, width, height);
        const code = jsQR(
          imageData.data,
          imageData.width,
          imageData.height,
          {
            inversionAttempts: "attemptBoth",
          }
        );

        if (code?.data) {
          registerScan(code.data);
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(scanFrame);
  }

  async function startScanner() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Kamera nie jest dostępna w tej przeglądarce.");
      return;
    }

    try {
      setStarting(true);
      setMessage("");
      stopScanner();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: selectedDeviceId
          ? {
            deviceId: {
              exact: selectedDeviceId,
            },
          }
          : {
            facingMode: {
              ideal: "environment",
            },
          },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      await loadCameras();
      setScanning(true);
      setStarting(false);
      setMessage("Skaner aktywny.");
      animationFrameRef.current = requestAnimationFrame(scanFrame);
    } catch (error) {
      console.error(error);
      stopScanner();
      setMessage("Nie udało się uruchomić kamery. Sprawdź uprawnienia przeglądarki.");
    }
  }

  async function copyLatestScan() {
    if (!latestScan) {
      return;
    }

    await navigator.clipboard.writeText(latestScan.value);
    setMessage("Wynik skopiowany.");
  }

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  return (
    <section className="space-y-6">
      <div className="ui-block bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">
              QR skaner
            </h2>

            <p className="text-gray-400">
              Testowy odczyt kodów QR z kamery urządzenia.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block min-w-0 sm:min-w-72">
              <span className="block text-sm font-bold text-gray-400 mb-2">
                Kamera
              </span>

              <select
                value={selectedDeviceId}
                onChange={(event) => setSelectedDeviceId(event.target.value)}
                disabled={scanning || starting}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white disabled:opacity-60"
              >
                {devices.length === 0 ? (
                  <option value="">
                    Domyślna kamera
                  </option>
                ) : devices.map((device) => (
                  <option
                    key={device.deviceId}
                    value={device.deviceId}
                  >
                    {device.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => loadCameras().catch(() => {
                setMessage("Nie udało się pobrać listy kamer.");
              })}
              disabled={scanning || starting}
              className="ui-button bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl font-bold transition"
            >
              Kamery
            </button>

            {scanning ? (
              <button
                type="button"
                onClick={stopScanner}
                className="ui-button bg-red-700 hover:bg-red-600 text-white px-5 py-3 rounded-xl font-bold transition"
              >
                Zatrzymaj
              </button>
            ) : (
              <button
                type="button"
                onClick={startScanner}
                disabled={starting}
                className="ui-button bg-green-700 hover:bg-green-600 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl font-bold transition"
              >
                {starting ? "Uruchamianie" : "Start"}
              </button>
            )}
          </div>
        </div>

        {message && (
          <p className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-gray-200">
            {message}
          </p>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="relative aspect-[4/3] bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              className="h-full w-full object-cover"
            />

            {!scanning && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-950 text-gray-500">
                Kamera nieaktywna
              </div>
            )}

            <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-green-400/80 shadow-[0_0_0_999px_rgba(0,0,0,0.25)]" />
          </div>

          <canvas
            ref={canvasRef}
            className="hidden"
          />
        </section>

        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-2xl font-bold text-white">
              Wynik
            </h3>

            <button
              type="button"
              onClick={copyLatestScan}
              disabled={!latestScan}
              className="ui-button bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl text-sm font-bold transition"
            >
              Kopiuj
            </button>
          </div>

          {latestScan ? (
            <div className="mt-5 space-y-4">
              <p className="text-sm text-gray-500">
                {formatScanTime(latestScan.scannedAt)}
              </p>

              <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-4">
                <p className="break-all font-mono text-sm text-green-200">
                  {latestScan.value}
                </p>
              </div>

              <div className="space-y-2">
                {latestScan.parsed.rows.map((row) => (
                  <div
                    key={`${row.label}-${row.value}`}
                    className="grid grid-cols-[120px_1fr] gap-3 rounded-xl bg-zinc-950/60 px-4 py-3 text-sm"
                  >
                    <p className="font-bold text-gray-500">
                      {row.label}
                    </p>

                    <p className="min-w-0 break-all text-gray-200">
                      {row.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-5 text-gray-400">
              Brak odczytu.
            </p>
          )}
        </section>
      </div>

      <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <h3 className="text-2xl font-bold text-white mb-4">
          Historia
        </h3>

        {history.length === 0 ? (
          <p className="text-gray-400">
            Brak skanów.
          </p>
        ) : (
          <div className="space-y-3">
            {history.map((item) => (
              <div
                key={`${item.scannedAt}-${item.value}`}
                className="rounded-xl bg-zinc-950/60 px-4 py-3"
              >
                <p className="text-xs text-gray-500">
                  {formatScanTime(item.scannedAt)}
                </p>

                <p className="mt-1 break-all font-mono text-sm text-gray-200">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
