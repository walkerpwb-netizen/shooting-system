"use client";

import type { ChangeEvent } from "react";
import { useMemo, useState } from "react";

type TargetRing = {
  score: number;
  diameterMm: number;
};

type TargetTemplate = {
  id: string;
  name: string;
  sheetWidthMm: number;
  sheetHeightMm: number;
  source: string;
  rings: TargetRing[];
  centerX: number;
  centerY: number;
  patternPreviewUrl?: string;
};

type ShotMark = {
  id: number;
  x: number;
  y: number;
  radius: number;
  score: number;
  confidence: number;
};

type AnalysisResult = {
  imageUrl: string;
  shots: ShotMark[];
  totalScore: number;
  threshold: number;
  cropDescription: string;
};

type LoadedImage = {
  image: HTMLImageElement;
  url: string;
};

type ComponentBox = {
  x: number;
  y: number;
  radius: number;
  area: number;
  confidence: number;
};

const officialTemplates: TargetTemplate[] = [
  {
    id: "ts-2",
    name: "TS-2",
    sheetWidthMm: 500,
    sheetHeightMm: 500,
    source: "wzór oficjalny",
    centerX: 0.5,
    centerY: 0.5,
    rings: [
      { score: 1, diameterMm: 500 },
      { score: 2, diameterMm: 450 },
      { score: 3, diameterMm: 400 },
      { score: 4, diameterMm: 350 },
      { score: 5, diameterMm: 300 },
      { score: 6, diameterMm: 250 },
      { score: 7, diameterMm: 200 },
      { score: 8, diameterMm: 150 },
      { score: 9, diameterMm: 100 },
      { score: 10, diameterMm: 50 },
    ],
  },
  {
    id: "nt-23p",
    name: "NT-23P",
    sheetWidthMm: 500,
    sheetHeightMm: 500,
    source: "wzór oficjalny",
    centerX: 0.5,
    centerY: 0.5,
    rings: [
      { score: 6, diameterMm: 500 },
      { score: 7, diameterMm: 400 },
      { score: 8, diameterMm: 300 },
      { score: 9, diameterMm: 200 },
      { score: 10, diameterMm: 100 },
    ],
  },
  {
    id: "nt-23p-2",
    name: "NT-23P/2",
    sheetWidthMm: 250,
    sheetHeightMm: 250,
    source: "wzór oficjalny",
    centerX: 0.5,
    centerY: 0.5,
    rings: [
      { score: 6, diameterMm: 250 },
      { score: 7, diameterMm: 200 },
      { score: 8, diameterMm: 150 },
      { score: 9, diameterMm: 100 },
      { score: 10, diameterMm: 50 },
    ],
  },
];

const generatedCustomRings = Array.from({ length: 10 }, (_, index) => ({
  score: 10 - index,
  diameterMm: (index + 1) * 50,
})).reverse();

function loadImageFile(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Nie udało się odczytać obrazu."));
    };
    image.src = url;
  });
}

function getScoreForPoint(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
  template: TargetTemplate
) {
  const centerX = canvasWidth * template.centerX;
  const centerY = canvasHeight * template.centerY;
  const targetScale = Math.min(
    canvasWidth / template.sheetWidthMm,
    canvasHeight / template.sheetHeightMm
  );
  const distance = Math.hypot(x - centerX, y - centerY);
  const rings = [...template.rings].sort((firstRing, secondRing) => secondRing.score - firstRing.score);

  for (const ring of rings) {
    if (distance <= (ring.diameterMm * targetScale) / 2) {
      return ring.score;
    }
  }

  return 0;
}

function drawScoringRings(
  context: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  template: TargetTemplate
) {
  const centerX = canvasWidth * template.centerX;
  const centerY = canvasHeight * template.centerY;
  const targetScale = Math.min(
    canvasWidth / template.sheetWidthMm,
    canvasHeight / template.sheetHeightMm
  );

  context.save();
  context.strokeStyle = "rgba(34, 197, 94, 0.5)";
  context.lineWidth = Math.max(1, Math.round(Math.min(canvasWidth, canvasHeight) * 0.002));
  context.font = `${Math.max(12, Math.round(Math.min(canvasWidth, canvasHeight) * 0.02))}px Arial`;
  context.fillStyle = "rgba(34, 197, 94, 0.85)";

  template.rings.forEach((ring) => {
    const radius = (ring.diameterMm * targetScale) / 2;

    context.beginPath();
    context.arc(centerX, centerY, radius, 0, Math.PI * 2);
    context.stroke();
    context.fillText(String(ring.score), centerX + radius + 4, centerY - 4);
  });

  context.restore();
}

