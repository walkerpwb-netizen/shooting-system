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

type TargetGeometry = {
  centerX: number;
  centerY: number;
  outerRadius: number;
  zoneWidth: number;
  confidence: number;
};

type DetectedShot = {
  x: number;
  y: number;
  radius: number;
  score: number;
  confidence: number;
};

type ScanResult = {
  imageUrl: string;
  width: number;
  height: number;
  shots: DetectedShot[];
  totalScore: number;
  geometryConfidence: number;
  patternCount: number;
};

type ShotTearPattern = {
  edgeDensity: number;
  radialCoverage: number;
  lineDominance: number;
  ringDominance: number;
  coreComplexity: number;
  annulusComplexity: number;
  edgeMean: number;
  centerRange: number;
};

type ShotShapeScore = {
  confidence: number;
  edgeDensity: number;
  radialCoverage: number;
  spokeCount: number;
  lineDominance: number;
  ringDominance: number;
  coreComplexity: number;
  annulusComplexity: number;
  edgeMean: number;
  centerRange: number;
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

type LineCandidate = {
  theta: number;
  rho: number;
  score: number;
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

const FOCUS_SETTLE_MS = 450;
const TARGET_SAMPLE_ANGLES = 144;
const SHOT_COMPONENT_SCAN_LIMIT = 90_000;
const MAX_DETECTED_SHOTS = 24;
const DOCUMENT_ANALYSIS_SIDE = 900;
const DOCUMENT_RHO_STEP = 4;
const MIN_WARP_CONFIDENCE = 0.42;
const MIN_CONFIDENT_CROP = 0.5;
const APPROVED_SHOT_PATTERN_COUNT = 51;
const SHOT_TEAR_PROFILE: ShotTearPattern = {
  edgeDensity: 0.2275,
  radialCoverage: 0.7917,
  lineDominance: 0.0951,
  ringDominance: 0.1962,
  coreComplexity: 0.3552,
  annulusComplexity: 0.1993,
  edgeMean: 121.5439,
  centerRange: 85,
};
const SHOT_TEAR_TOLERANCE: ShotTearPattern = {
  edgeDensity: 0.105,
  radialCoverage: 0.28,
  lineDominance: 0.085,
  ringDominance: 0.14,
  coreComplexity: 0.34,
  annulusComplexity: 0.095,
  edgeMean: 105,
  centerRange: 98,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

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

function lineIntersection(firstLine: LineCandidate, secondLine: LineCandidate): PaperPoint | null {
  const firstCos = Math.cos(firstLine.theta);
  const firstSin = Math.sin(firstLine.theta);
  const secondCos = Math.cos(secondLine.theta);
  const secondSin = Math.sin(secondLine.theta);
  const determinant = firstCos * secondSin - secondCos * firstSin;

  if (Math.abs(determinant) < 0.0001) {
    return null;
  }

  return {
    x: (firstLine.rho * secondSin - secondLine.rho * firstSin) / determinant,
    y: (firstCos * secondLine.rho - secondCos * firstLine.rho) / determinant,
  };
}

function distanceBetweenPoints(firstPoint: PaperPoint, secondPoint: PaperPoint) {
  return Math.hypot(firstPoint.x - secondPoint.x, firstPoint.y - secondPoint.y);
}

function polygonArea(points: PaperBounds["polygon"]) {
  let area = 0;

  points.forEach((point, index) => {
    const nextPoint = points[(index + 1) % points.length];

    area += point.x * nextPoint.y - nextPoint.x * point.y;
  });

  return Math.abs(area) / 2;
}

function pointInsideImage(point: PaperPoint, width: number, height: number, margin: number) {
  return (
    point.x >= -margin
    && point.y >= -margin
    && point.x <= width + margin
    && point.y <= height + margin
  );
}

function angleDistance(firstAngle: number, secondAngle: number) {
  const difference = Math.abs(firstAngle - secondAngle) % Math.PI;

  return Math.min(difference, Math.PI - difference);
}

function isNearExistingLine(lines: LineCandidate[], nextLine: LineCandidate, minRhoDistance: number) {
  return lines.some((line) => (
    angleDistance(line.theta, nextLine.theta) < (3 * Math.PI) / 180
    && Math.abs(line.rho - nextLine.rho) < minRhoDistance
  ));
}

function createLumaAndEdges(imageData: ImageData, width: number, height: number) {
  const luma = new Float32Array(width * height);

  for (let index = 0, pixel = 0; index < imageData.data.length; index += 4, pixel += 1) {
    const red = imageData.data[index];
    const green = imageData.data[index + 1];
    const blue = imageData.data[index + 2];

    luma[pixel] = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  }

  const magnitudes = new Float32Array(width * height);
  const histogram = Array.from({ length: 256 }, () => 0);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const pixel = y * width + x;
      const topLeft = luma[pixel - width - 1];
      const top = luma[pixel - width];
      const topRight = luma[pixel - width + 1];
      const left = luma[pixel - 1];
      const right = luma[pixel + 1];
      const bottomLeft = luma[pixel + width - 1];
      const bottom = luma[pixel + width];
      const bottomRight = luma[pixel + width + 1];
      const gradientX = -topLeft - 2 * left - bottomLeft + topRight + 2 * right + bottomRight;
      const gradientY = -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight;
      const magnitude = Math.min(255, Math.round(Math.hypot(gradientX, gradientY) / 4));

      magnitudes[pixel] = magnitude;
      histogram[magnitude] += 1;
    }
  }

  const threshold = clamp(
    getPercentileFromHistogram(histogram, Math.max(1, (width - 2) * (height - 2)), 0.88),
    28,
    92
  );
  const edgePixels: Array<{
    x: number;
    y: number;
    weight: number;
  }> = [];
  const maxEdgePixels = 24_000;
  const samplingStep = Math.max(1, Math.ceil((width * height) / 650_000));

  for (let y = 2; y < height - 2; y += samplingStep) {
    for (let x = 2; x < width - 2; x += samplingStep) {
      const pixel = y * width + x;
      const magnitude = magnitudes[pixel];

      if (magnitude >= threshold) {
        edgePixels.push({
          x,
          y,
          weight: magnitude,
        });

        if (edgePixels.length >= maxEdgePixels) {
          return {
            luma,
            magnitudes,
            edgePixels,
          };
        }
      }
    }
  }

  return {
    luma,
    magnitudes,
    edgePixels,
  };
}

function collectLineCandidates(
  edgePixels: Array<{ x: number; y: number; weight: number }>,
  width: number,
  height: number,
  angleStart: number,
  angleEnd: number,
  maxLines: number
) {
  const diagonal = Math.hypot(width, height);
  const rhoBins = Math.ceil((diagonal * 2) / DOCUMENT_RHO_STEP) + 1;
  const candidates: LineCandidate[] = [];

  for (let degrees = angleStart; degrees <= angleEnd; degrees += 2) {
    const theta = (degrees * Math.PI) / 180;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    const accumulator = new Float32Array(rhoBins);

    edgePixels.forEach((edgePixel) => {
      const rho = edgePixel.x * cos + edgePixel.y * sin;
      const rhoIndex = Math.round((rho + diagonal) / DOCUMENT_RHO_STEP);

      if (rhoIndex >= 0 && rhoIndex < rhoBins) {
        accumulator[rhoIndex] += edgePixel.weight;
      }
    });

    for (let rhoIndex = 1; rhoIndex < rhoBins - 1; rhoIndex += 1) {
      const score = accumulator[rhoIndex];

      if (
        score > accumulator[rhoIndex - 1]
        && score >= accumulator[rhoIndex + 1]
        && score > 2200
      ) {
        candidates.push({
          theta,
          rho: rhoIndex * DOCUMENT_RHO_STEP - diagonal,
          score,
        });
      }
    }
  }

  return candidates
    .sort((left, right) => right.score - left.score)
    .reduce<LineCandidate[]>((lines, line) => {
      if (lines.length >= maxLines) {
        return lines;
      }

      if (!isNearExistingLine(lines, line, Math.min(width, height) * 0.04)) {
        lines.push(line);
      }

      return lines;
    }, []);
}

function lineSupport(
  magnitudes: Float32Array,
  width: number,
  height: number,
  startPoint: PaperPoint,
  endPoint: PaperPoint
) {
  const length = distanceBetweenPoints(startPoint, endPoint);
  const samples = Math.max(24, Math.round(length / 8));
  let support = 0;
  let checked = 0;

  for (let index = 0; index <= samples; index += 1) {
    const fraction = index / samples;
    const x = Math.round(startPoint.x + (endPoint.x - startPoint.x) * fraction);
    const y = Math.round(startPoint.y + (endPoint.y - startPoint.y) * fraction);
    let bestMagnitude = 0;

    for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
      for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
        const sampleX = x + offsetX;
        const sampleY = y + offsetY;

        if (sampleX <= 0 || sampleY <= 0 || sampleX >= width - 1 || sampleY >= height - 1) {
          continue;
        }

        bestMagnitude = Math.max(bestMagnitude, magnitudes[sampleY * width + sampleX]);
      }
    }

    checked += 1;

    if (bestMagnitude >= 34) {
      support += 1;
    }
  }

  return support / Math.max(1, checked);
}

