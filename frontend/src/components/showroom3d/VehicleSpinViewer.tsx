"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { RotateCw, ChevronLeft, ChevronRight, Maximize2, Sparkles } from "lucide-react";

interface VehicleSpinViewerProps {
  spinImages: string[];
  vehicleTitle: string;
  lang?: "en" | "am";
  onOpenLightbox?: () => void;
}

export default function VehicleSpinViewer({
  spinImages,
  vehicleTitle,
  lang = "en",
  onOpenLightbox,
}: VehicleSpinViewerProps) {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const startXRef = useRef(0);
  const startFrameRef = useRef(0);
  const totalFrames = spinImages.length;

  // Preload all 360 spin frames in the background for stutter-free dragging
  useEffect(() => {
    let mounted = true;
    let count = 0;

    spinImages.forEach((src) => {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        if (mounted) {
          count++;
          setLoadedCount(count);
        }
      };
      img.onerror = () => {
        if (mounted) {
          count++;
          setLoadedCount(count);
        }
      };
    });

    return () => {
      mounted = false;
    };
  }, [spinImages]);

  const handlePointerDown = (clientX: number) => {
    setIsDragging(true);
    startXRef.current = clientX;
    startFrameRef.current = currentFrame;
  };

  const handlePointerMove = useCallback(
    (clientX: number) => {
      if (!isDragging || totalFrames === 0) return;
      const deltaX = clientX - startXRef.current;
      // Sensitivity: every ~12px of drag steps 1 frame
      const stepSensitivity = 12;
      const frameDelta = Math.floor(deltaX / stepSensitivity);
      let newFrame = (startFrameRef.current - frameDelta) % totalFrames;
      if (newFrame < 0) newFrame += totalFrames;
      setCurrentFrame(newFrame);
    },
    [isDragging, totalFrames]
  );

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const prevFrame = () => {
    setCurrentFrame((prev) => (prev - 1 + totalFrames) % totalFrames);
  };

  const nextFrame = () => {
    setCurrentFrame((prev) => (prev + 1) % totalFrames);
  };

  const progressPercent = Math.round((loadedCount / totalFrames) * 100);

  return (
    <div
      className="relative aspect-[16/10] w-full bg-zinc-950 rounded-2xl overflow-hidden border border-zinc-800/80 select-none group shadow-xl"
      onMouseDown={(e) => handlePointerDown(e.clientX)}
      onMouseMove={(e) => handlePointerMove(e.clientX)}
      onMouseUp={handlePointerUp}
      onMouseLeave={handlePointerUp}
      onTouchStart={(e) => handlePointerDown(e.touches[0].clientX)}
      onTouchMove={(e) => handlePointerMove(e.touches[0].clientX)}
      onTouchEnd={handlePointerUp}
      style={{ cursor: isDragging ? "grabbing" : "grab" }}
    >
      {/* Active Turntable Image */}
      {spinImages[currentFrame] && (
        <img
          src={spinImages[currentFrame]}
          alt={`${vehicleTitle} 360 view frame ${currentFrame + 1}`}
          className="w-full h-full object-cover pointer-events-none transition-transform duration-75"
          draggable={false}
        />
      )}

      {/* Preload Progress Indicator */}
      {loadedCount < totalFrames && (
        <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/75 border border-white/10 backdrop-blur-md text-[10px] text-zinc-300 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span>Buffering 360° ({progressPercent}%)</span>
        </div>
      )}

      {/* Top Left 360 Spin Badge */}
      <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500/90 text-black border border-amber-400 text-xs font-black shadow-lg backdrop-blur-md">
          <RotateCw size={13} className="animate-spin-slow" />
          <span>360° SPIN</span>
        </span>
      </div>

      {/* Floating Center Hint (Fades out when user starts dragging) */}
      {!isDragging && (
        <div className="absolute inset-x-0 bottom-14 flex justify-center pointer-events-none transition-opacity duration-300">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/70 border border-white/15 backdrop-blur-md text-xs text-zinc-200 shadow-xl">
            <RotateCw size={13} className="text-amber-400" />
            <span>
              {lang === "am"
                ? "መኪናውን በ 360° ለማሽከርከር ወደ ግራ ወይም ቀኝ ይጎትቱ"
                : "Drag left/right to spin 360°"}
            </span>
          </div>
        </div>
      )}

      {/* Stepper Buttons for precise clicking */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          prevFrame();
        }}
        aria-label="Previous frame"
        className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/90 text-white backdrop-blur-md border border-white/10 transition active:scale-95 shadow-md"
      >
        <ChevronLeft size={20} />
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          nextFrame();
        }}
        aria-label="Next frame"
        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 hover:bg-black/90 text-white backdrop-blur-md border border-white/10 transition active:scale-95 shadow-md"
      >
        <ChevronRight size={20} />
      </button>

      {/* Bottom Frame Counter and Zoom Lightbox Button */}
      <div className="absolute bottom-3 right-3 flex items-center gap-2 pointer-events-auto">
        <span className="bg-black/80 backdrop-blur-md text-zinc-300 text-xs px-2.5 py-1 rounded-md border border-white/10 tabular-nums font-mono">
          {currentFrame + 1} / {totalFrames}
        </span>
        {onOpenLightbox && (
          <button
            type="button"
            onClick={onOpenLightbox}
            aria-label="Expand 360 viewer"
            className="p-1.5 bg-black/80 hover:bg-black text-zinc-300 hover:text-white backdrop-blur-md rounded-md border border-white/10 transition"
          >
            <Maximize2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
