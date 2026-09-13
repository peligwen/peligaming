package com.peliglot.minimaploupe;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.awt.image.DataBufferInt;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.Map;
import net.runelite.api.BufferProvider;
import net.runelite.api.Client;
import net.runelite.api.Point;
import net.runelite.api.gameval.InterfaceID;
import net.runelite.api.widgets.Widget;
import org.junit.Before;
import org.junit.Test;

/**
 * Renders the overlay against a stand-in client whose frame buffer is a real
 * image, which is exactly how the client feeds RuneLite's overlays: the
 * Graphics2D an overlay draws with is the graphics of the image backing the
 * pixels {@code getBufferProvider()} hands out. So this exercises the whole
 * path — read the frame back, magnify it, draw it on — and can check where the
 * magnified pixels land.
 */
public class MinimapLoupeOverlayTest
{
	private static final int CANVAS_WIDTH = 800;
	private static final int CANVAS_HEIGHT = 600;
	private static final Rectangle MINIMAP = new Rectangle(650, 10, 151, 151);
	private static final int MAP_BACKGROUND = 0x20_20_20;
	private static final int MARKER = 0xFF_00_00;

	private BufferedImage canvas;
	private int[] pixels;
	private Graphics2D graphics;
	private int mouseX = 700;
	private int mouseY = 60;

	@Before
	public void setUp()
	{
		canvas = new BufferedImage(CANVAS_WIDTH, CANVAS_HEIGHT, BufferedImage.TYPE_INT_RGB);
		pixels = ((DataBufferInt) canvas.getRaster().getDataBuffer()).getData();
		graphics = canvas.createGraphics();
	}

	/** The minimap as the client would have left it: flat, with one lit pixel. */
	private void paintFrame(int markerX, int markerY)
	{
		final Disc map = Disc.inscribedIn(MINIMAP);
		for (int y = 0; y < CANVAS_HEIGHT; y++)
		{
			for (int x = 0; x < CANVAS_WIDTH; x++)
			{
				pixels[y * CANVAS_WIDTH + x] = map.contains(x, y) ? MAP_BACKGROUND : 0x00_00_80;
			}
		}
		pixels[markerY * CANVAS_WIDTH + markerX] = MARKER;
	}

	private MinimapLoupeOverlay overlay(MinimapLoupeConfig config)
	{
		final MinimapLoupePlugin plugin = new MinimapLoupePlugin()
		{
			@Override
			boolean isLensActive()
			{
				return true;
			}
		};
		return new MinimapLoupeOverlay(client(), plugin, config);
	}

	private Client client()
	{
		final Widget minimap = stub(Widget.class, answers -> {
			answers.put("getBounds", MINIMAP);
			answers.put("isHidden", false);
		});

		final BufferProvider frame = new BufferProvider()
		{
			@Override
			public int[] getPixels()
			{
				return pixels;
			}

			@Override
			public int getWidth()
			{
				return CANVAS_WIDTH;
			}

			@Override
			public int getHeight()
			{
				return CANVAS_HEIGHT;
			}
		};

		return (Client) Proxy.newProxyInstance(
			Client.class.getClassLoader(),
			new Class<?>[]{Client.class},
			(proxy, method, args) -> {
				switch (method.getName())
				{
					case "getWidget":
						// the fixed layout's minimap, and nothing else loaded
						return args != null && args.length == 1 && Integer.valueOf(InterfaceID.Toplevel.MINIMAP).equals(args[0])
							? minimap : null;
					case "getBufferProvider":
						return frame;
					case "getMouseCanvasPosition":
						return new Point(mouseX, mouseY);
					case "getCanvasWidth":
						return CANVAS_WIDTH;
					case "getCanvasHeight":
						return CANVAS_HEIGHT;
					case "toString":
						return "client";
					case "hashCode":
						return System.identityHashCode(proxy);
					case "equals":
						return proxy == args[0];
					default:
						return defaultValue(method.getReturnType());
				}
			});
	}

	@Test
	public void magnifiedPixelsLandCentredOnTheCursor()
	{
		paintFrame(mouseX, mouseY);
		final int zoom = 300;
		final int radius = 40;
		overlay(new MinimapLoupeConfig()
		{
			@Override
			public int zoom()
			{
				return zoom;
			}

			@Override
			public int radius()
			{
				return radius;
			}

			@Override
			public boolean smooth()
			{
				return false;
			}

			@Override
			public boolean showBorder()
			{
				return false;
			}
		}).render(graphics);

		// the one lit pixel, magnified 3x, is a 3x3 block centred on the cursor
		final Rectangle blob = boundsOf(MARKER);
		assertEquals("blob width", 3, blob.width);
		assertEquals("blob height", 3, blob.height);
		assertEquals("blob centre x", mouseX, blob.x + 1);
		assertEquals("blob centre y", mouseY, blob.y + 1);
		assertEquals(MARKER, pixels[mouseY * CANVAS_WIDTH + mouseX] & 0xFFFFFF);
	}

