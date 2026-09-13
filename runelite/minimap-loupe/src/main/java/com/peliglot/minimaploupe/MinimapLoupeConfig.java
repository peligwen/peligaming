package com.peliglot.minimaploupe;

import java.awt.Color;
import net.runelite.client.config.Alpha;
import net.runelite.client.config.Config;
import net.runelite.client.config.ConfigGroup;
import net.runelite.client.config.ConfigItem;
import net.runelite.client.config.Keybind;
import net.runelite.client.config.Range;
import net.runelite.client.config.Units;

@ConfigGroup(MinimapLoupeConfig.GROUP)
public interface MinimapLoupeConfig extends Config
{
	String GROUP = "minimaploupe";

	@ConfigItem(
		keyName = "zoom",
		name = "Magnification",
		description = "How much bigger the lens draws the map under it.<br>"
			+ "The lens enlarges pixels the client has already drawn, so past<br>"
			+ "about 400% it reads as blocks rather than detail.",
		position = 1
	)
	@Range(min = 110, max = 800)
	@Units(Units.PERCENT)
	default int zoom()
	{
		return 250;
	}

	@ConfigItem(
		keyName = "radius",
		name = "Lens radius",
		description = "Radius of the magnified circle, on screen.",
		position = 2
	)
	@Range(min = 16, max = 200)
	@Units(Units.PIXELS)
	default int radius()
	{
		return 56;
	}

	@ConfigItem(
		keyName = "anchor",
		name = "Lens position",
		description = "Draw the lens on the cursor, or beside the minimap so the map stays clear.",
		position = 3
	)
	default LensAnchor anchor()
	{
		return LensAnchor.CURSOR;
	}

	@ConfigItem(
		keyName = "smooth",
		name = "Smooth",
		description = "Blend the enlarged pixels instead of showing hard squares.",
		position = 4
	)
	default boolean smooth()
	{
		return true;
	}

	@ConfigItem(
		keyName = "showBorder",
		name = "Show rim",
		description = "Draw a ring around the lens.",
		position = 5
	)
	default boolean showBorder()
	{
		return true;
	}

	@Alpha
	@ConfigItem(
		keyName = "borderColor",
		name = "Rim colour",
		description = "Colour of the ring around the lens.",
		position = 6
	)
	default Color borderColor()
	{
		return new Color(0xE0, 0xC0, 0x6A, 0xD0);
	}

	@ConfigItem(
		keyName = "borderWidth",
		name = "Rim width",
		description = "Thickness of the ring around the lens.",
		position = 7
	)
	@Range(min = 1, max = 8)
	@Units(Units.PIXELS)
	default int borderWidth()
	{
		return 2;
	}

	@ConfigItem(
		keyName = "showCrosshair",
		name = "Show crosshair",
		description = "Mark the exact point under the cursor at the centre of the lens.<br>"
			+ "Mostly useful with the lens parked beside the minimap.",
		position = 8
	)
	default boolean showCrosshair()
	{
		return false;
	}

	@ConfigItem(
		keyName = "hotkey",
		name = "Hold to show",
		description = "Only show the lens while this key is held.<br>"
			+ "Leave unset and it shows whenever the cursor is over the minimap.",
		position = 9
	)
	default Keybind hotkey()
	{
		return Keybind.NOT_SET;
	}
}
