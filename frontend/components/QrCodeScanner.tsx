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

type BarcodeDetectionResult = {
  rawValue?: string;
};

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => {
  detect(source: CanvasImageSource): Promise<BarcodeDetectionResult[]>;
};

type CameraCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  torch?: boolean;
  zoom?: {
    min: number;
    max: number;
    step?: number;
  };
};

type CameraConstraintSet = MediaTrackConstraintSet & {
  focusMode?: string;
  pointsOfInterest?: {
    x: number;
    y: number;
  }[];
  torch?: boolean;
  zoom?: number;
};

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

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
  const scannerRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const scanningRef = useRef(false);
  const detectingRef = useRef(false);
  const digitalZoomRef = useRef(1);
  const barcodeDetectorRef = useRef<InstanceType<BarcodeDetectorConstructor> | null>(null);
  const lastScanValueRef = useRef("");
  const lastScanAtRef = useRef(0);

  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);
  const [fullscreenScanner, setFullscreenScanner] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [zoomRange, setZoomRange] = useState<CameraCapabilities["zoom"] | null>(null);
  const [zoomValue, setZoomValue] = useState(1);
  const [digitalZoom, setDigitalZoom] = useState(1);
  const [cameraHint, setCameraHint] = useState("");

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
      const environmentDevice = videoDevices.find((device) =>
        /back|rear|environment|tyl/i.test(device.label)
        && !/tele|zoom/i.test(device.label)
      );

      setSelectedDeviceId((environmentDevice || videoDevices[0]).deviceId);
    }
  }

  async function exitFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
    }
  }

  function stopScanner() {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    scanningRef.current = false;
    detectingRef.current = false;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setScanning(false);
    setStarting(false);
    setFullscreenScanner(false);
    setTorchSupported(false);
    setTorchEnabled(false);
    setZoomRange(null);
    exitFullscreen();
  }

  async function applyCameraTuning(stream: MediaStream) {
    const [videoTrack] = stream.getVideoTracks();

    if (!videoTrack) {
      return;
    }

    const capabilities = videoTrack.getCapabilities() as CameraCapabilities;
    const advanced: CameraConstraintSet[] = [];
    const hints: string[] = [];

    if (capabilities.focusMode?.includes("continuous")) {
      advanced.push({
        focusMode: "continuous",
      });
      hints.push("autofocus");
    }

    if (capabilities.zoom) {
      const nextZoom = capabilities.zoom.min || 1;

      setZoomRange(capabilities.zoom);
      setZoomValue(nextZoom);
      advanced.push({
        zoom: nextZoom,
      });
      hints.push("zoom min.");
    } else {
      setZoomRange(null);
    }

    setTorchSupported(Boolean(capabilities.torch));

    if (advanced.length > 0) {
      await videoTrack.applyConstraints({
        advanced,
      } as MediaTrackConstraints).catch(() => undefined);
    }

    setCameraHint(
      hints.length > 0
        ? `Kamera: ${hints.join(", ")}`
        : "Kamera aktywna"
    );
  }

  async function setCameraZoom(value: number) {
    const [videoTrack] = streamRef.current?.getVideoTracks() || [];

    if (!videoTrack || !zoomRange) {
      return;
    }

    const nextZoom = Math.min(
      zoomRange.max,
      Math.max(zoomRange.min, value)
    );

    setZoomValue(nextZoom);
    await videoTrack.applyConstraints({
      advanced: [
        {
          zoom: nextZoom,
        } as CameraConstraintSet,
      ],
    } as MediaTrackConstraints).catch(() => undefined);
  }

  function setDigitalScanZoom(value: number) {
    const nextZoom = Math.min(3, Math.max(1, value));

    digitalZoomRef.current = nextZoom;
    setDigitalZoom(nextZoom);
  }

  async function toggleTorch() {
    const [videoTrack] = streamRef.current?.getVideoTracks() || [];

    if (!videoTrack || !torchSupported) {
      return;
    }

    const nextTorchState = !torchEnabled;

    await videoTrack.applyConstraints({
      advanced: [
        {
          torch: nextTorchState,
        } as CameraConstraintSet,
      ],
    } as MediaTrackConstraints);

    setTorchEnabled(nextTorchState);
  }

  async function focusAtCenter() {
    const [videoTrack] = streamRef.current?.getVideoTracks() || [];

    if (!videoTrack) {
      return;
    }

    await videoTrack.applyConstraints({
      advanced: [
        {
          focusMode: "single-shot",
          pointsOfInterest: [
            {
              x: 0.5,
              y: 0.5,
            },
          ],
        } as CameraConstraintSet,
      ],
    } as MediaTrackConstraints).catch(() => {
      setMessage("Przytrzymaj kod w środku ramki.");
    });
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
    stopScanner();
  }

  function scanFrame() {
    if (!scanningRef.current) {
      return;
    }

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

        const digitalScanZoom = digitalZoomRef.current;
        const sourceWidth = width / digitalScanZoom;
        const sourceHeight = height / digitalScanZoom;
        const sourceX = (width - sourceWidth) / 2;
        const sourceY = (height - sourceHeight) / 2;

        context.drawImage(
          video,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          width,
          height
        );

        if (barcodeDetectorRef.current && !detectingRef.current) {
          detectingRef.current = true;
          barcodeDetectorRef.current.detect(canvas)
            .then((codes) => {
              const value = codes[0]?.rawValue;

              if (value) {
                registerScan(value);
              }
            })
            .catch(() => undefined)
            .finally(() => {
              detectingRef.current = false;
            });
        }

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

    if (scanningRef.current) {
      animationFrameRef.current = requestAnimationFrame(scanFrame);
    }
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
            width: {
              ideal: 1920,
            },
            height: {
              ideal: 1080,
            },
          }
          : {
            facingMode: {
              ideal: "environment",
            },
            width: {
              ideal: 1920,
            },
            height: {
              ideal: 1080,
            },
          },
      });

      streamRef.current = stream;
      await applyCameraTuning(stream);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const BarcodeDetector = window.BarcodeDetector as BarcodeDetectorConstructor | undefined;

      barcodeDetectorRef.current = BarcodeDetector
        ? new BarcodeDetector({
          formats: ["qr_code"],
        })
        : null;

      await loadCameras();
      scanningRef.current = true;
      setScanning(true);
      setFullscreenScanner(true);
      setStarting(false);
      setMessage("Skaner aktywny.");
      await scannerRef.current?.requestFullscreen?.().catch(() => undefined);
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
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <section
      ref={scannerRef}
      className={fullscreenScanner
        ? "fixed inset-0 z-50 overflow-y-auto bg-black p-3 sm:p-6"
        : "space-y-6"
      }
    >
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

        {cameraHint && scanning && (
          <p className="mt-3 text-sm text-gray-500">
            {cameraHint}
          </p>
        )}
      </div>

      <div className={fullscreenScanner
        ? "grid gap-4 xl:grid-cols-[1.2fr_0.8fr]"
        : "grid gap-6 xl:grid-cols-[1.2fr_0.8fr]"
      }>
        <section className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={focusAtCenter}
            className={fullscreenScanner
              ? "relative block h-[70svh] w-full bg-black"
              : "relative block aspect-[4/3] w-full bg-black"
            }
            aria-label="Ustaw ostrość na środku kadru"
          >
            <video
              ref={videoRef}
              muted
              playsInline
              style={{
                transform: `scale(${digitalZoom})`,
              }}
              className="h-full w-full object-cover transition-transform"
            />

            {!scanning && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-950 text-gray-500">
                Kamera nieaktywna
              </div>
            )}

            <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-green-400/80 shadow-[0_0_0_999px_rgba(0,0,0,0.25)]" />
          </button>

          {scanning && (
            <div className="flex flex-col gap-3 border-t border-zinc-800 bg-zinc-950 p-4 sm:flex-row sm:items-center">
              <label className="flex flex-1 items-center gap-3 text-sm text-gray-300">
                <span className="font-bold">
                  Zoom cyfrowy
                </span>

                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.1}
                  value={digitalZoom}
                  onChange={(event) => setDigitalScanZoom(Number(event.target.value))}
                  className="w-full"
                />
              </label>

              {zoomRange && (
                <label className="flex flex-1 items-center gap-3 text-sm text-gray-300">
                  <span className="font-bold">
                    Zoom aparatu
                  </span>

                  <input
                    type="range"
                    min={zoomRange.min}
                    max={zoomRange.max}
                    step={zoomRange.step || 0.1}
                    value={zoomValue}
                    onChange={(event) => setCameraZoom(Number(event.target.value))}
                    className="w-full"
                  />
                </label>
              )}

              {torchSupported && (
                <button
                  type="button"
                  onClick={toggleTorch}
                  className="ui-button bg-zinc-700 hover:bg-zinc-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition"
                >
                  {torchEnabled ? "Lampa off" : "Lampa on"}
                </button>
              )}
            </div>
          )}

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
