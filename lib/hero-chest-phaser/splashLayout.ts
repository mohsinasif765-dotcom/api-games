import * as Phaser from 'phaser';

/**
 * Full-bleed splash on portrait: square art must cover the tall canvas
 * (scale by the larger axis + zoom) so width never looks letterboxed / skinny.
 */
export function coverSplash(
  img: Phaser.GameObjects.Image,
  viewW: number,
  viewH: number,
  zoom = 1.08,
) {
  img.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  const s = Math.max(viewW / img.width, viewH / img.height) * zoom;
  img.setScale(s);
  img.setPosition(viewW / 2, viewH / 2);
}
