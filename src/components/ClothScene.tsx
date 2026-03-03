import React, { useEffect, useRef, useState } from "react";

// ─── Blender-like cloth configuration ──────────────────────────────────────────

interface ClothConfig {
  // Structural
  structuralStiffness: number;
  maxTensionStrain: number;
  maxCompressionStrain: number;

  // Bending & Shear
  bendingStiffness: number;
  shearStiffness: number;

  // Damping
  velocityDamping: number;

  // Solver
  substeps: number;
  constraintIterations: number;

  // Pressure (2D area-based)
  pressureEnabled: boolean;
  pressureStrength: number;
  pressureDamping: number;
  pressureBoundaryRings: number;

  // Mouse interaction
  mousePullStrength: number;
  mouseMaxVelocity: number;

  // Recovery (rest-pose springs)
  recoveryStiffness: number;
  recoveryEaseMs: number;
}

const BLENDER_LIKE_FLAG: ClothConfig = {
  structuralStiffness: 0.8,
  maxTensionStrain: 1.15,
  maxCompressionStrain: 0.85,
  bendingStiffness: 0.3,
  shearStiffness: 0.5,
  velocityDamping: 0.998,
  substeps: 3,
  constraintIterations: 3,
  pressureEnabled: false,
  pressureStrength: 0,
  pressureDamping: 0.95,
  pressureBoundaryRings: 2,
  mousePullStrength: 0.25,
  mouseMaxVelocity: 15,
  recoveryStiffness: 80,
  recoveryEaseMs: 300,
};

const INTERACTIVE_STABLE: ClothConfig = {
  structuralStiffness: 1.0,
  maxTensionStrain: 1.05,
  maxCompressionStrain: 0.9,
  bendingStiffness: 0.5,
  shearStiffness: 0.7,
  velocityDamping: 0.997,
  substeps: 4,
  constraintIterations: 4,
  pressureEnabled: false,
  pressureStrength: 0,
  pressureDamping: 0.9,
  pressureBoundaryRings: 2,
  mousePullStrength: 0.3,
  mouseMaxVelocity: 12,
  recoveryStiffness: 120,
  recoveryEaseMs: 200,
};

// Suppress unused-variable lint for the preset that isn't assigned as a default
void BLENDER_LIKE_FLAG;

// ─── Component ─────────────────────────────────────────────────────────────────

interface ClothSimulationProps {
  clothWidth?: number;
  clothHeight?: number;
  spacing?: number;
  gravity?: number;
  mouseInfluence?: number;
  mouseCut?: number;
  tearDistance?: number;
  backgroundColor?: string;
  textureSrc?: string;
  config?: ClothConfig;
}

