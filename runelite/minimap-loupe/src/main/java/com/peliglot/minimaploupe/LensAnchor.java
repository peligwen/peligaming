package com.peliglot.minimaploupe;

/**
 * Where the magnified circle is drawn. What it *shows* is the same either
 * way — the patch of minimap under the cursor — this only says where that
 * patch is painted.
 */
public enum LensAnchor
{
	/**
	 * Under the cursor, like a magnifying glass laid on the map. Reads most
	 * naturally, at the cost of covering the map around the pointer.
	 */
	CURSOR("On the cursor"),
	/**
	 * Parked to the left of the minimap, so the map itself is never covered
	 * and the lens never magnifies its own output.
	 */
	BESIDE_MINIMAP("Beside the minimap");

	private final String label;

	LensAnchor(String label)
	{
		this.label = label;
	}

	@Override
	public String toString()
	{
		return label;
	}
}
