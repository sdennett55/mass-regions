import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { ChevronDown, ChevronRight, Settings2, X } from "lucide-react";

import {
  formatTownLabel,
  getCanonicalTownId,
  getRegionColor,
  getRegionForTownId,
  getRegionTownCount,
  getLegendGroups,
} from "../data/massRegions";
import { CAPTURE_POINTS_TO_CAPTURE } from "../game/constants";
import { useTerritoryGame } from "../game/useTerritoryGame";
import type { TownBattleState } from "../game/types";
import ActivityFeed from "./ActivityFeed";
import GameHud from "./GameHud";
import MassachusettsMap from "./Map";
import TownBattlePanel from "./TownBattlePanel";

const SVG_WIDTH = 2100;
const SVG_HEIGHT = 1300;
const MIN_ZOOM = 0.7;
const MAX_ZOOM = 12;
const PAN_SAFE_AREA_X = SVG_WIDTH / 2;
const PAN_SAFE_AREA_Y = SVG_HEIGHT / 2;
const WHEEL_COMMIT_DELAY_MS = 90;
const MAP_VIEW_STORAGE_KEY = "mass-regions:view";
const MAP_SETTINGS_STORAGE_KEY = "mass-regions:settings";
const TOUCH_HOVER_BLOCK_MS = 800;
const RENDER_BUFFER_RATIO = 0.18;
const REGIONS_MODE_QUERY_VALUE = "regions";
const COMPACT_HUD_BREAKPOINT_PX = 900;

type Viewport = {
  width: number;
  height: number;
};

type CameraState = {
  x: number;
  y: number;
  zoom: number;
};

type RenderBox = {
  height: number;
  width: number;
  x: number;
  y: number;
};

type LocalPoint = {
  x: number;
  y: number;
};

type ActiveTown = {
  battleState: TownBattleState | null;
  controlCount: number;
  region: string;
  regionColor: string;
  town: string;
  townId: string;
};

type PanGesture = {
  kind: "pan";
  moved: boolean;
  pointerType: string;
  pointerId: number;
  startCamera: CameraState;
  startPoint: LocalPoint;
  startTownId: string | null;
};

type PinchGesture = {
  kind: "pinch";
  moved: boolean;
  startCamera: CameraState;
  startDistance: number;
  startWorldPoint: LocalPoint;
};

type GestureState = PanGesture | PinchGesture | null;

type StoredMapSettings = {
  battleMode: boolean;
  showTownLabels: boolean;
};

function getInitialViewport() {
  if (typeof window === "undefined") {
    return null;
  }

  const width = window.visualViewport?.width ?? window.innerWidth;
  const height = window.visualViewport?.height ?? window.innerHeight;

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return {
    width,
    height,
  } satisfies Viewport;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampInRange(value: number, min: number, max: number) {
  return min <= max ? clamp(value, min, max) : (min + max) / 2;
}

function midpoint(a: LocalPoint, b: LocalPoint): LocalPoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function distance(a: LocalPoint, b: LocalPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getPanMoveThreshold(pointerType: string) {
  return pointerType === "touch" ? 8 : 3;
}

function getVisibleWidth(zoom: number) {
  return SVG_WIDTH / zoom;
}

function getVisibleHeight(zoom: number, viewport: Viewport) {
  return getVisibleWidth(zoom) * (viewport.height / viewport.width);
}

function getRenderBox(camera: CameraState, viewport: Viewport): RenderBox {
  const visibleWidth = getVisibleWidth(camera.zoom);
  const visibleHeight = getVisibleHeight(camera.zoom, viewport);
  const padWidth = visibleWidth * RENDER_BUFFER_RATIO;
  const padHeight = visibleHeight * RENDER_BUFFER_RATIO;

  return {
    height: visibleHeight + padHeight * 2,
    width: visibleWidth + padWidth * 2,
    x: camera.x - padWidth,
    y: camera.y - padHeight,
  };
}

function getRenderViewBoxString(camera: CameraState, viewport: Viewport) {
  const renderBox = getRenderBox(camera, viewport);
  return `${renderBox.x} ${renderBox.y} ${renderBox.width} ${renderBox.height}`;
}

function getRenderLayerStyle(viewport: Viewport) {
  return {
    height: `${viewport.height * (1 + RENDER_BUFFER_RATIO * 2)}px`,
    left: `${viewport.width * -RENDER_BUFFER_RATIO}px`,
    top: `${viewport.height * -RENDER_BUFFER_RATIO}px`,
    width: `${viewport.width * (1 + RENDER_BUFFER_RATIO * 2)}px`,
  };
}

function clampCamera(camera: CameraState, viewport: Viewport): CameraState {
  const zoom = clamp(camera.zoom, MIN_ZOOM, MAX_ZOOM);
  const visibleWidth = getVisibleWidth(zoom);
  const visibleHeight = getVisibleHeight(zoom, viewport);

  const x = clampInRange(
    camera.x,
    -PAN_SAFE_AREA_X,
    SVG_WIDTH + PAN_SAFE_AREA_X - visibleWidth,
  );

  const y = clampInRange(
    camera.y,
    -PAN_SAFE_AREA_Y,
    SVG_HEIGHT + PAN_SAFE_AREA_Y - visibleHeight,
  );

  return { x, y, zoom };
}

function getFitCamera(viewport: Viewport): CameraState {
  const fitZoom = Math.min(
    1,
    (SVG_WIDTH * viewport.height) / (SVG_HEIGHT * viewport.width),
  );
  const visibleWidth = getVisibleWidth(fitZoom);
  const visibleHeight = getVisibleHeight(fitZoom, viewport);

  return clampCamera(
    {
      zoom: fitZoom,
      x: (SVG_WIDTH - visibleWidth) / 2,
      y: (SVG_HEIGHT - visibleHeight) / 2,
    },
    viewport,
  );
}

function areCamerasEqual(a: CameraState, b: CameraState) {
  return (
    Math.abs(a.x - b.x) < 0.01 &&
    Math.abs(a.y - b.y) < 0.01 &&
    Math.abs(a.zoom - b.zoom) < 0.0001
  );
}

function loadStoredCamera() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawCamera = window.sessionStorage.getItem(MAP_VIEW_STORAGE_KEY);
    if (!rawCamera) {
      return null;
    }

    const parsedCamera = JSON.parse(rawCamera) as Partial<CameraState>;
    if (
      typeof parsedCamera.x !== "number" ||
      typeof parsedCamera.y !== "number" ||
      typeof parsedCamera.zoom !== "number"
    ) {
      return null;
    }

    return {
      x: parsedCamera.x,
      y: parsedCamera.y,
      zoom: parsedCamera.zoom,
    };
  } catch {
    return null;
  }
}