function detectShotComponents(
  imageData: ImageData,
  sensitivity: number,
  expectedShots: number,
  patternImageData?: ImageData
): {
  components: ComponentBox[];
  threshold: number;
} {
  const { width, height, data } = imageData;
  const pixelCount = width * height;
  const gray = new Uint8Array(pixelCount);
  const patternGray = patternImageData ? new Uint8Array(pixelCount) : null;
  let sum = 0;

  for (let index = 0; index < pixelCount; index += 1) {
    const dataIndex = index * 4;
    const value = Math.round(
      data[dataIndex] * 0.299
      + data[dataIndex + 1] * 0.587
      + data[dataIndex + 2] * 0.114
    );

    gray[index] = value;
    sum += value;

    if (patternGray && patternImageData) {
      const patternData = patternImageData.data;
      patternGray[index] = Math.round(
        patternData[dataIndex] * 0.299
        + patternData[dataIndex + 1] * 0.587
        + patternData[dataIndex + 2] * 0.114
      );
    }
  }

  const mean = sum / pixelCount;
  let variance = 0;

  for (let index = 0; index < pixelCount; index += 1) {
    variance += (gray[index] - mean) ** 2;
  }

  const standardDeviation = Math.sqrt(variance / pixelCount);
  const threshold = Math.max(
    18,
    Math.min(125, Math.round(mean - standardDeviation * 0.95 + sensitivity))
  );
  const visited = new Uint8Array(pixelCount);
  const components: ComponentBox[] = [];
  const minArea = Math.max(10, Math.round(pixelCount * 0.000012));
  const maxArea = Math.max(80, Math.round(pixelCount * 0.002));
  const maxBoxSize = Math.min(width, height) * 0.09;
  const stack: number[] = [];

  for (let startY = 1; startY < height - 1; startY += 1) {
    for (let startX = 1; startX < width - 1; startX += 1) {
      const startIndex = startY * width + startX;
      const isDarkCandidate = patternGray
        ? gray[startIndex] + 34 < patternGray[startIndex] && gray[startIndex] < 150
        : gray[startIndex] <= threshold;

      if (visited[startIndex] || !isDarkCandidate) {
        continue;
      }

      let area = 0;
      let sumX = 0;
      let sumY = 0;
      let darkness = 0;
      let minX = startX;
      let maxX = startX;
      let minY = startY;
      let maxY = startY;

      visited[startIndex] = 1;
      stack.push(startIndex);

      while (stack.length > 0) {
        const currentIndex = stack.pop();

        if (currentIndex === undefined) {
          break;
        }

        const x = currentIndex % width;
        const y = Math.floor(currentIndex / width);

        area += 1;
        sumX += x;
        sumY += y;
        darkness += 255 - gray[currentIndex];
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);

        const neighbors = [
          currentIndex - 1,
          currentIndex + 1,
          currentIndex - width,
          currentIndex + width,
        ];

        neighbors.forEach((neighborIndex) => {
          const neighborIsDarkCandidate = patternGray
            ? gray[neighborIndex] + 34 < patternGray[neighborIndex] && gray[neighborIndex] < 150
            : gray[neighborIndex] <= threshold;

          if (
            neighborIndex <= 0
            || neighborIndex >= pixelCount
            || visited[neighborIndex]
            || !neighborIsDarkCandidate
          ) {
            return;
          }

          visited[neighborIndex] = 1;
          stack.push(neighborIndex);
        });
      }

      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      const ratio = boxWidth / boxHeight;
      const density = area / (boxWidth * boxHeight);

      if (
        area < minArea
        || area > maxArea
        || boxWidth > maxBoxSize
        || boxHeight > maxBoxSize
        || ratio < 0.35
        || ratio > 2.85
        || density < 0.24
      ) {
        continue;
      }

      components.push({
        x: sumX / area,
        y: sumY / area,
        radius: Math.max(8, Math.sqrt(area / Math.PI) * 1.9),
        area,
        confidence: Math.min(1, (darkness / area) / 210) * density,
      });
    }
  }

  const mergedComponents: ComponentBox[] = [];
  const mergeDistance = Math.min(width, height) * 0.024;

  [...components]
    .sort((firstComponent, secondComponent) => secondComponent.confidence - firstComponent.confidence)
    .forEach((component) => {
      const existingComponent = mergedComponents.find(
        (mergedComponent) => Math.hypot(
          mergedComponent.x - component.x,
          mergedComponent.y - component.y
        ) < mergeDistance
      );

      if (existingComponent) {
        return;
      }

      mergedComponents.push(component);
    });

  return {
    components: mergedComponents
      .slice(0, Math.max(1, expectedShots))
      .sort((firstComponent, secondComponent) => firstComponent.y - secondComponent.y || firstComponent.x - secondComponent.x),
    threshold,
  };
}

