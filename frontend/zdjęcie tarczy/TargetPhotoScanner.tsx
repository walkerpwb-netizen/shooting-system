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
  paperDetected: boolean;
};

type PaperPoint = {
  x: number;
  y: number;
};

type PaperBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  polygon: [PaperPoint, PaperPoint, PaperPoint, PaperPoint];
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

const AUTO_CAPTURE_CONFIDENCE = 0.8;
const AUTO_CAPTURE_STABLE_FRAMES = 4;
const AUTO_CAPTURE_GEOMETRY_TOLERANCE = 0.035;

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

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const middleIndex = Math.floor(sortedValues.length / 2);

  return sortedValues.length % 2 === 0
    ? (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2
    : sortedValues[middleIndex];
}

function percentile(values: number[], fraction: number) {
  if (values.length === 0) {
    return 0;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.round((sortedValues.length - 1) * fraction))
  );

  return sortedValues[index];
}

function fallbackPaperBounds(width: number, height: number): PaperBounds {
  return {
    x: 0,
    y: 0,
    width,
    height,
    confidence: 0,
    polygon: [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
  };
}

function findLongestRun(mask: Uint8Array, offset: number, length: number) {
  let bestStart = -1;
  let bestEnd = -1;
  let currentStart = -1;

  for (let index = 0; index < length; index += 1) {
    if (mask[offset + index]) {
      if (currentStart < 0) {
        currentStart = index;
      }
    } else if (currentStart >= 0) {
      if (index - currentStart > bestEnd - bestStart) {
        bestStart = currentStart;
        bestEnd = index - 1;
      }

      currentStart = -1;
    }
  }

  if (currentStart >= 0 && length - currentStart > bestEnd - bestStart) {
    bestStart = currentStart;
    bestEnd = length - 1;
  }

  return {
    start: bestStart,
    end: bestEnd,
    length: bestStart < 0 ? 0 : bestEnd - bestStart + 1,
  };
}

function makePaperMask(imageData: ImageData, width: number, height: number) {
  const histogram = Array.from({ length: 256 }, () => 0);
  const pixelCount = width * height;

  for (let index = 0; index < imageData.data.length; index += 4) {
    const red = imageData.data[index];
    const green = imageData.data[index + 1];
    const blue = imageData.data[index + 2];
    const luma = Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722);

    histogram[luma] += 1;
  }

  const p50 = getPercentileFromHistogram(histogram, pixelCount, 0.5);
  const p82 = getPercentileFromHistogram(histogram, pixelCount, 0.82);
  const paperThreshold = Math.max(88, Math.min(185, Math.round((p50 + p82) / 2 - 18)));
  const mask = new Uint8Array(pixelCount);

  for (let index = 0, pixel = 0; index < imageData.data.length; index += 4, pixel += 1) {
    const red = imageData.data[index];
    const green = imageData.data[index + 1];
    const blue = imageData.data[index + 2];
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    const chroma = max - min;
    const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const yellowCast = red + green - blue * 2;
    const neutralEnough = chroma <= 72 && yellowCast <= 118;
    const whiteEnough = red >= paperThreshold && green >= paperThreshold && blue >= paperThreshold - 18;
    const shadowPaper = luma >= paperThreshold - 18 && chroma <= 46 && yellowCast <= 84;

    if ((whiteEnough && neutralEnough) || shadowPaper) {
      mask[pixel] = 1;
    }
  }

  return mask;
}

