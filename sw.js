// MineGuess Service Worker — Offline Support
// Version bei jedem Deploy erhöhen. HTML/JS/CSS/JSON: network-first (frische Deploys),
// Bilder/Fonts: cache-first. Socket.io und Firebase werden nie abgefangen.
const CACHE = 'mineguess-v17';
// ASSETS_START (generiert von tools/gen-sw-assets.js)
const ASSETS = [
  "/",
  "/index.html",
  "/game.html",
  "/multiplayer.html",
  "/premium.html",
  "/impressum.html",
  "/datenschutz.html",
  "/mg.css",
  "/mg-skin.js",
  "/mg-icons.js",
  "/mg-scene.js",
  "/mg-png.js",
  "/answer-check.js",
  "/ranked.js",
  "/sounds/bell.mp3",
  "/sounds/orb.mp3",
  "/sounds/totem.mp3",
  "/sounds/rare-achievement.mp3",
  "/sounds/anvil-drop.mp3",
  "/questions.json",
  "/multiplayer-config.js",
  "/logo-green.png",
  "/logo-transparent.png",
  "/logo-64.png",
  "/logo-128.png",
  "/fonts/inter-400-800-latin.woff2",
  "/fonts/silkscreen-400-latin.woff2",
  "/fonts/silkscreen-700-latin.woff2"
];
// ASSETS_END

