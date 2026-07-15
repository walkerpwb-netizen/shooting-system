"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import { apiUrl } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

type TargetRing = {
  score: number;
  diameterMm: number;
};

type TargetTemplate = {
  id: string;
  name: string;
  source: string;
  sheetWidthMm: number;
  sheetHeightMm: number;
  centerX: number;
  centerY: number;
  imageUrl: string;
  rings: TargetRing[];
};

type ApiTargetTemplate = {
  id: string;
  name: string;
  source: string;
  sheet_width_mm: number;
  sheet_height_mm: number;
  center_x: number;
  center_y: number;
  image_url: string;
  rings: Array<{
    score: number;
    diameter_mm: number;
  }>;
};

type LoadedImage = {
  image: HTMLImageElement;
  revoke?: () => void;
};

type Point = {
  x: number;
  y: number;
};

type Bullseye = {
  x: number;
  y: number;
  radius: number;
  area: number;
};

type ShotMark = {
  id: number;
  x: number;
  y: number;
  radius: number;
  score: number;
  confidence: number;
};

type ComponentBox = {
  x: number;
  y: number;
  radius: number;
  area: number;
  boxWidth: number;
  boxHeight: number;
  density: number;
  circularFill: number;
  greenShare: number;
  darkShare: number;
  brightShare: number;
  meanDifference: number;
  confidence: number;
};

type PreparedImage = {
  canvas: HTMLCanvasElement;
  description: string;
};

type AlignmentResult = PreparedImage & {
  bullseye: Bullseye | null;
};

type AnalysisResult = {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  shots: ShotMark[];
  totalScore: number;
  threshold: number;
  cropDescription: string;
};

const defaultCustomRings = Array.from({ length: 10 }, (_, index) => ({
  score: index + 1,
  diameterMm: (10 - index) * 50,
}));
const maxSourceCanvasSide = 4096;
const maxAnalysisCanvasSide = 1800;

function apiTemplateToTargetTemplate(template: ApiTargetTemplate): TargetTemplate {
  return {
    id: template.id,
    name: template.name,
    source: template.source,
    sheetWidthMm: template.sheet_width_mm,
    sheetHeightMm: template.sheet_height_mm,
    centerX: template.center_x,
    centerY: template.center_y,
    imageUrl: template.image_url,
    rings: template.rings.map((ring) => ({
      score: ring.score,
      diameterMm: ring.diameter_mm,
    })),
  };
}

function templateImageSrc(template: TargetTemplate) {
  return template.imageUrl ? apiUrl(template.imageUrl) : "";
}

function generatedRingsForSize(widthMm: number, heightMm: number) {
  const maxDiameter = Math.max(50, Math.min(widthMm, heightMm));

  return defaultCustomRings.map((ring) => ({
    score: ring.score,
    diameterMm: (maxDiameter / 10) * (11 - ring.score),
  }));
}

function loadImageFile(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => resolve({
      image,
      revoke: () => URL.revokeObjectURL(url),
    });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Nie udało się odczytać obrazu."));
    };
    image.src = url;
  });
}

function loadImageUrl(url: string): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.crossOrigin = "anonymous";
    image.onload = () => resolve({ image });
    image.onerror = () => reject(new Error("Nie udało się pobrać obrazu wzorcowego."));
    image.src = url;
  });
}

function imageToCanvas(image: HTMLImageElement, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!context) {
    throw new Error("Przeglądarka nie udostępniła kontekstu obrazu.");
  }

  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvas;
}

function detectPaperQuad(imageData: ImageData, targetAspectRatio: number): Point[] {
  const { width, height, data } = imageData;
  const sampleStep = Math.max(2, Math.ceil(Math.max(width, height) / 420));
  const sampleWidth = Math.ceil(width / sampleStep);
  const sampleHeight = Math.ceil(height / sampleStep);
  const mask = new Uint8Array(sampleWidth * sampleHeight);
  const visited = new Uint8Array(mask.length);

  for (let sampleY = 0; sampleY < sampleHeight; sampleY += 1) {
    for (let sampleX = 0; sampleX < sampleWidth; sampleX += 1) {
      const x = Math.min(width - 1, sampleX * sampleStep);
      const y = Math.min(height - 1, sampleY * sampleStep);
      const index = (y * width + x) * 4;
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const maxChannel = Math.max(red, green, blue);
      const minChannel = Math.min(red, green, blue);
      const brightness = (red + green + blue) / 3;
      const saturation = maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel;

      if (
        (brightness > 118 && saturation < 0.42)
        || (brightness > 150 && saturation < 0.58)
      ) {
        mask[sampleY * sampleWidth + sampleX] = 1;
      }
    }
  }

  let bestComponent: {
    area: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null = null;
  const stack: number[] = [];

  for (let startY = 0; startY < sampleHeight; startY += 1) {
    for (let startX = 0; startX < sampleWidth; startX += 1) {
      const startIndex = startY * sampleWidth + startX;

      if (!mask[startIndex] || visited[startIndex]) {
        continue;
      }

      let area = 0;
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

        const x = currentIndex % sampleWidth;
        const y = Math.floor(currentIndex / sampleWidth);

        area += 1;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);

        const neighbors = [
          currentIndex - 1,
          currentIndex + 1,
          currentIndex - sampleWidth,
          currentIndex + sampleWidth,
        ];

        neighbors.forEach((neighborIndex) => {
          if (
            neighborIndex < 0
            || neighborIndex >= mask.length
            || visited[neighborIndex]
            || !mask[neighborIndex]
          ) {
            return;
          }

          const neighborX = neighborIndex % sampleWidth;

          if (Math.abs(neighborX - x) > 1) {
            return;
          }

          visited[neighborIndex] = 1;
          stack.push(neighborIndex);
        });
      }

      const componentWidth = maxX - minX + 1;
      const componentHeight = maxY - minY + 1;
      const componentArea = componentWidth * componentHeight;
      const fill = area / componentArea;

      if (
        area < mask.length * 0.025
        || fill < 0.28
        || componentWidth < sampleWidth * 0.18
        || componentHeight < sampleHeight * 0.18
      ) {
        continue;
      }

      if (!bestComponent || area > bestComponent.area) {
        bestComponent = {
          area,
          minX,
          maxX,
          minY,
          maxY,
        };
      }
    }
  }

  if (!bestComponent) {
    return [
      { x: 0, y: 0 },
      { x: width - 1, y: 0 },
      { x: width - 1, y: height - 1 },
      { x: 0, y: height - 1 },
    ];
  }

  const padding = Math.round(sampleStep * 1.5);
  let left = Math.max(0, bestComponent.minX * sampleStep - padding);
  let top = Math.max(0, bestComponent.minY * sampleStep - padding);
  let right = Math.min(width - 1, (bestComponent.maxX + 1) * sampleStep + padding);
  let bottom = Math.min(height - 1, (bestComponent.maxY + 1) * sampleStep + padding);
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const cropWidth = right - left;
  const cropHeight = bottom - top;

  if (cropWidth / cropHeight > targetAspectRatio) {
    const nextHeight = Math.min(height - 1, cropWidth / targetAspectRatio);

    top = centerY - nextHeight / 2;
    bottom = centerY + nextHeight / 2;
  } else {
    const nextWidth = Math.min(width - 1, cropHeight * targetAspectRatio);

    left = centerX - nextWidth / 2;
    right = centerX + nextWidth / 2;
  }

  if (left < 0) {
    right -= left;
    left = 0;
  }

  if (right > width - 1) {
    left -= right - (width - 1);
    right = width - 1;
  }

  if (top < 0) {
    bottom -= top;
    top = 0;
  }

  if (bottom > height - 1) {
    top -= bottom - (height - 1);
    bottom = height - 1;
  }

  left = Math.max(0, left);
  top = Math.max(0, top);
  right = Math.min(width - 1, right);
  bottom = Math.min(height - 1, bottom);

  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
}

