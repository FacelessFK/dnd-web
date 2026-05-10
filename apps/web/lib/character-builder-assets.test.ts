import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getCharacterBuilderAssetManifestEntries,
  getCharacterBuilderAssetPath,
  getCharacterBuilderAssetStatus,
  getCharacterBuilderEquipmentAssetKey,
  getCharacterBuilderSpellAssetKey,
} from './character-builder-assets';
import {
  backgroundChoices,
  classChoices,
  mockCharacterLibraryEntries,
  speciesChoices,
} from './character-builder-data';
import { getRuleSpellByName } from './character-builder-rules-helpers';

describe('character builder asset mapping', () => {
  it('returns generated local paths for primary visible asset categories', () => {
    assert.equal(
      getCharacterBuilderAssetPath('portrait.elara'),
      '/assets/character-builder/portraits/elara-nightbloom.webp',
    );
    assert.equal(
      getCharacterBuilderAssetPath('species.goliath'),
      '/assets/character-builder/species/goliath.webp',
    );
    assert.equal(
      getCharacterBuilderAssetPath('class.sorcerer'),
      '/assets/character-builder/classes/sorcerer-spark.webp',
    );
    assert.equal(
      getCharacterBuilderAssetPath('background.soldier'),
      '/assets/character-builder/backgrounds/soldier-banner.webp',
    );
    assert.equal(
      getCharacterBuilderAssetPath('equipment.chain_mail'),
      '/assets/character-builder/equipment/chain-mail.webp',
    );
    assert.equal(
      getCharacterBuilderAssetPath('spell.school_illusion'),
      '/assets/character-builder/spells/illusion.webp',
    );
    assert.equal(
      getCharacterBuilderAssetPath('frame.gold'),
      '/assets/character-builder/frames/gold-corner-frame.svg',
    );
  });

  it('keeps missing expanded asset slots explicit and fallback-safe', () => {
    assert.equal(getCharacterBuilderAssetPath('background.entertainer'), null);
    assert.equal(
      getCharacterBuilderAssetStatus('background.entertainer'),
      'missing',
    );

    const manifestEntry = getCharacterBuilderAssetManifestEntries().find(
      (entry) => entry.key === 'background.entertainer',
    );

    assert.equal(
      manifestEntry?.fallbackPath,
      '/assets/character-builder/textures/dark-panel.webp',
    );
  });

  it('maps library, species, class, and background choices to generated art', () => {
    assert.ok(
      mockCharacterLibraryEntries.every(
        (entry) =>
          getCharacterBuilderAssetStatus(entry.portraitAssetKey) ===
          'generated',
      ),
    );
    assert.ok(
      speciesChoices.every(
        (choice) =>
          choice.assetKey &&
          getCharacterBuilderAssetStatus(choice.assetKey) === 'generated',
      ),
    );
    assert.ok(
      classChoices.every(
        (choice) =>
          choice.assetKey &&
          getCharacterBuilderAssetStatus(choice.assetKey) === 'generated',
      ),
    );
    assert.ok(
      backgroundChoices.every(
        (choice) =>
          choice.assetKey &&
          getCharacterBuilderAssetStatus(choice.assetKey) === 'generated',
      ),
    );
  });

  it('resolves equipment labels to exact or safe fallback asset keys', () => {
    assert.equal(
      getCharacterBuilderEquipmentAssetKey('Quarterstaff'),
      'equipment.quarterstaff',
    );
    assert.equal(
      getCharacterBuilderEquipmentAssetKey('Chain Shirt'),
      'equipment.chain_mail',
    );
    assert.equal(
      getCharacterBuilderEquipmentAssetKey("Explorer's Pack"),
      'equipment.explorer_pack',
    );
    assert.equal(
      getCharacterBuilderEquipmentAssetKey('Longsword'),
      'equipment.dagger',
    );
    assert.equal(
      getCharacterBuilderEquipmentAssetKey('Unknown Trinket'),
      'equipment.basic_gear',
    );
  });

  it('resolves spell labels to exact icons or spell-school fallbacks', () => {
    assert.equal(
      getCharacterBuilderSpellAssetKey('Fire Bolt', 'Evocation'),
      'spell.fire_bolt',
    );
    assert.equal(
      getCharacterBuilderSpellAssetKey(
        'Silent Image',
        getRuleSpellByName('Silent Image')?.school,
      ),
      'spell.school_illusion',
    );
    assert.equal(getCharacterBuilderSpellAssetKey('Unknown Spell'), null);
  });
});
