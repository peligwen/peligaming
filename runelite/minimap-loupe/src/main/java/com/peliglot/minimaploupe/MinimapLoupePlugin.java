package com.peliglot.minimaploupe;

import com.google.inject.Provides;
import javax.inject.Inject;
import net.runelite.client.config.ConfigManager;
import net.runelite.client.config.Keybind;
import net.runelite.client.input.KeyManager;
import net.runelite.client.plugins.Plugin;
import net.runelite.client.plugins.PluginDescriptor;
import net.runelite.client.ui.overlay.OverlayManager;
import net.runelite.client.util.HotkeyListener;

@PluginDescriptor(
	name = "Minimap Loupe",
	description = "Magnifies a small circle of the minimap under your cursor",
	tags = {"minimap", "magnify", "magnifier", "zoom", "loupe", "lens", "map", "accessibility"}
)
public class MinimapLoupePlugin extends Plugin
{
	@Inject
	private OverlayManager overlayManager;

	@Inject
	private MinimapLoupeOverlay overlay;

	@Inject
	private KeyManager keyManager;

	@Inject
	private MinimapLoupeConfig config;

	/** Written on the key thread, read on the client thread each frame. */
	private volatile boolean hotkeyHeld;

	private final HotkeyListener hotkeyListener = new HotkeyListener(() -> config.hotkey())
	{
		@Override
		public void hotkeyPressed()
		{
			hotkeyHeld = true;
		}

		@Override
		public void hotkeyReleased()
		{
			hotkeyHeld = false;
		}
	};

	@Provides
	MinimapLoupeConfig provideConfig(ConfigManager configManager)
	{
		return configManager.getConfig(MinimapLoupeConfig.class);
	}

	@Override
	protected void startUp()
	{
		hotkeyHeld = false;
		overlayManager.add(overlay);
		keyManager.registerKeyListener(hotkeyListener);
	}

	@Override
	protected void shutDown()
	{
		keyManager.unregisterKeyListener(hotkeyListener);
		overlayManager.remove(overlay);
		hotkeyHeld = false;
	}

	/**
	 * Whether the lens should draw at all this frame. With no key bound it is
	 * always armed and the cursor being over the minimap is the only condition;
	 * with one bound, the key has to be down as well.
	 */
	boolean isLensActive()
	{
		final Keybind hotkey = config.hotkey();
		return hotkey == null || Keybind.NOT_SET.equals(hotkey) || hotkeyHeld;
	}
}
