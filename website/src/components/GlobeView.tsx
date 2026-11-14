/** globe.gl wrapper. The library is imported dynamically so the 3D chunk only loads
 * when a globe is actually mounted, and every layer is driven by props. */

import { useEffect, useRef, useState, type ReactNode } from "react";
import Globe, { type GlobeInstance } from "globe.gl";
import { SKY_TEXTURE } from "../lib/textures";

export interface GlobePoint {
  lat: number;
  lng: number;
  label?: string;
  detail?: string;
  color?: string;
  size?: number;
  value?: number;
  id?: string;
  rank?: number;
  selected?: boolean;
}

export interface GlobeArc {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
}

export interface GlobeRing {
  lat: number;
  lng: number;
  color?: string;
}

export interface GlobeViewProps {
  texture: string;
  bumpTexture?: string;
  atmosphere?: { color: string; altitude: number };
  points?: GlobePoint[];
  flags?: GlobePoint[];
  arcs?: GlobeArc[];
  rings?: GlobeRing[];
  focus?: { lat: number; lng: number; altitude: number } | null;
  height?: number;
  autoRotate?: number;
  onPointClick?: (p: GlobePoint) => void;
  onGlobeReady?: () => void;
  errorFallback?: ReactNode;
  label?: string;
}

const MIN_ALTITUDE = 0.22;
const MAX_ALTITUDE = 2.5;
const SAFE_CYAN = "#38bdf8";