function pointInScoringArea(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
  template: TargetTemplate
) {
  const largestRing = template.rings.reduce(
    (largest, ring) => Math.max(largest, ring.diameterMm),
    0
  );

  if (!largestRing) {
    return true;
  }

  const centerX = canvasWidth * template.centerX;
  const centerY = canvasHeight * template.centerY;
  const targetScale = Math.min(
    canvasWidth / template.sheetWidthMm,
    canvasHeight / template.sheetHeightMm
  );
  const outerRadius = (largestRing * targetScale) / 2;

  return Math.hypot(x - centerX, y - centerY) <= outerRadius * 1.04;
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

function solveLinearSystem(matrix: number[][], vector: number[]) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;

    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) {
        pivotRow = row;
      }
    }

    [augmented[column], augmented[pivotRow]] = [augmented[pivotRow], augmented[column]];

    const pivot = augmented[column][column] || 1;

    for (let valueIndex = column; valueIndex <= size; valueIndex += 1) {
      augmented[column][valueIndex] /= pivot;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) {
        continue;
      }

      const factor = augmented[row][column];

      for (let valueIndex = column; valueIndex <= size; valueIndex += 1) {
        augmented[row][valueIndex] -= factor * augmented[column][valueIndex];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

function transformFromRectToQuad(width: number, height: number, quad: Point[]) {
  const sourcePoints = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ];
  const matrix: number[][] = [];
  const vector: number[] = [];

  sourcePoints.forEach((point, index) => {
    const target = quad[index];

    matrix.push([point.x, point.y, 1, 0, 0, 0, -target.x * point.x, -target.x * point.y]);
    vector.push(target.x);
    matrix.push([0, 0, 0, point.x, point.y, 1, -target.y * point.x, -target.y * point.y]);
    vector.push(target.y);
  });

  const [a, b, c, d, e, f, g, h] = solveLinearSystem(matrix, vector);

  return (x: number, y: number) => {
    const denominator = g * x + h * y + 1;

    return {
      x: (a * x + b * y + c) / denominator,
      y: (d * x + e * y + f) / denominator,
    };
  };
}

function samplePixel(data: Uint8ClampedArray, width: number, height: number, x: number, y: number) {
  const safeX = Math.max(0, Math.min(width - 1, Math.round(x)));
  const safeY = Math.max(0, Math.min(height - 1, Math.round(y)));
  const index = (safeY * width + safeX) * 4;

  return [
    data[index],
    data[index + 1],
    data[index + 2],
    data[index + 3],
  ];
}

function detectBullseye(canvas: HTMLCanvasElement): Bullseye | null {
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!context) {
    return null;
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const { width, height, data } = imageData;
  const pixelCount = width * height;
  const mask = new Uint8Array(pixelCount);
  const visited = new Uint8Array(pixelCount);

  for (let index = 0; index < pixelCount; index += 1) {
    const dataIndex = index * 4;
    const red = data[dataIndex];
    const green = data[dataIndex + 1];
    const blue = data[dataIndex + 2];
    const brightness = red * 0.299 + green * 0.587 + blue * 0.114;
    const maxChannel = Math.max(red, green, blue);
    const minChannel = Math.min(red, green, blue);
    const saturation = maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel;

    if (brightness < 82 || (brightness < 118 && saturation < 0.38)) {
      mask[index] = 1;
    }
  }

  let bestBullseye: Bullseye | null = null;
  const stack: number[] = [];
  const minArea = pixelCount * 0.004;
  const maxArea = pixelCount * 0.24;
  const minCenterX = width * 0.18;
  const maxCenterX = width * 0.82;
  const minCenterY = height * 0.14;
  const maxCenterY = height * 0.86;

  for (let startY = 1; startY < height - 1; startY += 1) {
    for (let startX = 1; startX < width - 1; startX += 1) {
      const startIndex = startY * width + startX;

      if (!mask[startIndex] || visited[startIndex]) {
        continue;
      }

      let area = 0;
      let sumX = 0;
      let sumY = 0;
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
          if (
            neighborIndex <= 0
            || neighborIndex >= pixelCount
            || visited[neighborIndex]
            || !mask[neighborIndex]
          ) {
            return;
          }

          const neighborX = neighborIndex % width;

          if (Math.abs(neighborX - x) > 1) {
            return;
          }

          visited[neighborIndex] = 1;
          stack.push(neighborIndex);
        });
      }

      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      const ratio = boxWidth / boxHeight;
      const centerX = sumX / area;
      const centerY = sumY / area;
      const radius = Math.max(boxWidth, boxHeight) / 2;

      if (
        area < minArea
        || area > maxArea
        || ratio < 0.55
        || ratio > 1.8
        || centerX < minCenterX
        || centerX > maxCenterX
        || centerY < minCenterY
        || centerY > maxCenterY
      ) {
        continue;
      }

      if (!bestBullseye || area > bestBullseye.area) {
        bestBullseye = {
          x: (minX + maxX) / 2,
          y: (minY + maxY) / 2,
          radius,
          area,
        };
      }
    }
  }

  return bestBullseye;
}