function detectClosedEdgeContour(imageData: ImageData, width: number, height: number): PaperBounds | null {
  const { magnitudes } = createLumaAndEdges(imageData, width, height);
  const samples: number[] = [];
  const sampleStep = Math.max(1, Math.round((width * height) / 120_000));

  for (let pixel = 0; pixel < magnitudes.length; pixel += sampleStep) {
    samples.push(magnitudes[pixel]);
  }

  const edgeThreshold = clamp(percentile(samples, 0.9), 30, 74);
  const barrier = new Uint8Array(width * height);
  const dilationRadius = Math.max(1, Math.round(Math.min(width, height) / 360));

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (magnitudes[y * width + x] < edgeThreshold) {
        continue;
      }

      for (let offsetY = -dilationRadius; offsetY <= dilationRadius; offsetY += 1) {
        for (let offsetX = -dilationRadius; offsetX <= dilationRadius; offsetX += 1) {
          const nextX = x + offsetX;
          const nextY = y + offsetY;

          if (nextX <= 0 || nextY <= 0 || nextX >= width - 1 || nextY >= height - 1) {
            continue;
          }

          barrier[nextY * width + nextX] = 1;
        }
      }
    }
  }

  const outside = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let queueStart = 0;
  let queueEnd = 0;

  function enqueue(pixel: number) {
    if (pixel < 0 || pixel >= outside.length || outside[pixel] || barrier[pixel]) {
      return;
    }

    outside[pixel] = 1;
    queue[queueEnd] = pixel;
    queueEnd += 1;
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }

  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (queueStart < queueEnd) {
    const pixel = queue[queueStart];
    queueStart += 1;
    const x = pixel % width;

    enqueue(pixel - width);
    enqueue(pixel + width);

    if (x > 0) {
      enqueue(pixel - 1);
    }

    if (x < width - 1) {
      enqueue(pixel + 1);
    }
  }

  const visited = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  const minArea = width * height * 0.04;
  let bestBounds: PaperBounds | null = null;
  let bestScore = 0;

  for (let startPixel = 0; startPixel < visited.length; startPixel += 1) {
    if (outside[startPixel] || visited[startPixel]) {
      continue;
    }

    let stackLength = 0;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let edgeTouches = 0;
    let topLeft: PaperPoint | null = null;
    let topRight: PaperPoint | null = null;
    let bottomRight: PaperPoint | null = null;
    let bottomLeft: PaperPoint | null = null;
    let topLeftScore = Number.POSITIVE_INFINITY;
    let topRightScore = Number.NEGATIVE_INFINITY;
    let bottomRightScore = Number.NEGATIVE_INFINITY;
    let bottomLeftScore = Number.POSITIVE_INFINITY;

    stack[stackLength] = startPixel;
    stackLength += 1;
    visited[startPixel] = 1;

    while (stackLength > 0) {
      stackLength -= 1;
      const pixel = stack[stackLength];
      const x = pixel % width;
      const y = Math.floor(pixel / width);

      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      if (x <= 1 || y <= 1 || x >= width - 2 || y >= height - 2) {
        edgeTouches += 1;
      }

      const sumScore = x + y;
      const differenceScore = x - y;

      if (sumScore < topLeftScore) {
        topLeftScore = sumScore;
        topLeft = { x, y };
      }

      if (differenceScore > topRightScore) {
        topRightScore = differenceScore;
        topRight = { x, y };
      }

      if (sumScore > bottomRightScore) {
        bottomRightScore = sumScore;
        bottomRight = { x, y };
      }

      if (differenceScore < bottomLeftScore) {
        bottomLeftScore = differenceScore;
        bottomLeft = { x, y };
      }

      const neighbors = [
        pixel - 1,
        pixel + 1,
        pixel - width,
        pixel + width,
      ];

      neighbors.forEach((neighbor) => {
        if (
          neighbor < 0
          || neighbor >= visited.length
          || visited[neighbor]
          || outside[neighbor]
          || stackLength >= stack.length - 1
        ) {
          return;
        }

        const neighborX = neighbor % width;

        if (Math.abs(neighborX - x) > 1) {
          return;
        }

        visited[neighbor] = 1;
        stack[stackLength] = neighbor;
        stackLength += 1;
      });
    }

    if (area < minArea || !topLeft || !topRight || !bottomRight || !bottomLeft) {
      continue;
    }

    const componentWidth = maxX - minX + 1;
    const componentHeight = maxY - minY + 1;
    const aspectRatio = componentWidth / Math.max(1, componentHeight);
    const areaRatio = area / (width * height);
    const boxRatio = (componentWidth * componentHeight) / (width * height);
    const fillRatio = area / Math.max(1, componentWidth * componentHeight);
    const edgeTouchRatio = edgeTouches / Math.max(1, area);

    if (
      componentWidth < width * 0.22
      || componentHeight < height * 0.18
      || aspectRatio < 0.42
      || aspectRatio > 2.35
      || areaRatio > 0.88
      || boxRatio > 0.92
      || fillRatio < 0.16
      || edgeTouchRatio > 0.035
    ) {
      continue;
    }

    const centerX = minX + componentWidth / 2;
    const centerY = minY + componentHeight / 2;
    const centeredness = 1 - Math.min(
      1,
      Math.hypot((centerX - width / 2) / width, (centerY - height / 2) / height) * 1.5
    );
    const polygon = [topLeft, topRight, bottomRight, bottomLeft] as PaperBounds["polygon"];
    const topWidth = distanceBetweenPoints(topLeft, topRight);
    const bottomWidth = distanceBetweenPoints(bottomLeft, bottomRight);
    const leftHeight = distanceBetweenPoints(topLeft, bottomLeft);
    const rightHeight = distanceBetweenPoints(topRight, bottomRight);
    const oppositeWidthRatio = Math.min(topWidth, bottomWidth) / Math.max(1, Math.max(topWidth, bottomWidth));
    const oppositeHeightRatio = Math.min(leftHeight, rightHeight) / Math.max(1, Math.max(leftHeight, rightHeight));
    const contourBalance = clamp((oppositeWidthRatio + oppositeHeightRatio) / 2, 0, 1);
    const score = area * (0.62 + centeredness * 0.22 + contourBalance * 0.16);

    if (score <= bestScore) {
      continue;
    }

    bestScore = score;
    bestBounds = {
      x: minX,
      y: minY,
      width: componentWidth,
      height: componentHeight,
      confidence: clamp(
        centeredness * 0.34
        + contourBalance * 0.28
        + Math.min(1, areaRatio / 0.24) * 0.26
        + Math.min(1, fillRatio / 0.55) * 0.12,
        0,
        1
      ),
      polygon,
    };
  }

  return bestBounds;
}

