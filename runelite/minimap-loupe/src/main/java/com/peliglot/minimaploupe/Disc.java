package com.peliglot.minimaploupe;

import java.awt.Rectangle;

/**
 * The round map inside the minimap's square draw area. The widget gives a box;
 * the corners of that box are the client's own frame, not map, so every test
 * of "is this on the map" goes through the ellipse inscribed in it.
 */
final class Disc
{
	private final double centreX;
	private final double centreY;
	private final double radiusX;
	private final double radiusY;

	Disc(double centreX, double centreY, double radiusX, double radiusY)
	{
		this.centreX = centreX;
		this.centreY = centreY;
		this.radiusX = radiusX;
		this.radiusY = radiusY;
	}

	/** The ellipse inscribed in a widget's bounds, or null if it has no area. */
	static Disc inscribedIn(Rectangle bounds)
	{
		if (bounds == null || bounds.width < 2 || bounds.height < 2)
		{
			return null;
		}
		final double radiusX = (bounds.width - 1) / 2.0;
		final double radiusY = (bounds.height - 1) / 2.0;
		return new Disc(bounds.x + radiusX, bounds.y + radiusY, radiusX, radiusY);
	}

	boolean contains(double x, double y)
	{
		final double dx = (x - centreX) / radiusX;
		final double dy = (y - centreY) / radiusY;
		return dx * dx + dy * dy <= 1.0;
	}
}