async function analyzeTargetImage(
  file: File,
  template: TargetTemplate,
  sensitivity: number,
  expectedShots: number,
  patternFile?: File | null
): Promise<AnalysisResult> {
  const loadedImage = await loadImageFile(file);
  const loadedPatternImage = patternFile ? await loadImageFile(patternFile) : null;
  const aspectRatio = template.sheetWidthMm / template.sheetHeightMm;
  let sourceWidth = loadedImage.image.naturalWidth;
  let sourceHeight = loadedImage.image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;

  if (sourceWidth / sourceHeight > aspectRatio) {
    sourceWidth = sourceHeight * aspectRatio;
    sourceX = (loadedImage.image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = sourceWidth / aspectRatio;
    sourceY = (loadedImage.image.naturalHeight - sourceHeight) / 2;
  }

  const maxCanvasSide = 1200;
  const scale = Math.min(1, maxCanvasSide / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!context) {
    URL.revokeObjectURL(loadedImage.url);
    throw new Error("Przeglądarka nie udostępniła kontekstu obrazu.");
  }

  canvas.width = Math.round(sourceWidth * scale);
  canvas.height = Math.round(sourceHeight * scale);
  context.drawImage(
    loadedImage.image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  let patternImageData: ImageData | undefined;

  if (loadedPatternImage) {
    const patternCanvas = document.createElement("canvas");
    const patternContext = patternCanvas.getContext("2d", {
      willReadFrequently: true,
    });

    if (patternContext) {
      let patternSourceWidth = loadedPatternImage.image.naturalWidth;
      let patternSourceHeight = loadedPatternImage.image.naturalHeight;
      let patternSourceX = 0;
      let patternSourceY = 0;

      if (patternSourceWidth / patternSourceHeight > aspectRatio) {
        patternSourceWidth = patternSourceHeight * aspectRatio;
        patternSourceX = (loadedPatternImage.image.naturalWidth - patternSourceWidth) / 2;
      } else {
        patternSourceHeight = patternSourceWidth / aspectRatio;
        patternSourceY = (loadedPatternImage.image.naturalHeight - patternSourceHeight) / 2;
      }

      patternCanvas.width = canvas.width;
      patternCanvas.height = canvas.height;
      patternContext.drawImage(
        loadedPatternImage.image,
        patternSourceX,
        patternSourceY,
        patternSourceWidth,
        patternSourceHeight,
        0,
        0,
        patternCanvas.width,
        patternCanvas.height
      );
      patternImageData = patternContext.getImageData(0, 0, patternCanvas.width, patternCanvas.height);
    }
  }

  const detection = detectShotComponents(imageData, sensitivity, expectedShots, patternImageData);
  const shots = detection.components.map((component, index) => ({
    id: index + 1,
    x: component.x,
    y: component.y,
    radius: component.radius,
    score: getScoreForPoint(component.x, component.y, canvas.width, canvas.height, template),
    confidence: component.confidence,
  }));

  drawScoringRings(context, canvas.width, canvas.height, template);

  shots.forEach((shot) => {
    context.save();
    context.strokeStyle = "#ef4444";
    context.fillStyle = "#ef4444";
    context.lineWidth = Math.max(3, Math.round(Math.min(canvas.width, canvas.height) * 0.004));
    context.beginPath();
    context.arc(shot.x, shot.y, Math.max(shot.radius, 14), 0, Math.PI * 2);
    context.stroke();
    context.font = `700 ${Math.max(16, Math.round(Math.min(canvas.width, canvas.height) * 0.028))}px Arial`;
    context.fillText(String(shot.score), shot.x + shot.radius + 6, shot.y - shot.radius - 6);
    context.restore();
  });

  URL.revokeObjectURL(loadedImage.url);
  if (loadedPatternImage) {
    URL.revokeObjectURL(loadedPatternImage.url);
  }

  return {
    imageUrl: canvas.toDataURL("image/jpeg", 0.92),
    shots,
    totalScore: shots.reduce((sum, shot) => sum + shot.score, 0),
    threshold: detection.threshold,
    cropDescription: `${Math.round(sourceWidth)} x ${Math.round(sourceHeight)} px`,
  };
}

export default function TargetScoringBeta() {
  const [selectedTemplateId, setSelectedTemplateId] = useState(officialTemplates[0].id);
  const [customTemplate, setCustomTemplate] = useState<TargetTemplate | null>(null);
  const [customName, setCustomName] = useState("Własna tarcza");
  const [customWidth, setCustomWidth] = useState(500);
  const [customHeight, setCustomHeight] = useState(500);
  const [targetFile, setTargetFile] = useState<File | null>(null);
  const [patternFile, setPatternFile] = useState<File | null>(null);
  const [targetFileName, setTargetFileName] = useState("");
  const [patternFileName, setPatternFileName] = useState("");
  const [expectedShots, setExpectedShots] = useState(10);
  const [sensitivity, setSensitivity] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  const templates = useMemo(
    () => customTemplate ? [...officialTemplates, customTemplate] : officialTemplates,
    [customTemplate]
  );
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) || templates[0];

  async function handlePatternFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const loadedImage = await loadImageFile(file);
    const nextCustomTemplate: TargetTemplate = {
      id: "custom",
      name: customName.trim() || "Własna tarcza",
      sheetWidthMm: Math.max(50, customWidth),
      sheetHeightMm: Math.max(50, customHeight),
      source: "wzór własny",
      centerX: 0.5,
      centerY: 0.5,
      rings: generatedCustomRings.map((ring) => ({
        ...ring,
        diameterMm: (Math.min(customWidth, customHeight) / 10) * (11 - ring.score),
      })),
      patternPreviewUrl: loadedImage.url,
    };

    setPatternFileName(file.name);
    setPatternFile(file);
    setCustomTemplate(nextCustomTemplate);
    setSelectedTemplateId(nextCustomTemplate.id);
    setMessage("Własny wzór dodany do listy.");
  }

  function handleTargetFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;

    setTargetFile(file);
    setTargetFileName(file?.name || "");
    setResult(null);
    setAccepted(false);
    setMessage("");
  }

  async function runAnalysis() {
    if (!targetFile) {
      setMessage("Dodaj zdjęcie tarczy do analizy.");
      return;
    }

    try {
      setWorking(true);
      setAccepted(false);
      setMessage("");
      const nextResult = await analyzeTargetImage(
        targetFile,
        selectedTemplate,
        sensitivity,
        expectedShots,
        selectedTemplate.id === "custom" ? patternFile : null
      );

      setResult(nextResult);
      setMessage("Analiza zakończona.");
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : "Nie udało się przeanalizować zdjęcia.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="ui-block bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-red-300">
              Beta test
            </p>
            <h2 className="mt-2 text-3xl font-black text-white">
              Zliczanie przestrzelin
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
              <p className="font-bold text-gray-400">Wzór</p>
              <p className="mt-1 text-lg font-black text-white">{selectedTemplate.name}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
              <p className="font-bold text-gray-400">Strzały</p>
              <p className="mt-1 text-lg font-black text-white">{result?.shots.length ?? 0}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
              <p className="font-bold text-gray-400">Wynik</p>
              <p className="mt-1 text-lg font-black text-white">{result?.totalScore ?? "-"}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
              <p className="font-bold text-gray-400">Status</p>
              <p className={`mt-1 text-lg font-black ${accepted ? "text-green-300" : "text-yellow-300"}`}>
                {accepted ? "zaakceptowany" : "roboczy"}
              </p>
            </div>
          </div>
        </div>

        {message && (
          <p className="mt-5 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 font-semibold text-gray-100">
            {message}
          </p>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <section className="ui-block space-y-5 bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div>
            <h3 className="text-xl font-black text-white">
              Wzór tarczy
            </h3>

            <div className="mt-4 grid gap-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    setSelectedTemplateId(template.id);
                    setResult(null);
                    setAccepted(false);
                  }}
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    selectedTemplate.id === template.id
                      ? "border-green-500 bg-green-950/50 text-white"
                      : "border-zinc-800 bg-zinc-950 text-gray-300 hover:border-zinc-600"
                  }`}
                >
                  <span className="block font-black">{template.name}</span>
                  <span className="mt-1 block text-sm text-gray-400">
                    {template.sheetWidthMm} x {template.sheetHeightMm} mm · {template.source}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-5">
            <h3 className="text-xl font-black text-white">
              Własny wzór
            </h3>

            <div className="mt-4 grid gap-3">
              <input
                type="text"
                value={customName}
                onChange={(event) => setCustomName(event.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white"
              />

              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="mb-2 block text-sm font-bold text-gray-300">Szer. mm</span>
                  <input
                    type="number"
                    min={50}
                    value={customWidth}
                    onChange={(event) => setCustomWidth(Number(event.target.value))}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-sm font-bold text-gray-300">Wys. mm</span>
                  <input
                    type="number"
                    min={50}
                    value={customHeight}
                    onChange={(event) => setCustomHeight(Number(event.target.value))}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white"
                  />
                </label>
              </div>

              <label className="block rounded-xl border border-dashed border-zinc-700 bg-zinc-950 px-4 py-4 text-gray-200">
                <span className="block font-bold">Plik wzoru</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => void handlePatternFileChange(event)}
                  className="mt-3 block w-full text-sm text-gray-300 file:mr-4 file:rounded-lg file:border-0 file:bg-green-700 file:px-4 file:py-2 file:font-bold file:text-white"
                />
                {patternFileName && (
                  <span className="mt-2 block text-sm text-green-300">{patternFileName}</span>
                )}
              </label>

              {customTemplate?.patternPreviewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={customTemplate.patternPreviewUrl}
                  alt="Podgląd własnego wzoru tarczy"
                  className="max-h-56 w-full rounded-xl border border-zinc-800 object-contain"
                />
              )}
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-5">
            <h3 className="text-xl font-black text-white">
              Zdjęcie
            </h3>

            <div className="mt-4 grid gap-4">
              <label className="block rounded-xl border border-dashed border-zinc-700 bg-zinc-950 px-4 py-4 text-gray-200">
                <span className="block font-bold">Zdjęcie tarczy</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleTargetFileChange}
                  className="mt-3 block w-full text-sm text-gray-300 file:mr-4 file:rounded-lg file:border-0 file:bg-red-700 file:px-4 file:py-2 file:font-bold file:text-white"
                />
                {targetFileName && (
                  <span className="mt-2 block text-sm text-green-300">{targetFileName}</span>
                )}
              </label>

              <label>
                <span className="mb-2 block text-sm font-bold text-gray-300">
                  Liczba przestrzelin
                </span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={expectedShots}
                  onChange={(event) => setExpectedShots(Number(event.target.value))}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white"
                />
              </label>

              <label>
                <span className="mb-2 block text-sm font-bold text-gray-300">
                  Czułość: {sensitivity}
                </span>
                <input
                  type="range"
                  min={-35}
                  max={35}
                  value={sensitivity}
                  onChange={(event) => setSensitivity(Number(event.target.value))}
                  className="w-full accent-red-600"
                />
              </label>

              <button
                type="button"
                onClick={() => void runAnalysis()}
                disabled={working}
                className="ui-button rounded-xl bg-green-700 px-5 py-3 font-black text-white transition hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-zinc-700"
              >
                {working ? "Analizuję..." : "Analizuj zdjęcie"}
              </button>
            </div>
          </div>
        </section>

        <section className="ui-block bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-black text-white">
                Wynik do akceptacji
              </h3>
              {result && (
                <p className="mt-2 text-sm text-gray-400">
                  Próg: {result.threshold} · kadr: {result.cropDescription}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setAccepted(true)}
                disabled={!result}
                className="ui-button rounded-xl bg-green-700 px-5 py-3 font-bold text-white transition hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-zinc-700"
              >
                Akceptuj
              </button>

              <button
                type="button"
                onClick={() => {
                  setAccepted(false);
                  setResult(null);
                }}
                className="ui-button rounded-xl bg-zinc-800 px-5 py-3 font-bold text-white transition hover:bg-zinc-700"
              >
                Wyczyść
              </button>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
            {result ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.imageUrl}
                alt="Zdjęcie tarczy z zaznaczonymi przestrzelinami"
                className="max-h-[72vh] w-full object-contain"
              />
            ) : (
              <div className="flex min-h-[28rem] items-center justify-center px-6 text-center text-gray-500">
                Brak wyniku analizy.
              </div>
            )}
          </div>

          {result && (
            <div className="mt-6 overflow-x-auto">
              <div className="grid min-w-[640px] grid-cols-[80px_1fr_1fr_1fr] border-b border-zinc-800 px-4 py-3 text-sm font-black text-gray-400">
                <p>Nr</p>
                <p>Punkt</p>
                <p>Pozycja</p>
                <p>Pewność</p>
              </div>

              {result.shots.map((shot) => (
                <div
                  key={shot.id}
                  className="grid min-w-[640px] grid-cols-[80px_1fr_1fr_1fr] border-b border-zinc-800 px-4 py-3 text-sm text-gray-200 last:border-b-0"
                >
                  <p className="font-black text-white">{shot.id}</p>
                  <p>{shot.score}</p>
                  <p>
                    {Math.round(shot.x)}, {Math.round(shot.y)}
                  </p>
                  <p>{Math.round(shot.confidence * 100)}%</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