function detectDocumentByEdges(imageData: ImageData, width: number, height: number): PaperBounds | null {
  const { magnitudes, edgePixels } = createLumaAndEdges(imageData, width, height);

  if (edgePixels.length < 800) {
    return null;
  }

  const verticalLines = collectLineCandidates(edgePixels, width, height, -48, 48, 24);
  const horizontalLines = collectLineCandidates(edgePixels, width, height, 42, 138, 24);
  let bestBounds: PaperBounds | null = null;
  let bestScore = 0;

  for (let leftIndex = 0; leftIndex < verticalLines.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < verticalLines.length; rightIndex += 1) {
      const firstVertical = verticalLines[leftIndex];
      const secondVertical = verticalLines[rightIndex];
      const verticalDelta = Math.abs(firstVertical.rho - secondVertical.rho);

      if (verticalDelta < width * 0.22 || verticalDelta > width * 0.96) {
        continue;
      }

      const orderedVerticals = firstVertical.rho < secondVertical.rho
        ? [firstVertical, secondVertical]
        : [secondVertical, firstVertical];

      for (let topIndex = 0; topIndex < horizontalLines.length; topIndex += 1) {
        for (let bottomIndex = topIndex + 1; bottomIndex < horizontalLines.length; bottomIndex += 1) {
          const firstHorizontal = horizontalLines[topIndex];
          const secondHorizontal = horizontalLines[bottomIndex];
          const horizontalDelta = Math.abs(firstHorizontal.rho - secondHorizontal.rho);

          if (horizontalDelta < height * 0.16 || horizontalDelta > height * 0.96) {
            continue;
          }

          const orderedHorizontals = firstHorizontal.rho < secondHorizontal.rho
            ? [firstHorizontal, secondHorizontal]
            : [secondHorizontal, firstHorizontal];
          const topLeft = lineIntersection(orderedVerticals[0], orderedHorizontals[0]);
          const topRight = lineIntersection(orderedVerticals[1], orderedHorizontals[0]);
          const bottomRight = lineIntersection(orderedVerticals[1], orderedHorizontals[1]);
          const bottomLeft = lineIntersection(orderedVerticals[0], orderedHorizontals[1]);

          if (!topLeft || !topRight || !bottomRight || !bottomLeft) {
            continue;
          }

          const polygon = [topLeft, topRight, bottomRight, bottomLeft] as PaperBounds["polygon"];
          const margin = Math.min(width, height) * 0.08;

          if (!polygon.every((point) => pointInsideImage(point, width, height, margin))) {
            continue;
          }

          const topWidth = distanceBetweenPoints(topLeft, topRight);
          const bottomWidth = distanceBetweenPoints(bottomLeft, bottomRight);
          const leftHeight = distanceBetweenPoints(topLeft, bottomLeft);
          const rightHeight = distanceBetweenPoints(topRight, bottomRight);
          const averageWidth = (topWidth + bottomWidth) / 2;
          const averageHeight = (leftHeight + rightHeight) / 2;
          const aspectRatio = averageWidth / Math.max(1, averageHeight);
          const area = polygonArea(polygon);
          const areaRatio = area / (width * height);
          const oppositeWidthRatio = Math.min(topWidth, bottomWidth) / Math.max(topWidth, bottomWidth);
          const oppositeHeightRatio = Math.min(leftHeight, rightHeight) / Math.max(leftHeight, rightHeight);

          if (
            areaRatio < 0.14
            || areaRatio > 0.86
            || aspectRatio < 0.76
            || aspectRatio > 1.32
            || oppositeWidthRatio < 0.56
            || oppositeHeightRatio < 0.56
          ) {
            continue;
          }

          const edgeSupport = (
            lineSupport(magnitudes, width, height, topLeft, topRight)
            + lineSupport(magnitudes, width, height, topRight, bottomRight)
            + lineSupport(magnitudes, width, height, bottomRight, bottomLeft)
            + lineSupport(magnitudes, width, height, bottomLeft, topLeft)
          ) / 4;
          const centerX = (topLeft.x + topRight.x + bottomRight.x + bottomLeft.x) / 4;
          const centerY = (topLeft.y + topRight.y + bottomRight.y + bottomLeft.y) / 4;
          const centeredness = 1 - Math.min(
            1,
            Math.hypot((centerX - width / 2) / width, (centerY - height / 2) / height) * 1.5
          );
          const lineScore = (
            orderedVerticals[0].score
            + orderedVerticals[1].score
            + orderedHorizontals[0].score
            + orderedHorizontals[1].score
          ) / 4;
          const squareScore = 1 - clamp(Math.abs(1 - aspectRatio) / 0.32, 0, 1);
          const sizeScore = clamp(areaRatio / 0.32, 0, 1);
          const score = edgeSupport * 2.4
            + squareScore * 1.35
            + sizeScore * 1.15
            + centeredness * 0.55
            + lineScore / 60_000;

          if (edgeSupport < 0.22 || score <= bestScore) {
            continue;
          }

          bestScore = score;
          bestBounds = {
            x: Math.max(0, Math.floor(Math.min(...polygon.map((point) => point.x)))),
            y: Math.max(0, Math.floor(Math.min(...polygon.map((point) => point.y)))),
            width: Math.min(
              width,
              Math.ceil(Math.max(...polygon.map((point) => point.x)) - Math.min(...polygon.map((point) => point.x)))
            ),
            height: Math.min(
              height,
              Math.ceil(Math.max(...polygon.map((point) => point.y)) - Math.min(...polygon.map((point) => point.y)))
            ),
            confidence: clamp(edgeSupport * 0.5 + squareScore * 0.28 + sizeScore * 0.14 + centeredness * 0.08, 0, 1),
            polygon,
          };
        }
      }
    }
  }

  return bestBounds;
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

function findLargestPaperComponent(mask: Uint8Array, width: number, height: number): PaperBounds | null {
  const visited = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  let bestBounds: PaperBounds | null = null;
  let bestScore = 0;
  const minArea = width * height * 0.035;

  for (let startPixel = 0; startPixel < mask.length; startPixel += 1) {
    if (!mask[startPixel] || visited[startPixel]) {
      continue;
    }

    let stackLength = 0;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let edgeTouches = 0;

    stack[stackLength] = startPixel;
    stackLength += 1;
    visited[startPixel] = 1;

    while (stackLength > 0) {
      stackLength -= 1;
      const pixel = stack[stackLength];
      const x = pixel % width;
      const y = Math.floor(pixel / width);

      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      if (x <= 1 || y <= 1 || x >= width - 2 || y >= height - 2) {
        edgeTouches += 1;
      }

      const neighbors = [
        pixel - 1,
        pixel + 1,
        pixel - width,
        pixel + width,
        pixel - width - 1,
        pixel - width + 1,
        pixel + width - 1,
        pixel + width + 1,
      ];

      neighbors.forEach((neighbor) => {
        if (
          neighbor < 0
          || neighbor >= mask.length
          || visited[neighbor]
          || !mask[neighbor]
          || stackLength >= stack.length - 1
        ) {
          return;
        }

        const neighborX = neighbor % width;

        if (Math.abs(neighborX - x) > 1) {
          return;
        }

        visited[neighbor] = 1;
        stack[stackLength] = neighbor;
        stackLength += 1;
      });
    }

    if (area < minArea) {
      continue;
    }

    const componentWidth = maxX - minX + 1;
    const componentHeight = maxY - minY + 1;
    const boundingArea = componentWidth * componentHeight;
    const fillRatio = area / Math.max(1, boundingArea);
    const aspectRatio = componentWidth / Math.max(1, componentHeight);
    const imageCoverage = boundingArea / (width * height);
    const edgeTouchRatio = edgeTouches / Math.max(1, area);

    if (
      componentWidth < width * 0.24
      || componentHeight < height * 0.14
      || aspectRatio < 0.76
      || aspectRatio > 1.32
      || fillRatio < 0.24
      || imageCoverage > 0.9
      || edgeTouchRatio > 0.06
    ) {
      continue;
    }

    const centeredness = 1 - Math.min(
      1,
      Math.hypot(
        (minX + componentWidth / 2 - width / 2) / width,
        (minY + componentHeight / 2 - height / 2) / height
      ) * 1.8
    );
    const score = area * (0.72 + fillRatio * 0.22 + centeredness * 0.18);

    if (score > bestScore) {
      bestScore = score;
      bestBounds = {
        x: minX,
        y: minY,
        width: componentWidth,
        height: componentHeight,
        confidence: clamp(fillRatio * 0.55 + centeredness * 0.35 + Math.min(1, imageCoverage / 0.2) * 0.1, 0, 1),
        polygon: [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ],
      };
    }
  }

  return bestBounds;
}

function colorBin(red: number, green: number, blue: number) {
  return ((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4);
}

function isCommonBackgroundBin(
  histogram: Uint32Array,
  red: number,
  green: number,
  blue: number,
  threshold: number
) {
  const redBin = red >> 4;
  const greenBin = green >> 4;
  const blueBin = blue >> 4;

  for (let redOffset = -1; redOffset <= 1; redOffset += 1) {
    for (let greenOffset = -1; greenOffset <= 1; greenOffset += 1) {
      for (let blueOffset = -1; blueOffset <= 1; blueOffset += 1) {
        const nextRed = redBin + redOffset;
        const nextGreen = greenBin + greenOffset;
        const nextBlue = blueBin + blueOffset;

        if (
          nextRed < 0
          || nextRed > 15
          || nextGreen < 0
          || nextGreen > 15
          || nextBlue < 0
          || nextBlue > 15
        ) {
          continue;
        }

        if (histogram[(nextRed << 8) | (nextGreen << 4) | nextBlue] >= threshold) {
          return true;
        }
      }
    }
  }

  return false;
}

function morphMask(mask: Uint8Array, width: number, height: number, mode: "dilate" | "erode") {
  const nextMask = new Uint8Array(mask.length);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const pixel = y * width + x;
      let hits = 0;

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          hits += mask[pixel + offsetY * width + offsetX];
        }
      }

      if (
        (mode === "dilate" && hits > 0)
        || (mode === "erode" && hits >= 6)
      ) {
        nextMask[pixel] = 1;
      }
    }
  }

  return nextMask;
}

