import { Suspense, lazy, type ComponentProps } from "react";

const Inner = lazy(() => import("./GlobeView"));

/** Same props as GlobeView, but the 3D renderer (and its three.js payload) is fetched only
 *  when a globe is actually placed on the page. Text, tables and charts stay instant. */
export default function GlobeLazy(props: ComponentProps<typeof Inner>) {
  const height = props.height ?? 360;
  return (
    <Suspense
      fallback={
        <div
          className="globe-frame"
          style={{ height, display: "grid", placeItems: "center", gap: 8 }}
          role="status"
          aria-label="Loading 3D renderer"
        >
          <div className="spinner" />
        </div>
      }
    >
      <Inner {...props} />
    </Suspense>
  );
}
