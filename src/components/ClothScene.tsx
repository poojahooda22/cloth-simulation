import React, { useEffect, useRef, useState } from "react";

interface ClothSimulationProps {
  width?: number;
  height?: number;
  clothWidth?: number;
  clothHeight?: number;
  spacing?: number;
  gravity?: number;
  mouseInfluence?: number;
  mouseCut?: number;
  tearDistance?: number;
  backgroundColor?: string;
  lineColor?: string;
}

export const ClothSimulation: React.FC<ClothSimulationProps> = ({
  width = window.innerWidth,
  height = window.innerHeight,
  clothWidth = Math.floor(width / 14),
  clothHeight = 60,
  spacing = 10,
  gravity = 1200,
  mouseInfluence = 40,
  mouseCut = 35,
  tearDistance = 60,
  backgroundColor = "transparent",
  lineColor = "#1f1f1fff",
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width, height });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const clothSettings = {
      physicsAccuracy: 3,
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
            this.px = this.x - (mouseX - this.x) * 0.5;
            this.py = this.y - (mouseY - this.y) * 0.5;
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
        const nx = this.x + (this.x - this.px) * 0.99 + (this.vx / 2) * delta;
        const ny = this.y + (this.y - this.py) * 0.99 + (this.vy / 2) * delta;

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

        this.x = Math.max(1, Math.min((canvas?.width ?? 200) - 1, this.x));
        this.y = Math.max(1, Math.min((canvas?.height ?? 200) - 1, this.y));
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

    class Cloth {
      points: Point[] = [];

      constructor() {
        const startX = (canvas?.width ?? 200) / 2 - (clothWidth * spacing) / 2;

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
        ctx.beginPath();
        ctx.strokeStyle = lineColor;
        this.points.forEach((p) => {
          p.constraints.forEach((c) => {
            ctx.moveTo(c.p1.x, c.p1.y);
            ctx.lineTo(c.p2.x, c.p2.y);
          });
        });
        ctx.stroke();
      }
    }

    const resizeCanvas = () => {
      setCanvasSize({
        width: width || window.innerWidth,
        height: height || window.innerHeight,
      });
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    let cloth = new Cloth();

    const handleMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
      mouseDown = true;
      mouseButton = e.button;
    };

    const touchDown = (e: TouchEvent) => {
      // mouse.current.button = 1; // Changed from e.which to e.button
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

    let animationFrameId: number;
    const update = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cloth.update();
      cloth.draw();
      animationFrameId = requestAnimationFrame(update);
    };

    window.addEventListener("touchstart", touchDown);
    window.addEventListener("touchmove", handleTouchMove);
    window.addEventListener("touchend", touchUp);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("contextmenu", handleContextMenu);

    update();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("touchstart", touchDown);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", touchUp);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("contextmenu", handleContextMenu);
    };
  }, [
    width,
    height,
    clothWidth,
    clothHeight,
    spacing,
    gravity,
    mouseInfluence,
    mouseCut,
    tearDistance,
    lineColor,
  ]);

  return (
    <canvas
      ref={canvasRef}
      width={canvasSize.width}
      height={canvasSize.height}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor,
        pointerEvents: "auto",
      }}
    />
  );
};