function detectPaperBounds(canvas: HTMLCanvasElement, maxAnalysisSide = 900): PaperBounds {
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
    return fallbackPaperBounds(canvas.width, canvas.height);
  }

  analysisCanvas.width = width;
  analysisCanvas.height = height;
  analysisContext.drawImage(canvas, 0, 0, width, height);

  const imageData = analysisContext.getImageData(0, 0, width, height);
  const mask = makePaperMask(imageData, width, height);
  const rowEdges: Array<{
    y: number;
    left: number;
    right: number;
    runLength: number;
  }> = [];
  const minRunLength = Math.round(width * 0.22);

  for (let y = 0; y < height; y += 1) {
    const run = findLongestRun(mask, y * width, width);

    if (run.length >= minRunLength) {
      rowEdges.push({
        y,
        left: run.start,
        right: run.end,
        runLength: run.length,
      });
    }
  }

  if (rowEdges.length < height * 0.12) {
    return fallbackPaperBounds(canvas.width, canvas.height);
  }

  const rowLengths = rowEdges.map((row) => row.runLength);
  const strongRunLength = Math.max(
    minRunLength,
    percentile(rowLengths, 0.55) * 0.72
  );
  const strongRows = rowEdges.filter((row) => row.runLength >= strongRunLength);

  if (strongRows.length < height * 0.08) {
    return fallbackPaperBounds(canvas.width, canvas.height);
  }

  const topY = percentile(strongRows.map((row) => row.y), 0.02);
  const bottomY = percentile(strongRows.map((row) => row.y), 0.98);
  const verticalSpan = Math.max(1, bottomY - topY);
  const topBand = strongRows.filter((row) => Math.abs(row.y - topY) <= Math.max(8, verticalSpan * 0.08));
  const bottomBand = strongRows.filter((row) => Math.abs(row.y - bottomY) <= Math.max(8, verticalSpan * 0.08));
  const centerRows = strongRows.filter((row) => row.y >= topY + verticalSpan * 0.18 && row.y <= bottomY - verticalSpan * 0.18);

  if (centerRows.length < 6) {
    return fallbackPaperBounds(canvas.width, canvas.height);
  }

  const leftX = percentile(centerRows.map((row) => row.left), 0.12);
  const rightX = percentile(centerRows.map((row) => row.right), 0.88);
  const topLeftX = median(topBand.map((row) => row.left)) || leftX;
  const topRightX = median(topBand.map((row) => row.right)) || rightX;
  const bottomLeftX = median(bottomBand.map((row) => row.left)) || leftX;
  const bottomRightX = median(bottomBand.map((row) => row.right)) || rightX;
  const minX = Math.min(leftX, topLeftX, bottomLeftX);
  const maxX = Math.max(rightX, topRightX, bottomRightX);
  const paperWidth = maxX - minX + 1;
  const paperHeight = bottomY - topY + 1;

  if (paperWidth < width * 0.22 || paperHeight < height * 0.22) {
    return fallbackPaperBounds(canvas.width, canvas.height);
  }

  const marginX = Math.round(paperWidth * 0.01);
  const marginY = Math.round(paperHeight * 0.01);
  const scaledX = Math.max(0, minX - marginX);
  const scaledY = Math.max(0, topY - marginY);
  const scaledMaxX = Math.min(width - 1, maxX + marginX);
  const scaledMaxY = Math.min(height - 1, bottomY + marginY);
  const areaRatio = (paperWidth * paperHeight) / (width * height);
  const confidence = Math.min(
    1,
    Math.max(0, strongRows.length / Math.max(1, paperHeight)) * Math.min(1, areaRatio / 0.22)
  );

  function scalePoint(point: PaperPoint): PaperPoint {
    return {
      x: Math.round(point.x / scale),
      y: Math.round(point.y / scale),
    };
  }

  return {
    x: Math.round(scaledX / scale),
    y: Math.round(scaledY / scale),
    width: Math.round((scaledMaxX - scaledX + 1) / scale),
    height: Math.round((scaledMaxY - scaledY + 1) / scale),
    confidence,
    polygon: [
      scalePoint({ x: topLeftX, y: topY }),
      scalePoint({ x: topRightX, y: topY }),
      scalePoint({ x: bottomRightX, y: bottomY }),
      scalePoint({ x: bottomLeftX, y: bottomY }),
    ],
  };
}

function cropPaperFromCanvas(sourceCanvas: HTMLCanvasElement): CropResult {
  const bounds = detectPaperBounds(sourceCanvas, 1200);
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
      paperDetected: false,
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
    paperDetected: bounds.confidence >= 0.35,
  };
}