function detectDocumentByBackgroundSeparation(
  imageData: ImageData,
  width: number,
  height: number
): PaperBounds | null {
  const margin = Math.max(8, Math.round(Math.min(width, height) * 0.06));
  const histogram = new Uint32Array(4096);
  let borderSamples = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (
        x > margin
        && x < width - margin
        && y > margin
        && y < height - margin
      ) {
        continue;
      }

      const index = (y * width + x) * 4;

      histogram[colorBin(imageData.data[index], imageData.data[index + 1], imageData.data[index + 2])] += 1;
      borderSamples += 1;
    }
  }

  const backgroundThreshold = Math.max(3, Math.round(borderSamples * 0.00022));
  const mask = new Uint8Array(width * height);

  for (let index = 0, pixel = 0; index < imageData.data.length; index += 4, pixel += 1) {
    if (
      !isCommonBackgroundBin(
        histogram,
        imageData.data[index],
        imageData.data[index + 1],
        imageData.data[index + 2],
        backgroundThreshold
      )
    ) {
      mask[pixel] = 1;
    }
  }

  const closedMask = morphMask(
    morphMask(
      morphMask(mask, width, height, "dilate"),
      width,
      height,
      "dilate"
    ),
    width,
    height,
    "erode"
  );
  const visited = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  const minArea = width * height * 0.08;
  let bestBounds: PaperBounds | null = null;
  let bestScore = 0;

  for (let startPixel = 0; startPixel < closedMask.length; startPixel += 1) {
    if (!closedMask[startPixel] || visited[startPixel]) {
      continue;
    }

    let stackLength = 0;
    let area = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let edgeTouches = 0;
    let topLeft: PaperPoint | null = null;
    let topRight: PaperPoint | null = null;
    let bottomRight: PaperPoint | null = null;
    let bottomLeft: PaperPoint | null = null;
    let topLeftScore = Number.POSITIVE_INFINITY;
    let topRightScore = Number.NEGATIVE_INFINITY;
    let bottomRightScore = Number.NEGATIVE_INFINITY;
    let bottomLeftScore = Number.POSITIVE_INFINITY;

    stack[stackLength] = startPixel;
    stackLength += 1;
    visited[startPixel] = 1;

    while (stackLength > 0) {
      stackLength -= 1;
      const pixel = stack[stackLength];
      const x = pixel % width;
      const y = Math.floor(pixel / width);

      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      if (x <= 1 || y <= 1 || x >= width - 2 || y >= height - 2) {
        edgeTouches += 1;
      }

      const sumScore = x + y;
      const differenceScore = x - y;

      if (sumScore < topLeftScore) {
        topLeftScore = sumScore;
        topLeft = { x, y };
      }

      if (differenceScore > topRightScore) {
        topRightScore = differenceScore;
        topRight = { x, y };
      }

      if (sumScore > bottomRightScore) {
        bottomRightScore = sumScore;
        bottomRight = { x, y };
      }

      if (differenceScore < bottomLeftScore) {
        bottomLeftScore = differenceScore;
        bottomLeft = { x, y };
      }

      const neighbors = [
        pixel - 1,
        pixel + 1,
        pixel - width,
        pixel + width,
        pixel - width - 1,
        pixel - width + 1,
        pixel + width - 1,
        pixel + width + 1,
      ];

      neighbors.forEach((neighbor) => {
        if (
          neighbor < 0
          || neighbor >= closedMask.length
          || visited[neighbor]
          || !closedMask[neighbor]
          || stackLength >= stack.length - 1
        ) {
          return;
        }

        const neighborX = neighbor % width;

        if (Math.abs(neighborX - x) > 1) {
          return;
        }

        visited[neighbor] = 1;
        stack[stackLength] = neighbor;
        stackLength += 1;
      });
    }

    if (area < minArea || !topLeft || !topRight || !bottomRight || !bottomLeft) {
      continue;
    }

    const componentWidth = maxX - minX + 1;
    const componentHeight = maxY - minY + 1;
    const aspectRatio = componentWidth / Math.max(1, componentHeight);
    const areaRatio = area / (width * height);
    const edgeTouchRatio = edgeTouches / Math.max(1, area);

    if (
      componentWidth < width * 0.28
      || componentHeight < height * 0.22
      || aspectRatio < 0.46
      || aspectRatio > 2.2
      || areaRatio > 0.88
      || edgeTouchRatio > 0.08
    ) {
      continue;
    }

    const polygon = [topLeft, topRight, bottomRight, bottomLeft] as PaperBounds["polygon"];
    const polygonAreaRatio = polygonArea(polygon) / (width * height);
    const fillRatio = area / Math.max(1, componentWidth * componentHeight);
    const score = area * (0.74 + Math.min(1, polygonAreaRatio / 0.28) * 0.16 + fillRatio * 0.1);

    if (score <= bestScore || polygonAreaRatio < 0.1) {
      continue;
    }

    bestScore = score;
    bestBounds = {
      x: minX,
      y: minY,
      width: componentWidth,
      height: componentHeight,
      confidence: clamp(
        Math.min(1, polygonAreaRatio / 0.28) * 0.42
        + Math.min(1, fillRatio / 0.55) * 0.26
        + Math.min(1, areaRatio / 0.26) * 0.22
        + (1 - edgeTouchRatio) * 0.1,
        0,
        1
      ),
      polygon,
    };
  }

  return bestBounds;
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
  const p78 = getPercentileFromHistogram(histogram, pixelCount, 0.78);
  const p92 = getPercentileFromHistogram(histogram, pixelCount, 0.92);
  const paperThreshold = Math.max(
    112,
    Math.min(218, Math.round(Math.max(p78 - 24, p50 + 18, p92 - 58)))
  );
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
    const neutralEnough = chroma <= 64 && yellowCast <= 120;
    const whiteEnough = red >= paperThreshold && green >= paperThreshold && blue >= paperThreshold - 22;
    const shadowPaper = luma >= paperThreshold - 22 && chroma <= 42 && yellowCast <= 92;

    if ((whiteEnough && neutralEnough) || shadowPaper) {
      mask[pixel] = 1;
    }
  }

  return mask;
}

