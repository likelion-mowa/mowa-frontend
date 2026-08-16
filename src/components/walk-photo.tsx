import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { IcWalk } from '@/components/icons';
import { colors } from '@/lib/theme';

/**
 * A walk's photo, filling its (positioned) parent, with the prototype's mint
 * placeholder when there is none.
 *
 * Persisted `photoUrl` values should be HTTPS Cloudinary URLs. A load failure
 * still falls back to the placeholder instead of leaving a blank tile.
 */

type WalkPhotoProps = {
  uri: string | null;
  iconSize?: number;
  opacity?: number;
  /** Off when the parent already draws a background worth seeing (calendar cells). */
  showFallback?: boolean;
};

export function WalkPhoto({
  uri,
  iconSize = 28,
  opacity = 1,
  showFallback = true,
}: WalkPhotoProps) {
  const [failed, setFailed] = useState(false);

  if (uri === null || failed) {
    if (!showFallback) return null;
    return (
      <View style={StyleSheet.absoluteFill} className="items-center justify-center bg-mint">
        <IcWalk size={iconSize} color={colors.sage} />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      onError={() => setFailed(true)}
      style={[StyleSheet.absoluteFill, { opacity }]}
      resizeMode="cover"
    />
  );
}