function hasStablePaperGeometry(previousBounds: PaperBounds | null, nextBounds: PaperBounds) {
  if (!previousBounds) {
    return false;
  }

  const maxSide = Math.max(
    previousBounds.width,
    previousBounds.height,
    nextBounds.width,
    nextBounds.height,
    1
  );
  const positionDelta = Math.max(
    Math.abs(previousBounds.x - nextBounds.x),
    Math.abs(previousBounds.y - nextBounds.y)
  ) / maxSide;
  const sizeDelta = Math.max(
    Math.abs(previousBounds.width - nextBounds.width),
    Math.abs(previousBounds.height - nextBounds.height)
  ) / maxSide;

  return positionDelta <= AUTO_CAPTURE_GEOMETRY_TOLERANCE
    && sizeDelta <= AUTO_CAPTURE_GEOMETRY_TOLERANCE;
}

export default function TargetPhotoScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const digitalZoomRef = useRef(1);
  const streamRef = useRef<MediaStream | null>(null);
  const lastAutoCaptureBoundsRef = useRef<PaperBounds | null>(null);
  const stableAutoCaptureFramesRef = useRef(0);
  const autoCaptureInProgressRef = useRef(false);
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
  const [paperPreview, setPaperPreview] = useState<PaperBounds | null>(null);
  const [flashOnCapture, setFlashOnCapture] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [autoCaptureStatus, setAutoCaptureStatus] = useState("");

  function updateDigitalZoom(value: number) {
    const nextZoom = Math.max(1, Math.min(4, value));

    digitalZoomRef.current = nextZoom;
    setDigitalZoom(nextZoom);
  }

  function stopCamera() {
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setTorchSupported(false);
    setTorchEnabled(false);
    setCameraZoomRange(null);
    setCameraZoom(1);
    setPaperPreview(null);
    setAutoCaptureStatus("");
    stableAutoCaptureFramesRef.current = 0;
    lastAutoCaptureBoundsRef.current = null;
    autoCaptureInProgressRef.current = false;

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

  async function setTorchState(enabled: boolean) {
    const [videoTrack] = streamRef.current?.getVideoTracks() || [];

    if (!videoTrack || !torchSupported) {
      return false;
    }

    return videoTrack.applyConstraints({
      advanced: [
        {
          torch: enabled,
        } as CameraConstraintSet,
      ],
    } as MediaTrackConstraints).then(() => {
      setTorchEnabled(enabled);
      return true;
    }).catch(() => false);
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
    setControlsOpen(false);

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
      startPaperPreview();
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
      startPaperPreview();
    } catch {
      setMessage("Nie udało się przełączyć aparatu.");
    } finally {
      setStarting(false);
    }
  }

  async function toggleTorch() {
    const changed = await setTorchState(!torchEnabled);

    if (!changed) {
      setMessage("Ten aparat nie pozwolił włączyć lampy w przeglądarce.");
    }
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

  function evaluateAutoCapture(bounds: PaperBounds | null) {
    if (
      !bounds
      || bounds.confidence < AUTO_CAPTURE_CONFIDENCE
      || autoCaptureInProgressRef.current
    ) {
      stableAutoCaptureFramesRef.current = 0;
      lastAutoCaptureBoundsRef.current = bounds;
      setAutoCaptureStatus("");
      return;
    }

    const isStable = hasStablePaperGeometry(lastAutoCaptureBoundsRef.current, bounds);

    lastAutoCaptureBoundsRef.current = bounds;

    if (!isStable) {
      stableAutoCaptureFramesRef.current = 1;
      setAutoCaptureStatus("Trzymaj nieruchomo");
      return;
    }

    stableAutoCaptureFramesRef.current += 1;

    const framesLeft = Math.max(
      0,
      AUTO_CAPTURE_STABLE_FRAMES - stableAutoCaptureFramesRef.current
    );

    if (framesLeft > 0) {
      setAutoCaptureStatus(`Automatyczne zdjęcie za ${framesLeft}`);
      return;
    }

    autoCaptureInProgressRef.current = true;
    setAutoCaptureStatus("Robię zdjęcie");
    void captureTargetPhoto();
  }

  function drawVideoFrameToCanvas() {
    const video = videoRef.current;

    if (!video || video.readyState < video.HAVE_CURRENT_DATA) {
      return null;
    }

    const width = video.videoWidth || 1920;
    const height = video.videoHeight || 1080;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", {
      willReadFrequently: true,
    });

    if (!context) {
      return null;
    }

    canvas.width = width;
    canvas.height = height;

    const sourceWidth = width / digitalZoomRef.current;
    const sourceHeight = height / digitalZoomRef.current;
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
    return canvas;
  }

  function drawPaperPreview(bounds: PaperBounds | null, sourceWidth: number, sourceHeight: number) {
    const canvas = overlayCanvasRef.current;
    const video = videoRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !video || !context) {
      return;
    }

    const rect = video.getBoundingClientRect();
    const displayWidth = Math.max(1, Math.round(rect.width));
    const displayHeight = Math.max(1, Math.round(rect.height));

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
    }

    context.clearRect(0, 0, displayWidth, displayHeight);

    if (!bounds || bounds.confidence < 0.28) {
      return;
    }

    const coverScale = Math.max(displayWidth / sourceWidth, displayHeight / sourceHeight) * digitalZoomRef.current;
    const renderedWidth = sourceWidth * coverScale;
    const renderedHeight = sourceHeight * coverScale;
    const offsetX = (displayWidth - renderedWidth) / 2;
    const offsetY = (displayHeight - renderedHeight) / 2;

    const points = bounds.polygon.map((point) => ({
      x: point.x * coverScale + offsetX,
      y: point.y * coverScale + offsetY,
    }));

    context.lineWidth = Math.max(3, displayWidth * 0.006);
    context.strokeStyle = bounds.confidence >= 0.45
      ? "rgba(34, 197, 94, 0.96)"
      : "rgba(250, 204, 21, 0.96)";
    context.fillStyle = "rgba(34, 197, 94, 0.10)";
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.closePath();
    context.fill();
    context.stroke();
  }

  function startPaperPreview() {
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
    }

    const scan = () => {
      const video = videoRef.current;
      let nextBounds: PaperBounds | null = null;

      if (video && video.readyState >= video.HAVE_CURRENT_DATA) {
        const width = video.videoWidth || 1920;
        const height = video.videoHeight || 1080;
        const canvas = previewCanvasRef.current || document.createElement("canvas");
        const context = canvas.getContext("2d", {
          willReadFrequently: true,
        });

        previewCanvasRef.current = canvas;

        if (context) {
          canvas.width = width;
          canvas.height = height;

          const sourceWidth = width / digitalZoomRef.current;
          const sourceHeight = height / digitalZoomRef.current;
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

          nextBounds = detectPaperBounds(canvas, 520);
          setPaperPreview(nextBounds);
          drawPaperPreview(nextBounds, width, height);
          evaluateAutoCapture(nextBounds);
        }
      }

      if (!nextBounds) {
        setPaperPreview(null);
        drawPaperPreview(null, 1, 1);
        evaluateAutoCapture(null);
      }

      if (streamRef.current && !autoCaptureInProgressRef.current) {
        previewTimerRef.current = window.setTimeout(scan, 260);
      }
    };

    previewTimerRef.current = window.setTimeout(scan, 300);
  }

  async function captureTargetPhoto() {
    if (autoCaptureInProgressRef.current && !streamRef.current) {
      return;
    }

    autoCaptureInProgressRef.current = true;

    if (flashOnCapture && torchSupported && !torchEnabled) {
      await setTorchState(true);
      await new Promise((resolve) => {
        window.setTimeout(resolve, 220);
      });
    }

    const canvas = drawVideoFrameToCanvas();

    if (!canvas) {
      setMessage("Nie udało się przygotować obrazu.");
      if (flashOnCapture && torchSupported) {
        await setTorchState(false);
      }
      autoCaptureInProgressRef.current = false;
      return;
    }

    setResult(cropPaperFromCanvas(canvas));

    if (flashOnCapture && torchSupported) {
      await setTorchState(false);
    }

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
            {" "}
            {result.paperDetected ? "Krawędzie wykryte." : "Krawędzie niepewne."}
          </p>
        </section>
      )}

      {cameraOpen && (
        <div className="fixed inset-0 z-[100] overflow-hidden bg-black text-white">
          <div className="absolute inset-0 bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              style={{
                transform: `scale(${digitalZoom})`,
              }}
              className="h-full w-full object-cover transition-transform"
            />

            <canvas
              ref={overlayCanvasRef}
              className="pointer-events-none absolute inset-0 z-20 h-full w-full"
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

          <div className="pointer-events-none absolute inset-x-0 top-0 z-40 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={closeCamera}
                className="pointer-events-auto ui-button rounded-full bg-black/55 px-4 py-2 text-sm font-black text-white shadow-lg backdrop-blur transition hover:bg-black/70"
              >
                Zamknij
              </button>

              <button
                type="button"
                onClick={() => {
                  setControlsOpen((currentValue) => !currentValue);
                }}
                className="pointer-events-auto ui-button rounded-full bg-black/55 px-4 py-2 text-sm font-black text-white shadow-lg backdrop-blur transition hover:bg-black/70"
              >
                Ustawienia
              </button>
            </div>

            <div className="mt-3 flex justify-center">
              <span className={`rounded-full px-4 py-2 text-sm font-black shadow-lg backdrop-blur ${
                paperPreview && paperPreview.confidence >= 0.45
                  ? "bg-green-600/80 text-white"
                  : paperPreview && paperPreview.confidence >= 0.28
                    ? "bg-yellow-400/85 text-zinc-950"
                    : "bg-black/55 text-white"
              }`}>
                {paperPreview && paperPreview.confidence >= 0.45
                  ? "Krawędzie wykryte"
                  : paperPreview && paperPreview.confidence >= 0.28
                    ? "Krawędzie niepewne"
                    : "Ustaw kartkę w kadrze"}
              </span>
            </div>

            {autoCaptureStatus && (
              <div className="mt-2 flex justify-center">
                <span className="rounded-full bg-white/90 px-4 py-2 text-sm font-black text-zinc-950 shadow-lg backdrop-blur">
                  {autoCaptureStatus}
                </span>
              </div>
            )}

            {controlsOpen && (
              <div className="pointer-events-auto mt-3 space-y-3 rounded-2xl border border-white/10 bg-black/75 p-4 shadow-2xl backdrop-blur">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-300">
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

                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-300">
                    Zoom kadru x{digitalZoom.toFixed(1)}
                  </span>

                  <input
                    type="range"
                    min={1}
                    max={4}
                    step={0.1}
                    value={digitalZoom}
                    onChange={(event) => updateDigitalZoom(Number(event.target.value))}
                    className="w-full accent-green-500"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-300">
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

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      void toggleTorch();
                    }}
                    disabled={starting || !torchSupported}
                    className="ui-button rounded-xl bg-zinc-800 px-4 py-3 text-sm font-black text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {torchSupported
                      ? torchEnabled ? "Światło: on" : "Światło: off"
                      : "Światło niedostępne"}
                  </button>

                  <button
                    type="button"
                    onClick={() => setFlashOnCapture((currentValue) => !currentValue)}
                    disabled={!torchSupported}
                    className="ui-button rounded-xl bg-zinc-800 px-4 py-3 text-sm font-black text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {flashOnCapture ? "Błysk: auto" : "Błysk: off"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={() => {
                  void captureTargetPhoto();
                }}
                disabled={starting}
                className="pointer-events-auto h-20 w-20 rounded-full border-4 border-white bg-white shadow-[0_0_0_6px_rgba(255,255,255,0.22)] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Zrób zdjęcie"
              />
            </div>

            <div className="mt-5 flex items-center justify-center gap-2">
              {[1, 1.5, 2, 3].map((zoomValue) => (
                <button
                  key={zoomValue}
                  type="button"
                  onClick={() => updateDigitalZoom(zoomValue)}
                  className={`pointer-events-auto rounded-full px-3 py-2 text-sm font-black backdrop-blur transition ${
                    Math.abs(digitalZoom - zoomValue) < 0.05
                      ? "bg-white text-zinc-950"
                      : "bg-black/55 text-white hover:bg-black/70"
                  }`}
                >
                  {zoomValue}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