function detectPaperBounds(canvas: HTMLCanvasElement, maxAnalysisSide = DOCUMENT_ANALYSIS_SIDE): PaperBounds {
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
  const backgroundBounds = detectDocumentByBackgroundSeparation(imageData, width, height);
  const documentBounds = detectDocumentByEdges(imageData, width, height);
  const perspectiveBounds = [backgroundBounds, documentBounds]
    .filter((bounds): bounds is PaperBounds => bounds !== null && bounds.confidence >= MIN_WARP_CONFIDENCE)
    .sort((left, right) => right.confidence - left.confidence)[0];

  if (perspectiveBounds) {
    function scalePoint(point: PaperPoint): PaperPoint {
      return {
        x: Math.round(point.x / scale),
        y: Math.round(point.y / scale),
      };
    }

    const polygon = perspectiveBounds.polygon.map(scalePoint) as PaperBounds["polygon"];
    const minX = Math.max(0, Math.floor(Math.min(...polygon.map((point) => point.x))));
    const minY = Math.max(0, Math.floor(Math.min(...polygon.map((point) => point.y))));
    const maxX = Math.min(canvas.width, Math.ceil(Math.max(...polygon.map((point) => point.x))));
    const maxY = Math.min(canvas.height, Math.ceil(Math.max(...polygon.map((point) => point.y))));

    return {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      confidence: perspectiveBounds.confidence,
      polygon,
    };
  }

  const closedContourBounds = detectClosedEdgeContour(imageData, width, height);

  if (closedContourBounds && closedContourBounds.confidence >= 0.48) {
    function scalePoint(point: PaperPoint): PaperPoint {
      return {
        x: Math.round(point.x / scale),
        y: Math.round(point.y / scale),
      };
    }

    const polygon = closedContourBounds.polygon.map(scalePoint) as PaperBounds["polygon"];
    const minX = Math.max(0, Math.floor(Math.min(...polygon.map((point) => point.x))));
    const minY = Math.max(0, Math.floor(Math.min(...polygon.map((point) => point.y))));
    const maxX = Math.min(canvas.width, Math.ceil(Math.max(...polygon.map((point) => point.x))));
    const maxY = Math.min(canvas.height, Math.ceil(Math.max(...polygon.map((point) => point.y))));

    return {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      confidence: closedContourBounds.confidence,
      polygon,
    };
  }

  const mask = makePaperMask(imageData, width, height);
  const componentBounds = findLargestPaperComponent(mask, width, height);

  if (componentBounds && componentBounds.confidence >= MIN_WARP_CONFIDENCE) {
    const marginX = Math.round(componentBounds.width * 0.018);
    const marginY = Math.round(componentBounds.height * 0.018);
    const scaledX = Math.max(0, componentBounds.x - marginX);
    const scaledY = Math.max(0, componentBounds.y - marginY);
    const scaledMaxX = Math.min(width - 1, componentBounds.x + componentBounds.width - 1 + marginX);
    const scaledMaxY = Math.min(height - 1, componentBounds.y + componentBounds.height - 1 + marginY);

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
      confidence: componentBounds.confidence,
      polygon: [
        scalePoint({ x: scaledX, y: scaledY }),
        scalePoint({ x: scaledMaxX, y: scaledY }),
        scalePoint({ x: scaledMaxX, y: scaledMaxY }),
        scalePoint({ x: scaledX, y: scaledMaxY }),
      ],
    };
  }

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
  const paperAspectRatio = paperWidth / Math.max(1, paperHeight);

  if (
    paperWidth < width * 0.22
    || paperHeight < height * 0.22
    || paperAspectRatio < 0.76
    || paperAspectRatio > 1.32
  ) {
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

function solveLinearSystem(matrix: number[][], values: number[]) {
  const size = values.length;
  const augmented = matrix.map((row, index) => [...row, values[index]]);

  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;

    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) {
        pivotRow = row;
      }
    }

    if (Math.abs(augmented[pivotRow][column]) < 1e-8) {
      return null;
    }

    [augmented[column], augmented[pivotRow]] = [augmented[pivotRow], augmented[column]];

    const pivot = augmented[column][column];

    for (let cell = column; cell <= size; cell += 1) {
      augmented[column][cell] /= pivot;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) {
        continue;
      }

      const factor = augmented[row][column];

      for (let cell = column; cell <= size; cell += 1) {
        augmented[row][cell] -= factor * augmented[column][cell];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

function perspectiveCoefficients(
  sourcePoints: PaperBounds["polygon"],
  destinationPoints: PaperBounds["polygon"]
) {
  const matrix: number[][] = [];
  const values: number[] = [];

  sourcePoints.forEach((sourcePoint, index) => {
    const destinationPoint = destinationPoints[index];

    matrix.push([
      sourcePoint.x,
      sourcePoint.y,
      1,
      0,
      0,
      0,
      -destinationPoint.x * sourcePoint.x,
      -destinationPoint.x * sourcePoint.y,
    ]);
    values.push(destinationPoint.x);

    matrix.push([
      0,
      0,
      0,
      sourcePoint.x,
      sourcePoint.y,
      1,
      -destinationPoint.y * sourcePoint.x,
      -destinationPoint.y * sourcePoint.y,
    ]);
    values.push(destinationPoint.y);
  });

  return solveLinearSystem(matrix, values);
}

function warpPerspectiveFromBounds(sourceCanvas: HTMLCanvasElement, bounds: PaperBounds) {
  const [topLeft, topRight, bottomRight, bottomLeft] = bounds.polygon;
  const targetWidth = Math.max(
    1,
    Math.round((distanceBetweenPoints(topLeft, topRight) + distanceBetweenPoints(bottomLeft, bottomRight)) / 2)
  );
  const targetHeight = Math.max(
    1,
    Math.round((distanceBetweenPoints(topLeft, bottomLeft) + distanceBetweenPoints(topRight, bottomRight)) / 2)
  );
  const destinationPoints = [
    { x: 0, y: 0 },
    { x: targetWidth - 1, y: 0 },
    { x: targetWidth - 1, y: targetHeight - 1 },
    { x: 0, y: targetHeight - 1 },
  ] as PaperBounds["polygon"];
  const coefficients = perspectiveCoefficients(destinationPoints, bounds.polygon);

  if (!coefficients) {
    return null;
  }

  const sourceContext = sourceCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  const targetCanvas = document.createElement("canvas");
  const targetContext = targetCanvas.getContext("2d");

  if (!sourceContext || !targetContext) {
    return null;
  }

  const sourceData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const targetImageData = targetContext.createImageData(targetWidth, targetHeight);
  const [a, b, c, d, e, f, g, h] = coefficients;

  targetCanvas.width = targetWidth;
  targetCanvas.height = targetHeight;

  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const divisor = g * x + h * y + 1;
      const sourceX = clamp((a * x + b * y + c) / divisor, 0, sourceCanvas.width - 1);
      const sourceY = clamp((d * x + e * y + f) / divisor, 0, sourceCanvas.height - 1);
      const x0 = Math.floor(sourceX);
      const y0 = Math.floor(sourceY);
      const x1 = Math.min(sourceCanvas.width - 1, x0 + 1);
      const y1 = Math.min(sourceCanvas.height - 1, y0 + 1);
      const wx = sourceX - x0;
      const wy = sourceY - y0;
      const targetIndex = (y * targetWidth + x) * 4;
      const topLeftIndex = (y0 * sourceCanvas.width + x0) * 4;
      const topRightIndex = (y0 * sourceCanvas.width + x1) * 4;
      const bottomLeftIndex = (y1 * sourceCanvas.width + x0) * 4;
      const bottomRightIndex = (y1 * sourceCanvas.width + x1) * 4;

      for (let channel = 0; channel < 4; channel += 1) {
        const top = sourceData.data[topLeftIndex + channel] * (1 - wx)
          + sourceData.data[topRightIndex + channel] * wx;
        const bottom = sourceData.data[bottomLeftIndex + channel] * (1 - wx)
          + sourceData.data[bottomRightIndex + channel] * wx;

        targetImageData.data[targetIndex + channel] = top * (1 - wy) + bottom * wy;
      }
    }
  }

  targetContext.putImageData(targetImageData, 0, 0);

  return targetCanvas;
}

function cropPaperFromCanvas(sourceCanvas: HTMLCanvasElement): CropResult {
  const bounds = detectPaperBounds(sourceCanvas, 1200);
  const warpedCanvas = bounds.confidence >= MIN_WARP_CONFIDENCE
    ? warpPerspectiveFromBounds(sourceCanvas, bounds)
    : null;

  if (warpedCanvas) {
    return {
      imageUrl: warpedCanvas.toDataURL("image/jpeg", 0.92),
      originalWidth: sourceCanvas.width,
      originalHeight: sourceCanvas.height,
      croppedWidth: warpedCanvas.width,
      croppedHeight: warpedCanvas.height,
      paperDetected: bounds.confidence >= MIN_CONFIDENT_CROP,
    };
  }

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
    paperDetected: bounds.confidence >= MIN_CONFIDENT_CROP,
  };
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Nie udało się wczytać obrazu."));
    image.src = source;
  });
}

async function createCanvasFromImage(source: string) {
  const image = await loadImage(source);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!context) {
    throw new Error("Nie udało się przygotować płótna obrazu.");
  }

  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return canvas;
}

