import { useCallback, useEffect, useRef, useState } from 'react';
import { createWorker } from 'tesseract.js';

export type OcrResult = { text: string; confidence: number };

export function useOcr(langs = ['jpn', 'eng']) {
  const [worker, setWorker] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const langsRef = useRef(langs);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        setLoading(true);
        setError(null);
        const w = await createWorker(langsRef.current);
        if (mounted) {
          setWorker(w);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'OCR initialization failed');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      mounted = false;
      if (worker) {
        worker.terminate();
      }
    };
  }, []);

  const recognize = useCallback(
    async (canvas: HTMLCanvasElement): Promise<OcrResult> => {
      if (!worker) throw new Error('OCR worker not ready');
      try {
        const { data } = await worker.recognize(canvas);
        return {
          text: data.text.trim(),
          confidence: data.confidence,
        };
      } catch (err) {
        throw new Error(`OCR failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    },
    [worker]
  );

  return { recognize, ready: !!worker && !loading, loading, error };
}
