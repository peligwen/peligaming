package com.peliglot.minimaploupe;

import java.awt.BasicStroke;
import java.awt.Dimension;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.RenderingHints;
import java.awt.Shape;
import java.awt.Stroke;
import java.awt.geom.Ellipse2D;
import java.awt.image.BufferedImage;
import java.awt.image.DataBufferInt;
import javax.inject.Inject;
import net.runelite.api.BufferProvider;
import net.runelite.api.Client;
import net.runelite.api.Point;
import net.runelite.api.gameval.InterfaceID;
import net.runelite.api.widgets.Widget;
import net.runelite.client.ui.overlay.Overlay;
import net.runelite.client.ui.overlay.OverlayLayer;
import net.runelite.client.ui.overlay.OverlayPosition;

/**
 * Draws the lens.
 *
 * <p>There is no second, higher-resolution minimap to enlarge: the client
 * rasterises the map once, at one scale, into the frame buffer. So the lens is
 * a loupe in the literal sense — it reads back the pixels the client has
 * already drawn and redraws that patch bigger. Detail it magnifies is detail
 * that was already on screen; what it buys you is being able to read it.
 *
 * <p>That read has to happen after the minimap is in the buffer, which is why
 * this sits on {@link OverlayLayer#ALWAYS_ON_TOP} — the layer rendered from
 * the client's final frame callback, once the whole interface (and every other
 * plugin's minimap drawing) is down.
 */
class MinimapLoupeOverlay extends Overlay
{
	/**
	 * The minimap's draw area in each interface layout the client can be in —
	 * fixed, the two resizable layouts, and the mobile-style one. Only the
	 * loaded layout resolves to a widget, so the first hit is the live map.
	 */
	private static final int[] MINIMAP_DRAW_AREAS = {
		InterfaceID.Toplevel.MINIMAP,
		InterfaceID.ToplevelOsrsStretch.MINIMAP,
		InterfaceID.ToplevelPreEoc.MINIMAP,
		InterfaceID.ToplevelOsm.MINIMAP,
	};

	/** Gap between the minimap's box and a lens parked beside it. */
	private static final int PARKED_GAP = 8;

	private final Client client;
	private final MinimapLoupePlugin plugin;
	private final MinimapLoupeConfig config;

	/** Scratch copy of the patch being magnified, reused frame to frame. */
	private BufferedImage sample;
	private int[] sampleData;

	@Inject
	MinimapLoupeOverlay(Client client, MinimapLoupePlugin plugin, MinimapLoupeConfig config)
	{
		this.client = client;
		this.plugin = plugin;
		this.config = config;
		setPosition(OverlayPosition.DYNAMIC);
		setLayer(OverlayLayer.ALWAYS_ON_TOP);
		// Dynamic overlays draw in ascending priority, so the highest draws
		// last: over the minimap dots other plugins put down, and after them,
		// which means their dots are in the pixels this magnifies.
		setPriority(Overlay.PRIORITY_HIGHEST);
	}

	@Override
	public Dimension render(Graphics2D g)
	{
		if (!plugin.isLensActive())
		{
			return null;
		}

		final Widget minimap = minimapDrawArea();
		if (minimap == null || minimap.isHidden())
		{
			return null;
		}

		final Rectangle area = minimap.getBounds();
		final Disc map = Disc.inscribedIn(area);
		if (map == null)
		{
			return null;
		}

		final Point mouse = client.getMouseCanvasPosition();
		if (mouse == null || !map.contains(mouse.getX(), mouse.getY()))
		{
			return null;
		}

		final BufferProvider frame = client.getBufferProvider();
		final int[] pixels = frame.getPixels();
		final int frameWidth = frame.getWidth();
		final int frameHeight = frame.getHeight();
		if (pixels == null || frameWidth <= 0 || frameHeight <= 0
			|| pixels.length < frameWidth * frameHeight)
		{
			return null;
		}

		final int mouseX = mouse.getX();
		final int mouseY = mouse.getY();
		final double zoom = Math.max(1.1, config.zoom() / 100.0);
		final int lensRadius = config.radius();

		final int half = Loupe.sampleHalf(lensRadius, zoom);
		final int size = half * 2 + 1;
		final int sampleX = mouseX - half;
		final int sampleY = mouseY - half;
		ensureSample(size);
		Loupe.copyPatch(pixels, frameWidth, frameHeight, sampleX, sampleY, size, map, sampleData);

		final boolean parked = config.anchor() == LensAnchor.BESIDE_MINIMAP;
		final int lensX = Loupe.clamp(parked ? area.x - lensRadius - PARKED_GAP : mouseX,
			lensRadius, client.getCanvasWidth() - lensRadius);
		final int lensY = Loupe.clamp(parked ? area.y + area.height / 2 : mouseY,
			lensRadius, client.getCanvasHeight() - lensRadius);

		final Shape lens = new Ellipse2D.Double(
			lensX - lensRadius, lensY - lensRadius, lensRadius * 2.0, lensRadius * 2.0);

		// RuneLite hands every overlay the same cached Graphics2D, so whatever
		// is set here is put back before the next overlay draws with it.
		final Shape oldClip = g.getClip();
		final Object oldInterpolation = g.getRenderingHint(RenderingHints.KEY_INTERPOLATION);
		final Object oldAntialiasing = g.getRenderingHint(RenderingHints.KEY_ANTIALIASING);
		final Stroke oldStroke = g.getStroke();

		g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
		g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, config.smooth()
			? RenderingHints.VALUE_INTERPOLATION_BILINEAR
			: RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR);

		g.clip(lens);
		g.drawImage(sample, Loupe.placement(lensX, lensY, mouseX, mouseY, sampleX, sampleY, zoom), null);
		g.setClip(oldClip);

		if (config.showCrosshair())
		{
			final int arm = Math.max(3, lensRadius / 8);
			g.setStroke(new BasicStroke(1f));
			g.setColor(config.borderColor());
			g.drawLine(lensX - arm, lensY, lensX + arm, lensY);
			g.drawLine(lensX, lensY - arm, lensX, lensY + arm);
		}

		if (config.showBorder())
		{
			g.setStroke(new BasicStroke(config.borderWidth()));
			g.setColor(config.borderColor());
			g.draw(lens);
		}

		g.setStroke(oldStroke);
		restore(g, RenderingHints.KEY_INTERPOLATION, oldInterpolation,
			RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR);
		restore(g, RenderingHints.KEY_ANTIALIASING, oldAntialiasing,
			RenderingHints.VALUE_ANTIALIAS_OFF);
		return null;
	}

	private Widget minimapDrawArea()
	{
		for (int component : MINIMAP_DRAW_AREAS)
		{
			final Widget widget = client.getWidget(component);
			if (widget != null)
			{
				return widget;
			}
		}
		return null;
	}

	private void ensureSample(int size)
	{
		if (sample == null || sample.getWidth() != size)
		{
			sample = new BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB);
			sampleData = ((DataBufferInt) sample.getRaster().getDataBuffer()).getData();
		}
	}

	/** A rendering hint that reads back null was never set; Java2D's own default stands in. */
	private static void restore(Graphics2D g, RenderingHints.Key key, Object was, Object fallback)
	{
		g.setRenderingHint(key, was == null ? fallback : was);
	}
}
