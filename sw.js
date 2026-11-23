// MineGuess Service Worker — Offline Support
// Version bei jedem Deploy erhöhen. HTML/JS/CSS/JSON: network-first (frische Deploys),
// Bilder/Fonts: cache-first. Socket.io und Firebase werden nie abgefangen.
const CACHE = 'mineguess-v273';
// ASSETS_START (generiert von tools/gen-sw-assets.js)
const ASSETS = [
  "/",
  "/index.html",
  "/game.html",
  "/multiplayer.html",
  "/impressum.html",
  "/datenschutz.html",
  "/mg.css",
  "/emotes.json",
  "/mg-audio.js",
  "/mg-spotify.js",
  "/spotify-config.js",
  "/mg-skin.js",
  "/mg-icons.js",
  "/mg-scene.js",
  "/mg-png.js",
  "/answer-check.js",
  "/ranked.js",
  "/mg-badges.js",
  "/mg-panorama.js",
  "/mg-craft.js",
  "/craft-check.js",
  "/pairs.js",
  "/pairs.json",
  "/modes.js",
  "/challenge.js",
  "/challenge-pool.json",
  "/mg-craft-build.js",
  "/mg-hl.js",
  "/mg-hand.js",
  "/mg-profile.js",
  "/mg-video.js",
  "/mg-lang.js",
  "/mg-emote.js",
  "/mg-fpv.js",
  "/fpv-rules.js",
  "/emotes.json",
  "/mg-qen.js",
  "/mg-settings.js",
  "/mg-tutorial.js",
  "/mg-report.js",
  "/mg-rounds.js",
  "/mg-social.js",
  "/mg-social2.js",
  "/mg-loader.js",
  "/mg-i18n.js",
  "/mg-iso.js",
  "/assets/mc/block-list.json",
  "/assets/mc/craft-items.json",
  "/i18n-en.json",
  "/mg-mp2.js",
  "/fonts/AtkinsonHyperlegible-Regular.ttf",
  "/fonts/AtkinsonHyperlegible-Bold.ttf",
  "/mg-ranklist.js",
  "/assets/ui/buch.png",
  "/sounds/bell.mp3",
  "/sounds/orb.mp3",
  "/sounds/totem.mp3",
  "/sounds/rare-achievement.mp3",
  "/sounds/anvil-drop.mp3",
  "/questions.json",
  "/multiplayer-config.js",
  "/manifest.webmanifest",
  "/assets/brand/og-image.png",
  "/facts.json",
  "/assets/brand/icon-192.png",
  "/assets/brand/icon-512.png",
  "/assets/brand/icon-maskable-512.png",
  "/assets/brand/apple-touch-icon.png",
  "/assets/brand/brand-64.png",
  "/assets/brand/brand-128.png",
  "/assets/brand/brand-192.png",
  "/assets/brand/brand-512.png",
  "/assets/brand/banner-600.png",
  "/assets/brand/banner-dark-44.png",
  "/assets/brand/banner-dark-60.png",
  "/assets/brand/banner-dark-88.png",
  "/assets/brand/banner-dark-120.png",
  "/assets/brand/banner-light-44.png",
  "/assets/brand/banner-light-60.png",
  "/assets/brand/banner-light-88.png",
  "/assets/brand/banner-light-120.png",
  "/assets/brand/favicon-16.png",
  "/assets/brand/favicon-32.png",
  "/fonts/inter-400-800-latin.woff2",
  "/fonts/silkscreen-400-latin.woff2",
  "/fonts/silkscreen-700-latin.woff2",
  "/assets/video/clips.json",
  "/assets/video/poster/clip-01.webp",
  "/assets/video/poster/clip-02.webp",
  "/assets/video/poster/clip-03.webp",
  "/assets/video/poster/clip-04.webp",
  "/assets/video/poster/clip-05.webp",
  "/assets/video/poster/clip-06.webp",
  "/assets/video/poster/clip-07.webp",
  "/assets/video/poster/clip-08.webp",
  "/assets/video/poster/clip-09.webp",
  "/assets/video/poster/clip-10.webp",
  "/assets/video/poster/clip-11.webp",
  "/assets/video/poster/clip-12.webp"
];
// ASSETS_END