function getLumaFromData(imageData: ImageData, width: number, height: number, x: number, y: number) {
  const safeX = clamp(Math.round(x), 0, width - 1);
  const safeY = clamp(Math.round(y), 0, height - 1);
  const index = (safeY * width + safeX) * 4;
  const red = imageData.data[index];
  const green = imageData.data[index + 1];
  const blue = imageData.data[index + 2];

  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function detectTargetGeometry(canvas: HTMLCanvasElement): TargetGeometry {
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });
  const fallbackRadius = Math.min(canvas.width, canvas.height) * 0.47;

  if (!context) {
    return {
      centerX: canvas.width / 2,
      centerY: canvas.height / 2,
      outerRadius: fallbackRadius,
      zoneWidth: fallbackRadius / 10,
      confidence: 0,
    };
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const maxRadius = Math.min(canvas.width, canvas.height) * 0.49;
  const radialDarkness = Array.from(
    { length: Math.max(2, Math.floor(maxRadius) + 1) },
    () => 0
  );
  const angles = Array.from({ length: TARGET_SAMPLE_ANGLES }, (_, index) => {
    const angle = (Math.PI * 2 * index) / TARGET_SAMPLE_ANGLES;

    return {
      sin: Math.sin(angle),
      cos: Math.cos(angle),
    };
  });

  for (let radius = 4; radius < maxRadius; radius += 1) {
    let darkSamples = 0;
    let validSamples = 0;

    angles.forEach((angle) => {
      const x = centerX + angle.cos * radius;
      const y = centerY + angle.sin * radius;

      if (x <= 1 || y <= 1 || x >= canvas.width - 2 || y >= canvas.height - 2) {
        return;
      }

      const luma = getLumaFromData(imageData, canvas.width, canvas.height, x, y);

      validSamples += 1;

      if (luma < 160) {
        darkSamples += 1;
      }
    });

    radialDarkness[radius] = validSamples > 0 ? darkSamples / validSamples : 0;
  }

  const smoothedDarkness = radialDarkness.map((_, radius) => {
    let sum = 0;
    let count = 0;

    for (
      let neighborRadius = Math.max(0, radius - 2);
      neighborRadius <= Math.min(radialDarkness.length - 1, radius + 2);
      neighborRadius += 1
    ) {
      sum += radialDarkness[neighborRadius];
      count += 1;
    }

    return sum / Math.max(1, count);
  });
  let outerRadius = fallbackRadius;
  let confidence = 0;
  const minSearchRadius = Math.round(maxRadius * 0.35);
  const maxSearchRadius = Math.round(maxRadius * 0.99);

  for (let radius = minSearchRadius; radius <= maxSearchRadius; radius += 1) {
    const signal = smoothedDarkness[radius] || 0;
    const before = smoothedDarkness[Math.max(0, radius - 4)] || 0;
    const after = smoothedDarkness[Math.min(smoothedDarkness.length - 1, radius + 4)] || 0;
    const isPeak = signal >= before && signal >= after && signal >= 0.075;

    if (isPeak && radius > outerRadius * 0.68) {
      outerRadius = radius;
      confidence = Math.max(confidence, signal);
    }
  }

  return {
    centerX,
    centerY,
    outerRadius,
    zoneWidth: outerRadius / 10,
    confidence: clamp(confidence / 0.38, 0, 1),
  };
}

function pointScore(geometry: TargetGeometry, x: number, y: number) {
  const distanceFromCenter = Math.hypot(x - geometry.centerX, y - geometry.centerY);

  if (distanceFromCenter > geometry.outerRadius) {
    return 0;
  }

  return clamp(10 - Math.floor(distanceFromCenter / geometry.zoneWidth), 1, 10);
}

function buildShotMask(
  imageData: ImageData,
  width: number,
  height: number,
  geometry: TargetGeometry
) {
  const { luma, magnitudes } = createLumaAndEdges(imageData, width, height);
  const sampledMagnitudes: number[] = [];
  const sampleStep = Math.max(2, Math.round(Math.min(width, height) / 420));

  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      if (pointScore(geometry, x, y) === 0) {
        continue;
      }

      sampledMagnitudes.push(magnitudes[y * width + x]);
    }
  }

  const edgeThreshold = clamp(percentile(sampledMagnitudes, 0.94), 30, 86);
  const mask = new Uint8Array(width * height);

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const x = pixel % width;
    const y = Math.floor(pixel / width);

    if (
      x <= 1
      || y <= 1
      || x >= width - 2
      || y >= height - 2
      || pointScore(geometry, x, y) === 0
      || magnitudes[pixel] < edgeThreshold
    ) {
      continue;
    }

    mask[pixel] = 1;
  }

  return {
    mask: morphMask(mask, width, height, "dilate"),
    luma,
    magnitudes,
    edgeThreshold,
  };
}

function shotProfileDistance(score: Omit<ShotShapeScore, "confidence">) {
  const edgeDensityDistance = Math.abs(score.edgeDensity - SHOT_TEAR_PROFILE.edgeDensity)
    / SHOT_TEAR_TOLERANCE.edgeDensity;
  const radialCoverageDistance = Math.max(0, SHOT_TEAR_PROFILE.radialCoverage - score.radialCoverage)
    / SHOT_TEAR_TOLERANCE.radialCoverage;
  const lineDominanceDistance = Math.max(0, score.lineDominance - SHOT_TEAR_PROFILE.lineDominance)
    / SHOT_TEAR_TOLERANCE.lineDominance;
  const ringDominanceDistance = Math.max(0, score.ringDominance - SHOT_TEAR_PROFILE.ringDominance)
    / SHOT_TEAR_TOLERANCE.ringDominance;
  const coreComplexityDistance = Math.max(0, SHOT_TEAR_PROFILE.coreComplexity - score.coreComplexity)
    / SHOT_TEAR_TOLERANCE.coreComplexity;
  const annulusComplexityDistance = Math.abs(score.annulusComplexity - SHOT_TEAR_PROFILE.annulusComplexity)
    / SHOT_TEAR_TOLERANCE.annulusComplexity;
  const edgeMeanDistance = Math.max(0, SHOT_TEAR_PROFILE.edgeMean - score.edgeMean)
    / SHOT_TEAR_TOLERANCE.edgeMean;
  const centerRangeDistance = Math.max(0, SHOT_TEAR_PROFILE.centerRange - score.centerRange)
    / SHOT_TEAR_TOLERANCE.centerRange;

  return Math.hypot(
    edgeDensityDistance,
    radialCoverageDistance,
    lineDominanceDistance,
    ringDominanceDistance,
    coreComplexityDistance,
    annulusComplexityDistance,
    edgeMeanDistance,
    centerRangeDistance
  );
}

function scoreShotShape(
  luma: Float32Array,
  magnitudes: Float32Array,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  componentWidth: number,
  componentHeight: number,
  edgeThreshold: number
): ShotShapeScore {
  const patchRadius = Math.round(Math.max(
    componentWidth,
    componentHeight,
    Math.min(width, height) * 0.012,
    12
  ));
  const sectorCount = 24;
  const sectors = Array.from({ length: sectorCount }, () => 0);
  const radialRings = Array.from({ length: 8 }, () => 0);
  const localMagnitudes: number[] = [];
  const coreLuma: number[] = [];
  let edgePixels = 0;
  let edgeMagnitudeSum = 0;
  let patchPixels = 0;
  let coreEdgePixels = 0;
  let corePixels = 0;
  let annulusEdgePixels = 0;
  let annulusPixels = 0;

  for (
    let y = Math.max(0, Math.round(centerY - patchRadius));
    y <= Math.min(height - 1, Math.round(centerY + patchRadius));
    y += 1
  ) {
    for (
      let x = Math.max(0, Math.round(centerX - patchRadius));
      x <= Math.min(width - 1, Math.round(centerX + patchRadius));
      x += 1
    ) {
      const localDistance = Math.hypot(x - centerX, y - centerY);

      if (localDistance > patchRadius) {
        continue;
      }

      const pixel = y * width + x;
      const magnitude = magnitudes[pixel];

      localMagnitudes.push(magnitude);

      patchPixels += 1;

      if (localDistance <= patchRadius * 0.35) {
        corePixels += 1;
        coreLuma.push(luma[pixel]);
      }
    }
  }

  const localEdgeThreshold = clamp(
    Math.max(edgeThreshold * 0.76, percentile(localMagnitudes, 0.82)),
    18,
    145
  );

  for (
    let y = Math.max(0, Math.round(centerY - patchRadius));
    y <= Math.min(height - 1, Math.round(centerY + patchRadius));
    y += 1
  ) {
    for (
      let x = Math.max(0, Math.round(centerX - patchRadius));
      x <= Math.min(width - 1, Math.round(centerX + patchRadius));
      x += 1
    ) {
      const localDistance = Math.hypot(x - centerX, y - centerY);

      if (localDistance > patchRadius) {
        continue;
      }

      const magnitude = magnitudes[y * width + x];
      const hasEdge = magnitude >= localEdgeThreshold;

      if (localDistance <= patchRadius * 0.35) {

        if (hasEdge) {
          coreEdgePixels += 1;
        }
      }

      if (localDistance > patchRadius * 0.35 && localDistance <= patchRadius) {
        annulusPixels += 1;

        if (hasEdge) {
          annulusEdgePixels += 1;
        }
      }

      if (hasEdge) {
        edgePixels += 1;
        edgeMagnitudeSum += magnitude;

        if (localDistance > 1) {
          const angle = Math.atan2(y - centerY, x - centerX);
          const sector = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * sectorCount);

          sectors[clamp(sector, 0, sectorCount - 1)] += 1;
          radialRings[clamp(Math.floor((localDistance / patchRadius) * radialRings.length), 0, radialRings.length - 1)] += 1;
        }
      }
    }
  }

  const spokeThreshold = Math.max(2, Math.round(edgePixels / 28));
  const activeSectors = sectors.filter((sector) => sector >= spokeThreshold).length;
  const maxSector = Math.max(...sectors, 0);
  const maxRadialRing = Math.max(...radialRings, 0);
  const edgeDensity = edgePixels / Math.max(1, patchPixels);
  const radialCoverage = activeSectors / sectorCount;
  const lineDominance = maxSector / Math.max(1, edgePixels);
  const ringDominance = maxRadialRing / Math.max(1, edgePixels);
  const coreComplexity = coreEdgePixels / Math.max(1, corePixels);
  const annulusComplexity = annulusEdgePixels / Math.max(1, annulusPixels);
  const edgeMean = edgeMagnitudeSum / Math.max(1, edgePixels);
  const centerRange = percentile(coreLuma, 0.9) - percentile(coreLuma, 0.1);
  const profileDistance = shotProfileDistance({
    edgeDensity,
    radialCoverage,
    spokeCount: activeSectors,
    lineDominance,
    ringDominance,
    coreComplexity,
    annulusComplexity,
    edgeMean,
    centerRange,
  });
  const learnedPatternScore = clamp(1 - profileDistance / 3.8, 0, 1);
  const gateScore = clamp(
    Math.min(1, radialCoverage / 0.62) * 0.22
    + Math.min(1, activeSectors / 14) * 0.16
    + (1 - Math.min(1, lineDominance / 0.22)) * 0.18
    + (1 - Math.min(1, ringDominance / 0.42)) * 0.08
    + Math.min(1, edgeDensity / 0.16) * 0.1
    + Math.min(1, coreComplexity / 0.18) * 0.12
    + Math.min(1, annulusComplexity / 0.14) * 0.1
    + Math.min(1, edgeMean / 85) * 0.06
    + Math.min(1, centerRange / 40) * 0.04,
    0,
    1
  );
  const confidence = clamp(learnedPatternScore * 0.68 + gateScore * 0.32, 0, 1);

  return {
    confidence,
    edgeDensity,
    radialCoverage,
    spokeCount: activeSectors,
    lineDominance,
    ringDominance,
    coreComplexity,
    annulusComplexity,
    edgeMean,
    centerRange,
  };
}