export const ClothSimulation: React.FC<ClothSimulationProps> = ({
  clothWidth = 30,
  clothHeight = 60,
  spacing = 10,
  gravity = 1200,
  mouseInfluence =62,
  mouseCut = 30,
  tearDistance = 60,
  backgroundColor = "transparent",
  textureSrc,
  config = INTERACTIVE_STABLE,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureRef = useRef<HTMLImageElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 300, height: 300 });

  // ResizeObserver to auto-size canvas to container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ width: Math.floor(width), height: Math.floor(height) });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Texture loading effect
  useEffect(() => {
    if (!textureSrc) {
      textureRef.current = null;
      return;
    }

    const img = new Image();
    img.src = textureSrc;

    img.onload = () => {
      textureRef.current = img;
    };

    img.onerror = () => {
      textureRef.current = null;
    };

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [textureSrc]);

  // Simulation effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvasSize.width === 0 || canvasSize.height === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cfg = config;
    const gridCols = clothWidth + 1;

    let mouseX = 0,
      mouseY = 0;
    let mouseDown = false;
    let mouseButton = 0;
    let releaseTime = 0;

    const smoothstep = (t: number) => t * t * (3 - 2 * t);

    // ─── Point ───────────────────────────────────────────────────────────────

    class Point {
      x: number;
      y: number;
      px: number;
      py: number;
      vx: number;
      vy: number;
      pinX: number | null;
      pinY: number | null;
      constraints: Constraint[];

      constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
        this.px = x;
        this.py = y;
        this.vx = 0;
        this.vy = 0;
        this.pinX = null;
        this.pinY = null;
        this.constraints = [];
      }

      update(delta: number) {
        if (mouseDown) {
          const dx = this.x - mouseX;
          const dy = this.y - mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (mouseButton === 0 && dist < mouseInfluence) {
            // Spring-like pull toward cursor
            const influence = 1.0 - dist / mouseInfluence;
            const pull = influence * cfg.mousePullStrength;
            this.x += (mouseX - this.x) * pull;
            this.y += (mouseY - this.y) * pull;
            // Partial velocity preservation (blend px toward x instead of snapping)
            this.px += (this.x - this.px) * pull;
            this.py += (this.y - this.py) * pull;
          } else if (mouseButton === 2 && dist < mouseCut) {
            this.constraints = this.constraints.filter(
              (constraint) =>
                Math.sqrt(
                  (constraint.p1.x - constraint.p2.x) ** 2 +
                    (constraint.p1.y - constraint.p2.y) ** 2
                ) > tearDistance
            );
          }
        }

        this.addForce(0, gravity);
        const dt2 = delta * delta;
        let nx = this.x + (this.x - this.px) * cfg.velocityDamping + (this.vx / 2) * dt2;
        let ny = this.y + (this.y - this.py) * cfg.velocityDamping + (this.vy / 2) * dt2;

        // Velocity clamping — prevent explosive displacement
        const velX = nx - this.x;
        const velY = ny - this.y;
        const speed = Math.sqrt(velX * velX + velY * velY);
        if (speed > cfg.mouseMaxVelocity) {
          const scale = cfg.mouseMaxVelocity / speed;
          nx = this.x + velX * scale;
          ny = this.y + velY * scale;
        }

        this.px = this.x;
        this.py = this.y;
        this.x = nx;
        this.y = ny;
        this.vy = this.vx = 0;
      }

      resolveConstraints() {
        if (this.pinX !== null && this.pinY !== null) {
          this.x = this.pinX;
          this.y = this.pinY;
          return;
        }

        for (const constraint of this.constraints) {
          constraint.resolve();
        }

        this.x = Math.max(1, Math.min(canvasSize.width - 1, this.x));
        this.y = Math.max(1, Math.min(canvasSize.height - 1, this.y));
      }

      attach(point: Point, restLength: number, type: ConstraintType) {
        this.constraints.push(new Constraint(this, point, restLength, type));
      }

      addForce(x: number, y: number) {
        this.vx += x;
        this.vy += y;
      }

      pin(pinx: number, piny: number) {
        this.pinX = pinx;
        this.pinY = piny;
      }
    }

    // ─── Constraint ──────────────────────────────────────────────────────────

    type ConstraintType = "structural" | "bending" | "shear";

    class Constraint {
      p1: Point;
      p2: Point;
      length: number;
      type: ConstraintType;

      constructor(p1: Point, p2: Point, restLength: number, type: ConstraintType) {
        this.p1 = p1;
        this.p2 = p2;
        this.length = restLength;
        this.type = type;
      }

      resolve() {
        const dx = this.p1.x - this.p2.x;
        const dy = this.p1.y - this.p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Tearing (structural only)
        if (this.type === "structural" && dist > tearDistance) {
          this.p1.constraints = this.p1.constraints.filter((c) => c !== this);
          this.p2.constraints = this.p2.constraints.filter((c) => c !== this);
          return;
        }

        if (dist < 1e-6) return;

        // Strain limiting — clamp effective distance to [min, max] strain
        let targetDist = dist;
        const strain = dist / this.length;
        if (strain > cfg.maxTensionStrain) {
          targetDist = this.length * cfg.maxTensionStrain;
        } else if (strain < cfg.maxCompressionStrain) {
          targetDist = this.length * cfg.maxCompressionStrain;
        }

        // Type-specific stiffness
        const stiffness =
          this.type === "structural"
            ? cfg.structuralStiffness
            : this.type === "bending"
              ? cfg.bendingStiffness
              : cfg.shearStiffness;

        // PBD positional correction
        const correction = (this.length - targetDist) * stiffness * 0.5;
        const nx = dx / dist;
        const ny = dy / dist;

        this.p1.x += nx * correction;
        this.p1.y += ny * correction;
        this.p2.x -= nx * correction;
        this.p2.y -= ny * correction;
      }
    }

    // ─── Texture rendering ───────────────────────────────────────────────────

    function drawTexturedTriangle(
      img: HTMLImageElement,
      x0: number, y0: number,
      x1: number, y1: number,
      x2: number, y2: number,
      u0: number, v0: number,
      u1: number, v1: number,
      u2: number, v2: number,
    ) {
      if (!ctx) return;

      const det = u0 * (v1 - v2) + u1 * (v2 - v0) + u2 * (v0 - v1);
      if (Math.abs(det) < 1e-10) return;

      const invDet = 1 / det;

      const a = ((x0 * (v1 - v2)) + (x1 * (v2 - v0)) + (x2 * (v0 - v1))) * invDet;
      const c = ((x0 * (u2 - u1)) + (x1 * (u0 - u2)) + (x2 * (u1 - u0))) * invDet;
      const e = ((x0 * (u1 * v2 - u2 * v1)) + (x1 * (u2 * v0 - u0 * v2)) + (x2 * (u0 * v1 - u1 * v0))) * invDet;

      const b = ((y0 * (v1 - v2)) + (y1 * (v2 - v0)) + (y2 * (v0 - v1))) * invDet;
      const d = ((y0 * (u2 - u1)) + (y1 * (u0 - u2)) + (y2 * (u1 - u0))) * invDet;
      const f = ((y0 * (u1 * v2 - u2 * v1)) + (y1 * (u2 * v0 - u0 * v2)) + (y2 * (u0 * v1 - u1 * v0))) * invDet;

      // Expand clip triangle slightly to eliminate seam gaps
      const cx = (x0 + x1 + x2) / 3;
      const cy = (y0 + y1 + y2) / 3;
      const expand = 0.8;
      const ex0 = x0 + (x0 - cx) * expand / Math.hypot(x0 - cx, y0 - cy || 1);
      const ey0 = y0 + (y0 - cy) * expand / Math.hypot(x0 - cx, y0 - cy || 1);
      const ex1 = x1 + (x1 - cx) * expand / Math.hypot(x1 - cx, y1 - cy || 1);
      const ey1 = y1 + (y1 - cy) * expand / Math.hypot(x1 - cx, y1 - cy || 1);
      const ex2 = x2 + (x2 - cx) * expand / Math.hypot(x2 - cx, y2 - cy || 1);
      const ey2 = y2 + (y2 - cy) * expand / Math.hypot(x2 - cx, y2 - cy || 1);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(ex0, ey0);
      ctx.lineTo(ex1, ey1);
      ctx.lineTo(ex2, ey2);
      ctx.closePath();
      ctx.clip();

      ctx.setTransform(a, b, c, d, e, f);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    }

    // ─── Cloth ───────────────────────────────────────────────────────────────

    class Cloth {
      points: Point[] = [];
      restX: number[] = [];
      restY: number[] = [];
      pressureMask: number[] = [];
      restArea: number = 0;

      constructor() {
        const startX = canvasSize.width / 2 - (clothWidth * spacing) / 2;

        for (let y = 0; y <= clothHeight; y++) {
          for (let x = 0; x <= clothWidth; x++) {
            const p = new Point(
              startX + x * spacing,
              10 + y * spacing
            );

            // Structural constraints (horizontal + vertical)
            if (x !== 0) p.attach(this.points[this.points.length - 1], spacing, "structural");
            if (y === 0) p.pin(p.x, p.y);
            if (y !== 0) p.attach(this.points[x + (y - 1) * gridCols], spacing, "structural");

            // Bending constraints (skip-1, resist folding)
            if (x >= 2) {
              p.attach(this.points[this.points.length - 2], spacing * 2, "bending");
            }
            if (y >= 2) {
              p.attach(this.points[x + (y - 2) * gridCols], spacing * 2, "bending");
            }

            // Shear constraints (diagonals, resist parallelogram distortion)
            if (x > 0 && y > 0) {
              p.attach(this.points[(x - 1) + (y - 1) * gridCols], spacing * Math.SQRT2, "shear");
            }
            if (x < clothWidth && y > 0) {
              p.attach(this.points[(x + 1) + (y - 1) * gridCols], spacing * Math.SQRT2, "shear");
            }

            this.points.push(p);
          }
        }

        // Build pressure boundary mask
        this.pressureMask = new Array(this.points.length).fill(1);
        for (let y = 0; y <= clothHeight; y++) {
          for (let x = 0; x <= clothWidth; x++) {
            const idx = y * gridCols + x;
            const distFromBorder = Math.min(x, clothWidth - x, y, clothHeight - y);
            if (distFromBorder < cfg.pressureBoundaryRings) {
              this.pressureMask[idx] = 0;
            }
          }
        }

        // Capture rest positions for recovery springs
        this.restX = this.points.map(p => p.x);
        this.restY = this.points.map(p => p.y);

        // Compute rest area for pressure
        this.restArea = this.computeArea();
      }

      computeArea(): number {
        let area = 0;
        for (let gy = 0; gy < clothHeight; gy++) {
          for (let gx = 0; gx < clothWidth; gx++) {
            const tl = this.points[gx + gy * gridCols];
            const tr = this.points[(gx + 1) + gy * gridCols];
            const bl = this.points[gx + (gy + 1) * gridCols];
            area += 0.5 * ((tr.x - tl.x) * (bl.y - tl.y) - (bl.x - tl.x) * (tr.y - tl.y));
          }
        }
        return Math.abs(area);
      }

      applyPressure() {
        if (!cfg.pressureEnabled) return;

        const currentArea = this.computeArea();
        const areaError = this.restArea - currentArea;
        const force = areaError * cfg.pressureStrength * cfg.pressureDamping;

        // Distribute force along per-vertex approximate normals
        for (let gy = 0; gy < clothHeight; gy++) {
          for (let gx = 0; gx < clothWidth; gx++) {
            const tlIdx = gx + gy * gridCols;
            const trIdx = (gx + 1) + gy * gridCols;
            const blIdx = gx + (gy + 1) * gridCols;

            const tl = this.points[tlIdx];
            const tr = this.points[trIdx];
            const bl = this.points[blIdx];

            // Edge normals (perpendicular, pointing outward from triangle)
            const edgeX = tr.x - tl.x;
            const edgeY = tr.y - tl.y;
            const normalX = -edgeY;
            const normalY = edgeX;
            const len = Math.sqrt(normalX * normalX + normalY * normalY);
            if (len < 1e-6) continue;

            const fx = (normalX / len) * force / 3;
            const fy = (normalY / len) * force / 3;

            // Apply with mask
            if (this.pressureMask[tlIdx] > 0) { tl.addForce(fx, fy); }
            if (this.pressureMask[trIdx] > 0) { tr.addForce(fx, fy); }
            if (this.pressureMask[blIdx] > 0) { bl.addForce(fx, fy); }
          }
        }
      }

      update(elapsed: number, windStrength: number, dragging: boolean) {
        const subDt = 0.016 / cfg.substeps;
        const windX = Math.sin(elapsed * 0.003) * windStrength
                     + Math.sin(elapsed * 0.007) * windStrength * 0.3;

        // Recovery ease: ramp up from 0→1 over recoveryEaseMs after release
        let recoveryFactor = 0;
        if (!dragging) {
          const timeSinceRelease = elapsed - releaseTime;
          recoveryFactor = smoothstep(Math.min(1, timeSinceRelease / cfg.recoveryEaseMs));
        }

        for (let s = 0; s < cfg.substeps; s++) {
          // Apply wind each substep (vx/vy are zeroed at end of Point.update)
          this.points.forEach((p) => {
            if (p.pinX === null) {
              p.addForce(windX, Math.sin(elapsed * 0.005 + p.x * 0.01) * windStrength * 0.15);
            }
          });

          // Recovery: spring force toward rest pose (disabled during drag)
          if (recoveryFactor > 0) {
            const strength = cfg.recoveryStiffness * recoveryFactor;
            this.points.forEach((p, i) => {
              if (p.pinX === null) {
                p.addForce(
                  (this.restX[i] - p.x) * strength,
                  (this.restY[i] - p.y) * strength
                );
              }
            });
          }

          this.applyPressure();

          for (let i = 0; i < cfg.constraintIterations; i++) {
            this.points.forEach((p) => p.resolveConstraints());
          }
          this.points.forEach((p) => p.update(subDt));
        }
      }

      draw() {
        if (!ctx) return;

        const img = textureRef.current;

        if (img) {
          const imgW = img.naturalWidth;
          const imgH = img.naturalHeight;

          for (let gy = 0; gy < clothHeight; gy++) {
            for (let gx = 0; gx < clothWidth; gx++) {
              const tl = this.points[gx + gy * gridCols];
              const tr = this.points[(gx + 1) + gy * gridCols];
              const bl = this.points[gx + (gy + 1) * gridCols];
              const br = this.points[(gx + 1) + (gy + 1) * gridCols];

              const u_l = (gx / clothWidth) * imgW;
              const u_r = ((gx + 1) / clothWidth) * imgW;
              const v_t = (gy / clothHeight) * imgH;
              const v_b = ((gy + 1) / clothHeight) * imgH;

              drawTexturedTriangle(
                img,
                tl.x, tl.y, tr.x, tr.y, bl.x, bl.y,
                u_l, v_t, u_r, v_t, u_l, v_b
              );

              drawTexturedTriangle(
                img,
                tr.x, tr.y, br.x, br.y, bl.x, bl.y,
                u_r, v_t, u_r, v_b, u_l, v_b
              );
            }
          }
        }
      }
    }

    const cloth = new Cloth();
    const startTime = performance.now();

    // ─── Mouse-only event handlers ───────────────────────────────────────────

    const handleMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
      mouseDown = true;
      mouseButton = e.button;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    };

    const handleMouseUp = () => {
      mouseDown = false;
      releaseTime = performance.now() - startTime;
    };

    const handleMouseLeave = () => {
      mouseDown = false;
      releaseTime = performance.now() - startTime;
    };

    const handleWindowMouseUp = () => {
      if (mouseDown) {
        mouseDown = false;
        releaseTime = performance.now() - startTime;
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // ─── Wind ────────────────────────────────────────────────────────────────

    const WIND_BASE = 450;
    const WIND_BOOST_MULT = 10.0;
    const WIND_BOOST_DURATION = 3500;
    const WIND_BOOST_EASE = 600;

    // ─── Animation loop ─────────────────────────────────────────────────────

    let animationFrameId: number;
    const update = () => {
      const elapsed = performance.now() - startTime;

      let boost = 1.0;
      if (elapsed < WIND_BOOST_DURATION) {
        const fadeIn = Math.min(1, elapsed / WIND_BOOST_EASE);
        const fadeOut = Math.min(1, (WIND_BOOST_DURATION - elapsed) / WIND_BOOST_EASE);
        boost = 1.0 + (WIND_BOOST_MULT - 1.0) * smoothstep(fadeIn) * smoothstep(fadeOut);
      }

      const windStrength = WIND_BASE * boost;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cloth.update(elapsed, windStrength, mouseDown);
      cloth.draw();
      animationFrameId = requestAnimationFrame(update);
    };

    // Mouse-only events scoped to the canvas element
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("mouseup", handleWindowMouseUp);

    update();

    return () => {
      cancelAnimationFrame(animationFrameId);
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [
    canvasSize,
    clothWidth,
    clothHeight,
    spacing,
    gravity,
    mouseInfluence,
    mouseCut,
    tearDistance,
    config,
  ]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          backgroundColor,
        }}
      />
    </div>
  );
};
