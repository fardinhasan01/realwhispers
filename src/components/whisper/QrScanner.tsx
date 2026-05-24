import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Html5Qrcode } from "html5-qrcode";
import { X, Upload } from "lucide-react";

interface QrScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (payload: string) => void;
}

export function QrScanner({ open, onClose, onScan }: QrScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const id = "wl-qr-reader";

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setError(null);
    const start = async () => {
      try {
        const scanner = new Html5Qrcode(id);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (text) => {
            if (!mounted) return;
            onScan(text);
            void scanner.stop();
            onClose();
          },
          () => {},
        );
      } catch {
        setError("Camera access denied. Upload a QR image instead.");
      }
    };
    void start();
    return () => {
      mounted = false;
      void scannerRef.current?.stop().catch(() => {});
      scannerRef.current = null;
    };
  }, [open, onClose, onScan]);

  const handleFile = async (file: File) => {
    try {
      const scanner = new Html5Qrcode("wl-qr-file-scanner");
      const result = await scanner.scanFile(file, true);
      onScan(result);
      onClose();
    } catch {
      setError("Could not read QR from image");
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-xl"
      >
        <div className="flex items-center justify-between px-5 pt-12 pb-4">
          <h2 className="font-display text-lg font-semibold">Scan to join</h2>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div id={id} className="mx-auto mt-6 h-72 w-72 max-w-[90vw] overflow-hidden rounded-3xl ring-2 ring-[var(--neon-pink)]/40" />
        {error && <p className="mt-4 text-center text-sm text-destructive">{error}</p>}
        <div className="mt-auto flex gap-3 px-5 pb-10">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}/>
          <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 py-3 text-sm">
            <Upload className="h-4 w-4" /> Upload QR
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
