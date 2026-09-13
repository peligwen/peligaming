package com.peliglot.minimaploupe;

import java.awt.geom.AffineTransform;

/**
 * The magnification itself, kept free of the client so it can be reasoned
 * about (and tested) on its own: read a square patch of the rendered frame,
 * then work out where to put it so it lands under the lens at scale.
 */
final class Loupe
{
	/** What the lens shows where it reaches past the edge of the map. */
	static final int OFF_MAP = 0xFF0E0E0E;

	private Loupe()
	{
	}

	/**
	 * Half-width of the patch to magnify: the lens radius divided back down by
	 * the zoom, plus a pixel of margin so the rim has something to blend with.
	 */
	static int sampleHalf(int lensRadius, double zoom)
	{
		return (int) Math.ceil(lensRadius / zoom) + 1;
	}

	/**
	 * Copies a {@code size} square of the rendered frame, its top-left at
	 * ({@code sampleX}, {@code sampleY}), into {@code out} in row-major order.
	 *
	 * <p>Pixels off the frame or off the map read as {@link #OFF_MAP}: what is
	 * around the map is interface furniture, and magnified it would be a smear
	 * of it. The frame buffer carries no alpha of its own worth keeping (under
	 * the GPU renderer it is the interface's transparency mask), so the copy is
	 * forced opaque.
	 */
	static void copyPatch(int[] pixels, int frameWidth, int frameHeight,
		int sampleX, int sampleY, int size, Disc map, int[] out)
	{
		for (int row = 0; row < size; row++)
		{
			final int y = sampleY + row;
			final int base = row * size;
			final boolean rowOnFrame = y >= 0 && y < frameHeight;
			for (int col = 0; col < size; col++)
			{
				final int x = sampleX + col;
				final boolean readable = rowOnFrame && x >= 0 && x < frameWidth && map.contains(x, y);
				out[base + col] = readable ? (pixels[y * frameWidth + x] | 0xFF000000) : OFF_MAP;
			}
		}
	}

	/**
	 * Where to draw the patch: scaled by {@code zoom} about the point under the
	 * cursor, so that point lands dead centre in the lens however the lens is
	 * anchored — on the cursor, or parked beside the map.
	 *
	 * <p>The half pixels are the difference between a pixel and its centre: a
	 * pixel at index i covers [i, i+1), so it is i + 0.5 that has to line up,
	 * at both ends. Skip them and the whole lens sits half a magnified pixel up
	 * and to the left of what the cursor is actually on.
	 */
	static AffineTransform placement(int lensX, int lensY,
		int mouseX, int mouseY, int sampleX, int sampleY, double zoom)
	{
		final AffineTransform placement = new AffineTransform();
		placement.translate(
			lensX + 0.5 - (mouseX - sampleX + 0.5) * zoom,
			lensY + 0.5 - (mouseY - sampleY + 0.5) * zoom);
		placement.scale(zoom, zoom);
		return placement;
	}

	static int clamp(int value, int min, int max)
	{
		return max < min ? min : Math.max(min, Math.min(max, value));
	}
}