function saveStoredCamera(camera: CameraState) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(MAP_VIEW_STORAGE_KEY, JSON.stringify(camera));
  } catch {
    // Ignore storage failures so interaction keeps working in private/locked-down contexts.
  }
}

function loadStoredMapSettings(): StoredMapSettings | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawSettings = window.sessionStorage.getItem(MAP_SETTINGS_STORAGE_KEY);
    if (!rawSettings) {
      return null;
    }

    const parsedSettings = JSON.parse(
      rawSettings,
    ) as Partial<StoredMapSettings>;
    if (typeof parsedSettings.showTownLabels !== "boolean") {
      return null;
    }

    return {
      battleMode:
        typeof parsedSettings.battleMode === "boolean"
          ? parsedSettings.battleMode
          : true,
      showTownLabels: parsedSettings.showTownLabels,
    };
  } catch {
    return null;
  }
}

function getBattleModeOverrideFromUrl() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const modeParam = new URLSearchParams(window.location.search).get("mode");
    if (!modeParam) {
      return null;
    }

    return modeParam.trim().toLowerCase() === REGIONS_MODE_QUERY_VALUE
      ? false
      : null;
  } catch {
    return null;
  }
}

function loadInitialMapSettings() {
  const storedSettings = loadStoredMapSettings();
  const battleModeOverride = getBattleModeOverrideFromUrl();

  if (battleModeOverride === null) {
    return storedSettings;
  }

  return {
    battleMode: battleModeOverride,
    showTownLabels: storedSettings?.showTownLabels ?? true,
  };
}

function syncBattleModeUrl(isBattleMode: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const url = new URL(window.location.href);

    if (isBattleMode) {
      url.searchParams.delete("mode");
    } else {
      url.searchParams.set("mode", REGIONS_MODE_QUERY_VALUE);
    }

    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (nextUrl !== currentUrl) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
  } catch {
    // Ignore URL write failures so the map can keep working in restricted contexts.
  }
}

function saveStoredMapSettings(settings: StoredMapSettings) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      MAP_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings),
    );
  } catch {
    // Ignore storage failures so interaction keeps working in private/locked-down contexts.
  }
}

function isTouchCapableDevice() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return (
      window.navigator.maxTouchPoints > 0 ||
      window.matchMedia("(pointer: coarse)").matches
    );
  } catch {
    return false;
  }
}

function getPreviewMatrix(
  committedCamera: CameraState,
  previewCamera: CameraState,
  viewport: Viewport,
) {
  const committedRenderBox = getRenderBox(committedCamera, viewport);
  const previewRenderBox = getRenderBox(previewCamera, viewport);
  const renderWidth = viewport.width * (1 + RENDER_BUFFER_RATIO * 2);
  const renderHeight = viewport.height * (1 + RENDER_BUFFER_RATIO * 2);

  const scaleX = committedRenderBox.width / previewRenderBox.width;
  const scaleY = committedRenderBox.height / previewRenderBox.height;
  const translateX =
    ((committedRenderBox.x - previewRenderBox.x) / previewRenderBox.width) *
    renderWidth;
  const translateY =
    ((committedRenderBox.y - previewRenderBox.y) / previewRenderBox.height) *
    renderHeight;

  return {
    scaleX,
    scaleY,
    translateX,
    translateY,
  };
}