export default function GlobeView({
  texture,
  bumpTexture,
  atmosphere,
  points = [],
  flags = [],
  arcs = [],
  rings = [],
  focus,
  height = 360,
  autoRotate = 0.55,
  onPointClick,
  onGlobeReady,
  errorFallback,
  label,
}: GlobeViewProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const globe = useRef<GlobeInstance | null>(null);
  const focusRef = useRef(focus);
  const readyCallbackRef = useRef(onGlobeReady);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const clickRef = useRef(onPointClick);
  clickRef.current = onPointClick;
  focusRef.current = focus;
  readyCallbackRef.current = onGlobeReady;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let frameHandle = 0;
    const frame = el.parentElement;
    const widthFor = () => Math.max(200, el.clientWidth || frame?.clientWidth || 480);
    setError(false);

    try {
      const g = new Globe(el)
        .width(widthFor())
        .height(height)
        .backgroundColor("rgba(0,0,0,0)")
        .globeImageUrl(texture)
        .pointAltitude(0.018)
        // size is supplied per point (learned quality for tiles, constant for named sites)
        .pointRadius((d: object) => (d as GlobePoint).size ?? 0.34)
        .pointColor((d: object) => safeColor((d as GlobePoint).color))
        .pointsTransitionDuration(600)
        .pointLabel((d: object) => tipHtml(d as GlobePoint))
        .onPointClick((d: object) => clickRef.current?.(d as GlobePoint))
        .htmlAltitude(0.012)
        .htmlElement((d: object) => {
          const p = d as GlobePoint;
          const button = document.createElement("button");
          const title = `${p.label ?? "Earth match"}${p.detail ? ` · ${p.detail}` : ""}`;
          button.className = `globe-flag ${p.selected ? "is-selected" : ""}`;
          button.style.setProperty("--flag-color", safeColor(p.color));
          button.type = "button";
          // DOM properties/textContent are used rather than HTML interpolation.
          button.title = title;
          button.setAttribute("aria-label", title);
          button.setAttribute("aria-pressed", String(!!p.selected));
          const cloth = document.createElement("span");
          cloth.className = "flag-cloth";
          cloth.textContent = String(p.rank ?? "");
          button.append(cloth);
          button.addEventListener("click", (event) => {
            event.stopPropagation();
            clickRef.current?.(p);
          });
          return button;
        })
        .htmlElementVisibilityModifier((htmlElement: HTMLElement, visible: boolean) => {
          htmlElement.style.visibility = visible ? "visible" : "hidden";
          htmlElement.style.pointerEvents = visible ? "auto" : "none";
        })
        .ringMaxRadius(4.2)
        .ringPropagationSpeed(2.1)
        .ringRepeatPeriod(1100)
        .ringColor((d: object) => safeColor((d as GlobeRing).color))
        .arcColor(() => "rgba(129, 140, 248, 0.68)")
        .arcDashLength(0.42)
        .arcDashGap(0.18)
        .arcDashAnimateTime(1600)
        .arcStroke(0.55);
      if (bumpTexture) g.bumpImageUrl(bumpTexture);
      if (atmosphere) {
        g.showAtmosphere(true).atmosphereColor(safeColor(atmosphere.color)).atmosphereAltitude(atmosphere.altitude);
      }
      const controls = g.controls();
      controls.enableZoom = false; // Page wheel scrolling stays available; explicit buttons zoom.
      controls.autoRotate = autoRotate > 0;
      controls.autoRotateSpeed = autoRotate;
      controls.addEventListener("start", () => {
        controls.autoRotate = false;
      });
      controls.minDistance = 102;
      controls.maxDistance = 520;
      globe.current = g;
      setReady(true);

      const resize = () => g.width(widthFor());
      resize();
      frameHandle = window.requestAnimationFrame(() => {
        resize();
        readyCallbackRef.current?.();
      });
      const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
      if (frame) observer?.observe(frame);
      return () => {
        if (frameHandle) window.cancelAnimationFrame(frameHandle);
        observer?.disconnect();
        g.pauseAnimation();
        el.innerHTML = "";
        globe.current = null;
        setReady(false);
      };
    } catch {
      globe.current = null;
      setReady(false);
      setError(true);
      return;
    }
  }, [texture, bumpTexture, height, autoRotate]);

  useEffect(() => {
    const g = globe.current;
    if (!g || !ready) return;
    g.pointsData(points as object[]);
  }, [points, ready]);

  useEffect(() => {
    const g = globe.current;
    if (!g || !ready) return;
    g.htmlElementsData(flags as object[]);
  }, [flags, ready]);

  useEffect(() => {
    const g = globe.current;
    if (!g || !ready) return;
    g.arcsData(arcs as object[]);
  }, [arcs, ready]);

  useEffect(() => {
    const g = globe.current;
    if (!g || !ready) return;
    g.ringsData(rings as object[]);
  }, [rings, ready]);

  useEffect(() => {
    const g = globe.current;
    if (!g || !ready || !focus) return;
    g.pointOfView({ lat: focus.lat, lng: focus.lng, altitude: clampAltitude(focus.altitude) }, 1100);
  }, [focus, ready]);

  const moveView = (direction: "in" | "out" | "reset" | "left" | "right") => {
    const g = globe.current;
    if (!g) return;
    if (direction === "reset") {
      const latestFocus = focusRef.current;
      if (latestFocus) {
        g.pointOfView({ ...latestFocus, altitude: clampAltitude(latestFocus.altitude) }, 700);
      } else {
        g.pointOfView({ lat: 20, lng: 0, altitude: 1.45 }, 700);
      }
      return;
    }
    const current = g.pointOfView();
    if (direction === "left" || direction === "right") {
      g.pointOfView({lng:(current.lng ?? 0)+(direction === "left" ? -35 : 35)},450);
      return;
    }
    const altitude = current.altitude ?? 1;
    const nextAltitude = direction === "in" ? altitude * 0.72 : altitude / 0.72;
    g.pointOfView({ altitude: clampAltitude(nextAltitude) }, 450);
  };

  return (
    <div className="globe-frame" aria-label={label}>
      {error ? (
        <div className="globe-error" role="status">
          {errorFallback ?? "3D view unavailable — use result cards below"}
        </div>
      ) : (
        <>
          <div ref={host} />
          <div className="globe-controls" aria-label="Globe view controls">
            <button className="btn" type="button" onClick={() => moveView("in")} aria-label="Zoom in">+</button>
            <button className="btn" type="button" onClick={() => moveView("out")} aria-label="Zoom out">−</button>
            <button className="btn" type="button" onClick={() => moveView("left")} aria-label="Rotate left">←</button>
            <button className="btn" type="button" onClick={() => moveView("right")} aria-label="Rotate right">→</button>
            <button className="btn" type="button" onClick={() => moveView("reset")}>Reset</button>
          </div>
          {!ready && (
            <div className="pending">
              <div className="spinner" />
              <span>Loading 3D renderer…</span>
            </div>
          )}
          <div className="hint">drag to rotate · use + / − to zoom</div>
        </>
      )}
    </div>
  );
}

function clampAltitude(value: number) {
  return Math.min(MAX_ALTITUDE, Math.max(MIN_ALTITUDE, Number.isFinite(value) ? value : 1));
}

function safeColor(value?: string) {
  return value && /^#[0-9a-f]{3,8}$/i.test(value) ? value : SAFE_CYAN;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function tipHtml(d: GlobePoint): string {
  const color = safeColor(d.color);
  const label = escapeHtml(d.label ?? "");
  const detail = escapeHtml(d.detail ?? "");
  return `<div style="background:rgba(8,14,28,.94);padding:8px 11px;border-radius:9px;
      border:1px solid rgba(120,200,255,.35);border-color:${color};color:#eef4ff;font-size:12px;
      font-family:Inter,sans-serif;max-width:260px;line-height:1.45;">
      <b>${label}</b>
      ${d.value != null ? `<div style="font-family:var(--mono);color:#38bdf8;">${d.value.toFixed(4)}</div>` : ""}
      ${detail ? `<div style="color:#b8c6de;margin-top:2px;">${detail}</div>` : ""}
    </div>`;
}

export { SKY_TEXTURE };
