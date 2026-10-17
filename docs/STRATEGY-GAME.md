# Village strategy game

Play at https://lingikaushikreddy.github.io/Village-Sentinel/.

The original single-player browser simulation lets you place farms, timber camps, trading posts and watchtowers on an isometric grid. Buildings consume coins and timber. Farms generate food, camps produce timber and trading posts earn coins every five game seconds. Villagers consume food every ten seconds. Watchtowers provide village-wide defense against a raid every thirty seconds, with each raid stronger than the last. Upgrade buildings through level three; trade sixteen coins for eight food, or spend ten coins and twenty timber to repair twenty-five integrity.

Choose a building in the construction bar, then click a highlighted tile. Roofs become translucent during placement. Click a structure to upgrade it, or use “Manage a building” when another roof obscures it. On phones, swipe the map horizontally. Pause freezes village time; 2× advances twice as fast. Hidden pages do not advance. Progress saves on this device, with no offline production or cross-device account. “New village” asks before replacing that save.

Win by constructing eight buildings, repelling three raids and finishing at least one AI mission. Zero integrity ends the village. A completed AI mission grants forty coins and twenty-five timber once per scenario per village. Restarting that scenario does not multiply its reward.

The builder is deterministic application code. Its placement, economy, raids and workers do not invoke a model. The existing AI missions have their own world, observations and evidence. The public site replays real saved Decider results with a labeled Bedrock stand-in. These results do not read a player's custom buildings. Locally configured live mode retains the existing real Decider path. AWS and live Bedrock remain pending account setup.

All isometric terrain, buildings, villagers and raiders in this expansion are original code-drawn SVG. The game draws general inspiration from village strategy games; it contains no Brawl Stars or Clash of Clans assets, characters or branding, and has no multiplayer service.

Run `npm run test:strategy` with the game server running to exercise building, upgrades, trade, mission rewards, save/reload, invalid-save recovery, browser Back navigation, reset, pause/production, raid visuals and mobile layout. `SENTINEL_TEST_URL` can point to the static preview or public site. The tests use isolated browser contexts and spend nothing.
