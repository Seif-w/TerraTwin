import { useEffect, useRef } from "react";
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  LogarithmicScale,
  PointElement,
  Tooltip,
  type ChartConfiguration,
} from "chart.js";

// Only the pieces this site actually draws are registered, which keeps the chart chunk small.
Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  LogarithmicScale,
  PointElement,
  Tooltip,
);

Chart.defaults.color = "#b8c6de";
Chart.defaults.borderColor = "rgba(255,255,255,0.07)";
Chart.defaults.font.family = "Inter, system-ui, sans-serif";
Chart.defaults.font.size = 11;

export default function ChartBox({
  config,
  height = 220,
  ariaLabel,
}: {
  config: ChartConfiguration;
  height?: number;
  ariaLabel: string;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    // StrictMode remounts and HMR can leave an instance attached to this canvas;
    // Chart.js refuses a second one, so reclaim it before constructing.
    Chart.getChart(el)?.destroy();
    const chart = new Chart(el, {
      ...config,
      options: { responsive: true, maintainAspectRatio: false, ...config.options },
    });
    return () => chart.destroy();
  }, [config]);

  return (
    <div style={{ height, position: "relative" }}>
      <canvas ref={canvas} role="img" aria-label={ariaLabel} />
    </div>
  );
}
