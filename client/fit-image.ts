// Adapted from paseo-math (Apache-2.0), client/fit-image.ts at
// https://github.com/q5m-ai/paseo-math/tree/3644aa73d40f2e4e51f7a4ef48b22b668db017d8
// Changes: none beyond this attribution header.

import { createElement, useEffect, useState } from "react";
import { Image, StyleSheet, type ImageProps } from "react-native";

type FitImageProps = ImageProps & {
  indicator?: boolean;
  indicatorColor?: string;
  indicatorSize?: "small" | "large" | number;
  originalHeight?: number;
  originalWidth?: number;
};

/** Functional replacement for react-native-fit-image's legacy React class. */
export default function FitImage({
  indicator: _indicator,
  indicatorColor: _indicatorColor,
  indicatorSize: _indicatorSize,
  originalHeight,
  originalWidth,
  style,
  source,
  ...props
}: FitImageProps) {
  const [natural, setNatural] = useState(
    originalHeight && originalWidth ? { height: originalHeight, width: originalWidth } : undefined,
  );
  const uri =
    !Array.isArray(source) && source && typeof source === "object" ? source.uri : undefined;

  useEffect(() => {
    if (natural || !uri) return;
    let current = true;
    Image.getSize(
      uri,
      (width, height) => {
        if (current && width > 0 && height > 0) setNatural({ width, height });
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [natural, uri]);

  const flattened = StyleSheet.flatten(style);
  const hasDimensions = flattened?.width !== undefined && flattened?.height !== undefined;
  const fittedStyle =
    !hasDimensions && natural
      ? { width: "100%" as const, aspectRatio: natural.width / natural.height }
      : undefined;

  return createElement(Image, {
    ...props,
    source,
    style: [style, fittedStyle],
  });
}