function localCoreContrast(
  luma: Float32Array,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  coreRadius: number,
  ringRadius: number
) {
  let coreSum = 0;
  let coreCount = 0;
  let ringSum = 0;
  let ringCount = 0;
  const coreValues: number[] = [];
  const sampleStep = ringRadius > 28 ? 2 : 1;

  for (
    let y = Math.max(0, Math.round(centerY - ringRadius));
    y <= Math.min(height - 1, Math.round(centerY + ringRadius));
    y += sampleStep
  ) {
    for (
      let x = Math.max(0, Math.round(centerX - ringRadius));
      x <= Math.min(width - 1, Math.round(centerX + ringRadius));
      x += sampleStep
    ) {
      const distanceFromCenter = Math.hypot(x - centerX, y - centerY);
      const value = luma[y * width + x];

      if (distanceFromCenter <= coreRadius) {
        coreSum += value;
        coreCount += 1;
        coreValues.push(value);
      } else if (distanceFromCenter <= ringRadius && distanceFromCenter >= coreRadius * 1.8) {
        ringSum += value;
        ringCount += 1;
      }
    }
  }

  const coreMean = coreSum / Math.max(1, coreCount);
  const ringMean = ringSum / Math.max(1, ringCount);

  return {
    coreMean,
    ringMean,
    darkness: ringMean - coreMean,
    coreRange: percentile(coreValues, 0.9) - percentile(coreValues, 0.1),
  };
}

function detectShots(canvas: HTMLCanvasElement, geometry: TargetGeometry): DetectedShot[] {
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!context) {
    return [];
  }

  const width = canvas.width;
  const height = canvas.height;
  const imageData = context.getImageData(0, 0, width, height);
  const { mask, luma, magnitudes, edgeThreshold } = buildShotMask(
    imageData,
    width,
    height,
    geometry
  );
  const visited = new Uint8Array(width * height);
  const stack = new Int32Array(SHOT_COMPONENT_SCAN_LIMIT);
  const minBox = Math.max(5, Math.round(geometry.zoneWidth * 0.035));
  const maxBox = Math.max(22, Math.round(geometry.zoneWidth * 0.62));
  const minArea = Math.max(14, Math.round(minBox * minBox * 0.55));
  const maxArea = Math.round(maxBox * maxBox * 1.55);
  const candidates: DetectedShot[] = [];
  const addCandidate = (
    centerX: number,
    centerY: number,
    componentWidth: number,
    componentHeight: number,
    radiusMultiplier: number
  ) => {
    const score = pointScore(geometry, centerX, centerY);

    if (score === 0) {
      return;
    }

    const shapeScore = scoreShotShape(
      luma,
      magnitudes,
      width,
      height,
      centerX,
      centerY,
      componentWidth,
      componentHeight,
      edgeThreshold
    );
    const circularity = clamp(
      Math.min(componentWidth, componentHeight) / Math.max(componentWidth, componentHeight),
      0,
      1
    );
    const sizeScore = clamp(
      Math.min(componentWidth, componentHeight) / Math.max(1, geometry.zoneWidth * 0.12),
      0,
      1
    );
    const confidence = clamp(shapeScore.confidence * 0.74 + circularity * 0.14 + sizeScore * 0.12, 0, 1);

    if (
      confidence < 0.64
      || shapeScore.edgeDensity < 0.1
      || shapeScore.radialCoverage < 0.54
      || shapeScore.lineDominance > 0.24
      || shapeScore.ringDominance > 0.42
      || shapeScore.spokeCount < 13
      || shapeScore.annulusComplexity < 0.12
      || shapeScore.edgeMean < 46
    ) {
      return;
    }

    candidates.push({
      x: centerX,
      y: centerY,
      radius: clamp(Math.max(componentWidth, componentHeight) * radiusMultiplier, 10, geometry.zoneWidth * 0.34),
      score,
      confidence,
    });
  };

  for (let startPixel = 0; startPixel < mask.length; startPixel += 1) {
    if (!mask[startPixel] || visited[startPixel]) {
      continue;
    }

    let stackLength = 0;
    let area = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    stack[stackLength] = startPixel;
    stackLength += 1;
    visited[startPixel] = 1;

    while (stackLength > 0) {
      stackLength -= 1;
      const pixel = stack[stackLength];
      const x = pixel % width;
      const y = Math.floor(pixel / width);

      area += 1;
      sumX += x;
      sumY += y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      if (area > maxArea * 3 || stackLength >= SHOT_COMPONENT_SCAN_LIMIT - 5) {
        continue;
      }

      const neighbors = [
        pixel - 1,
        pixel + 1,
        pixel - width,
        pixel + width,
      ];

      neighbors.forEach((neighbor) => {
        if (
          neighbor < 0
          || neighbor >= mask.length
          || visited[neighbor]
          || !mask[neighbor]
          || stackLength >= SHOT_COMPONENT_SCAN_LIMIT - 1
        ) {
          return;
        }

        const neighborX = neighbor % width;

        if (Math.abs(neighborX - x) > 1) {
          return;
        }

        visited[neighbor] = 1;
        stack[stackLength] = neighbor;
        stackLength += 1;
      });
    }

    const componentWidth = maxX - minX + 1;
    const componentHeight = maxY - minY + 1;
    const aspectRatio = componentWidth / Math.max(1, componentHeight);
    const boxArea = componentWidth * componentHeight;
    const fillRatio = area / Math.max(1, boxArea);

    if (
      area < minArea
      || area > maxArea
      || componentWidth < minBox
      || componentHeight < minBox
      || componentWidth > maxBox * 1.9
      || componentHeight > maxBox * 1.9
      || aspectRatio < 0.38
      || aspectRatio > 2.65
      || fillRatio < 0.08
    ) {
      continue;
    }

    const centerX = sumX / area;
    const centerY = sumY / area;

    addCandidate(centerX, centerY, componentWidth, componentHeight, 0.72);
  }

  const coreRadius = clamp(geometry.zoneWidth * 0.11, 5, 24);
  const ringRadius = coreRadius * 3.2;
  const seedStep = Math.max(6, Math.round(coreRadius * 1.35));
  const scanMinX = Math.max(2, Math.round(geometry.centerX - geometry.outerRadius));
  const scanMaxX = Math.min(width - 3, Math.round(geometry.centerX + geometry.outerRadius));
  const scanMinY = Math.max(2, Math.round(geometry.centerY - geometry.outerRadius));
  const scanMaxY = Math.min(height - 3, Math.round(geometry.centerY + geometry.outerRadius));

  for (let y = scanMinY; y <= scanMaxY; y += seedStep) {
    for (let x = scanMinX; x <= scanMaxX; x += seedStep) {
      if (pointScore(geometry, x, y) === 0) {
        continue;
      }

      const contrast = localCoreContrast(luma, width, height, x, y, coreRadius, ringRadius);

      if (
        contrast.darkness < 18
        || contrast.coreRange < 24
        || contrast.coreMean > 170
      ) {
        continue;
      }

      addCandidate(x, y, coreRadius * 2.8, coreRadius * 2.8, 1.15);
    }
  }

  const rankedCandidates = candidates
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, MAX_DETECTED_SHOTS * 8);

  return rankedCandidates
    .reduce<DetectedShot[]>((acceptedShots, shot) => {
      const isDuplicate = acceptedShots.some((acceptedShot) => (
        Math.hypot(acceptedShot.x - shot.x, acceptedShot.y - shot.y) < geometry.zoneWidth * 0.32
      ));

      if (!isDuplicate) {
        acceptedShots.push(shot);
      }

      return acceptedShots;
    }, [])
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      return right.confidence - left.confidence;
    })
    .slice(0, MAX_DETECTED_SHOTS);
}

