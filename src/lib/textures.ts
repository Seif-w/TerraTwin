/** Procedural planet textures - reused from the original index1.html.
 *  الباك إند مطلوبش: النسيج يترسم في المتصفح، فماش مصدر خارجي ممكن يفشل. */

export type Body = "moon" | "mars";

const W = 2048;
const H = 1024;

function makeTexture(type: Body): string {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  if (type === "moon") {
    ctx.fillStyle = "#8b8d91";
    ctx.fillRect(0, 0, W, H);
    // maria: dark basalt plains
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const r = 60 + Math.random() * 190;
      const g = ctx.createRadialGradient(x, y, 6, x, y, r);
      g.addColorStop(0, "rgba(55, 58, 64, 0.78)");
      g.addColorStop(1, "rgba(139, 141, 145, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // highland craters
    for (let i = 0; i < 460; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const r = 2 + Math.random() * 22;
      ctx.strokeStyle = "rgba(222, 226, 232, 0.42)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(65, 68, 74, 0.4)";
      ctx.beginPath();
      ctx.arc(x + 1, y + 1, r * 0.85, 0, Math.PI * 2);
      ctx.fill();
    }
    // polar frost hints at the south pole terrain
    ctx.fillStyle = "rgba(240, 246, 255, 0.5)";
    ctx.fillRect(0, H - 26, W, 26);
  } else {
    const base = ctx.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0, "#d97742");
    base.addColorStop(0.5, "#b84a27");
    base.addColorStop(1, "#c96234");
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * W;
      const y = 40 + Math.random() * (H - 80);
      const r = 30 + Math.random() * 150;
      const g = ctx.createRadialGradient(x, y, 6, x, y, r);
      g.addColorStop(0, "rgba(78, 32, 18, 0.62)");
      g.addColorStop(1, "rgba(184, 74, 39, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * W;
      const y = 40 + Math.random() * (H - 80);
      const r = 2 + Math.random() * 14;
      ctx.strokeStyle = "rgba(245, 165, 120, 0.32)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(248, 250, 252, 0.85)";
    ctx.fillRect(0, 0, W, 30);
    ctx.fillRect(0, H - 30, W, 30);
  }
  return canvas.toDataURL("image/jpeg", 0.92);
}

const cache: Partial<Record<Body | "earth", string>> = {};

export function planetTexture(type: Body): string {
  if (!cache[type]) cache[type] = makeTexture(type);
  return cache[type] as string;
}

export const EARTH_TEXTURE = "/textures/earth-blue-marble.jpg";
export const EARTH_BUMP = "/textures/earth-topology.png";
export const SKY_TEXTURE = "/textures/night-sky.png";
