import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";

import { apiClient } from "../../api/client";

interface ProtectedImageProps {
  source: string;
  alt: string;
  className?: string;
  dataRevision?: number;
  onSourceChange?: (source: string | undefined) => void;
}

export function ProtectedImage({
  source,
  alt,
  className,
  dataRevision,
  onSourceChange
}: ProtectedImageProps) {
  const [imageSource, setImageSource] = useState<string>();
  const [failed, setFailed] = useState(false);
  const onSourceChangeRef = useRef(onSourceChange);
  onSourceChangeRef.current = onSourceChange;

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    setImageSource(undefined);
    setFailed(false);
    void apiClient.getBlob(source).then(({ blob }) => {
      if (!active) return;
      if (typeof URL.createObjectURL === "function") {
        objectUrl = URL.createObjectURL(blob);
        setImageSource(objectUrl);
        onSourceChangeRef.current?.(objectUrl);
      }
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => {
      active = false;
      onSourceChangeRef.current?.(undefined);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);

  if (failed) {
    return (
      <span
        aria-label={`${alt} preview unavailable`}
        className={`${className ?? ""} protected-image-fallback`.trim()}
        data-revision={dataRevision}
        role="status"
      >
        <ImageOff aria-hidden="true" />
      </span>
    );
  }

  if (!imageSource) {
    return (
      <span
        aria-label={alt}
        className={`${className ?? ""} protected-image-fallback protected-image-fallback--loading`.trim()}
        data-revision={dataRevision}
        role="img"
      />
    );
  }

  return (
      <img
        src={imageSource}
        alt={alt}
        className={className}
        data-revision={dataRevision}
      />
  );
}
