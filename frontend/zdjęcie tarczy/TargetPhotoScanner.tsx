"use client";

import { useEffect, useRef, useState } from "react";

type CameraDevice = {
  deviceId: string;
  label: string;
};

type CropResult = {
  imageUrl: string;
  originalWidth: number;
  originalHeight: number;
  croppedWidth: number;
  croppedHeight: number;
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

function scoreCameraDevice(device: CameraDevice, index: number) {
  const label = device.label.toLowerCase();
  const isFront = /front|przedni/.test(label);
  const isRear = /back|rear|environment|tyl|tyln/.test(label);
  const isUltraWide = /ultra[\s-]?wide|ultraszer|ultra szer|0\.5/.test(label);
  const isTele = /tele|zoom|2x|3x|telephoto/.test(label);
  const isPlainRear = /^(tylny aparat|back camera|rear camera)$/.test(label.trim());

  let score = 0;

  if (isPlainRear) {
    score += 100;
  }

  if (isRear) {
    score += 60;
  }

  if (/main|standard|1x/.test(label)) {
    score += 25;
  }

  if (isFront) {
    score -= 80;
  }

  if (isUltraWide || isTele) {
    score -= 45;
  }

  return score - index * 0.01;
}

function pickPreferredCamera(devices: CameraDevice[]) {
  if (devices.length === 0) {
    return null;
  }

  return [...devices]
    .map((device, index) => ({
      device,
      score: scoreCameraDevice(device, index),
    }))
    .sort((left, right) => right.score - left.score)[0].device;
}

async function listVideoInputs() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return [];
  }

  const devices = await navigator.mediaDevices.enumerateDevices();

  return devices
    .filter((device) => device.kind === "videoinput")
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Kamera ${index + 1}`,
    }));
}

function getPercentileFromHistogram(histogram: number[], total: number, percentile: number) {
  const target = Math.max(1, Math.round(total * percentile));
  let count = 0;

  for (let value = 0; value < histogram.length; value += 1) {
    count += histogram[value];

    if (count >= target) {
      return value;
    }
  }

  return 255;
}

function closePaperMask(mask: Uint8Array, width: number, height: number) {
  const dilated = new Uint8Array(mask.length);
  const closed = new Uint8Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;

      if (mask[index]) {
        dilated[index] = 1;
        continue;
      }

      let found = false;

      for (let dy = -2; dy <= 2 && !found; dy += 1) {
        const nextY = y + dy;

        if (nextY < 0 || nextY >= height) {
          continue;
        }

        for (let dx = -2; dx <= 2; dx += 1) {
          const nextX = x + dx;

          if (nextX < 0 || nextX >= width) {
            continue;
          }

          if (mask[nextY * width + nextX]) {
            found = true;
            break;
          }
        }
      }

      if (found) {
        dilated[index] = 1;
      }
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;

      if (!dilated[index]) {
        continue;
      }

      let keep = true;

      for (let dy = -2; dy <= 2 && keep; dy += 1) {
        const nextY = y + dy;

        if (nextY < 0 || nextY >= height) {
          keep = false;
          break;
        }

        for (let dx = -2; dx <= 2; dx += 1) {
          const nextX = x + dx;

          if (nextX < 0 || nextX >= width || !dilated[nextY * width + nextX]) {
            keep = false;
            break;
          }
        }
      }

      if (keep) {
        closed[index] = 1;
      }
    }
  }

  return closed;
}

function findPaperBounds(canvas: HTMLCanvasElement) {
  const maxAnalysisSide = 1100;
  const scale = Math.min(
    1,
    maxAnalysisSide / Math.max(canvas.width, canvas.height)
  );
  const width = Math.max(1, Math.round(canvas.width * scale));
  const height = Math.max(1, Math.round(canvas.height * scale));
  const analysisCanvas = document.createElement("canvas");
  const analysisContext = analysisCanvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!analysisContext) {
    return {
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
    };
  }

  analysisCanvas.width = width;
  analysisCanvas.height = height;
  analysisContext.drawImage(canvas, 0, 0, width, height);

  const imageData = analysisContext.getImageData(0, 0, width, height);
  const histogram = Array.from({ length: 256 }, () => 0);
  const pixelCount = width * height;

  for (let index = 0; index < imageData.data.length; index += 4) {
    const red = imageData.data[index];
    const green = imageData.data[index + 1];
    const blue = imageData.data[index + 2];
    const luma = Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722);

    histogram[luma] += 1;
  }

  const p55 = getPercentileFromHistogram(histogram, pixelCount, 0.55);
  const p88 = getPercentileFromHistogram(histogram, pixelCount, 0.88);
  const threshold = Math.max(92, Math.min(190, Math.round((p55 + p88) / 2 - 26)));
  const mask = new Uint8Array(pixelCount);
  const visited = new Uint8Array(pixelCount);

  for (let index = 0, pixel = 0; index < imageData.data.length; index += 4, pixel += 1) {
    const red = imageData.data[index];
    const green = imageData.data[index + 1];
    const blue = imageData.data[index + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const chroma = max - min;
    const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const blueDeficit = Math.max(red - blue, green - blue);
    const neutralPaper = chroma <= 58 && blueDeficit <= 52;
    const shadowedPaper = chroma <= 42 && luma >= threshold - 14;

    if ((luma >= threshold && neutralPaper) || shadowedPaper) {
      mask[pixel] = 1;
    }
  }

  const paperMask = closePaperMask(mask, width, height);

  let bestArea = 0;
  let bestMinX = 0;
  let bestMinY = 0;
  let bestMaxX = width - 1;
  let bestMaxY = height - 1;
  const stack: number[] = [];

  for (let start = 0; start < pixelCount; start += 1) {
    if (!paperMask[start] || visited[start]) {
      continue;
    }

    visited[start] = 1;
    stack.length = 0;
    stack.push(start);

    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    while (stack.length > 0) {
      const current = stack.pop() as number;
      const x = current % width;
      const y = Math.floor(current / width);

      area += 1;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      const left = current - 1;
      const right = current + 1;
      const top = current - width;
      const bottom = current + width;

      if (x > 0 && paperMask[left] && !visited[left]) {
        visited[left] = 1;
        stack.push(left);
      }

      if (x < width - 1 && paperMask[right] && !visited[right]) {
        visited[right] = 1;
        stack.push(right);
      }

      if (y > 0 && paperMask[top] && !visited[top]) {
        visited[top] = 1;
        stack.push(top);
      }

      if (y < height - 1 && paperMask[bottom] && !visited[bottom]) {
        visited[bottom] = 1;
        stack.push(bottom);
      }
    }

    if (area > bestArea) {
      bestArea = area;
      bestMinX = minX;
      bestMinY = minY;
      bestMaxX = maxX;
      bestMaxY = maxY;
    }
  }

  if (bestArea < pixelCount * 0.05) {
    return {
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
    };
  }

  const marginX = Math.round((bestMaxX - bestMinX + 1) * 0.006);
  const marginY = Math.round((bestMaxY - bestMinY + 1) * 0.006);
  const scaledX = Math.max(0, bestMinX - marginX);
  const scaledY = Math.max(0, bestMinY - marginY);
  const scaledMaxX = Math.min(width - 1, bestMaxX + marginX);
  const scaledMaxY = Math.min(height - 1, bestMaxY + marginY);

  return {
    x: Math.round(scaledX / scale),
    y: Math.round(scaledY / scale),
    width: Math.round((scaledMaxX - scaledX + 1) / scale),
    height: Math.round((scaledMaxY - scaledY + 1) / scale),
  };
}

function cropPaperFromCanvas(sourceCanvas: HTMLCanvasElement): CropResult {
  const bounds = findPaperBounds(sourceCanvas);
  const cropCanvas = document.createElement("canvas");
  const cropContext = cropCanvas.getContext("2d");
  const cropWidth = Math.max(1, Math.min(sourceCanvas.width - bounds.x, bounds.width));
  const cropHeight = Math.max(1, Math.min(sourceCanvas.height - bounds.y, bounds.height));

  if (!cropContext) {
    return {
      imageUrl: sourceCanvas.toDataURL("image/jpeg", 0.92),
      originalWidth: sourceCanvas.width,
      originalHeight: sourceCanvas.height,
      croppedWidth: sourceCanvas.width,
      croppedHeight: sourceCanvas.height,
    };
  }

  cropCanvas.width = cropWidth;
  cropCanvas.height = cropHeight;
  cropContext.drawImage(
    sourceCanvas,
    bounds.x,
    bounds.y,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight
  );

  return {
    imageUrl: cropCanvas.toDataURL("image/jpeg", 0.92),
    originalWidth: sourceCanvas.width,
    originalHeight: sourceCanvas.height,
    croppedWidth: cropWidth,
    croppedHeight: cropHeight,
  };
}

export default function TargetPhotoScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<CropResult | null>(null);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [cameraZoomRange, setCameraZoomRange] = useState<CameraCapabilities["zoom"] | null>(null);
  const [cameraZoom, setCameraZoom] = useState(1);
  const [digitalZoom, setDigitalZoom] = useState(1);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setTorchSupported(false);
    setTorchEnabled(false);
    setCameraZoomRange(null);
    setCameraZoom(1);

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function startStream(deviceId?: string) {
    const constraints: MediaStreamConstraints = {
      audio: false,
      video: deviceId
        ? {
            deviceId: {
              exact: deviceId,
            },
            width: {
              ideal: 4096,
            },
            height: {
              ideal: 3072,
            },
          }
        : {
            facingMode: {
              ideal: "environment",
            },
            width: {
              ideal: 4096,
            },
            height: {
              ideal: 3072,
            },
          },
    };

    return navigator.mediaDevices.getUserMedia(constraints);
  }

  async function applyCameraFeatures(stream: MediaStream) {
    const [videoTrack] = stream.getVideoTracks();

    if (!videoTrack) {
      return;
    }

    const capabilities = videoTrack.getCapabilities() as CameraCapabilities;
    const advanced: CameraConstraintSet[] = [];

    setTorchSupported(Boolean(capabilities.torch));
    setTorchEnabled(false);

    if (capabilities.focusMode?.includes("continuous")) {
      advanced.push({
        focusMode: "continuous",
      });
    }

    if (capabilities.zoom) {
      const initialZoom = Math.max(
        capabilities.zoom.min,
        Math.min(capabilities.zoom.max, 1)
      );

      setCameraZoomRange(capabilities.zoom);
      setCameraZoom(initialZoom);
      advanced.push({
        zoom: initialZoom,
      });
    } else {
      setCameraZoomRange(null);
      setCameraZoom(1);
    }

    if (advanced.length > 0) {
      await videoTrack.applyConstraints({
        advanced,
      } as MediaTrackConstraints).catch(() => undefined);
    }
  }

  async function attachStream(stream: MediaStream) {
    streamRef.current = stream;
    await applyCameraFeatures(stream);

    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
  }

  async function openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("Ta przeglądarka nie udostępnia aparatu.");
      return;
    }

    setCameraOpen(true);
    setStarting(true);
    setMessage("");

    try {
      const devicesBeforePermission = await listVideoInputs().catch(() => []);
      const preferredBeforePermission = pickPreferredCamera(devicesBeforePermission);
      let stream = await startStream(preferredBeforePermission?.deviceId).catch(() => startStream());
      const devicesAfterPermission = await listVideoInputs().catch(() => []);
      const preferredAfterPermission = pickPreferredCamera(devicesAfterPermission);
      const activeDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId || "";

      setCameras(devicesAfterPermission);

      if (
        preferredAfterPermission?.deviceId
        && preferredAfterPermission.deviceId !== activeDeviceId
      ) {
        stream.getTracks().forEach((track) => track.stop());
        stream = await startStream(preferredAfterPermission.deviceId);
      }

      setSelectedCameraId(stream.getVideoTracks()[0]?.getSettings().deviceId || "");
      await attachStream(stream);
    } catch {
      setMessage("Nie udało się uruchomić aparatu. Sprawdź uprawnienia kamery.");
      setCameraOpen(false);
      stopCamera();
    } finally {
      setStarting(false);
    }
  }

  function closeCamera() {
    stopCamera();
    setCameraOpen(false);
    setStarting(false);
  }

  async function changeCamera(deviceId: string) {
    setSelectedCameraId(deviceId);
    setStarting(true);
    setMessage("");

    try {
      stopCamera();
      const stream = await startStream(deviceId);
      await attachStream(stream);
    } catch {
      setMessage("Nie udało się przełączyć aparatu.");
    } finally {
      setStarting(false);
    }
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
    } as MediaTrackConstraints).then(() => {
      setTorchEnabled(nextTorchState);
    }).catch(() => {
      setMessage("Ten aparat nie pozwolił włączyć lampy w przeglądarce.");
    });
  }

  async function updateCameraZoom(value: number) {
    const [videoTrack] = streamRef.current?.getVideoTracks() || [];

    if (!videoTrack || !cameraZoomRange) {
      return;
    }

    const nextZoom = Math.max(
      cameraZoomRange.min,
      Math.min(cameraZoomRange.max, value)
    );

    setCameraZoom(nextZoom);
    await videoTrack.applyConstraints({
      advanced: [
        {
          zoom: nextZoom,
        } as CameraConstraintSet,
      ],
    } as MediaTrackConstraints).catch(() => undefined);
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
    } as MediaTrackConstraints).catch(() => undefined);
  }

  function captureTargetPhoto() {
    const video = videoRef.current;

    if (!video || video.readyState < video.HAVE_CURRENT_DATA) {
      setMessage("Aparat nie jest jeszcze gotowy.");
      return;
    }

    const width = video.videoWidth || 1920;
    const height = video.videoHeight || 1080;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", {
      willReadFrequently: true,
    });

    if (!context) {
      setMessage("Nie udało się przygotować obrazu.");
      return;
    }

    canvas.width = width;
    canvas.height = height;

    const sourceWidth = width / digitalZoom;
    const sourceHeight = height / digitalZoom;
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
    setResult(cropPaperFromCanvas(canvas));
    closeCamera();
  }

  useEffect(() => () => {
    stopCamera();
  }, []);

  return (
    <section className="space-y-6">
      <div className="ui-block rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <button
          type="button"
          onClick={() => {
            void openCamera();
          }}
          className="ui-button w-full rounded-xl bg-green-700 px-6 py-4 text-lg font-black text-white transition hover:bg-green-600 sm:w-auto"
        >
          Skanuj tarczę
        </button>

        {message && (
          <p className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 font-semibold text-gray-200">
            {message}
          </p>
        )}
      </div>

      {result && (
        <section className="ui-block rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="mb-4 text-2xl font-black text-white">
            Wynik kadrowania
          </h2>

          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.imageUrl}
              alt="Przycięte zdjęcie tarczy"
              className="h-auto w-full"
            />
          </div>

          <p className="mt-4 text-sm font-semibold text-gray-400">
            Zdjęcie {result.originalWidth} x {result.originalHeight} px, przycięte do {result.croppedWidth} x {result.croppedHeight} px.
          </p>
        </section>
      )}

      {cameraOpen && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-black text-white">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <h2 className="text-lg font-black">
              Zdjęcie tarczy
            </h2>

            <button
              type="button"
              onClick={closeCamera}
              className="ui-button rounded-lg bg-zinc-800 px-4 py-2 font-bold transition hover:bg-zinc-700"
            >
              Zamknij
            </button>
          </div>

          <div className="relative min-h-0 flex-1 bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              style={{
                transform: `scale(${digitalZoom})`,
              }}
              className="h-full w-full object-contain transition-transform"
            />

            <button
              type="button"
              onClick={() => {
                void focusAtCenter();
              }}
              className="absolute inset-0 z-10"
              aria-label="Ustaw ostrość na środku kadru"
            />

            {starting && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 text-lg font-bold text-gray-200">
                Uruchamianie aparatu...
              </div>
            )}
          </div>

          <div className="space-y-4 border-t border-white/10 px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-gray-300">
                  Aparat
                </span>

                <select
                  value={selectedCameraId}
                  onChange={(event) => {
                    void changeCamera(event.target.value);
                  }}
                  disabled={starting || cameras.length === 0}
                  className="w-full rounded-xl border border-white/10 bg-zinc-900 px-4 py-3 font-bold text-white disabled:opacity-50"
                >
                  {cameras.length === 0 ? (
                    <option value="">
                      Kamera aktywna
                    </option>
                  ) : (
                    cameras.map((camera) => (
                      <option
                        key={camera.deviceId}
                        value={camera.deviceId}
                      >
                        {camera.label}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <button
                type="button"
                onClick={() => {
                  void toggleTorch();
                }}
                disabled={starting || !torchSupported}
                className="ui-button self-end rounded-xl bg-zinc-800 px-4 py-3 font-black text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {torchSupported
                  ? torchEnabled ? "Flesz: włączony" : "Flesz: wyłączony"
                  : "Flesz niedostępny"}
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block rounded-xl border border-white/10 bg-zinc-950 px-4 py-3">
                <span className="mb-2 block text-sm font-bold text-gray-300">
                  Zoom kadru x{digitalZoom.toFixed(1)}
                </span>

                <input
                  type="range"
                  min={1}
                  max={4}
                  step={0.1}
                  value={digitalZoom}
                  onChange={(event) => setDigitalZoom(Number(event.target.value))}
                  className="w-full accent-green-500"
                />
              </label>

              <label className="block rounded-xl border border-white/10 bg-zinc-950 px-4 py-3">
                <span className="mb-2 block text-sm font-bold text-gray-300">
                  Zoom aparatu {cameraZoomRange ? `x${cameraZoom.toFixed(1)}` : "niedostępny"}
                </span>

                <input
                  type="range"
                  min={cameraZoomRange?.min || 1}
                  max={cameraZoomRange?.max || 1}
                  step={cameraZoomRange?.step || 0.1}
                  value={cameraZoom}
                  onChange={(event) => {
                    void updateCameraZoom(Number(event.target.value));
                  }}
                  disabled={!cameraZoomRange}
                  className="w-full accent-green-500 disabled:opacity-40"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={captureTargetPhoto}
              disabled={starting}
              className="ui-button w-full rounded-xl bg-green-700 px-6 py-4 text-xl font-black text-white transition hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-zinc-700"
            >
              Zrób zdjęcie
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
