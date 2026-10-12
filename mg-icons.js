/* MineGuess Icons: Minecraft-Texturen (assets/mc/) und eigene Pixel-Zeichen als inline-SVG.
   MGIcon.html(key, size, label) liefert sicheres HTML (feste Größe, kein Layout-Sprung). */
(function (global) {
  'use strict';
  var BASE = 'assets/mc/';

  // Schlüssel -> Pfad unter assets/mc/ (ohne .png). Quelle: docs/team/TEXTURE-MAP.json
  var MAP = {
    'cat.Mobs': 'item/creeper_spawn_egg', 'cat.Blöcke': 'block/grass_block_side', 'cat.Items': 'item/iron_sword',
    'cat.Crafting': 'block/crafting_table_front', 'cat.Redstone': 'item/redstone', 'cat.Verzauberungen': 'item/enchanted_book',
    'cat.Tränke': 'item/potion', 'cat.Dimensionen': 'block/obsidian', 'cat.Biome': 'block/oak_sapling',
    'cat.Essen & Nahrung': 'item/apple', 'cat.Erze & Ressourcen': 'item/diamond', 'cat.Strukturen': 'block/stone_bricks',
    'cat.Gameplay': 'item/compass_00', 'cat.Spielmechanik': 'block/repeater', 'cat.Geschichte & Updates': 'item/book',
    'cat.Weltgenerierung': 'item/map', 'cat.Hardcore-Wissen': 'item/bone', 'cat.Dorfbewohner': 'item/emerald',
    'badge.first_correct': 'item/arrow', 'badge.mob_expert': 'item/rotten_flesh', 'badge.nether_lord': 'block/netherrack',
    'badge.craft_master': 'block/crafting_table_front', 'badge.redstone_guru': 'item/redstone', 'badge.potion_master': 'item/potion',
    'badge.blitz_rookie': 'item/firework_rocket', 'badge.daily_3': 'item/clock_00', 'badge.daily_7': 'item/filled_map',
    'badge.100_played': 'item/nether_star',
    'mode.endless': 'block/grass_block_side', 'mode.competition': 'item/golden_sword', 'mode.multiplayer': 'item/ender_eye',
    'mode.blitz': 'item/firework_rocket', 'mode.daily': 'item/clock_00',
    'podium.1': 'item/gold_ingot', 'podium.2': 'item/iron_ingot', 'podium.3': 'item/copper_ingot',
    'ui.clock': 'item/clock_00', 'ui.joker': 'item/totem_of_undying', 'ui.sound': 'block/note_block',
    'ui.hint': 'item/glowstone_dust', 'ui.streak': 'item/blaze_powder', 'ui.report': 'item/writable_book'
  };

  // Eigene Pixel-Zeichen (7x7), Farbe über currentColor
  var BITS = {
    check: ['0000001', '0000011', '1000110', '1101100', '0111000', '0010000', '0000000'],
    cross: ['1000001', '0100010', '0010100', '0001000', '0010100', '0100010', '1000001'],
    up:    ['0001000', '0011100', '0111110', '0001000', '0001000', '0001000', '0000000'],
    down:  ['0000000', '0001000', '0001000', '0001000', '0111110', '0011100', '0001000'],
    ask:   ['0111100', '1000010', '0000010', '0001100', '0001000', '0000000', '0001000'],
    sun:   ['0001000', '1001001', '0011100', '0111110', '0011100', '1001001', '0001000'],
    moon:  ['0011100', '0111000', '1110000', '1110000', '1110000', '0111000', '0011100']
  };

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }


  // Vorhandene Dateien (für Namens-Lookup ohne externe Requests)
  var FILES = {};
  'item/allay_spawn_egg item/apple item/arrow item/axolotl_spawn_egg item/barrier item/bee_spawn_egg item/blaze_powder item/blaze_rod item/blaze_spawn_egg item/bone item/book item/bow item/bread item/cake item/carrot item/cat_spawn_egg item/chicken_spawn_egg item/clock_00 item/clock_01 item/coal item/comparator item/compass_00 item/cooked_beef item/copper_ingot item/cow_spawn_egg item/creeper_spawn_egg item/diamond item/diamond_helmet item/diamond_pickaxe item/diamond_sword item/drowned_spawn_egg item/elytra item/emerald item/enchanted_book item/enderman_spawn_egg item/ender_eye item/ender_pearl item/experience_bottle item/feather item/filled_map item/firework_rocket item/ghast_spawn_egg item/glass_bottle item/glowstone_dust item/golden_apple item/golden_helmet item/golden_sword item/gold_ingot item/gold_nugget item/gunpowder item/iron_helmet item/iron_ingot item/iron_pickaxe item/iron_sword item/lapis_lazuli item/lead item/map item/minecart item/name_tag item/netherite_ingot item/nether_star item/paper item/phantom_spawn_egg item/piglin_spawn_egg item/pig_spawn_egg item/potion item/redstone item/repeater item/rotten_flesh item/saddle item/sheep_spawn_egg item/skeleton_spawn_egg item/slime_ball item/slime_spawn_egg item/spider_eye item/spider_spawn_egg item/splash_potion item/stick item/string item/totem_of_undying item/trident item/villager_spawn_egg item/wandering_trader_spawn_egg item/warden_spawn_egg item/wheat item/witch_spawn_egg item/wolf_spawn_egg item/wooden_pickaxe item/wooden_sword item/writable_book item/zombie_spawn_egg block/barrel_side block/bedrock block/bookshelf block/cobblestone block/crafting_table_front block/crafting_table_top block/deepslate block/diamond_block block/diamond_ore block/dirt block/emerald_block block/enchanting_table_top block/end_stone block/furnace_front block/glowstone block/gold_block block/grass_block_side block/grass_block_top block/gravel block/iron_bars block/iron_block block/lava_still block/lectern_front block/netherrack block/note_block block/oak_leaves block/oak_log block/oak_log_top block/oak_planks block/oak_sapling block/obsidian block/piston_side block/pumpkin_side block/redstone_block block/redstone_lamp block/redstone_torch block/repeater block/sand block/sculk block/slime_block block/soul_sand block/sponge block/stone block/stone_bricks block/tnt_side block/tnt_top block/torch block/water_still'.split(' ').forEach(function (p) { FILES[p] = 1; });

  /** Lokale Textur zu einem Mob-/Item-Namen (de oder en). Gibt Pfad oder '' zurück. */
  function forName(name, enName) {
    var names = [enName, name].filter(Boolean);
    for (var i = 0; i < names.length; i++) {
      var id = String(names[i]).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
        .replace(/[ -]+/g, '_').replace(/[^a-z0-9_]/g, '');
      var c = ['item/' + id + '_spawn_egg', 'item/' + id, 'block/' + id, 'item/' + id.replace(/s$/, ''), 'block/' + id.replace(/s$/, '')];
      for (var j = 0; j < c.length; j++) if (FILES[c[j]]) return c[j];
    }
    return '';
  }

  function pixel(name, size) {
    var rows = BITS[name]; if (!rows) return '';
    var r = '';
    rows.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) if (row[x] === '1') r += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>';
    });
    return '<svg class="mc-icon mc-pix" width="' + size + '" height="' + size + '" viewBox="0 0 7 7" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true" focusable="false">' + r + '</svg>';
  }

  /** key: Eintrag aus MAP oder 'px.check' u. a. size: 16/24/32. label: aria-label/alt (leer = Deko). */
  function html(key, size, label) {
    size = size || 24;
    if (key.indexOf('px.') === 0) return pixel(key.slice(3), size);
    var p = MAP[key];
    if (!p) return '';
    return '<img class="mc-icon" src="' + BASE + p + '.png" width="' + size + '" height="' + size + '" alt="' + esc(label || '') +
      '" decoding="async" onerror="this.style.visibility=\'hidden\'">';
  }

  /** Textur anhand von cat-Name (Fallback: leer) */
  function category(name, size) { return html('cat.' + name, size || 16); }

  global.MGIcon = { html: html, category: category, map: MAP, base: BASE, forName: forName };
})(window);
