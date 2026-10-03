import * as Phaser from 'phaser';
import { DungeonScene } from './scenes/DungeonScene';

export function createPhaserGame(parent: HTMLElement): { game: Phaser.Game; scene: DungeonScene } {
  const scene = new DungeonScene();
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent,
    backgroundColor: '#0b0710',
    pixelArt: true,
    antialias: false,
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
    scene: [scene],
    banner: false,
  });
  return { game, scene };
}
