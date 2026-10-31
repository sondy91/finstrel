# Falcon Glide

The `falcon-glide-original-light.png` and `falcon-glide-original-dark.png` files are the matching transparent raster pair. Both derive from the same generated light-mode image and the same cleaned transparency selection. The dark version adds a thin ivory outline around that selection; no separate image generation was used. Their fully opaque interior pixels match exactly.

The source is a generated raster image, not a vector master. The transparent edge was cleaned by thresholding the source alpha, which removes the diffuse glow and may slightly change its edge pixels. The dark outline adds a few pixels beyond the edge. Inspect at the app's intended size before installing it as the application icon.

The two `falcon-glide-*.svg` files are earlier hand-drawn approximations, not the selected design. They are kept for reference and should not be treated as the matching raster pair. The matching PNGs are used in the app sidebar and welcome screen.