function alignCanvasByBullseye(
  targetCanvas: HTMLCanvasElement,
  patternBullseye: Bullseye | null
): AlignmentResult {
  const targetBullseye = detectBullseye(targetCanvas);

  if (!patternBullseye || !targetBullseye) {
    return {
      canvas: targetCanvas,
      description: "centrum nie wykryte",
      bullseye: targetBullseye,
    };
  }

  const context = targetCanvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!context) {
    return {
      canvas: targetCanvas,
      description: "centrum bez korekty",
      bullseye: targetBullseye,
    };
  }

  const sourceImageData = context.getImageData(0, 0, targetCanvas.width, targetCanvas.height);
  const outputCanvas = document.createElement("canvas");
  const outputContext = outputCanvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!outputContext) {
    return {
      canvas: targetCanvas,
      description: "centrum bez korekty",
      bullseye: targetBullseye,
    };
  }

  outputCanvas.width = targetCanvas.width;
  outputCanvas.height = targetCanvas.height;

  const outputImageData = outputContext.createImageData(outputCanvas.width, outputCanvas.height);
  const scale = Math.max(0.45, Math.min(2.2, targetBullseye.radius / patternBullseye.radius));

  for (let y = 0; y < outputCanvas.height; y += 1) {
    for (let x = 0; x < outputCanvas.width; x += 1) {
      const sourceX = targetBullseye.x + (x - patternBullseye.x) * scale;
      const sourceY = targetBullseye.y + (y - patternBullseye.y) * scale;
      const outputIndex = (y * outputCanvas.width + x) * 4;

      if (
        sourceX < 0
        || sourceX >= targetCanvas.width
        || sourceY < 0
        || sourceY >= targetCanvas.height
      ) {
        outputImageData.data[outputIndex] = 245;
        outputImageData.data[outputIndex + 1] = 245;
        outputImageData.data[outputIndex + 2] = 242;
        outputImageData.data[outputIndex + 3] = 255;
        continue;
      }

      const pixel = samplePixel(
        sourceImageData.data,
        targetCanvas.width,
        targetCanvas.height,
        sourceX,
        sourceY
      );

      outputImageData.data[outputIndex] = pixel[0];
      outputImageData.data[outputIndex + 1] = pixel[1];
      outputImageData.data[outputIndex + 2] = pixel[2];
      outputImageData.data[outputIndex + 3] = pixel[3];
    }
  }

  outputContext.putImageData(outputImageData, 0, 0);

  return {
    canvas: outputCanvas,
    description: `centrum dopasowane, skala ${scale.toFixed(2)}x`,
    bullseye: targetBullseye,
  };
}

function warpCanvasToTemplate(
  sourceCanvas: HTMLCanvasElement,
  template: TargetTemplate,
  outputWidth: number,
  outputHeight: number
): PreparedImage {
  const sourceContext = sourceCanvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!sourceContext) {
    throw new Error("Nie udało się przygotować zdjęcia.");
  }

  const sourceImageData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const quad = detectPaperQuad(sourceImageData, template.sheetWidthMm / template.sheetHeightMm);
  const outputCanvas = document.createElement("canvas");
  const outputContext = outputCanvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!outputContext) {
    throw new Error("Nie udało się przygotować kadru wzorca.");
  }

  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;

  const outputImageData = outputContext.createImageData(outputWidth, outputHeight);
  const mapPoint = transformFromRectToQuad(outputWidth, outputHeight, quad);

  for (let y = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      const sourcePoint = mapPoint(x, y);
      const pixel = samplePixel(
        sourceImageData.data,
        sourceCanvas.width,
        sourceCanvas.height,
        sourcePoint.x,
        sourcePoint.y
      );
      const outputIndex = (y * outputWidth + x) * 4;

      outputImageData.data[outputIndex] = pixel[0];
      outputImageData.data[outputIndex + 1] = pixel[1];
      outputImageData.data[outputIndex + 2] = pixel[2];
      outputImageData.data[outputIndex + 3] = pixel[3];
    }
  }

  outputContext.putImageData(outputImageData, 0, 0);

  const quadWidth = Math.round((Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y) + Math.hypot(quad[2].x - quad[3].x, quad[2].y - quad[3].y)) / 2);
  const quadHeight = Math.round((Math.hypot(quad[3].x - quad[0].x, quad[3].y - quad[0].y) + Math.hypot(quad[2].x - quad[1].x, quad[2].y - quad[1].y)) / 2);

  return {
    canvas: outputCanvas,
    description: `${quadWidth} x ${quadHeight} px, dopasowane do ${template.name}`,
  };
}

