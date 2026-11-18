export const SPLIT_RATIO_STORAGE_KEY = "texpulse.splitRatio";
export const SIDEBAR_WIDTH_STORAGE_KEY = "texpulse.sidebarWidth";

export const DEFAULT_SPLIT_RATIO = 0.5;
export const MIN_SPLIT_RATIO = 0.22;
export const MAX_SPLIT_RATIO = 0.78;

export const DEFAULT_SIDEBAR_WIDTH = 240;
export const MIN_SIDEBAR_WIDTH = 180;
export const MAX_SIDEBAR_WIDTH = 380;

export const MIN_PDF_ZOOM = 0.5;
export const MAX_PDF_ZOOM = 3.0;
export const PINCH_WHEEL_SENSITIVITY = 0.0045;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function getDefaultStorage(): StorageLike | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function clampSplitRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return DEFAULT_SPLIT_RATIO;
  return Math.min(MAX_SPLIT_RATIO, Math.max(MIN_SPLIT_RATIO, ratio));
}

export function clampSidebarWidth(widthPx: number): number {
  if (!Number.isFinite(widthPx)) return DEFAULT_SIDEBAR_WIDTH;
  return Math.round(Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, widthPx)));
}

export function computeSplitRatioFromPointer(
  clientX: number,
  containerLeft: number,
  containerWidth: number,
): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return DEFAULT_SPLIT_RATIO;
  }
  return clampSplitRatio((clientX - containerLeft) / containerWidth);
}

export function loadPersistedSplitRatio(
  storage: StorageLike | null = getDefaultStorage(),
): number {
  if (!storage) return DEFAULT_SPLIT_RATIO;
  try {
    const raw = storage.getItem(SPLIT_RATIO_STORAGE_KEY);
    if (!raw) return DEFAULT_SPLIT_RATIO;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clampSplitRatio(parsed) : DEFAULT_SPLIT_RATIO;
  } catch {
    return DEFAULT_SPLIT_RATIO;
  }
}

export function savePersistedSplitRatio(
  ratio: number,
  storage: StorageLike | null = getDefaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(SPLIT_RATIO_STORAGE_KEY, String(clampSplitRatio(ratio)));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadPersistedSidebarWidth(
  storage: StorageLike | null = getDefaultStorage(),
): number {
  if (!storage) return DEFAULT_SIDEBAR_WIDTH;
  try {
    const raw = storage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (!raw) return DEFAULT_SIDEBAR_WIDTH;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clampSidebarWidth(parsed) : DEFAULT_SIDEBAR_WIDTH;
  } catch {
    return DEFAULT_SIDEBAR_WIDTH;
  }
}

export function savePersistedSidebarWidth(
  widthPx: number,
  storage: StorageLike | null = getDefaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clampSidebarWidth(widthPx)));
  } catch {
    // Ignore storage quota errors
  }
}

export function clampPdfZoom(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_PDF_ZOOM, Math.max(MIN_PDF_ZOOM, Number(scale.toFixed(4))));
}

export function computePinchWheelZoomFactor(deltaY: number): number {
  if (!Number.isFinite(deltaY)) return 1;
  return Math.exp(-deltaY * PINCH_WHEEL_SENSITIVITY);
}

export function computeNextPinchZoomScale(currentScale: number, deltaY: number): number {
  const safeBase = clampPdfZoom(currentScale);
  return clampPdfZoom(safeBase * computePinchWheelZoomFactor(deltaY));
}

export function computeFocalScrollPosition(params: {
  scrollLeft: number;
  scrollTop: number;
  cursorOffsetX: number;
  cursorOffsetY: number;
  previousScale: number;
  nextScale: number;
}): { scrollLeft: number; scrollTop: number } {
  const { scrollLeft, scrollTop, cursorOffsetX, cursorOffsetY, previousScale, nextScale } = params;
  if (!Number.isFinite(previousScale) || previousScale <= 0 || !Number.isFinite(nextScale)) {
    return { scrollLeft: Math.max(0, scrollLeft), scrollTop: Math.max(0, scrollTop) };
  }
  const ratio = nextScale / previousScale;
  return {
    scrollLeft: Math.max(0, (scrollLeft + cursorOffsetX) * ratio - cursorOffsetX),
    scrollTop: Math.max(0, (scrollTop + cursorOffsetY) * ratio - cursorOffsetY),
  };
}
