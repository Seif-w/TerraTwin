import { useEffect, useState } from "react";
import { Link, RouterProvider, useRouter, type Route } from "./lib/router";
import { loadDataset, type Dataset } from "./lib/artifacts";
import Home from "./views/Home";
import BrandIcon from "./components/BrandIcon";
import DataLayers from "./views/DataLayers";
import PhotoView from "./views/PhotoView";
import MarsSamples from "./views/MarsSamples";
import HowItWorks from "./views/HowItWorks";

const TABS: { to: Route; label: string }[] = [
  { to: "/", label: "Home" },
  { to: "/photo", label: "Find a place" },
  { to: "/mars-samples", label: "Mars samples" },
  { to: "/data-layers", label: "Explore" },
  { to: "/how-it-works", label: "How it works" },
];

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string; files: string[] }
  | { kind: "ready"; data: Dataset };

export default function App() {
  return (
    <RouterProvider>
      <Shell />
    </RouterProvider>
  );
}

function Shell() {
  const { route } = useRouter();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    loadDataset()
      .then((data) => alive && setState({ kind: "ready", data }))
      .catch((err: unknown) => {
        if (!alive) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
          files: [
            "data/ml_products.json",
            "data/terratwin_ml_ranked.json",
            "data/transferability_report.csv",
            "data/reference.json",
            "data/bodies.json",
            "data/photo_label_schema.json",
            "samples/samples.json",
            "data/mars_samples.json",
          ],
        });
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="TerraTwin home">
          <BrandIcon />
          <span>
            Terra<em>Twin</em>
          </span>
        </Link>
        <nav className="nav" aria-label="Primary">
          {TABS.map((t) => (
            <Link key={t.to} to={t.to} className={route === t.to ? "active" : undefined}>
              {t.label}
            </Link>
          ))}
        </nav>
      </header>

      {state.kind === "loading" && <Booting />}
      {state.kind === "error" && <ArtifactFailure state={state} onRetry={() => location.reload()} />}

      {state.kind === "ready" && (
        <main className="stack">
          {route === "/" && <Home data={state.data} />}
          {route === "/data-layers" && <DataLayers data={state.data} />}
          {route === "/photo" && <PhotoView data={state.data} />}
          {route === "/mars-samples" && <MarsSamples data={state.data} />}
          {route === "/how-it-works" && <HowItWorks data={state.data} />}
        </main>
      )}

      <footer className="footer">
        <span className="provenance">TerraTwin · Explore similar environments</span>
        <span className="version-label">Global preview · 2</span>
      </footer>
    </div>
  );
}

function Booting() {
  return (
    <div className="panel">
      <div className="kicker">TerraTwin</div>
      <h2>Loading places…</h2>
      <div className="panel-sub">Getting the latest supplied records ready.</div>
      <div className="spinner" />
    </div>
  );
}

function ArtifactFailure({
  state,
  onRetry,
}: {
  state: { kind: "error"; message: string; files: string[] };
  onRetry: () => void;
}) {
  return (
    <div className="errorbox">
      <b>We could not load the places right now.</b>
      <p>Try again in a moment. If the problem continues, the supplied data files may be unavailable.</p>
      <code>{state.message}</code>
      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer" }}>Files checked</summary>
        <ul className="list">
          {state.files.map((file) => (
            <li key={file}><code>/{file}</code></li>
          ))}
        </ul>
      </details>
      <button className="btn" onClick={onRetry}>Try again</button>
    </div>
  );
}
