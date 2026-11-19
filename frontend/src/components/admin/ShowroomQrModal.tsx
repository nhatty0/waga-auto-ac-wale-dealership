"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Printer,
  Download,
  Copy,
  Check,
  CarFront,
  ExternalLink,
  QrCode,
  Share2,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { resolveImageUrl } from "@/lib/images";
import { SITE_URL } from "@/lib/site";

const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "");

interface ShowroomQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  dealershipName: string;
  dealershipSlug: string;
  logoUrl?: string | null;
  showroomUrl: string;
}

export default function ShowroomQrModal({
  isOpen,
  onClose,
  dealershipName,
  dealershipSlug,
  logoUrl,
  showroomUrl,
}: ShowroomQrModalProps) {
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const handleCopyLink = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(showroomUrl);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = showroomUrl;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const handleDownloadPng = () => {
    const svgEl = document.getElementById("showroom-qr-code-svg");
    if (!svgEl) return;

    try {
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();

      img.onload = () => {
        // High-definition 1024x1024 output
        const size = 1024;
        canvas.width = size;
        canvas.height = size;

        if (ctx) {
          // White background with border radius
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, size, size);

          // Center QR code with padding
          const padding = 112;
          const qrSize = size - padding * 2;
          ctx.drawImage(img, padding, padding, qrSize, qrSize);
        }

        const pngUrl = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.download = `${dealershipSlug}-showroom-qr.png`;
        downloadLink.href = pngUrl;
        downloadLink.click();
      };

      img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
    } catch (err) {
      console.error("Failed to export QR PNG:", err);
    }
  };

  const handlePrint = () => {
    const svgEl = document.getElementById("showroom-qr-code-svg");
    const svgHtml = svgEl ? svgEl.outerHTML : "";

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="am">
        <head>
          <meta charset="utf-8" />
          <title>${dealershipName} - Digital Showroom QR</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 20mm;
            }
            * {
              box-sizing: border-box;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #111827;
              margin: 0;
              padding: 40px 24px;
              text-align: center;
              background: #ffffff;
            }
            .header {
              margin-bottom: 24px;
            }
            .title {
              font-size: 32px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin: 0 0 8px 0;
              color: #0f172a;
            }
            .badge {
              display: inline-block;
              background: #fef3c7;
              color: #92400e;
              font-size: 13px;
              font-weight: 700;
              padding: 4px 16px;
              border-radius: 9999px;
              border: 1px solid #fde68a;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .qr-wrapper {
              display: inline-block;
              margin: 28px auto;
              padding: 24px;
              border: 2.5px solid #e2e8f0;
              border-radius: 28px;
              background: #ffffff;
              box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
            }
            .qr-wrapper svg {
              display: block;
              width: 290px;
              height: 290px;
            }
            .headline {
              font-size: 22px;
              font-weight: 800;
              margin: 0 0 8px 0;
              color: #0f172a;
            }
            .description {
              font-size: 15px;
              line-height: 1.6;
              color: #475569;
              max-width: 520px;
              margin: 0 auto 24px auto;
            }
            .url-chip {
              display: inline-block;
              background: #f1f5f9;
              border: 1px solid #cbd5e1;
              color: #0f172a;
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
              font-size: 15px;
              font-weight: 700;
              padding: 10px 24px;
              border-radius: 9999px;
            }
            .footer {
              margin-top: 50px;
              font-size: 12px;
              color: #94a3b8;
              border-top: 1px solid #f1f5f9;
              padding-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="title">${dealershipName}</h1>
            <div class="badge">ኦፊሴላዊ ዲጂታል ሾውሩም • Official Digital Showroom</div>
          </div>

          <div class="qr-wrapper">
            ${svgHtml}
          </div>

          <h2 class="headline">ስልክዎን በማዞር QR ኮዱን ይቃኙ (Scan to Browse)</h2>
          <p class="description">
            የቅርብ ጊዜ የመኪና ዝርዝሮችን፣ የባንክ ብድር ስሌት፣ የቅድመ ክፍያ መረጃዎችን እና የሙከራ ጉዞ (Test Drive) ቀጠሮዎችን ይመልከቱ።
          </p>

          <div>
            <div class="url-chip">${showroomUrl}</div>
          </div>

          <div class="footer">
            Powered by AC WALE MARKET (${SITE_HOST})
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  const resolvedLogo = logoUrl ? resolveImageUrl(logoUrl) : null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-gradient-to-b from-zinc-900 to-zinc-950 border border-amber-500/30 rounded-3xl p-6 sm:p-7 shadow-2xl shadow-black/80 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-white bg-zinc-800/80 hover:bg-zinc-800 rounded-full transition"
          title="Close / ዝጋ"
        >
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5 pr-8">
          {resolvedLogo && !logoError ? (
            <img
              src={resolvedLogo}
              alt={dealershipName}
              onError={() => setLogoError(true)}
              className="w-12 h-12 rounded-2xl object-cover border border-amber-500/30 shadow-md shadow-amber-500/10"
            />
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-md shadow-amber-500/10 shrink-0">
              <QrCode size={24} />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-lg font-black tracking-tight text-white truncate">
              {dealershipName}
            </h2>
            <p className="text-xs text-amber-400/90 font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              የሾውሩም QR ኮድ • Showroom QR
            </p>
          </div>
        </div>

        {/* QR Code Presentation Box */}
        <div className="bg-white rounded-2xl p-5 mb-5 flex flex-col items-center justify-center shadow-inner shadow-black/10">
          <div className="p-2 bg-white rounded-xl">
            <QRCodeSVG
              id="showroom-qr-code-svg"
              value={showroomUrl}
              size={230}
              level="H"
              includeMargin={true}
              imageSettings={
                resolvedLogo && !logoError
                  ? {
                      src: resolvedLogo,
                      x: undefined,
                      y: undefined,
                      height: 44,
                      width: 44,
                      excavate: true,
                    }
                  : undefined
              }
            />
          </div>
          <p className="mt-2 text-xs font-semibold text-zinc-600 text-center">
            ስልክዎን በማዞር QR ኮዱን ይቃኙ (Scan to Browse)
          </p>
        </div>

        {/* Live URL Pill with Quick Copy */}
        <div className="mb-5 bg-black/60 border border-zinc-800 rounded-xl p-2.5 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1 pl-1">
            <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
              Live Showroom Link
            </p>
            <p className="text-xs font-mono text-amber-300/90 truncate font-semibold">
              {showroomUrl}
            </p>
          </div>
          <button
            onClick={handleCopyLink}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 border ${
              copied
                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700"
            }`}
            title="Copy Showroom Link"
          >
            {copied ? (
              <>
                <Check size={13} className="text-emerald-400" />
                <span>ተቀድቷል</span>
              </>
            ) : (
              <>
                <Copy size={13} />
                <span>ኮፒ</span>
              </>
            )}
          </button>
        </div>

        {/* Modal Actions */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={handleDownloadPng}
            className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 hover:border-zinc-500 transition"
          >
            <Download size={15} />
            <span>PNG አውርድ (Save)</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black transition shadow-lg shadow-amber-500/20"
          >
            <Printer size={15} />
            <span>አትም (Print Flyer)</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
