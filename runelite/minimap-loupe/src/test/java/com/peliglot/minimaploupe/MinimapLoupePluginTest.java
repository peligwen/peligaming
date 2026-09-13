package com.peliglot.minimaploupe;

import net.runelite.client.RuneLite;
import net.runelite.client.externalplugins.ExternalPluginManager;

/**
 * Runs a development client with the plugin loaded: {@code gradle run}.
 */
public class MinimapLoupePluginTest
{
	public static void main(String[] args) throws Exception
	{
		ExternalPluginManager.loadBuiltin(MinimapLoupePlugin.class);
		RuneLite.main(args);
	}
}