async function analyzeCroppedTarget(source: string): Promise<ScanResult> {
  const canvas = await createCanvasFromImage(source);
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Nie udało się przygotować analizy.");
  }

  const geometry = detectTargetGeometry(canvas);
  const shots = detectShots(canvas, geometry);
  const markerRadius = clamp(Math.min(canvas.width, canvas.height) * 0.012, 12, 32);

  context.lineWidth = clamp(Math.min(canvas.width, canvas.height) * 0.004, 4, 10);
  context.strokeStyle = "#ef233c";
  context.fillStyle = "#ef233c";
  context.font = `900 ${Math.round(markerRadius * 1.45)}px Arial, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  shots.forEach((shot, index) => {
    const displayRadius = Math.max(markerRadius, shot.radius);

    context.beginPath();
    context.arc(shot.x, shot.y, displayRadius, 0, Math.PI * 2);
    context.stroke();
    context.fillText(String(index + 1), shot.x + displayRadius * 1.25, shot.y - displayRadius * 1.25);
  });

  return {
    imageUrl: canvas.toDataURL("image/jpeg", 0.92),
    width: canvas.width,
    height: canvas.height,
    shots,
    totalScore: shots.reduce((sum, shot) => sum + shot.score, 0),
    geometryConfidence: geometry.confidence,
    patternCount: APPROVED_SHOT_PATTERN_COUNT,
  };
}

export default function TargetPhotoScanner() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const digitalZoomRef = useRef(1);
  const streamRef = useRef<MediaStream | null>(null);
  const capturingRef = useRef(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<CropResult | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanMessage, setScanMessage] = useState("");
  const [scanning, setScanning] = useState(false);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [cameraZoomRange, setCameraZoomRange] = useState<CameraCapabilities["zoom"] | null>(null);
  const [cameraZoom, setCameraZoom] = useState(1);
  const [digitalZoom, setDigitalZoom] = useState(1);
  const [flashOnCapture, setFlashOnCapture] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [captureStatus, setCaptureStatus] = useState("");

  function updateDigitalZoom(value: number) {
    const nextZoom = Math.max(1, Math.min(4, value));

    digitalZoomRef.current = nextZoom;
    setDigitalZoom(nextZoom);
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setTorchSupported(false);
    setTorchEnabled(false);
    setCameraZoomRange(null);
    setCameraZoom(1);
    capturingRef.current = false;
    setCapturing(false);
    setCaptureStatus("");

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
    setScanResult(null);
    setScanMessage("");
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

    const capabilities = videoTrack.getCapabilities() as CameraCapabilities;
    const focusMode = capabilities.focusMode?.includes("single-shot")
      ? "single-shot"
      : capabilities.focusMode?.includes("continuous")
        ? "continuous"
        : undefined;

    if (!focusMode) {
      return;
    }

    await videoTrack.applyConstraints({
      advanced: [
        {
          focusMode,
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

  async function captureTargetPhoto() {
    if (capturingRef.current) {
      return;
    }

    capturingRef.current = true;
    setCapturing(true);
    setCaptureStatus("Ustawiam ostrość");

    await focusAtCenter();
    await new Promise((resolve) => {
      window.setTimeout(resolve, FOCUS_SETTLE_MS);
    });

    setCaptureStatus("Robię zdjęcie");

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
      capturingRef.current = false;
      setCapturing(false);
      setCaptureStatus("");
      return;
    }

    setResult(cropPaperFromCanvas(canvas));
    setScanResult(null);
    setScanMessage("");

    if (flashOnCapture && torchSupported) {
      await setTorchState(false);
    }

    closeCamera();
  }

  async function scanCroppedTarget() {
    if (!result || scanning) {
      return;
    }

    setScanning(true);
    setScanMessage("");

    try {
      const nextScanResult = await analyzeCroppedTarget(result.imageUrl);

      setScanResult(nextScanResult);
      setScanMessage(
        nextScanResult.shots.length === 0
          ? "Nie wykryto przestrzelin w obszarze punktowym."
          : ""
      );
    } catch {
      setScanMessage("Nie udało się przeanalizować wykadrowanego obrazu.");
      setScanResult(null);
    } finally {
      setScanning(false);
    }
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

          <button
            type="button"
            onClick={() => {
              void scanCroppedTarget();
            }}
            disabled={scanning}
            className="ui-button mt-5 w-full rounded-xl bg-green-700 px-6 py-4 text-lg font-black text-white transition hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {scanning ? "Skanowanie..." : "Skanuj"}
          </button>

          {scanMessage && (
            <p className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 font-semibold text-gray-200">
              {scanMessage}
            </p>
          )}
        </section>
      )}

      {scanResult && (
        <section className="ui-block rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="mb-2 text-2xl font-black text-white">
            Wynik skanowania
          </h2>

          <p className="mb-4 text-sm font-semibold text-gray-400">
            {scanResult.shots.length} przestrzelin · {scanResult.totalScore} pkt · geometria stref {Math.round(scanResult.geometryConfidence * 100)}% · wzorce {scanResult.patternCount}
          </p>

          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={scanResult.imageUrl}
              alt="Zdjęcie tarczy po analizie przestrzelin"
              className="h-auto w-full"
            />
          </div>

          {scanResult.shots.length > 0 && (
            <div className="mt-5 overflow-hidden rounded-xl border border-zinc-800">
              <table className="w-full border-collapse text-left text-sm text-gray-200">
                <thead className="bg-zinc-950 text-xs uppercase text-gray-400">
                  <tr>
                    <th className="px-4 py-3">
                      Nr
                    </th>
                    <th className="px-4 py-3">
                      Punkt
                    </th>
                    <th className="px-4 py-3">
                      Pewność
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {scanResult.shots.map((shot, index) => (
                    <tr
                      key={`${Math.round(shot.x)}-${Math.round(shot.y)}-${index}`}
                      className="border-t border-zinc-800"
                    >
                      <td className="px-4 py-3 font-bold">
                        {index + 1}
                      </td>
                      <td className="px-4 py-3 font-bold">
                        {shot.score}
                      </td>
                      <td className="px-4 py-3">
                        {Math.round(shot.confidence * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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

            {captureStatus && (
              <div className="mt-3 flex justify-center">
                <span className="rounded-full bg-white/90 px-4 py-2 text-sm font-black text-zinc-950 shadow-lg backdrop-blur">
                  {captureStatus}
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
                disabled={starting || capturing}
                className="pointer-events-auto h-20 w-20 rounded-full border-4 border-white bg-white shadow-[0_0_0_6px_rgba(255,255,255,0.22)] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={capturing ? "Ustawianie ostrości" : "Zrób zdjęcie"}
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
