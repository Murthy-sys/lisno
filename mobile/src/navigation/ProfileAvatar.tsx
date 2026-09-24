import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import type { PublicUser } from "../contracts/session";
import type { CleanupRegistry } from "../core/config/cleanupRegistry";
import type { DownloadedArtifact, NativeTransferManager } from "../platform/files";
import { useConfiguredRuntime } from "../runtime/RuntimeProvider";
import { colors, fonts } from "../ui/tokens";

/** Stored photos are 512×512 JPEGs; the limit leaves headroom without accepting arbitrary payloads. */
const PROFILE_PHOTO_MAX_BYTES = 2 * 1024 * 1024;

export function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  const initials = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return initials.map((part) => Array.from(part ?? "")[0] ?? "").join("").toLocaleUpperCase();
}

export function profilePhotoPath(userId: string, version: number): string {
  return `/users/${encodeURIComponent(userId)}/profile-photo?v=${encodeURIComponent(String(version))}`;
}

/**
 * Downloaded photos are shared per runtime so every scaffold mount does not refetch the same version.
 * The cache is cleared with the runtime's private-state cleanup (logout, access denial), which also
 * deletes the underlying private files.
 */
const photoCaches = new WeakMap<NativeTransferManager, Map<string, Promise<DownloadedArtifact>>>();

function photoCache(transfers: NativeTransferManager, cleanups: CleanupRegistry): Map<string, Promise<DownloadedArtifact>> {
  let cache = photoCaches.get(transfers);
  if (!cache) {
    const created = new Map<string, Promise<DownloadedArtifact>>();
    cache = created;
    photoCaches.set(transfers, created);
    try {
      cleanups.register("profile-photo-cache", () => created.clear(), 13);
    } catch {
      // A registration already exists for this runtime; its handler owns clearing.
    }
  }
  return cache;
}

function evict(cache: Map<string, Promise<DownloadedArtifact>>, key: string): void {
  const entry = cache.get(key);
  if (!entry) return;
  cache.delete(key);
  void entry.then((artifact) => artifact.release()).catch(() => undefined);
}

export function ProfileAvatar({ user, size, testID }: { readonly user: PublicUser; readonly size: number; readonly testID?: string }) {
  const context = useConfiguredRuntime();
  const runtime = context.runtime;
  const version = user.profilePhotoVersion;
  const photoKey = version === undefined ? null : `${user.id}:${version}`;
  const [photo, setPhoto] = useState<{ readonly key: string; readonly uri: string } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  useEffect(() => {
    if (photoKey === null || version === undefined || !runtime) return;
    const cache = photoCache(runtime.transfers, runtime.cleanups);
    let entry = cache.get(photoKey);
    if (!entry) {
      try {
        entry = runtime.transfers.download({
          path: profilePhotoPath(user.id, version),
          fileName: "profile-photo.jpg",
          mimeType: "image/jpeg",
          maxBytes: PROFILE_PHOTO_MAX_BYTES
        }).result;
      } catch {
        setFailedKey(photoKey);
        return;
      }
      cache.set(photoKey, entry);
      // Older versions of this user's photo are superseded once a new version is requested.
      for (const key of [...cache.keys()]) {
        if (key !== photoKey && key.startsWith(`${user.id}:`)) evict(cache, key);
      }
    }
    let active = true;
    entry.then((artifact) => {
      if (active) setPhoto({ key: photoKey, uri: artifact.uri });
    }).catch(() => {
      if (cache.get(photoKey) === entry) cache.delete(photoKey);
      if (active) setFailedKey(photoKey);
    });
    return () => {
      active = false;
    };
  }, [photoKey, runtime, user.id, version]);

  const uri = photoKey !== null && failedKey !== photoKey && photo?.key === photoKey ? photo.uri : null;
  const circle = { width: size, height: size, borderRadius: size / 2 };

  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.avatar, circle]}
      testID={testID}
    >
      {uri ? (
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          source={{ uri }}
          style={circle}
          testID={testID ? `${testID}-photo` : undefined}
          onError={() => {
            if (runtime && photoKey) evict(photoCache(runtime.transfers, runtime.cleanups), photoKey);
            setFailedKey(photoKey);
          }}
        />
      ) : (
        <Text numberOfLines={1} style={[styles.initials, { fontSize: Math.max(9, Math.round(size * 0.4)) }]}>
          {initialsForName(user.name) || "L"}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: colors.accent },
  initials: { color: colors.shell, fontFamily: fonts.semibold, includeFontPadding: false }
});
