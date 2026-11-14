import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: string;
}

/** Keeps a render failure visible instead of leaving a blank page. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ info: info.componentStack ?? "" });
    // also mirrored to the console so tooling can pick it up
    console.error("[TerraTwin] render failure", error, info);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="shell">
        <div className="errorbox" style={{ marginTop: 24 }}>
          <b>The interface hit a render failure instead of showing placeholder content.</b>
          <code>{this.state.error.message}</code>
          <code>{(this.state.info || "").split("\n").slice(0, 8).join("\n")}</code>
          <p style={{ marginTop: 12 }}>
            Reload the page, or check that the artifact files under <code>/data/</code> are present.
          </p>
          <button className="btn" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