	@Test
	public void theLensIsParkedClearOfTheMapWhenAsked()
	{
		paintFrame(mouseX, mouseY);
		final int radius = 40;
		overlay(new MinimapLoupeConfig()
		{
			@Override
			public int zoom()
			{
				return 300;
			}

			@Override
			public int radius()
			{
				return radius;
			}

			@Override
			public boolean smooth()
			{
				return false;
			}

			@Override
			public boolean showBorder()
			{
				return false;
			}

			@Override
			public LensAnchor anchor()
			{
				return LensAnchor.BESIDE_MINIMAP;
			}
		}).render(graphics);

		// the map still holds the original lit pixel, so look only where the
		// parked lens is: everything left of the minimap's box
		final Rectangle blob = boundsOf(MARKER, new Rectangle(0, 0, MINIMAP.x, CANVAS_HEIGHT));
		assertEquals(3, blob.width);
		// left of the minimap's box, vertically on its middle
		assertEquals(MINIMAP.x - radius - 8, blob.x + 1);
		assertEquals(MINIMAP.y + MINIMAP.height / 2, blob.y + 1);
		// and the map itself is untouched
		assertTrue(MINIMAP.x > blob.x + blob.width);
	}

	@Test
	public void nothingIsDrawnWhenTheCursorIsOffTheMap()
	{
		paintFrame(mouseX, mouseY);
		final int[] before = pixels.clone();
		mouseX = 100;
		mouseY = 300;

		assertNull(overlay(new MinimapLoupeConfig()
		{
		}).render(graphics));
		assertTrue(java.util.Arrays.equals(before, pixels));
	}

	@Test
	public void theGraphicsIsHandedBackAsItWasFound()
	{
		paintFrame(mouseX, mouseY);
		graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION,
			RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR);
		graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING,
			RenderingHints.VALUE_ANTIALIAS_OFF);
		final java.awt.Stroke stroke = graphics.getStroke();

		overlay(new MinimapLoupeConfig()
		{
		}).render(graphics);

		// RuneLite reuses one Graphics2D for every overlay in the frame, so a
		// hint left switched on here would follow every plugin drawn after it
		assertEquals(RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR,
			graphics.getRenderingHint(RenderingHints.KEY_INTERPOLATION));
		assertEquals(RenderingHints.VALUE_ANTIALIAS_OFF,
			graphics.getRenderingHint(RenderingHints.KEY_ANTIALIASING));
		assertEquals(stroke, graphics.getStroke());
		assertNull(graphics.getClip());
	}

	@Test
	public void theRimIsDrawnAroundTheLens()
	{
		paintFrame(mouseX, mouseY);
		final Color rim = new Color(0x00FF00);
		final int radius = 40;
		overlay(new MinimapLoupeConfig()
		{
			@Override
			public int radius()
			{
				return radius;
			}

			@Override
			public Color borderColor()
			{
				return rim;
			}
		}).render(graphics);

		final Rectangle ring = boundsOf(rim.getRGB() & 0xFFFFFF);
		assertEquals(mouseX, ring.x + ring.width / 2);
		assertEquals(mouseY, ring.y + ring.height / 2);
		assertEquals(2 * radius, ring.width, 2);
		assertEquals(2 * radius, ring.height, 2);
	}

	/** Bounding box of every pixel of exactly this colour. */
	private Rectangle boundsOf(int rgb)
	{
		return boundsOf(rgb, new Rectangle(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT));
	}

	/** Bounding box of every pixel of exactly this colour within a region. */
	private Rectangle boundsOf(int rgb, Rectangle region)
	{
		int minX = Integer.MAX_VALUE, minY = Integer.MAX_VALUE, maxX = -1, maxY = -1;
		for (int y = region.y; y < region.y + region.height; y++)
		{
			for (int x = region.x; x < region.x + region.width; x++)
			{
				if ((pixels[y * CANVAS_WIDTH + x] & 0xFFFFFF) == rgb)
				{
					minX = Math.min(minX, x);
					minY = Math.min(minY, y);
					maxX = Math.max(maxX, x);
					maxY = Math.max(maxY, y);
				}
			}
		}
		assertTrue("no pixels of " + Integer.toHexString(rgb), maxX >= 0);
		return new Rectangle(minX, minY, maxX - minX + 1, maxY - minY + 1);
	}

	private interface Answers
	{
		void fill(Map<String, Object> answers);
	}

	@SuppressWarnings("unchecked")
	private static <T> T stub(Class<T> type, Answers fill)
	{
		final Map<String, Object> answers = new HashMap<>();
		fill.fill(answers);
		final InvocationHandler handler = (proxy, method, args) ->
			answers.containsKey(method.getName())
				? answers.get(method.getName())
				: defaultValue(method.getReturnType());
		return (T) Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, handler);
	}

	private static Object defaultValue(Class<?> type)
	{
		if (!type.isPrimitive())
		{
			return null;
		}
		if (type == boolean.class)
		{
			return false;
		}
		if (type == long.class)
		{
			return 0L;
		}
		if (type == double.class)
		{
			return 0d;
		}
		if (type == float.class)
		{
			return 0f;
		}
		if (type == void.class)
		{
			return null;
		}
		return 0;
	}
}