function outputSizeForTemplate(template: TargetTemplate) {
  const maxSide = maxAnalysisCanvasSide;
  const aspectRatio = template.sheetWidthMm / template.sheetHeightMm;

  if (aspectRatio >= 1) {
    return {
      width: maxSide,
      height: Math.max(1, Math.round(maxSide / aspectRatio)),
    };
  }

  return {
    width: Math.max(1, Math.round(maxSide * aspectRatio)),
    height: maxSide,
  };
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
  context.strokeStyle = "rgba(34, 197, 94, 0.42)";
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

function isOnPrintedScoreAxis(
  component: ComponentBox,
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
  const largestRing = template.rings.reduce(
    (largest, ring) => Math.max(largest, ring.diameterMm),
    0
  );
  const outerRadius = (largestRing * targetScale) / 2;
  const distanceFromCenter = Math.hypot(component.x - centerX, component.y - centerY);
  const axisBand = Math.max(16, Math.round(Math.min(canvasWidth, canvasHeight) * 0.024));

  return (
    distanceFromCenter > outerRadius * 0.18
    && distanceFromCenter < outerRadius * 1.02
    && (
      Math.abs(component.x - centerX) <= axisBand
      || Math.abs(component.y - centerY) <= axisBand
    )
  );
}

function isLikelyPrintedScoreNumber(
  component: ComponentBox,
  canvasWidth: number,
  canvasHeight: number,
  template: TargetTemplate
) {
  if (!isOnPrintedScoreAxis(component, canvasWidth, canvasHeight, template)) {
    return false;
  }

  const shorterSide = Math.min(component.boxWidth, component.boxHeight);
  const longerSide = Math.max(component.boxWidth, component.boxHeight);
  const elongation = longerSide / Math.max(1, shorterSide);
  const canvasMinSide = Math.min(canvasWidth, canvasHeight);
  const smallPrintedMark = (
    longerSide <= Math.max(38, canvasMinSide * 0.038)
    && component.area <= canvasWidth * canvasHeight * 0.00016
  );
  const thinStrokeShape = (
    component.density < 0.48
    && (
      component.circularFill < 0.5
      || elongation > 1.45
      || shorterSide <= Math.max(7, longerSide * 0.48)
    )
  );

  return smallPrintedMark && thinStrokeShape;
}

function distanceToNearestScoringRing(
  component: ComponentBox,
  canvasWidth: number,
  canvasHeight: number,
  template: TargetTemplate
) {
  if (template.rings.length === 0) {
    return null;
  }

  const centerX = canvasWidth * template.centerX;
  const centerY = canvasHeight * template.centerY;
  const targetScale = Math.min(
    canvasWidth / template.sheetWidthMm,
    canvasHeight / template.sheetHeightMm
  );
  const distanceFromCenter = Math.hypot(component.x - centerX, component.y - centerY);

  return template.rings.reduce((nearestDistance, ring) => {
    const ringRadius = (ring.diameterMm * targetScale) / 2;

    return Math.min(nearestDistance, Math.abs(distanceFromCenter - ringRadius));
  }, Number.POSITIVE_INFINITY);
}

function hasImpactMass(component: ComponentBox) {
  const contrastShare = component.darkShare + component.brightShare;
  const compactEnough = component.circularFill >= 0.2 || component.density >= 0.36;

  return (
    compactEnough
    && component.meanDifference >= 44
    && (
      component.darkShare >= 0.2
      || component.brightShare >= 0.18
      || contrastShare >= 0.34
    )
  );
}

function isLikelyPrintedGuideLine(
  component: ComponentBox,
  canvasWidth: number,
  canvasHeight: number,
  template: TargetTemplate
) {
  const ringDistance = distanceToNearestScoringRing(component, canvasWidth, canvasHeight, template);

  if (ringDistance === null) {
    return false;
  }

  const shorterSide = Math.min(component.boxWidth, component.boxHeight);
  const longerSide = Math.max(component.boxWidth, component.boxHeight);
  const elongation = longerSide / Math.max(1, shorterSide);
  const nearRing = ringDistance <= Math.max(8, component.radius * 1.15);
  const lineLike = (
    component.density < 0.43
    && (
      component.circularFill < 0.54
      || elongation > 1.35
      || shorterSide <= Math.max(7, longerSide * 0.46)
    )
  );
  const greenRingInk = component.greenShare > 0.18 && component.darkShare < 0.36;
  const weakRingDifference = component.meanDifference < 92 && component.confidence < 0.34;

  return nearRing && (greenRingInk || (lineLike && weakRingDifference)) && !hasImpactMass(component);
}

function detectShotComponents(
  targetImageData: ImageData,
  patternImageData: ImageData,
  sensitivity: number,
  template: TargetTemplate
): {
  components: ComponentBox[];
  threshold: number;
} {
  const { width, height, data } = targetImageData;
  const patternData = patternImageData.data;
  const pixelCount = width * height;
  const difference = new Uint8Array(pixelCount);
  let totalDifference = 0;

  for (let index = 0; index < pixelCount; index += 1) {
    const dataIndex = index * 4;
    const targetGray = Math.round(
      data[dataIndex] * 0.299
      + data[dataIndex + 1] * 0.587
      + data[dataIndex + 2] * 0.114
    );
    const patternGray = Math.round(
      patternData[dataIndex] * 0.299
      + patternData[dataIndex + 1] * 0.587
      + patternData[dataIndex + 2] * 0.114
    );
    const value = Math.abs(patternGray - targetGray);

    difference[index] = value;
    totalDifference += value;
  }

  const averageDifference = totalDifference / pixelCount;
  let variance = 0;

  for (let index = 0; index < pixelCount; index += 1) {
    variance += (difference[index] - averageDifference) ** 2;
  }

  const standardDeviation = Math.sqrt(variance / pixelCount);
  const threshold = Math.max(
    10,
    Math.min(105, Math.round(averageDifference + standardDeviation * 1.35 - sensitivity))
  );
  const visited = new Uint8Array(pixelCount);
  const components: ComponentBox[] = [];
  const minArea = Math.max(8, Math.round(pixelCount * 0.000006));
  const maxArea = Math.max(120, Math.round(pixelCount * 0.0016));
  const maxBoxSize = Math.min(width, height) * 0.065;
  const stack: number[] = [];
  const marginX = Math.round(width * 0.025);
  const marginY = Math.round(height * 0.025);

  for (let startY = marginY; startY < height - marginY; startY += 1) {
    for (let startX = marginX; startX < width - marginX; startX += 1) {
      const startIndex = startY * width + startX;

      if (visited[startIndex] || difference[startIndex] <= threshold) {
        continue;
      }

      let area = 0;
      let sumX = 0;
      let sumY = 0;
      let strength = 0;
      let minX = startX;
      let maxX = startX;
      let minY = startY;
      let maxY = startY;
      let greenPixels = 0;
      let darkPixels = 0;
      let brightPixels = 0;

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
        strength += difference[currentIndex];

        const currentDataIndex = currentIndex * 4;
        const red = data[currentDataIndex];
        const green = data[currentDataIndex + 1];
        const blue = data[currentDataIndex + 2];
        const targetGray = red * 0.299 + green * 0.587 + blue * 0.114;

        if (green > 95 && green - red > 14 && green - blue > 10) {
          greenPixels += 1;
        }

        if (targetGray < 92) {
          darkPixels += 1;
        }

        if (targetGray > 178) {
          brightPixels += 1;
        }

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
          if (
            neighborIndex <= 0
            || neighborIndex >= pixelCount
            || visited[neighborIndex]
            || difference[neighborIndex] <= threshold
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
      const radius = Math.max(9, Math.sqrt(area / Math.PI) * 1.85);
      const boundingRadius = Math.max(boxWidth, boxHeight) / 2;
      const circularFill = area / Math.max(1, Math.PI * boundingRadius * boundingRadius);
      const meanDifference = strength / area;
      const component = {
        x: sumX / area,
        y: sumY / area,
        radius,
        area,
        boxWidth,
        boxHeight,
        density,
        circularFill,
        greenShare: greenPixels / area,
        darkShare: darkPixels / area,
        brightShare: brightPixels / area,
        meanDifference,
        confidence: Math.min(1, meanDifference / 120) * density,
      };

      if (
        area < minArea
        || area > maxArea
        || boxWidth > maxBoxSize
        || boxHeight > maxBoxSize
        || ratio < 0.38
        || ratio > 2.65
        || density < 0.14
      ) {
        continue;
      }

      if (
        isLikelyPrintedScoreNumber(component, width, height, template)
        || isLikelyPrintedGuideLine(component, width, height, template)
      ) {
        continue;
      }

      components.push(component);
    }
  }

  const mergedComponents: ComponentBox[] = [];
  const mergeDistance = Math.min(width, height) * 0.026;

  [...components]
    .sort((firstComponent, secondComponent) => secondComponent.confidence - firstComponent.confidence)
    .forEach((component) => {
      const duplicate = mergedComponents.some(
        (mergedComponent) => Math.hypot(
          mergedComponent.x - component.x,
          mergedComponent.y - component.y
        ) < mergeDistance
      );

      if (!duplicate) {
        mergedComponents.push(component);
      }
    });

  return {
    components: mergedComponents
      .sort((firstComponent, secondComponent) => firstComponent.y - secondComponent.y || firstComponent.x - secondComponent.x),
    threshold,
  };
}

async function analyzeTargetImage(
  file: File,
  template: TargetTemplate,
  sensitivity: number
): Promise<AnalysisResult> {
  const patternUrl = templateImageSrc(template);

  if (!patternUrl) {
    throw new Error("Najpierw zapisz obraz wzorcowy dla wybranej tarczy.");
  }

  const loadedTarget = await loadImageFile(file);
  const loadedPattern = await loadImageUrl(patternUrl);

  try {
    const outputSize = outputSizeForTemplate(template);
    const targetSourceCanvas = imageToCanvas(loadedTarget.image, maxSourceCanvasSide);
    const patternSourceCanvas = imageToCanvas(loadedPattern.image, maxSourceCanvasSide);
    const preparedTarget = warpCanvasToTemplate(
      targetSourceCanvas,
      template,
      outputSize.width,
      outputSize.height
    );
    const preparedPattern = warpCanvasToTemplate(
      patternSourceCanvas,
      template,
      outputSize.width,
      outputSize.height
    );
    const patternBullseye = detectBullseye(preparedPattern.canvas);
    const alignedTarget = alignCanvasByBullseye(preparedTarget.canvas, patternBullseye);
    const scoringTemplate = patternBullseye
      ? {
          ...template,
          centerX: patternBullseye.x / outputSize.width,
          centerY: patternBullseye.y / outputSize.height,
        }
      : template;
    const targetContext = alignedTarget.canvas.getContext("2d", {
      willReadFrequently: true,
    });
    const patternContext = preparedPattern.canvas.getContext("2d", {
      willReadFrequently: true,
    });

    if (!targetContext || !patternContext) {
      throw new Error("Nie udało się przygotować porównania.");
    }

    const targetImageData = targetContext.getImageData(0, 0, outputSize.width, outputSize.height);
    const patternImageData = patternContext.getImageData(0, 0, outputSize.width, outputSize.height);
    const detection = detectShotComponents(
      targetImageData,
      patternImageData,
      sensitivity,
      scoringTemplate
    );
    const shots = detection.components
      .filter((component) => pointInScoringArea(
        component.x,
        component.y,
        outputSize.width,
        outputSize.height,
        scoringTemplate
      ))
      .map((component) => ({
        x: component.x,
        y: component.y,
        radius: component.radius,
        score: getScoreForPoint(
          component.x,
          component.y,
          outputSize.width,
          outputSize.height,
          scoringTemplate
        ),
        confidence: component.confidence,
      }))
      .filter((shot) => shot.score > 0)
      .map((shot, index) => ({
        ...shot,
        id: index + 1,
      }));

    drawScoringRings(targetContext, outputSize.width, outputSize.height, scoringTemplate);

    return {
      imageUrl: alignedTarget.canvas.toDataURL("image/jpeg", 0.92),
      imageWidth: outputSize.width,
      imageHeight: outputSize.height,
      shots,
      totalScore: shots.reduce((sum, shot) => sum + shot.score, 0),
      threshold: detection.threshold,
      cropDescription: `${preparedTarget.description}; ${alignedTarget.description}`,
    };
  } finally {
    loadedTarget.revoke?.();
  }
}

export default function TargetScoringBeta() {
  const [templates, setTemplates] = useState<TargetTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [targetFile, setTargetFile] = useState<File | null>(null);
  const [targetFileName, setTargetFileName] = useState("");
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [templateFileName, setTemplateFileName] = useState("");
  const [saveMode, setSaveMode] = useState("selected");
  const [templateName, setTemplateName] = useState("Własna tarcza");
  const [templateWidth, setTemplateWidth] = useState(500);
  const [templateHeight, setTemplateHeight] = useState(500);
  const [sensitivity, setSensitivity] = useState(0);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [showShotMarkers, setShowShotMarkers] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState("");

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) || templates[0],
    [selectedTemplateId, templates]
  );
  const selectedTemplateHasImage = Boolean(selectedTemplate?.imageUrl);

  function prepareTemplateForm(template: TargetTemplate) {
    setTemplateName(template.name);
    setTemplateWidth(template.sheetWidthMm);
    setTemplateHeight(template.sheetHeightMm);
  }

  useEffect(() => {
    let active = true;

    async function loadTemplates() {
      const token = getAccessToken();

      try {
        setLoadingTemplates(true);
        const response = await fetch(apiUrl("/admin/beta-target-templates"), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const data: ApiTargetTemplate[] | { detail?: string } = await response.json();

        if (!active) {
          return;
        }

        if (!response.ok || !Array.isArray(data)) {
          setMessage("Nie udało się pobrać listy wzorców.");
          return;
        }

        const nextTemplates = data.map(apiTemplateToTargetTemplate);
        setTemplates(nextTemplates);
        setSelectedTemplateId((currentId) => currentId || nextTemplates[0]?.id || "");

        if (nextTemplates[0]) {
          prepareTemplateForm(nextTemplates[0]);
        }
      } catch (error) {
        console.error(error);
        if (active) {
          setMessage("Błąd połączenia przy pobieraniu wzorców.");
        }
      } finally {
        if (active) {
          setLoadingTemplates(false);
        }
      }
    }

    void loadTemplates();

    return () => {
      active = false;
    };
  }, []);

  function handleTargetFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;

    setTargetFile(file);
    setTargetFileName(file?.name || "");
    setResult(null);
    setResultOpen(false);
    setAccepted(false);
    setMessage("");

    if (file) {
      void runAnalysis(file);
    }
  }

  function handleTemplateFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;

    setTemplateFile(file);
    setTemplateFileName(file?.name || "");
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!templateFile) {
      setMessage("Dodaj plik obrazu wzorcowego.");
      return;
    }

    const baseTemplate = saveMode === "new" ? null : selectedTemplate;
    const width = Math.max(50, templateWidth);
    const height = Math.max(50, templateHeight);
    const rings = baseTemplate?.rings || generatedRingsForSize(width, height);
    const formData = new FormData();
    const token = getAccessToken();

    formData.set("template_id", baseTemplate?.id || "");
    formData.set("name", templateName.trim() || "Własna tarcza");
    formData.set("source", baseTemplate?.source || "wzór własny");
    formData.set("sheet_width_mm", String(width));
    formData.set("sheet_height_mm", String(height));
    formData.set("center_x", String(baseTemplate?.centerX ?? 0.5));
    formData.set("center_y", String(baseTemplate?.centerY ?? 0.5));
    formData.set(
      "rings_json",
      JSON.stringify(rings.map((ring) => ({
        score: ring.score,
        diameter_mm: ring.diameterMm,
      })))
    );
    formData.set("image", templateFile);

    try {
      setSavingTemplate(true);
      setMessage("");
      const response = await fetch(apiUrl("/admin/beta-target-templates"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });
      const data: ApiTargetTemplate | { detail?: string } = await response.json();

      if (!response.ok) {
        setMessage(("detail" in data && data.detail) || "Nie udało się zapisać wzorca.");
        return;
      }

      if (!("id" in data)) {
        setMessage("Nie udało się zapisać wzorca.");
        return;
      }

      const savedTemplate = apiTemplateToTargetTemplate(data);
      setTemplates((currentTemplates) => {
        const exists = currentTemplates.some((template) => template.id === savedTemplate.id);

        return exists
          ? currentTemplates.map((template) => template.id === savedTemplate.id ? savedTemplate : template)
          : [...currentTemplates, savedTemplate];
      });
      setSelectedTemplateId(savedTemplate.id);
      setTemplateFile(null);
      setTemplateFileName("");
      setSaveMode("selected");
      setResult(null);
      setResultOpen(false);
      setAccepted(false);
      setMessage("Wzorzec zapisany w systemie.");
    } catch (error) {
      console.error(error);
      setMessage("Błąd połączenia przy zapisie wzorca.");
    } finally {
      setSavingTemplate(false);
    }
  }

  async function runAnalysis(fileOverride?: File) {
    if (!selectedTemplate) {
      setMessage("Wybierz wzorzec tarczy.");
      return;
    }

    if (!selectedTemplate.imageUrl) {
      setMessage("Ten wzorzec nie ma jeszcze zapisanego obrazu. Najpierw wgraj i zapisz obraz wzorcowy.");
      return;
    }

    const fileToAnalyze = fileOverride || targetFile;

    if (!fileToAnalyze) {
      setMessage("Dodaj zdjęcie tarczy do analizy.");
      return;
    }

    try {
      setWorking(true);
      setAccepted(false);
      setResultOpen(false);
      setMessage("");
      const nextResult = await analyzeTargetImage(
        fileToAnalyze,
        selectedTemplate,
        sensitivity
      );

      setResult(nextResult);
      setShowShotMarkers(true);
      setResultOpen(true);
      setMessage("Zdjęcie przycięte, dopasowane do wzorca i przeanalizowane.");
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
              <p className="font-bold text-gray-400">Wzorzec</p>
              <p className="mt-1 text-lg font-black text-white">{selectedTemplate?.name || "-"}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
              <p className="font-bold text-gray-400">Obraz</p>
              <p className={`mt-1 text-lg font-black ${selectedTemplateHasImage ? "text-green-300" : "text-yellow-300"}`}>
                {selectedTemplateHasImage ? "zapisany" : "brak"}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
              <p className="font-bold text-gray-400">Strzały</p>
              <p className="mt-1 text-lg font-black text-white">{result?.shots.length ?? 0}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3">
              <p className="font-bold text-gray-400">Wynik</p>
              <p className="mt-1 text-lg font-black text-white">{result?.totalScore ?? "-"}</p>
            </div>
          </div>
        </div>

        {message && (
          <p className="mt-5 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 font-semibold text-gray-100">
            {message}
          </p>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,25rem)_minmax(0,1fr)]">
        <section className="ui-block space-y-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
          <div>
            <h3 className="text-xl font-black text-white">
              Lista wzorców
            </h3>

            <div className="mt-4 grid gap-2">
              {loadingTemplates ? (
                <p className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-gray-400">
                  Ładowanie wzorców...
                </p>
              ) : templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    setSelectedTemplateId(template.id);
                    prepareTemplateForm(template);
                    setSaveMode("selected");
                    setResult(null);
                    setResultOpen(false);
                    setAccepted(false);
                    setMessage("");
                  }}
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    selectedTemplate?.id === template.id
                      ? "border-green-500 bg-green-950/50 text-white"
                      : "border-zinc-800 bg-zinc-950 text-gray-300 hover:border-zinc-600"
                  }`}
                >
                  <span className="block font-black">{template.name}</span>
                  <span className="mt-1 block text-sm text-gray-400">
                    {template.sheetWidthMm} x {template.sheetHeightMm} mm · {template.source}
                  </span>
                  <span className={`mt-2 inline-block rounded-full px-2 py-1 text-xs font-black ${
                    template.imageUrl
                      ? "bg-green-500/15 text-green-200"
                      : "bg-yellow-500/15 text-yellow-200"
                  }`}>
                    {template.imageUrl ? "obraz wzorcowy zapisany" : "wgraj obraz wzorcowy"}
                  </span>
                </button>
              ))}
            </div>

            {selectedTemplate?.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={templateImageSrc(selectedTemplate)}
                alt="Zapisany wzorzec tarczy"
                className="mt-4 max-h-56 w-full rounded-xl border border-zinc-800 bg-zinc-950 object-contain"
              />
            )}
          </div>

          <form
            onSubmit={(event) => void saveTemplate(event)}
            className="border-t border-zinc-800 pt-5"
          >
            <h3 className="text-xl font-black text-white">
              Zapisz wzorzec
            </h3>

            <div className="mt-4 grid gap-3">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-zinc-950 p-1">
                <button
                  type="button"
                  onClick={() => setSaveMode("selected")}
                  className={`rounded-lg px-3 py-2 text-sm font-black transition ${
                    saveMode === "selected"
                      ? "bg-green-700 text-white"
                      : "text-gray-300 hover:bg-zinc-800"
                  }`}
                >
                  Aktualizuj
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSaveMode("new");
                    setTemplateName("Własna tarcza");
                    setTemplateWidth(500);
                    setTemplateHeight(500);
                  }}
                  className={`rounded-lg px-3 py-2 text-sm font-black transition ${
                    saveMode === "new"
                      ? "bg-green-700 text-white"
                      : "text-gray-300 hover:bg-zinc-800"
                  }`}
                >
                  Nowy
                </button>
              </div>

              <input
                type="text"
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white"
              />

              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="mb-2 block text-sm font-bold text-gray-300">Szer. mm</span>
                  <input
                    type="number"
                    min={50}
                    value={templateWidth}
                    onChange={(event) => setTemplateWidth(Number(event.target.value))}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-sm font-bold text-gray-300">Wys. mm</span>
                  <input
                    type="number"
                    min={50}
                    value={templateHeight}
                    onChange={(event) => setTemplateHeight(Number(event.target.value))}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white"
                  />
                </label>
              </div>

              <label className="block rounded-xl border border-dashed border-zinc-700 bg-zinc-950 px-4 py-4 text-gray-200">
                <span className="block font-bold">Obraz wzorcowy</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleTemplateFileChange}
                  className="mt-3 block w-full text-sm text-gray-300 file:mr-4 file:rounded-lg file:border-0 file:bg-green-700 file:px-4 file:py-2 file:font-bold file:text-white"
                />
                {templateFileName && (
                  <span className="mt-2 block text-sm text-green-300">{templateFileName}</span>
                )}
              </label>

              <button
                type="submit"
                disabled={savingTemplate}
                className="ui-button rounded-xl bg-green-700 px-5 py-3 font-black text-white transition hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-zinc-700"
              >
                {savingTemplate ? "Zapisuję..." : "Zapisz wzorzec w systemie"}
              </button>
            </div>
          </form>

          <div className="border-t border-zinc-800 pt-5">
            <h3 className="text-xl font-black text-white">
              Zdjęcie do analizy
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

              {working && (
                <p className="rounded-xl border border-green-700/40 bg-green-700/10 px-4 py-3 text-sm font-bold text-green-100">
                  Analizuję zdjęcie...
                </p>
              )}

              <label>
                <span className="mb-2 block text-sm font-bold text-gray-300">
                  Czułość różnicy: {sensitivity}
                </span>
                <input
                  type="range"
                  min={-25}
                  max={35}
                  value={sensitivity}
                  onChange={(event) => setSensitivity(Number(event.target.value))}
                  className="w-full accent-red-600"
                />
              </label>

              <button
                type="button"
                onClick={() => void runAnalysis()}
                disabled={working || !selectedTemplateHasImage || !targetFile}
                className="ui-button rounded-xl bg-green-700 px-5 py-3 font-black text-white transition hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-zinc-700"
              >
                {working ? "Dopasowuję..." : "Analizuj ponownie"}
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
                  Próg różnicy: {result.threshold} · kadr: {result.cropDescription}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setAccepted(true);
                  setResultOpen(false);
                }}
                disabled={!result}
                className="ui-button rounded-xl bg-green-700 px-5 py-3 font-bold text-white transition hover:bg-green-600 disabled:cursor-not-allowed disabled:bg-zinc-700"
              >
                Akceptuj
              </button>

              <button
                type="button"
                onClick={() => setResultOpen(true)}
                disabled={!result}
                className="ui-button rounded-xl bg-red-700 px-5 py-3 font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-zinc-700"
              >
                Otwórz wynik
              </button>

              <button
                type="button"
                onClick={() => {
                  setAccepted(false);
                  setResult(null);
                  setResultOpen(false);
                }}
                className="ui-button rounded-xl bg-zinc-800 px-5 py-3 font-bold text-white transition hover:bg-zinc-700"
              >
                Wyczyść
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 px-5 py-8 text-center">
            {result ? (
              <div className="mx-auto grid max-w-xl gap-3 text-gray-200">
                <p className="text-3xl font-black text-white">{result.totalScore} pkt</p>
                <p className="font-bold text-gray-300">
                  Wykryte przestrzeliny: {result.shots.length}
                </p>
                <p className="text-sm text-gray-500">
                  Wynik otworzył się w pełnym ekranie po analizie. Możesz wrócić do podglądu przyciskiem „Otwórz wynik”.
                </p>
              </div>
            ) : (
              <div className="flex min-h-[16rem] items-center justify-center px-6 text-center text-gray-500">
                Brak wyniku analizy.
              </div>
            )}
          </div>

          {accepted && (
            <p className="mt-4 rounded-xl border border-green-700/40 bg-green-700/10 px-4 py-3 font-semibold text-green-100">
              Wynik zaakceptowany w beta teście.
            </p>
          )}
        </section>
      </div>

      {result && resultOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Wynik do akceptacji"
          className="fixed inset-0 z-[1000] flex flex-col bg-zinc-950 text-white"
        >
          <div className="flex flex-col gap-3 border-b border-zinc-800 bg-zinc-950/95 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-black">Wynik do akceptacji</h3>
              <p className="mt-1 text-sm text-gray-400">
                {result.shots.length} przestrzelin · {result.totalScore} pkt · próg {result.threshold}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowShotMarkers((currentValue) => !currentValue)}
                className="ui-button rounded-xl bg-zinc-800 px-4 py-3 text-sm font-black text-white transition hover:bg-zinc-700"
              >
                {showShotMarkers ? "Ukryj znaczniki" : "Pokaż znaczniki"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setAccepted(true);
                  setResultOpen(false);
                }}
                className="ui-button rounded-xl bg-green-700 px-4 py-3 text-sm font-black text-white transition hover:bg-green-600"
              >
                Akceptuj
              </button>

              <button
                type="button"
                onClick={() => setResultOpen(false)}
                className="ui-button rounded-xl bg-zinc-800 px-4 py-3 text-sm font-black text-white transition hover:bg-zinc-700"
              >
                Zamknij
              </button>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="min-h-0 overflow-auto rounded-xl border border-zinc-800 bg-black p-2">
              <div
                className="relative mx-auto w-full max-w-full"
                style={{ aspectRatio: `${result.imageWidth} / ${result.imageHeight}` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={result.imageUrl}
                  alt="Zdjęcie tarczy dopasowane do wzorca"
                  className="absolute inset-0 h-full w-full object-contain"
                />

                {showShotMarkers && result.shots.map((shot) => {
                  const markerRadius = Math.max(shot.radius, 14);

                  return (
                    <div key={shot.id}>
                      <span
                        className="pointer-events-none absolute rounded-full border-[3px] border-red-500"
                        style={{
                          left: `${(shot.x / result.imageWidth) * 100}%`,
                          top: `${(shot.y / result.imageHeight) * 100}%`,
                          width: `${((markerRadius * 2) / result.imageWidth) * 100}%`,
                          aspectRatio: "1 / 1",
                          transform: "translate(-50%, -50%)",
                        }}
                      />
                      <span
                        className="pointer-events-none absolute text-lg font-black text-red-500"
                        style={{
                          left: `${((shot.x + markerRadius + 8) / result.imageWidth) * 100}%`,
                          top: `${((shot.y - markerRadius - 8) / result.imageHeight) * 100}%`,
                        }}
                      >
                        {shot.score}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="min-h-0 overflow-auto rounded-xl border border-zinc-800 bg-zinc-900">
              <div className="sticky top-0 grid grid-cols-[64px_1fr_1fr] border-b border-zinc-800 bg-zinc-900 px-4 py-3 text-sm font-black text-gray-400">
                <p>Nr</p>
                <p>Punkt</p>
                <p>Pewność</p>
              </div>

              {result.shots.map((shot) => (
                <div
                  key={shot.id}
                  className="grid grid-cols-[64px_1fr_1fr] border-b border-zinc-800 px-4 py-3 text-sm text-gray-200 last:border-b-0"
                >
                  <p className="font-black text-white">{shot.id}</p>
                  <p>{shot.score}</p>
                  <p>{Math.round(shot.confidence * 100)}%</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