// ASSETS_MC_START (generiert aus assets/mc/ von tools/gen-sw-assets.js)
const ASSETS_MC = ["/assets/mc/block/barrel_side.png","/assets/mc/block/bedrock.png","/assets/mc/block/bell_bottom.png","/assets/mc/block/bell_side.png","/assets/mc/block/bell_top.png","/assets/mc/block/bookshelf.png","/assets/mc/block/cobblestone.png","/assets/mc/block/crafting_table_front.png","/assets/mc/block/crafting_table_top.png","/assets/mc/block/deepslate.png","/assets/mc/block/diamond_block.png","/assets/mc/block/diamond_ore.png","/assets/mc/block/dirt.png","/assets/mc/block/emerald_block.png","/assets/mc/block/enchanting_table_top.png","/assets/mc/block/end_stone.png","/assets/mc/block/furnace_front.png","/assets/mc/block/glowstone.png","/assets/mc/block/gold_block.png","/assets/mc/block/grass_block_side.png","/assets/mc/block/grass_block_top.png","/assets/mc/block/gravel.png","/assets/mc/block/iron_bars.png","/assets/mc/block/iron_block.png","/assets/mc/block/lava_still.png","/assets/mc/block/lectern_front.png","/assets/mc/block/netherrack.png","/assets/mc/block/note_block.png","/assets/mc/block/oak_leaves.png","/assets/mc/block/oak_log.png","/assets/mc/block/oak_log_top.png","/assets/mc/block/oak_planks.png","/assets/mc/block/oak_sapling.png","/assets/mc/block/obsidian.png","/assets/mc/block/piston_side.png","/assets/mc/block/polished_andesite.png","/assets/mc/block/pumpkin_side.png","/assets/mc/block/redstone_block.png","/assets/mc/block/redstone_lamp.png","/assets/mc/block/redstone_torch.png","/assets/mc/block/repeater.png","/assets/mc/block/sand.png","/assets/mc/block/scaffolding_bottom.png","/assets/mc/block/scaffolding_side.png","/assets/mc/block/scaffolding_top.png","/assets/mc/block/sculk.png","/assets/mc/block/slime_block.png","/assets/mc/block/soul_sand.png","/assets/mc/block/sponge.png","/assets/mc/block/stone.png","/assets/mc/block/stone_bricks.png","/assets/mc/block/stripped_oak_log.png","/assets/mc/block/stripped_oak_log_top.png","/assets/mc/block/tnt_side.png","/assets/mc/block/tnt_top.png","/assets/mc/block/torch.png","/assets/mc/block/water_still.png","/assets/mc/entity/bell/bell_body.png","/assets/mc/entity/player/slim/alex.png","/assets/mc/entity/player/wide/steve.png","/assets/mc/gui/button.png","/assets/mc/gui/button_disabled.png","/assets/mc/gui/button_highlighted.png","/assets/mc/gui/food_empty.png","/assets/mc/gui/food_full.png","/assets/mc/gui/food_half.png","/assets/mc/gui/heart_empty.png","/assets/mc/gui/heart_full.png","/assets/mc/gui/heart_half.png","/assets/mc/gui/hotbar.png","/assets/mc/gui/hotbar_selection.png","/assets/mc/gui/slot.png","/assets/mc/gui/slot_highlight_back.png","/assets/mc/gui/xp_bar_background.png","/assets/mc/gui/xp_bar_progress.png","/assets/mc/gui/xp_orb.png","/assets/mc/item/allay_spawn_egg.png","/assets/mc/item/apple.png","/assets/mc/item/arrow.png","/assets/mc/item/axolotl_spawn_egg.png","/assets/mc/item/barrier.png","/assets/mc/item/bee_spawn_egg.png","/assets/mc/item/blaze_powder.png","/assets/mc/item/blaze_rod.png","/assets/mc/item/blaze_spawn_egg.png","/assets/mc/item/bone.png","/assets/mc/item/book.png","/assets/mc/item/bow.png","/assets/mc/item/bread.png","/assets/mc/item/cake.png","/assets/mc/item/carrot.png","/assets/mc/item/cat_spawn_egg.png","/assets/mc/item/chicken_spawn_egg.png","/assets/mc/item/clock_00.png","/assets/mc/item/clock_01.png","/assets/mc/item/coal.png","/assets/mc/item/comparator.png","/assets/mc/item/compass_00.png","/assets/mc/item/cooked_beef.png","/assets/mc/item/copper_ingot.png","/assets/mc/item/cow_spawn_egg.png","/assets/mc/item/creeper_spawn_egg.png","/assets/mc/item/diamond.png","/assets/mc/item/diamond_helmet.png","/assets/mc/item/diamond_pickaxe.png","/assets/mc/item/diamond_sword.png","/assets/mc/item/drowned_spawn_egg.png","/assets/mc/item/elytra.png","/assets/mc/item/emerald.png","/assets/mc/item/enchanted_book.png","/assets/mc/item/ender_eye.png","/assets/mc/item/ender_pearl.png","/assets/mc/item/enderman_spawn_egg.png","/assets/mc/item/experience_bottle.png","/assets/mc/item/feather.png","/assets/mc/item/filled_map.png","/assets/mc/item/firework_rocket.png","/assets/mc/item/ghast_spawn_egg.png","/assets/mc/item/glass_bottle.png","/assets/mc/item/glowstone_dust.png","/assets/mc/item/gold_ingot.png","/assets/mc/item/gold_nugget.png","/assets/mc/item/golden_apple.png","/assets/mc/item/golden_helmet.png","/assets/mc/item/golden_sword.png","/assets/mc/item/gunpowder.png","/assets/mc/item/iron_helmet.png","/assets/mc/item/iron_ingot.png","/assets/mc/item/iron_pickaxe.png","/assets/mc/item/iron_sword.png","/assets/mc/item/lapis_lazuli.png","/assets/mc/item/lead.png","/assets/mc/item/map.png","/assets/mc/item/minecart.png","/assets/mc/item/name_tag.png","/assets/mc/item/nether_star.png","/assets/mc/item/netherite_ingot.png","/assets/mc/item/paper.png","/assets/mc/item/phantom_spawn_egg.png","/assets/mc/item/pig_spawn_egg.png","/assets/mc/item/piglin_spawn_egg.png","/assets/mc/item/potion.png","/assets/mc/item/redstone.png","/assets/mc/item/repeater.png","/assets/mc/item/rotten_flesh.png","/assets/mc/item/saddle.png","/assets/mc/item/sheep_spawn_egg.png","/assets/mc/item/skeleton_spawn_egg.png","/assets/mc/item/slime_ball.png","/assets/mc/item/slime_spawn_egg.png","/assets/mc/item/spider_eye.png","/assets/mc/item/spider_spawn_egg.png","/assets/mc/item/splash_potion.png","/assets/mc/item/stick.png","/assets/mc/item/string.png","/assets/mc/item/totem_of_undying.png","/assets/mc/item/trident.png","/assets/mc/item/villager_spawn_egg.png","/assets/mc/item/wandering_trader_spawn_egg.png","/assets/mc/item/warden_spawn_egg.png","/assets/mc/item/wheat.png","/assets/mc/item/witch_spawn_egg.png","/assets/mc/item/wolf_spawn_egg.png","/assets/mc/item/wooden_pickaxe.png","/assets/mc/item/wooden_sword.png","/assets/mc/item/writable_book.png","/assets/mc/item/zombie_spawn_egg.png","/assets/mc/map/map_background.png"];
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

  const isStaticMedia = url.pathname.startsWith('/assets/mc/') || /\.(png|jpg|jpeg|svg|webp|gif|ico|woff2?|ttf|mp3|ogg|wav)$/i.test(url.pathname);

  if (isStaticMedia) {
    // cache-first, im Hintergrund auffrischen
    e.respondWith(
      caches.match(req).then(cached => {
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
