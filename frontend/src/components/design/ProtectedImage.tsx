import { useEffect, useState } from "react";

import { apiClient } from "../../api/client";

interface ProtectedImageProps {
  source: string;
  alt: string;
  dataRevision?: number;
}

export function ProtectedImage({ source, alt, dataRevision }: ProtectedImageProps) {
  const [imageSource, setImageSource] = useState<string>();
  const [failed, setFailed] = useState(false);

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
      }
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);

  return (
    <>
      <img src={imageSource} alt={alt} data-revision={dataRevision} />
      {failed ? <span role="status">Preview unavailable.</span> : null}
    </>
  );
}
