package com.peliglot.minimaploupe;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import java.awt.Rectangle;
import java.awt.geom.AffineTransform;
import java.awt.geom.Point2D;
import org.junit.Test;

public class LoupeTest
{
	/** A frame where every pixel encodes its own coordinates, so copies are checkable. */
	private static int[] frame(int width, int height)
	{
		final int[] pixels = new int[width * height];
		for (int y = 0; y < height; y++)
		{
			for (int x = 0; x < width; x++)
			{
				pixels[y * width + x] = (x << 8) | y;
			}
		}
		return pixels;
	}

	@Test
	public void sampleHalfCoversTheWholeLens()
	{
		for (int radius = 16; radius <= 200; radius++)
		{
			for (int percent = 110; percent <= 800; percent += 7)
			{
				final double zoom = percent / 100.0;
				assertTrue("lens " + radius + " at " + percent + "%",
					Loupe.sampleHalf(radius, zoom) * zoom >= radius);
			}
		}
	}

	@Test
	public void thePointUnderTheCursorLandsInTheCentreOfTheLens()
	{
		final double zoom = 2.5;
		final int mouseX = 640;
		final int mouseY = 90;
		final int half = Loupe.sampleHalf(56, zoom);
		final AffineTransform placement = Loupe.placement(
			200, 300, mouseX, mouseY, mouseX - half, mouseY - half, zoom);

		// the cursor's own pixel sits at (half, half) in the copied patch, and
		// it is pixel centres that have to meet: (half + 0.5) onto (200.5, 300.5)
		final Point2D centre = placement.transform(new Point2D.Double(half + 0.5, half + 0.5), null);
		assertEquals(200.5, centre.getX(), 1e-9);
		assertEquals(300.5, centre.getY(), 1e-9);
	}

	@Test
	public void neighbouringPixelsSpreadByTheZoom()
	{
		final double zoom = 3.0;
		final int half = Loupe.sampleHalf(48, zoom);
		final AffineTransform placement = Loupe.placement(100, 100, 500, 50, 500 - half, 50 - half, zoom);

		final Point2D centre = placement.transform(new Point2D.Double(half + 0.5, half + 0.5), null);
		final Point2D right = placement.transform(new Point2D.Double(half + 1.5, half + 0.5), null);
		final Point2D down = placement.transform(new Point2D.Double(half + 0.5, half + 1.5), null);

		assertEquals(zoom, right.getX() - centre.getX(), 1e-9);
		assertEquals(0.0, right.getY() - centre.getY(), 1e-9);
		assertEquals(zoom, down.getY() - centre.getY(), 1e-9);
	}

	@Test
	public void patchCopiesTheMapAndMasksEverythingElse()
	{
		final int width = 800;
		final int height = 600;
		final int[] pixels = frame(width, height);
		// a minimap-sized disc, roughly where the fixed layout puts it
		final Disc map = Disc.inscribedIn(new Rectangle(650, 10, 151, 151));

		final int size = 9;
		final int sampleX = 725 - 4;
		final int sampleY = 85 - 4;
		final int[] out = new int[size * size];
		Loupe.copyPatch(pixels, width, height, sampleX, sampleY, size, map, out);

		for (int row = 0; row < size; row++)
		{
			for (int col = 0; col < size; col++)
			{
				final int x = sampleX + col;
				final int y = sampleY + row;
				final int expected = map.contains(x, y)
					? (pixels[y * width + x] | 0xFF000000)
					: Loupe.OFF_MAP;
				assertEquals("pixel " + x + "," + y, expected, out[row * size + col]);
			}
		}
	}

	@Test
	public void patchNeverReadsOffTheFrame()
	{
		final int width = 40;
		final int height = 30;
		final int[] pixels = frame(width, height);
		// a disc that runs off all four edges: only the frame's own bounds can
		// keep the copy from reading out of the array
		final Disc map = new Disc(width / 2.0, height / 2.0, 1000, 1000);

		final int size = 101;
		final int[] out = new int[size * size];
		Loupe.copyPatch(pixels, width, height, -50, -50, size, map, out);

		assertEquals(Loupe.OFF_MAP, out[0]);
		assertEquals(Loupe.OFF_MAP, out[out.length - 1]);
		// (0,0) of the frame sits 50 in from the patch's top-left corner
		assertEquals(pixels[0] | 0xFF000000, out[50 * size + 50]);
	}

	@Test
	public void clampKeepsTheLensOnTheCanvas()
	{
		assertEquals(56, Loupe.clamp(10, 56, 700));
		assertEquals(700, Loupe.clamp(900, 56, 700));
		assertEquals(300, Loupe.clamp(300, 56, 700));
		// a canvas narrower than the lens still gives a usable number
		assertEquals(56, Loupe.clamp(10, 56, 20));
	}

	@Test
	public void discIsTheEllipseInsideTheWidgetBox()
	{
		final Rectangle bounds = new Rectangle(650, 10, 151, 151);
		final Disc map = Disc.inscribedIn(bounds);

		assertTrue(map.contains(725, 85));           // centre
		assertTrue(map.contains(650, 85));           // left edge, mid height
		assertFalse(map.contains(bounds.x, bounds.y)); // top-left corner: frame, not map
		assertFalse(map.contains(649, 85));           // just outside
		assertNull(Disc.inscribedIn(null));
		assertNull(Disc.inscribedIn(new Rectangle(0, 0, 0, 0)));
	}
}
