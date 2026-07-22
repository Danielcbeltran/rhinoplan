import { useEffect, useRef, useState } from 'react';

interface Props {
  onCapture: (dataUrl: string) => void;
  onClose: () => void;
}

export default function CameraCapture({ onCapture, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (e: any) {
        setError(e?.message || 'No se pudo acceder a la cámara');
      }
    }
    start();
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [facing]);

  function snap() {
    const video = videoRef.current;
    if (!video) return;
    const w = video.videoWidth, h = video.videoHeight;
    if (!w || !h) return;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(video, 0, 0);
    onCapture(c.toDataURL('image/png'));
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Captura desde cámara</h2>
        {error ? (
          <p style={{ color: 'var(--error)' }}>{error}</p>
        ) : (
          <div className="camera-stage">
            <video ref={videoRef} playsInline muted />
          </div>
        )}
        <div className="row">
          <button onClick={() => setFacing(facing === 'user' ? 'environment' : 'user')}>
            Cambiar cámara
          </button>
          <button onClick={onClose}>Cancelar</button>
          <button className="primary" onClick={snap} disabled={!!error}>
            Capturar foto
          </button>
        </div>
      </div>
    </div>
  );
}
