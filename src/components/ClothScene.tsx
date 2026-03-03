import React, { useEffect, useRef, useState } from "react";

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
}

export const ClothSimulation: React.FC<ClothSimulationProps> = ({
  clothWidth = 30,
  clothHeight = 60,
  spacing = 10,
  gravity = 1200,
  mouseInfluence = 42,
  mouseCut = 30,
  tearDistance = 60,
  backgroundColor = "transparent",
  textureSrc,
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

    const clothSettings = {
      physicsAccuracy: 5,
      mouseInfluence,
      mouseCut,
      gravity,
      clothHeight,
      clothWidth,
      startY: 10,
      spacing,
      tearDistance,
    };

    let mouseX = 0,
      mouseY = 0;
    let mouseDown = false;
    let mouseButton = 0;

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
            this.px = this.x - (mouseX - this.x) * 0.8;
            this.py = this.y - (mouseY - this.y) * 0.8;
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
        delta *= delta;
        const nx = this.x + (this.x - this.px) * 0.995 + (this.vx / 2) * delta;
        const ny = this.y + (this.y - this.py) * 0.995 + (this.vy / 2) * delta;

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

      attach(point: Point) {
        this.constraints.push(new Constraint(this, point));
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

    class Constraint {
      p1: Point;
      p2: Point;
      length: number;

      constructor(p1: Point, p2: Point) {
        this.p1 = p1;
        this.p2 = p2;
        this.length = spacing;
      }

      resolve() {
        const dx = this.p1.x - this.p2.x;
        const dy = this.p1.y - this.p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > tearDistance) {
          this.p1.constraints = this.p1.constraints.filter((c) => c !== this);
          this.p2.constraints = this.p2.constraints.filter((c) => c !== this);
          return;
        }

        const diff = (this.length - dist) / dist;
        const px = dx * diff * 0.5;
        const py = dy * diff * 0.5;

        this.p1.x += px;
        this.p1.y += py;
        this.p2.x -= px;
        this.p2.y -= py;
      }
    }

    function drawTexturedTriangle(
      img: HTMLImageElement,
      // Canvas (destination) coordinates
      x0: number, y0: number,
      x1: number, y1: number,
      x2: number, y2: number,
      // Texture (source) pixel coordinates
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

    class Cloth {
      points: Point[] = [];

      constructor() {
        const startX = canvasSize.width / 2 - (clothWidth * spacing) / 2;

        for (let y = 0; y <= clothHeight; y++) {
          for (let x = 0; x <= clothWidth; x++) {
            const p = new Point(
              startX + x * spacing,
              clothSettings.startY + y * spacing
            );

            if (x !== 0) p.attach(this.points[this.points.length - 1]);
            if (y === 0) p.pin(p.x, p.y);
            if (y !== 0) p.attach(this.points[x + (y - 1) * (clothWidth + 1)]);

            this.points.push(p);
          }
        }
      }

      update() {
        for (let i = 0; i < clothSettings.physicsAccuracy; i++) {
          this.points.forEach((p) => p.resolveConstraints());
        }
        this.points.forEach((p) => p.update(0.016));
      }

      draw() {
        if (!ctx) return;

        const img = textureRef.current;

        if (img) {
          const gridCols = clothWidth + 1;
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

              // Triangle A: TL, TR, BL
              drawTexturedTriangle(
                img,
                tl.x, tl.y, tr.x, tr.y, bl.x, bl.y,
                u_l, v_t, u_r, v_t, u_l, v_b
              );

              // Triangle B: TR, BR, BL
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

    const handleMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
      mouseDown = true;
      mouseButton = e.button;
    };

    const touchDown = (e: TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.touches[0].clientX - rect.left;
      mouseY = e.touches[0].clientY - rect.top;
      mouseDown = true;
      mouseButton = 2;
    };

    const touchUp = () => {
      mouseDown = false;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.touches[0].clientX - rect.left;
      mouseY = e.touches[0].clientY - rect.top;
    };

    const handleMouseUp = () => {
      mouseDown = false;
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    // Wind boost configuration
    const WIND_BASE = 450;
    const WIND_BOOST_MULT = 10.0;
    const WIND_BOOST_DURATION = 3500;
    const WIND_BOOST_EASE = 600;
    const startTime = performance.now();

    const smoothstep = (t: number) => t * t * (3 - 2 * t);

    let animationFrameId: number;
    const update = () => {
      const elapsed = performance.now() - startTime;

      // Calculate wind boost envelope with smooth easing
      let boost = 1.0;
      if (elapsed < WIND_BOOST_DURATION) {
        const fadeIn = Math.min(1, elapsed / WIND_BOOST_EASE);
        const fadeOut = Math.min(1, (WIND_BOOST_DURATION - elapsed) / WIND_BOOST_EASE);
        boost = 1.0 + (WIND_BOOST_MULT - 1.0) * smoothstep(fadeIn) * smoothstep(fadeOut);
      }

      // Apply wind force to non-pinned points
      const windStrength = WIND_BASE * boost;
      const windX = Math.sin(elapsed * 0.003) * windStrength
                   + Math.sin(elapsed * 0.007) * windStrength * 0.3;
      cloth.points.forEach((p) => {
        if (p.pinX === null) {
          p.addForce(windX, Math.sin(elapsed * 0.005 + p.x * 0.01) * windStrength * 0.15);
        }
      });

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cloth.update();
      cloth.draw();
      animationFrameId = requestAnimationFrame(update);
    };

    // Scope events to the canvas element, not window
    canvas.addEventListener("touchstart", touchDown);
    canvas.addEventListener("touchmove", handleTouchMove);
    canvas.addEventListener("touchend", touchUp);
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("contextmenu", handleContextMenu);

    update();

    return () => {
      cancelAnimationFrame(animationFrameId);
      canvas.removeEventListener("touchstart", touchDown);
      canvas.removeEventListener("touchmove", handleTouchMove);
      canvas.removeEventListener("touchend", touchUp);
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("contextmenu", handleContextMenu);
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