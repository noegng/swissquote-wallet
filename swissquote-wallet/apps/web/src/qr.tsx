// QR codes: display (receive address, invitation link) and reading with the camera or from
// an image (recipient address). Libraries: qrcode (generation), jsqr (reading).
import { useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { Btn } from './ui';

/** QR code drawn as SVG, dark modules on a white background. */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { size, path } = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: 'M' });
    let d = '';
    for (let y = 0; y < modules.size; y++) {
      for (let x = 0; x < modules.size; x++) {
        if (modules.data[y * modules.size + x]) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { size: modules.size, path: d };
  }, [value]);
  // A 4-module quiet zone around the code, required for reliable reading.
  return (
    <svg className="qr" viewBox={`-4 -4 ${size + 8} ${size + 8}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect x={-4} y={-4} width={size + 8} height={size + 8} fill="#fff" />
      <path d={path} fill="#323232" />
    </svg>
  );
}

/** Content of a payment QR: an address alone, or a BIP-21 URI "bitcoin:address?amount=0.001". */
export function parsePaymentCode(text: string): { address: string; amount?: string } {
  const raw = text.trim();
  const uri = /^bitcoin:([^?]+)(?:\?(.*))?$/i.exec(raw);
  let address = uri ? uri[1] : raw;
  // Uppercase QRs (more compact) carry bech32 addresses, which are case-insensitive.
  if (address === address.toUpperCase()) address = address.toLowerCase();
  const amount = uri?.[2] ? new URLSearchParams(uri[2]).get('amount') : null;
  return { address, amount: amount && /^\d+(\.\d{1,8})?$/.test(amount) ? amount : undefined };
}

function decode(source: CanvasImageSource, width: number, height: number, canvas: HTMLCanvasElement): string | null {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || !width || !height) return null;
  ctx.drawImage(source, 0, 0, width, height);
  return jsQR(ctx.getImageData(0, 0, width, height).data, width, height)?.data || null;
}

/** Reads a QR code with the device camera, or from an image chosen by the client. */
export function QrScanner({ onResult }: { onResult: (text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef(document.createElement('canvas'));
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  // False if the camera is missing or denied: choosing an image remains possible.
  const [camera, setCamera] = useState(true);
  const done = useRef(onResult);
  done.current = onResult;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stop = false;

    function tick() {
      const v = video.current;
      if (stop || !v) return;
      if (v.readyState >= v.HAVE_CURRENT_DATA) {
        const text = decode(v, v.videoWidth, v.videoHeight, canvas.current);
        if (text) return done.current(text);
      }
      frame = requestAnimationFrame(tick);
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera(false);
      setError('This browser cannot open the camera. Choose an image of the QR code instead.');
    } else {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        .then((s) => {
          if (stop) return s.getTracks().forEach((t) => t.stop());
          stream = s;
          if (video.current) {
            video.current.srcObject = s;
            video.current.play().catch(() => {});
          }
          frame = requestAnimationFrame(tick);
        })
        .catch(() => {
          setCamera(false);
          setError('Camera unavailable or not allowed. Choose an image of the QR code instead.');
        });
    }
    return () => {
      stop = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function fromImage(f: File | undefined) {
    if (!f) return;
    try {
      const bitmap = await createImageBitmap(f);
      // Image scaled down to 1000 px at most: enough for a QR, and quick to analyse.
      const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
      const text = decode(bitmap, Math.round(bitmap.width * scale), Math.round(bitmap.height * scale), canvas.current);
      if (text) done.current(text);
      else setError('No QR code found in this image.');
    } catch {
      setError('This image cannot be read.');
    }
  }

  return (
    <>
      {camera && (
        <div className="scanner">
          <video ref={video} muted playsInline aria-label="Camera view" />
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => fromImage(e.target.files?.[0])} />
      <Btn kind="secondary" onClick={() => file.current?.click()}>
        Choose an image instead
      </Btn>
    </>
  );
}