function InteractiveMap() {
  const initialSettings = loadInitialMapSettings();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const mapLayerRef = useRef<HTMLDivElement | null>(null);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);
  const hasResolvedInitialCameraRef = useRef(false);
  const pointersRef = useRef(new globalThis.Map<number, LocalPoint>());
  const gestureRef = useRef<GestureState>(null);
  const wheelCommitTimerRef = useRef<number | null>(null);
  const previewFrameRef = useRef<number | null>(null);
  const pendingPreviewCameraRef = useRef<CameraState | null>(null);
  const committedCameraRef = useRef<CameraState | null>(null);
  const previewCameraRef = useRef<CameraState | null>(null);
  const lastTouchInteractionTimeRef = useRef(0);

  const [viewport, setViewport] = useState<Viewport | null>(() => getInitialViewport());
  const [camera, setCamera] = useState<CameraState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLegendOpen, setIsLegendOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [expandedLegendRegions, setExpandedLegendRegions] = useState<string[]>(
    [],
  );
  const [showTownLabels, setShowTownLabels] = useState(
    initialSettings?.showTownLabels ?? true,
  );
  const [isBattleMode, setIsBattleMode] = useState(
    initialSettings?.battleMode ?? true,
  );
  const [hoveredTownId, setHoveredTownId] = useState<string | null>(null);
  const [selectedTownId, setSelectedTownId] = useState<string | null>(null);
  const {
    actionPoints,
    activityEvents,
    capturedTownCount,
    contestedTownCount,
    controlCounts,
    getTownContext,
    hasLiveSnapshot,
    legendGroups,
    nextActionPointIn,
    onDefend,
    onInvade,
    season,
    seasonLabel,
    serverNow,
    seasonTimeRemaining,
    statusMessage,
    townVisualStates,
  } = useTerritoryGame();
  const placeNounPlural = isBattleMode ? "territories" : "municipalities";
  const labelsSettingLabel = isBattleMode
    ? "Territory names"
    : "Municipality names";
  const legendDescription = `Browse all regions and ${placeNounPlural}`;
  const mapAriaLabel = `Map of Massachusetts ${placeNounPlural} colored by region`;

  const clearWheelCommitTimer = () => {
    if (wheelCommitTimerRef.current !== null) {
      window.clearTimeout(wheelCommitTimerRef.current);
      wheelCommitTimerRef.current = null;
    }
  };

  const cancelPreviewFrame = () => {
    if (previewFrameRef.current !== null) {
      window.cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
    }
  };

  const updateHoveredTownId = (nextTownId: string | null) => {
    setHoveredTownId((currentTownId) =>
      currentTownId === nextTownId ? currentTownId : nextTownId,
    );
  };

  const updateSelectedTownId = (nextTownId: string | null) => {
    setSelectedTownId((currentTownId) =>
      currentTownId === nextTownId ? currentTownId : nextTownId,
    );
  };

  const markTouchInteraction = () => {
    lastTouchInteractionTimeRef.current = Date.now();
  };

  const shouldIgnoreHover = (pointerType: string) =>
    pointerType !== "mouse" ||
    !!gestureRef.current ||
    pointersRef.current.size > 0 ||
    Date.now() - lastTouchInteractionTimeRef.current < TOUCH_HOVER_BLOCK_MS;

  const setMapHitTestingEnabled = (enabled: boolean) => {
    if (!mapLayerRef.current) {
      return;
    }

    mapLayerRef.current.style.pointerEvents = enabled ? "" : "none";
  };

  const clearPreviewTransform = () => {
    if (!mapLayerRef.current) {
      return;
    }

    mapLayerRef.current.style.transform = "";
    mapLayerRef.current.style.transformOrigin = "";
    mapLayerRef.current.style.willChange = "";
  };

  const getLocalPoint = (
    clientX: number,
    clientY: number,
  ): LocalPoint | null => {
    const bounds = viewportRef.current?.getBoundingClientRect();
    if (!bounds) {
      return null;
    }

    return {
      x: clientX - bounds.left,
      y: clientY - bounds.top,
    };
  };

  const getDisplayedCamera = () =>
    previewCameraRef.current ?? committedCameraRef.current;

  const getTownById = (
    rawTownId: string,
    battleModeEnabled: boolean,
  ): ActiveTown | null => {
    const canonicalTownId = getCanonicalTownId(rawTownId);
    const battleState = season.towns[canonicalTownId];
    const baselineRegion = getRegionForTownId(canonicalTownId);

    if (!battleState || !baselineRegion) {
      return null;
    }

    const region = battleModeEnabled
      ? battleState.currentRegion
      : baselineRegion;

    return {
      battleState: battleModeEnabled ? battleState : null,
      controlCount: battleModeEnabled
        ? (controlCounts[battleState.currentRegion] ?? 0)
        : getRegionTownCount(region),
      region,
      regionColor: getRegionColor(region),
      town: formatTownLabel(canonicalTownId),
      townId: canonicalTownId,
    };
  };

  const getTownIdFromEventTarget = (
    target: EventTarget | null,
  ): string | null => {
    if (!(target instanceof Element)) {
      return null;
    }

    const townPath = target.closest("path[id]");
    if (!townPath) {
      return null;
    }

    return getCanonicalTownId(townPath.id);
  };

  const getTownIdAtClientPoint = (clientX: number, clientY: number) => {
    if (typeof document === "undefined") {
      return null;
    }

    return getTownIdFromEventTarget(
      document.elementFromPoint(clientX, clientY),
    );
  };

  const writePreviewCamera = (nextCamera: CameraState) => {
    if (!viewport || !mapLayerRef.current || !committedCameraRef.current) {
      return;
    }

    if (areCamerasEqual(committedCameraRef.current, nextCamera)) {
      clearPreviewTransform();
      return;
    }

    const { scaleX, scaleY, translateX, translateY } = getPreviewMatrix(
      committedCameraRef.current,
      nextCamera,
      viewport,
    );

    mapLayerRef.current.style.willChange = "transform";
    mapLayerRef.current.style.transformOrigin = "0 0";
    mapLayerRef.current.style.transform = `matrix(${scaleX}, 0, 0, ${scaleY}, ${translateX}, ${translateY})`;
  };

  const schedulePreviewCamera = (nextCamera: CameraState) => {
    previewCameraRef.current = nextCamera;
    pendingPreviewCameraRef.current = nextCamera;

    if (previewFrameRef.current !== null) {
      return;
    }

    previewFrameRef.current = window.requestAnimationFrame(() => {
      previewFrameRef.current = null;

      const pendingCamera = pendingPreviewCameraRef.current;
      if (!pendingCamera) {
        clearPreviewTransform();
        return;
      }

      writePreviewCamera(pendingCamera);
    });
  };

  const commitPreviewCamera = (nextCamera?: CameraState | null) => {
    if (!viewport) {
      return;
    }

    clearWheelCommitTimer();
    cancelPreviewFrame();

    const cameraToCommit =
      nextCamera ?? pendingPreviewCameraRef.current ?? previewCameraRef.current;
    if (!cameraToCommit) {
      setMapHitTestingEnabled(true);
      return;
    }

    const clampedCamera = clampCamera(cameraToCommit, viewport);
    const svgElement = mapLayerRef.current?.querySelector("svg");

    if (svgElement) {
      svgElement.setAttribute(
        "viewBox",
        getRenderViewBoxString(clampedCamera, viewport),
      );
    }

    saveStoredCamera(clampedCamera);
    committedCameraRef.current = clampedCamera;
    previewCameraRef.current = clampedCamera;
    pendingPreviewCameraRef.current = null;
    clearPreviewTransform();
    setMapHitTestingEnabled(true);
    setCamera((currentCamera) =>
      currentCamera && areCamerasEqual(currentCamera, clampedCamera)
        ? currentCamera
        : clampedCamera,
    );
  };

  const resetView = () => {
    if (!viewport) {
      return;
    }

    pointersRef.current.clear();
    gestureRef.current = null;
    setIsDragging(false);
    setIsSettingsOpen(false);
    updateHoveredTownId(null);
    updateSelectedTownId(null);
    commitPreviewCamera(getFitCamera(viewport));
  };

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    const handleWindowPointerDown = (event: PointerEvent) => {
      if (settingsPanelRef.current?.contains(event.target as Node)) {
        return;
      }

      setIsSettingsOpen(false);
    };

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
      }
    };

    window.addEventListener("pointerdown", handleWindowPointerDown);
    window.addEventListener("keydown", handleWindowKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handleWindowPointerDown);
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    saveStoredMapSettings({
      battleMode: isBattleMode,
      showTownLabels,
    });
  }, [isBattleMode, showTownLabels]);

  useEffect(() => {
    syncBattleModeUrl(isBattleMode);
  }, [isBattleMode]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      const nextViewport = {
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      };

      setViewport(nextViewport);

      const isInitialViewport = !hasResolvedInitialCameraRef.current;
      const basisCamera = getDisplayedCamera();
      const restoredCamera = isInitialViewport ? loadStoredCamera() : null;
      const nextCamera = basisCamera
        ? clampCamera(basisCamera, nextViewport)
        : restoredCamera
          ? clampCamera(restoredCamera, nextViewport)
          : getFitCamera(nextViewport);

      cancelPreviewFrame();
      hasResolvedInitialCameraRef.current = true;
      saveStoredCamera(nextCamera);
      committedCameraRef.current = nextCamera;
      previewCameraRef.current = nextCamera;
      pendingPreviewCameraRef.current = null;
      clearPreviewTransform();
      setMapHitTestingEnabled(true);

      const svgElement = mapLayerRef.current?.querySelector("svg");
      if (svgElement) {
        svgElement.setAttribute(
          "viewBox",
          getRenderViewBoxString(nextCamera, nextViewport),
        );
      }

      setCamera((currentCamera) =>
        currentCamera && areCamerasEqual(currentCamera, nextCamera)
          ? currentCamera
          : nextCamera,
      );
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
      clearWheelCommitTimer();
      cancelPreviewFrame();
    };
  }, []);

  const beginPanGesture = (
    pointerId: number,
    pointerType: string,
    startPoint: LocalPoint,
    startTownId: string | null,
  ) => {
    const startCamera = getDisplayedCamera();
    if (!startCamera) {
      return;
    }

    gestureRef.current = {
      kind: "pan",
      moved: false,
      pointerType,
      pointerId,
      startCamera,
      startPoint,
      startTownId,
    };

    setIsDragging(true);
  };

  const continuePanGesture = (pointerId: number, startPoint: LocalPoint) => {
    const startCamera = getDisplayedCamera();
    if (!startCamera) {
      return;
    }

    gestureRef.current = {
      kind: "pan",
      moved: true,
      pointerType: "touch",
      pointerId,
      startCamera,
      startPoint,
      startTownId: null,
    };

    setMapHitTestingEnabled(false);
    setIsDragging(true);
  };

  const beginPinchGesture = () => {
    if (!viewport) {
      return;
    }

    const startCamera = getDisplayedCamera();
    if (!startCamera) {
      return;
    }

    const pointerEntries = Array.from(pointersRef.current.values());
    if (pointerEntries.length < 2) {
      return;
    }

    const startCenter = midpoint(pointerEntries[0], pointerEntries[1]);
    const startDistance = Math.max(
      distance(pointerEntries[0], pointerEntries[1]),
      1,
    );
    const visibleWidth = getVisibleWidth(startCamera.zoom);
    const visibleHeight = getVisibleHeight(startCamera.zoom, viewport);

    gestureRef.current = {
      kind: "pinch",
      moved: true,
      startCamera,
      startDistance,
      startWorldPoint: {
        x: startCamera.x + (startCenter.x / viewport.width) * visibleWidth,
        y: startCamera.y + (startCenter.y / viewport.height) * visibleHeight,
      },
    };

    setMapHitTestingEnabled(false);
    updateHoveredTownId(null);
    setIsDragging(true);
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if ((event.target as Element | null)?.closest('[data-ui-control="true"]')) {
      return;
    }

    if (!viewport) {
      return;
    }

    const pointer = getLocalPoint(event.clientX, event.clientY);
    const currentCamera = getDisplayedCamera();
    if (!pointer || !currentCamera) {
      return;
    }

    event.preventDefault();

    const zoomFactor = Math.exp(-event.deltaY * 0.0015);
    const visibleWidth = getVisibleWidth(currentCamera.zoom);
    const visibleHeight = getVisibleHeight(currentCamera.zoom, viewport);
    const worldX =
      currentCamera.x + (pointer.x / viewport.width) * visibleWidth;
    const worldY =
      currentCamera.y + (pointer.y / viewport.height) * visibleHeight;
    const nextZoom = clamp(currentCamera.zoom * zoomFactor, MIN_ZOOM, MAX_ZOOM);
    const nextVisibleWidth = getVisibleWidth(nextZoom);
    const nextVisibleHeight = getVisibleHeight(nextZoom, viewport);

    const nextCamera = clampCamera(
      {
        zoom: nextZoom,
        x: worldX - (pointer.x / viewport.width) * nextVisibleWidth,
        y: worldY - (pointer.y / viewport.height) * nextVisibleHeight,
      },
      viewport,
    );

    setMapHitTestingEnabled(false);
    schedulePreviewCamera(nextCamera);
    clearWheelCommitTimer();
    wheelCommitTimerRef.current = window.setTimeout(() => {
      commitPreviewCamera(previewCameraRef.current);
    }, WHEEL_COMMIT_DELAY_MS);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as Element | null)?.closest('[data-ui-control="true"]')) {
      return;
    }

    if (event.button !== 0 && event.pointerType !== "touch") {
      return;
    }

    clearWheelCommitTimer();

    if (event.pointerType === "touch") {
      markTouchInteraction();
      updateHoveredTownId(null);
    }

    const point = getLocalPoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    pointersRef.current.set(event.pointerId, point);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (pointersRef.current.size === 1) {
      beginPanGesture(
        event.pointerId,
        event.pointerType,
        point,
        getTownIdFromEventTarget(event.target),
      );
      return;
    }

    if (pointersRef.current.size === 2) {
      beginPinchGesture();
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = getLocalPoint(event.clientX, event.clientY);
    if (!point || !pointersRef.current.has(event.pointerId)) {
      return;
    }

    pointersRef.current.set(event.pointerId, point);

    if (!viewport || !gestureRef.current) {
      return;
    }

    if (gestureRef.current.kind === "pan") {
      if (gestureRef.current.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = point.x - gestureRef.current.startPoint.x;
      const deltaY = point.y - gestureRef.current.startPoint.y;
      const wasMoved = gestureRef.current.moved;
      const moved =
        wasMoved ||
        Math.hypot(deltaX, deltaY) >
          getPanMoveThreshold(gestureRef.current.pointerType);
      const visibleWidth = getVisibleWidth(gestureRef.current.startCamera.zoom);
      const visibleHeight = getVisibleHeight(
        gestureRef.current.startCamera.zoom,
        viewport,
      );

      const nextCamera = clampCamera(
        {
          ...gestureRef.current.startCamera,
          x:
            gestureRef.current.startCamera.x -
            (deltaX / viewport.width) * visibleWidth,
          y:
            gestureRef.current.startCamera.y -
            (deltaY / viewport.height) * visibleHeight,
        },
        viewport,
      );

      gestureRef.current = {
        ...gestureRef.current,
        moved,
      };

      if (moved && !wasMoved) {
        setMapHitTestingEnabled(false);
        updateHoveredTownId(null);
      }

      schedulePreviewCamera(nextCamera);
      return;
    }

    if (gestureRef.current.kind === "pinch" && pointersRef.current.size >= 2) {
      const pointerEntries = Array.from(pointersRef.current.values());
      if (pointerEntries.length < 2) {
        return;
      }

      const center = midpoint(pointerEntries[0], pointerEntries[1]);
      const currentDistance = Math.max(
        distance(pointerEntries[0], pointerEntries[1]),
        1,
      );
      const nextZoom = clamp(
        gestureRef.current.startCamera.zoom *
          (currentDistance / gestureRef.current.startDistance),
        MIN_ZOOM,
        MAX_ZOOM,
      );
      const nextVisibleWidth = getVisibleWidth(nextZoom);
      const nextVisibleHeight = getVisibleHeight(nextZoom, viewport);

      const nextCamera = clampCamera(
        {
          zoom: nextZoom,
          x:
            gestureRef.current.startWorldPoint.x -
            (center.x / viewport.width) * nextVisibleWidth,
          y:
            gestureRef.current.startWorldPoint.y -
            (center.y / viewport.height) * nextVisibleHeight,
        },
        viewport,
      );

      schedulePreviewCamera(nextCamera);
      updateHoveredTownId(null);
    }
  };

  const finishGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) {
      return;
    }

    const currentGesture = gestureRef.current;
    const isTouchGesture =
      currentGesture?.kind === "pan" && currentGesture.pointerType === "touch";
    const releasedTownId =
      event.type === "pointerup" &&
      currentGesture?.kind === "pan" &&
      !currentGesture.moved
        ? getTownIdAtClientPoint(event.clientX, event.clientY)
        : null;

    if (event.pointerType === "touch") {
      markTouchInteraction();
      updateHoveredTownId(null);
    }

    pointersRef.current.delete(event.pointerId);

    if (currentGesture?.kind === "pinch") {
      commitPreviewCamera(previewCameraRef.current);

      if (pointersRef.current.size === 1) {
        const remainingEntry = Array.from(pointersRef.current.entries())[0];
        if (remainingEntry) {
          const [remainingPointerId, remainingPoint] = remainingEntry;
          continuePanGesture(remainingPointerId, remainingPoint);
        }
      } else if (pointersRef.current.size === 0) {
        gestureRef.current = null;
        setIsDragging(false);
      } else {
        beginPinchGesture();
      }
    } else if (currentGesture?.kind === "pan") {
      const tappedTownId =
        currentGesture.startTownId &&
        releasedTownId === currentGesture.startTownId
          ? currentGesture.startTownId
          : null;

      if (tappedTownId) {
        if (isBattleMode) {
          updateSelectedTownId(tappedTownId);

          if (!isTouchGesture) {
            updateHoveredTownId(tappedTownId);
          }
        } else {
          updateSelectedTownId(null);
          updateHoveredTownId(tappedTownId);
        }
      } else if (!currentGesture.moved) {
        if (isBattleMode) {
          updateSelectedTownId(null);
        }

        if (!isTouchGesture || !isBattleMode) {
          updateHoveredTownId(null);
        }
      }

      commitPreviewCamera(previewCameraRef.current);
      gestureRef.current = null;

      if (pointersRef.current.size >= 2) {
        beginPinchGesture();
      } else if (pointersRef.current.size === 1) {
        const remainingEntry = Array.from(pointersRef.current.entries())[0];
        if (remainingEntry) {
          const [remainingPointerId, remainingPoint] = remainingEntry;
          continuePanGesture(remainingPointerId, remainingPoint);
        }
      } else {
        setIsDragging(false);
      }
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerLeave = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (shouldIgnoreHover(event.pointerType)) {
      return;
    }

    if (!gestureRef.current) {
      updateHoveredTownId(null);
    }
  };

  const handlePointerOver = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (shouldIgnoreHover(event.pointerType)) {
      return;
    }

    updateHoveredTownId(getTownIdFromEventTarget(event.target));
  };

  const handlePointerOut = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (shouldIgnoreHover(event.pointerType)) {
      return;
    }

    updateHoveredTownId(getTownIdFromEventTarget(event.relatedTarget));
  };

  const handleResetButtonPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleSettingsButtonPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleSettingsButtonClick = (
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    setIsSettingsOpen((currentState) => !currentState);
  };

  const handleSettingsBackdropPointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleSettingsBackdropClick = (
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    setIsSettingsOpen(false);
  };

  const handleTownLabelsTogglePointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleTownLabelsToggleClick = (
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    setShowTownLabels((currentState) => !currentState);
  };

  const handleBattleModeTogglePointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleBattleModeToggleClick = (
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    setIsBattleMode((currentState) => {
      const nextState = !currentState;

      if (!nextState) {
        updateSelectedTownId(null);
      }

      return nextState;
    });
  };

  const handleLegendTogglePointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleLegendToggleClick = (
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    setIsSettingsOpen(false);
    setIsLegendOpen((currentState) => {
      if (!currentState) {
        setExpandedLegendRegions([]);
      }

      return !currentState;
    });
  };

  const handleLegendRegionToggle = (region: string) => {
    setExpandedLegendRegions((currentRegions) =>
      currentRegions.includes(region)
        ? currentRegions.filter((currentRegion) => currentRegion !== region)
        : [...currentRegions, region],
    );
  };

  const handleResetButtonClick = (
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    resetView();
  };

  const activeTownId = (isBattleMode ? selectedTownId : null) ?? hoveredTownId;
  const activeTown = activeTownId
    ? getTownById(activeTownId, isBattleMode)
    : null;
  const selectedTownContext =
    isBattleMode && selectedTownId ? getTownContext(selectedTownId) : null;
  const defaultCamera = viewport ? getFitCamera(viewport) : null;
  const mapLayerStyle = viewport ? getRenderLayerStyle(viewport) : undefined;
  const isAtInitialView =
    !camera || !defaultCamera || areCamerasEqual(camera, defaultCamera);
  const isMobileViewport = !!viewport && viewport.width < 640;
  const isCompactHud = !!viewport && viewport.width < COMPACT_HUD_BREAKPOINT_PX;
  const hasTouchInput = isTouchCapableDevice();
  const showDismissVeil = hasTouchInput;
  const shouldHideSelectedTownPanel = isLegendOpen && isMobileViewport;
  const shouldHideActiveTownTooltip =
    shouldHideSelectedTownPanel || (isBattleMode && hasTouchInput);
  const displayedLegendGroups = isBattleMode ? legendGroups : getLegendGroups();

  return (
    <section
      ref={viewportRef}
      className={`relative h-dvh w-screen touch-none select-none overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.78),transparent_28%),linear-gradient(180deg,#dfe7f1_0%,#d5dee9_100%)] ${
        isDragging ? "cursor-grabbing" : "cursor-grab"
      }`}
      onPointerCancel={finishGesture}
      onPointerDown={handlePointerDown}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      onPointerOut={handlePointerOut}
      onPointerOver={handlePointerOver}
      onPointerUp={finishGesture}
      onWheel={handleWheel}
    >
      {isBattleMode ? (
        <GameHud
          actionPoints={hasLiveSnapshot ? actionPoints : null}
          capturedTownCount={capturedTownCount}
          compact={isCompactHud}
          contestedTownCount={contestedTownCount}
          nextActionPointIn={nextActionPointIn}
          seasonLabel={seasonLabel}
          seasonTimeRemaining={seasonTimeRemaining}
        />
      ) : null}

      {isBattleMode ? (
        <ActivityFeed
          events={activityEvents}
          now={serverNow}
          showDismissVeil={showDismissVeil}
        />
      ) : null}

      <div
        className="pointer-events-none absolute flex items-center gap-2"
        style={{
          left: "calc(env(safe-area-inset-left, 0px) + 0.75rem)",
          top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
        }}
      >
        {isSettingsOpen && showDismissVeil ? (
          <button
            aria-label="Close settings"
            className="pointer-events-auto fixed inset-0 z-20 cursor-default bg-transparent"
            data-ui-control="true"
            onClick={handleSettingsBackdropClick}
            onPointerDown={handleSettingsBackdropPointerDown}
            type="button"
          />
        ) : null}

        <div
          ref={settingsPanelRef}
          className={`pointer-events-auto relative cursor-default select-text ${
            isSettingsOpen ? "z-30" : "z-10"
          }`}
          data-ui-control="true"
        >
          <button
            aria-expanded={isSettingsOpen}
            aria-haspopup="menu"
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-white/75 bg-white/82 text-slate-700 shadow-[0_10px_30px_rgba(15,23,42,0.14)] backdrop-blur transition hover:bg-white"
            data-ui-control="true"
            onClick={handleSettingsButtonClick}
            onPointerDown={handleSettingsButtonPointerDown}
            type="button"
          >
            <Settings2 className="h-4 w-4" strokeWidth={2.1} />
          </button>

          {isSettingsOpen ? (
            <div
              className="absolute left-0 top-full mt-2 w-[18.5rem] cursor-default select-text overflow-hidden rounded-2xl border border-white/75 bg-white/92 shadow-[0_18px_40px_rgba(15,23,42,0.18)] backdrop-blur"
              data-ui-control="true"
              role="menu"
            >
              <div className="border-b border-slate-200/80 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Settings
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    Battle mode
                  </p>
                  <p className="text-xs font-medium text-slate-500">
                    Show contested and captured territory
                  </p>
                </div>

                <button
                  aria-checked={isBattleMode}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition ${
                    isBattleMode ? "bg-slate-950" : "bg-slate-300"
                  }`}
                  data-ui-control="true"
                  onClick={handleBattleModeToggleClick}
                  onPointerDown={handleBattleModeTogglePointerDown}
                  role="switch"
                  type="button"
                >
                  <span
                    className={`h-5 w-5 rounded-full bg-white shadow-[0_2px_8px_rgba(15,23,42,0.18)] transition ${
                      isBattleMode ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    {labelsSettingLabel}
                  </p>
                  <p className="text-xs font-medium text-slate-500">
                    Show labels on the map
                  </p>
                </div>

                <button
                  aria-checked={showTownLabels}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition ${
                    showTownLabels ? "bg-slate-950" : "bg-slate-300"
                  }`}
                  data-ui-control="true"
                  onClick={handleTownLabelsToggleClick}
                  onPointerDown={handleTownLabelsTogglePointerDown}
                  role="switch"
                  type="button"
                >
                  <span
                    className={`h-5 w-5 rounded-full bg-white shadow-[0_2px_8px_rgba(15,23,42,0.18)] transition ${
                      showTownLabels ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-950">Legend</p>
                  <p className="text-xs font-medium text-slate-500">
                    {legendDescription}
                  </p>
                </div>

                <button
                  className="shrink-0 cursor-pointer rounded-full border border-slate-200 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                  data-ui-control="true"
                  onClick={handleLegendToggleClick}
                  onPointerDown={handleLegendTogglePointerDown}
                  type="button"
                >
                  {isLegendOpen ? "Hide" : "Open"}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {!isAtInitialView ? (
          <button
            data-ui-control="true"
            className="pointer-events-auto relative z-10 cursor-pointer rounded-full border border-white/75 bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_30px_rgba(15,23,42,0.16)] transition hover:bg-slate-800"
            onClick={handleResetButtonClick}
            onPointerDown={handleResetButtonPointerDown}
            type="button"
          >
            Reset
          </button>
        ) : null}
      </div>

      {isLegendOpen ? (
        <aside
          className={`pointer-events-auto absolute flex w-[min(24rem,calc(100vw-1.5rem))] cursor-default select-text flex-col overflow-hidden rounded-3xl border border-white/75 bg-white/92 shadow-[0_18px_48px_rgba(15,23,42,0.18)] backdrop-blur ${
            isMobileViewport ? "z-30" : "z-10"
          }`}
          data-ui-control="true"
          style={{
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)",
            right: "calc(env(safe-area-inset-right, 0px) + 0.75rem)",
            top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)",
          }}
        >
          <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">Legend</p>
              <p className="text-xs font-medium text-slate-500">All regions</p>
            </div>

            <button
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50"
              data-ui-control="true"
              onClick={() => setIsLegendOpen(false)}
              onPointerDown={handleLegendTogglePointerDown}
              type="button"
            >
              <X className="h-4 w-4" strokeWidth={2.1} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-2 py-2">
            <div className="space-y-2">
              {displayedLegendGroups.map((group) => {
                const isExpanded = expandedLegendRegions.includes(group.region);

                return (
                  <div
                    key={group.region}
                    className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90"
                  >
                    <button
                      className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-3 text-left transition hover:bg-slate-50"
                      data-ui-control="true"
                      onClick={() => handleLegendRegionToggle(group.region)}
                      type="button"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          aria-hidden="true"
                          className="h-3 w-3 shrink-0 rounded-full shadow-inner shadow-black/10"
                          style={{ backgroundColor: group.color }}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">
                            {group.region}
                          </p>
                          <p className="text-xs font-medium text-slate-500">
                            {group.townCount} {placeNounPlural}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 text-slate-500">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" strokeWidth={2.1} />
                        ) : (
                          <ChevronRight className="h-4 w-4" strokeWidth={2.1} />
                        )}
                      </div>
                    </button>

                    {isExpanded ? (
                      <div className="border-t border-slate-200/80 bg-slate-50/80 px-3 py-3">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                          {group.towns.map((town) => (
                            <p
                              key={`${group.region}-${town}`}
                              className="text-xs font-medium text-slate-700"
                            >
                              {town}
                            </p>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      ) : null}

      {selectedTownContext && !shouldHideSelectedTownPanel ? (
        <TownBattlePanel
          actionPoints={hasLiveSnapshot ? actionPoints : null}
          battleState={selectedTownContext.town}
          captureProtectionRemaining={
            selectedTownContext.captureProtectionRemaining
          }
          isCaptureProtected={selectedTownContext.isCaptureProtected}
          onClose={() => updateSelectedTownId(null)}
          onDefend={() => onDefend(selectedTownContext.town.townName)}
          onInvade={(region) =>
            onInvade(selectedTownContext.town.townName, region)
          }
          statusMessage={statusMessage}
          validInvadingRegions={selectedTownContext.validInvadingRegions}
        />
      ) : activeTown && !shouldHideActiveTownTooltip ? (
        <div
          className="pointer-events-none absolute z-10 max-w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-white/75 bg-white/86 px-4 py-3 shadow-[0_12px_32px_rgba(15,23,42,0.14)] backdrop-blur"
          style={{
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)",
            left: "calc(env(safe-area-inset-left, 0px) + 0.75rem)",
            right: "calc(env(safe-area-inset-right, 0px) + 0.75rem)",
          }}
        >
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 rounded-full shadow-inner shadow-black/10"
              style={{ backgroundColor: activeTown.regionColor }}
            />
            <div>
              <p className="text-sm font-semibold text-slate-950">
                {activeTown.town}
              </p>
              <p className="text-xs font-medium text-slate-600">
                {activeTown.region} ({activeTown.controlCount} {placeNounPlural}
                )
              </p>
              <p className="text-[11px] font-medium text-slate-500">
                {isBattleMode && activeTown.battleState
                  ? townVisualStates[activeTown.townId]?.isCaptureProtected
                    ? "Captured territory"
                    : activeTown.battleState.isContested
                      ? `${activeTown.battleState.contestingRegion} invading (${activeTown.battleState.captureProgress}/${CAPTURE_POINTS_TO_CAPTURE})`
                      : "Secure territory"
                  : null}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {camera && viewport ? (
        <div
          ref={mapLayerRef}
          className="absolute origin-top-left [contain:layout_paint_size]"
          style={mapLayerStyle}
        >
          <MassachusettsMap
            aria-label={mapAriaLabel}
            className="block h-full w-full select-none"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            selectedTownId={isBattleMode ? selectedTownId : null}
            showTownLabels={showTownLabels}
            townVisualStates={isBattleMode ? townVisualStates : undefined}
            viewBox={getRenderViewBoxString(camera, viewport)}
          />
        </div>
      ) : null}
    </section>
  );
}

export default InteractiveMap;
