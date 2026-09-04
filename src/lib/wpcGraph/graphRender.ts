// wpcGraph/graphRender.ts — extracted from the WPC page (size-ratchet split).
// Pure canvas render helpers + the SimNode shape. No React state, no page scope:
// every input arrives as a parameter, so this is a byte-equivalent move.

import type React from 'react';
import type { GraphNode } from '@/lib/wholePersonGraphData';
import { attnNodeStyle, type AttentionTier } from '@/lib/wpcGraph/attention';

export interface SimNode extends GraphNode {
  r: number;
  attn?: AttentionTier;
  alpha?: number;
  signal?: boolean;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
  isCross?: boolean;
}

// ── Draw a sphere-quality node on Canvas 2D ───────────────────────────────────
function drawSphereNode(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  isMaria: boolean,
  isCross: boolean,
  pulse: boolean,
  flashActive: boolean,
  consentPending: boolean,
  opacity: number,
  time: number,
  highlighted: boolean,
  chainActive: boolean,
  chainProgress: number, // 0–1 for the traveling pulse
  validUntilDays: number | undefined,
  propertyRichness: number | undefined,
  isAgent: boolean,
  signalPulse = false
): void {
  ctx.save();
  ctx.globalAlpha = opacity;

  // Outer bloom glow
  const glowR = r + (isMaria ? 40 : 22);
  const glowGrad = ctx.createRadialGradient(x, y, r * 0.5, x, y, glowR);
  glowGrad.addColorStop(0, color + (isMaria ? 'aa' : '66'));
  glowGrad.addColorStop(0.4, color + '33');
  glowGrad.addColorStop(1, color + '00');
  ctx.beginPath();
  ctx.arc(x, y, glowR, 0, Math.PI * 2);
  ctx.fillStyle = glowGrad;
  ctx.fill();

  if (isMaria) {
    const glow2R = r + 65;
    const glow2 = ctx.createRadialGradient(x, y, r, x, y, glow2R);
    glow2.addColorStop(0, color + '44');
    glow2.addColorStop(1, color + '00');
    ctx.beginPath();
    ctx.arc(x, y, glow2R, 0, Math.PI * 2);
    ctx.fillStyle = glow2;
    ctx.fill();
  }

  // Signal pulse — strong expanding attention ring (Phase 1, non-golden signal node).
  if (signalPulse && !isCross) {
    const t = (time % 1800) / 1800;
    const ease = 1 - Math.pow(1 - t, 3);
    ctx.save();
    ctx.globalAlpha = opacity * (1 - t) * 0.9;
    ctx.beginPath();
    ctx.arc(x, y, r + 6 + ease * 24, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }

  // Pulse ring animation
  if (pulse && !isCross) {
    const pulseScale = 1 + 0.18 * Math.sin(time * 0.003);
    const pulseR = r * pulseScale + 8;
    ctx.beginPath();
    ctx.arc(x, y, pulseR, 0, Math.PI * 2);
    ctx.strokeStyle = color + 'aa';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Consent pending dashed ring
  if (consentPending) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r + 5, 0, Math.PI * 2);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── Temporal validity arc ─────────────────────────────────────────────────
  // Drawn just outside the node as a depleting arc (full = 90d, empty = 0d)
  if (validUntilDays !== undefined) {
    const maxDays = 90;
    const fraction = Math.min(validUntilDays / maxDays, 1);
    const arcR = r + 9;
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + fraction * Math.PI * 2;
    const arcColor =
      validUntilDays <= 14 ? '#ef4444' : validUntilDays <= 30 ? '#f59e0b' : '#4ade80';

    // Background track
    ctx.beginPath();
    ctx.arc(x, y, arcR, 0, Math.PI * 2);
    ctx.strokeStyle = arcColor + '22';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Filled arc
    ctx.beginPath();
    ctx.arc(x, y, arcR, startAngle, endAngle);
    ctx.strokeStyle = arcColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Pulsing tip dot
    const tipX = x + arcR * Math.cos(endAngle);
    const tipY = y + arcR * Math.sin(endAngle);
    const tipPulse = 0.7 + 0.3 * Math.sin(time * 0.004);
    ctx.beginPath();
    ctx.arc(tipX, tipY, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = arcColor;
    ctx.globalAlpha = opacity * tipPulse;
    ctx.fill();
    ctx.globalAlpha = opacity;
  }

  // ── Property richness indicator ───────────────────────────────────────────
  // Small segmented arc on the inner border of the node
  if (propertyRichness !== undefined && !isMaria) {
    const segments = 8;
    const filled = Math.round(propertyRichness * segments);
    const segR = r - 3;
    const richColor =
      propertyRichness >= 0.8 ? '#4ade80' : propertyRichness >= 0.5 ? '#f59e0b' : '#ef444488';
    const gapAngle = 0.08;
    const segAngle = (Math.PI * 2 - segments * gapAngle) / segments;

    for (let i = 0; i < segments; i++) {
      const startA = -Math.PI / 2 + i * (segAngle + gapAngle);
      const endA = startA + segAngle;
      ctx.beginPath();
      ctx.arc(x, y, segR, startA, endA);
      ctx.strokeStyle = i < filled ? richColor : richColor.replace('80', '20') + '33';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Agent node — hexagonal outer ring
  if (isAgent) {
    const hexR = r + 6;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 - Math.PI / 6;
      const hx = x + hexR * Math.cos(angle);
      const hy = y + hexR * Math.sin(angle);
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.strokeStyle = color + 'cc';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Main sphere
  const highlightX = x - r * 0.3;
  const highlightY = y - r * 0.3;
  const sphereGrad = ctx.createRadialGradient(highlightX, highlightY, r * 0.05, x, y, r);

  if (flashActive) {
    sphereGrad.addColorStop(0, '#ffffff');
    sphereGrad.addColorStop(0.3, color);
    sphereGrad.addColorStop(1, '#000000cc');
  } else {
    sphereGrad.addColorStop(0, '#ffffffcc');
    sphereGrad.addColorStop(0.12, color + 'ff');
    sphereGrad.addColorStop(0.55, color + 'dd');
    sphereGrad.addColorStop(1, '#000000ee');
  }

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = sphereGrad;
  ctx.globalAlpha = opacity * (isCross ? 0.65 : 1);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = isMaria ? color : color + 'cc';
  ctx.lineWidth = isMaria ? 3 : isCross ? 1.5 : 2;
  ctx.globalAlpha = opacity * (isCross ? 0.5 : 0.9);
  ctx.stroke();

  // Signal highlight ring
  if (highlighted) {
    ctx.globalAlpha = 1;
    const ringR = r + (validUntilDays !== undefined ? 14 : 7);
    const ringGlow = ctx.createRadialGradient(x, y, ringR - 4, x, y, ringR + 8);
    ringGlow.addColorStop(0, color + 'cc');
    ringGlow.addColorStop(0.5, color + '66');
    ringGlow.addColorStop(1, color + '00');
    ctx.beginPath();
    ctx.arc(x, y, ringR + 8, 0, Math.PI * 2);
    ctx.fillStyle = ringGlow;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Chain traversal pulse ring
  if (chainActive && chainProgress > 0) {
    ctx.globalAlpha = chainProgress * opacity;
    const chainR = r + 12 + (1 - chainProgress) * 20;
    ctx.beginPath();
    ctx.arc(x, y, chainR, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, chainR, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.globalAlpha = opacity;
  }

  ctx.restore();
}

// ── Standalone render helper ──────────────────────────────────────────────────
export function renderFrame(
  canvas: HTMLCanvasElement,
  timestamp: number,
  dimensions: { width: number; height: number },
  dpr: number,
  transform: { k: number; x: number; y: number },
  nodes: SimNode[],
  highlightRef: React.MutableRefObject<string[]>,
  flashRef: React.MutableRefObject<string[]>,
  chainRef: React.MutableRefObject<{ nodeId: string; progress: number }[]>
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width: w, height: h } = dimensions;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
  bgGrad.addColorStop(0, '#0c0c1a');
  bgGrad.addColorStop(1, '#030305');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.028)';
  for (let gx = 0; gx < w; gx += 28) {
    for (let gy = 0; gy < h; gy += 28) {
      ctx.beginPath();
      ctx.arc(gx, gy, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const { k, x: tx, y: ty } = transform;
  ctx.translate(tx, ty);
  ctx.scale(k, k);
  const hlSet = new Set(highlightRef.current);
  const flashSet = new Set(flashRef.current);
  const chainMap = new Map(chainRef.current.map((c) => [c.nodeId, c.progress]));

  nodes.forEach((n) => {
    const anchorNode = n.id === 'n01' || n.type === 'Agent';
    const opacity = n.alpha ?? (anchorNode ? 1 : attnNodeStyle(n.attn ?? 'context').alpha);
    const highlighted =
      (hlSet.size > 0 && hlSet.has(n.id)) ||
      (!anchorNode && (n.attn === 'act' || (n.signal ?? false)));
    const chainProgress = chainMap.get(n.id) ?? 0;
    const chainActive = chainMap.has(n.id);
    drawSphereNode(
      ctx,
      n.x,
      n.y,
      n.r,
      n.color,
      n.id === 'n01',
      n.isCross ?? false,
      n.pulse ?? false,
      flashSet.has(n.id),
      n.consentPending ?? false,
      opacity,
      timestamp,
      highlighted,
      chainActive,
      chainProgress,
      n.validUntilDays,
      n.propertyRichness,
      n.type === 'Agent',
      n.signal ?? false
    );
  });
  ctx.restore();
}