// ASSETS_MC_START (generiert aus assets/mc/ von tools/gen-sw-assets.js)
const ASSETS_MC = ["/assets/mc/block/acacia_log.png","/assets/mc/block/acacia_planks.png","/assets/mc/block/azure_bluet.png","/assets/mc/block/barrel_side.png","/assets/mc/block/basalt_side.png","/assets/mc/block/bedrock.png","/assets/mc/block/bell_bottom.png","/assets/mc/block/bell_side.png","/assets/mc/block/bell_top.png","/assets/mc/block/birch_leaves.png","/assets/mc/block/birch_log.png","/assets/mc/block/birch_planks.png","/assets/mc/block/black_stained_glass.png","/assets/mc/block/blue_orchid.png","/assets/mc/block/blue_stained_glass.png","/assets/mc/block/blue_wool.png","/assets/mc/block/bookshelf.png","/assets/mc/block/brown_stained_glass.png","/assets/mc/block/brown_wool.png","/assets/mc/block/cherry_log.png","/assets/mc/block/cherry_planks.png","/assets/mc/block/chiseled_red_sandstone.png","/assets/mc/block/cobblestone.png","/assets/mc/block/copper_trapdoor.png","/assets/mc/block/cornflower.png","/assets/mc/block/crafting_table_front.png","/assets/mc/block/crafting_table_top.png","/assets/mc/block/crimson_planks.png","/assets/mc/block/crimson_stem_top.png","/assets/mc/block/cut_red_sandstone.png","/assets/mc/block/cyan_stained_glass.png","/assets/mc/block/cyan_wool.png","/assets/mc/block/dandelion.png","/assets/mc/block/dark_oak_leaves.png","/assets/mc/block/dark_oak_log.png","/assets/mc/block/dark_oak_planks.png","/assets/mc/block/deepslate.png","/assets/mc/block/diamond_block.png","/assets/mc/block/diamond_ore.png","/assets/mc/block/dirt.png","/assets/mc/block/emerald_block.png","/assets/mc/block/enchanting_table_top.png","/assets/mc/block/end_stone.png","/assets/mc/block/exposed_chiseled_copper.png","/assets/mc/block/exposed_copper.png","/assets/mc/block/exposed_copper_bulb.png","/assets/mc/block/exposed_copper_grate.png","/assets/mc/block/exposed_copper_trapdoor.png","/assets/mc/block/exposed_cut_copper.png","/assets/mc/block/furnace_front.png","/assets/mc/block/glowstone.png","/assets/mc/block/gold_block.png","/assets/mc/block/grass_block_side.png","/assets/mc/block/grass_block_top.png","/assets/mc/block/gravel.png","/assets/mc/block/gray_stained_glass.png","/assets/mc/block/gray_wool.png","/assets/mc/block/green_stained_glass.png","/assets/mc/block/green_wool.png","/assets/mc/block/iron_bars.png","/assets/mc/block/iron_block.png","/assets/mc/block/jungle_log.png","/assets/mc/block/jungle_planks.png","/assets/mc/block/lava_still.png","/assets/mc/block/lectern_front.png","/assets/mc/block/light_blue_stained_glass.png","/assets/mc/block/light_blue_wool.png","/assets/mc/block/light_gray_stained_glass.png","/assets/mc/block/light_gray_wool.png","/assets/mc/block/lilac_top.png","/assets/mc/block/lily_of_the_valley.png","/assets/mc/block/lime_stained_glass.png","/assets/mc/block/lime_wool.png","/assets/mc/block/magenta_stained_glass.png","/assets/mc/block/magenta_wool.png","/assets/mc/block/mangrove_log.png","/assets/mc/block/mangrove_planks.png","/assets/mc/block/mangrove_roots_side.png","/assets/mc/block/nether_bricks.png","/assets/mc/block/netherrack.png","/assets/mc/block/note_block.png","/assets/mc/block/oak_leaves.png","/assets/mc/block/oak_log.png","/assets/mc/block/oak_log_top.png","/assets/mc/block/oak_planks.png","/assets/mc/block/oak_sapling.png","/assets/mc/block/obsidian.png","/assets/mc/block/orange_stained_glass.png","/assets/mc/block/orange_tulip.png","/assets/mc/block/orange_wool.png","/assets/mc/block/oxeye_daisy.png","/assets/mc/block/oxidized_chiseled_copper.png","/assets/mc/block/oxidized_copper.png","/assets/mc/block/oxidized_copper_bulb.png","/assets/mc/block/oxidized_copper_grate.png","/assets/mc/block/oxidized_copper_trapdoor.png","/assets/mc/block/oxidized_cut_copper.png","/assets/mc/block/piston_side.png","/assets/mc/block/polished_andesite.png","/assets/mc/block/pumpkin_side.png","/assets/mc/block/redstone_block.png","/assets/mc/block/redstone_lamp.png","/assets/mc/block/redstone_torch.png","/assets/mc/block/repeater.png","/assets/mc/block/sand.png","/assets/mc/block/scaffolding_bottom.png","/assets/mc/block/scaffolding_side.png","/assets/mc/block/scaffolding_top.png","/assets/mc/block/sculk.png","/assets/mc/block/short_grass.png","/assets/mc/block/slime_block.png","/assets/mc/block/soul_sand.png","/assets/mc/block/sponge.png","/assets/mc/block/spruce_leaves.png","/assets/mc/block/stone.png","/assets/mc/block/stone_bricks.png","/assets/mc/block/stripped_oak_log.png","/assets/mc/block/stripped_oak_log_top.png","/assets/mc/block/tall_grass_bottom.png","/assets/mc/block/tall_grass_top.png","/assets/mc/block/tnt_side.png","/assets/mc/block/tnt_top.png","/assets/mc/block/torch.png","/assets/mc/block/water_still.png","/assets/mc/entity/bell/bell_body.png","/assets/mc/entity/player/slim/alex.png","/assets/mc/entity/player/wide/steve.png","/assets/mc/gui/heart_container.png","/assets/mc/gui/heart_container_hardcore.png","/assets/mc/gui/heart_full.png","/assets/mc/gui/heart_half.png","/assets/mc/gui/heart_hardcore_full.png","/assets/mc/gui/heart_hardcore_half.png","/assets/mc/item/acacia_boat.png","/assets/mc/item/allay_spawn_egg.png","/assets/mc/item/apple.png","/assets/mc/item/arrow.png","/assets/mc/item/axolotl_spawn_egg.png","/assets/mc/item/barrier.png","/assets/mc/item/bee_spawn_egg.png","/assets/mc/item/birch_boat.png","/assets/mc/item/blaze_powder.png","/assets/mc/item/blaze_rod.png","/assets/mc/item/blaze_spawn_egg.png","/assets/mc/item/blue_dye.png","/assets/mc/item/bolt_armor_trim_smithing_template.png","/assets/mc/item/bone.png","/assets/mc/item/book.png","/assets/mc/item/bow.png","/assets/mc/item/bread.png","/assets/mc/item/brown_dye.png","/assets/mc/item/cake.png","/assets/mc/item/carrot.png","/assets/mc/item/cat_spawn_egg.png","/assets/mc/item/charcoal.png","/assets/mc/item/cherry_boat.png","/assets/mc/item/chicken_spawn_egg.png","/assets/mc/item/clock_00.png","/assets/mc/item/clock_01.png","/assets/mc/item/coal.png","/assets/mc/item/coast_armor_trim_smithing_template.png","/assets/mc/item/comparator.png","/assets/mc/item/compass_00.png","/assets/mc/item/cooked_beef.png","/assets/mc/item/copper_door.png","/assets/mc/item/copper_ingot.png","/assets/mc/item/cow_spawn_egg.png","/assets/mc/item/creeper_spawn_egg.png","/assets/mc/item/cyan_dye.png","/assets/mc/item/dark_oak_boat.png","/assets/mc/item/diamond.png","/assets/mc/item/diamond_helmet.png","/assets/mc/item/diamond_pickaxe.png","/assets/mc/item/diamond_sword.png","/assets/mc/item/drowned_spawn_egg.png","/assets/mc/item/dune_armor_trim_smithing_template.png","/assets/mc/item/elytra.png","/assets/mc/item/emerald.png","/assets/mc/item/enchanted_book.png","/assets/mc/item/ender_eye.png","/assets/mc/item/ender_pearl.png","/assets/mc/item/enderman_spawn_egg.png","/assets/mc/item/experience_bottle.png","/assets/mc/item/exposed_copper_door.png","/assets/mc/item/eye_armor_trim_smithing_template.png","/assets/mc/item/feather.png","/assets/mc/item/filled_map.png","/assets/mc/item/firework_rocket.png","/assets/mc/item/flow_armor_trim_smithing_template.png","/assets/mc/item/ghast_spawn_egg.png","/assets/mc/item/glass_bottle.png","/assets/mc/item/glowstone_dust.png","/assets/mc/item/gold_ingot.png","/assets/mc/item/gold_nugget.png","/assets/mc/item/golden_apple.png","/assets/mc/item/golden_helmet.png","/assets/mc/item/golden_sword.png","/assets/mc/item/gray_dye.png","/assets/mc/item/green_dye.png","/assets/mc/item/gunpowder.png","/assets/mc/item/host_armor_trim_smithing_template.png","/assets/mc/item/iron_helmet.png","/assets/mc/item/iron_ingot.png","/assets/mc/item/iron_pickaxe.png","/assets/mc/item/iron_sword.png","/assets/mc/item/jungle_boat.png","/assets/mc/item/lapis_lazuli.png","/assets/mc/item/lead.png","/assets/mc/item/light_blue_dye.png","/assets/mc/item/light_gray_dye.png","/assets/mc/item/lime_dye.png","/assets/mc/item/magenta_dye.png","/assets/mc/item/mangrove_boat.png","/assets/mc/item/map.png","/assets/mc/item/minecart.png","/assets/mc/item/name_tag.png","/assets/mc/item/nether_star.png","/assets/mc/item/netherite_ingot.png","/assets/mc/item/netherite_upgrade_smithing_template.png","/assets/mc/item/orange_dye.png","/assets/mc/item/oxidized_copper_door.png","/assets/mc/item/paper.png","/assets/mc/item/phantom_spawn_egg.png","/assets/mc/item/pig_spawn_egg.png","/assets/mc/item/piglin_spawn_egg.png","/assets/mc/item/potion.png","/assets/mc/item/redstone.png","/assets/mc/item/repeater.png","/assets/mc/item/rotten_flesh.png","/assets/mc/item/saddle.png","/assets/mc/item/sheep_spawn_egg.png","/assets/mc/item/skeleton_spawn_egg.png","/assets/mc/item/slime_ball.png","/assets/mc/item/slime_spawn_egg.png","/assets/mc/item/spider_eye.png","/assets/mc/item/spider_spawn_egg.png","/assets/mc/item/splash_potion.png","/assets/mc/item/stick.png","/assets/mc/item/string.png","/assets/mc/item/totem_of_undying.png","/assets/mc/item/trident.png","/assets/mc/item/villager_spawn_egg.png","/assets/mc/item/wandering_trader_spawn_egg.png","/assets/mc/item/warden_spawn_egg.png","/assets/mc/item/wheat.png","/assets/mc/item/witch_spawn_egg.png","/assets/mc/item/wolf_spawn_egg.png","/assets/mc/item/wooden_pickaxe.png","/assets/mc/item/wooden_sword.png","/assets/mc/item/writable_book.png","/assets/mc/item/zombie_spawn_egg.png","/assets/mc/map/map_background.png"];
// ASSETS_MC_END

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => Promise.allSettled(ASSETS.concat(ASSETS_MC).map(u => c.add(u))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                 // Firebase, Google Fonts etc. unberührt
  if (url.pathname.startsWith('/socket.io/')) return;              // Echtzeit nie cachen
  if (url.pathname.includes('firebase-config')) return;

  // Videos nie ueber den Service Worker (Range-Requests, grosse Dateien)
  if (url.pathname.startsWith('/assets/video/') && /\.(mp4|webm)$/i.test(url.pathname)) return;

  const isStaticMedia = url.pathname.startsWith('/assets/mc/') || /\.(png|jpg|jpeg|svg|webp|gif|ico|woff2?|ttf|mp3|ogg|wav)$/i.test(url.pathname);

  if (isStaticMedia) {
    // cache-first, im Hintergrund auffrischen
    e.respondWith(
      caches.match(req).then(cached => {
        if (cached && url.pathname.startsWith('/assets/brand/')) return cached;   // grosse Lade-GIFs nur aus dem Cache
        const net = fetch(req).then(res => {
          if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
          return res;
        }).catch(() => cached);
        return cached || net;
      })
    );
    return;
  }

  // network-first: HTML, JS, CSS, JSON
  e.respondWith(
    fetch(req).then(res => {
      if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(c => c || caches.match('/index.html')))
  );
});
