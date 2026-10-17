# One village, one cast

User approved removing the separate old demo and putting all AI missions in the painted village. Continue the existing native modules and feature branch; no paid calls or AWS deployment.

Implementation choice: a mission panel docks beside the same map (below it on phones). The map and six characters stay mounted. Mission presentation stages Mira at the trading post for checks/trades and the hall for declines, with the active helper highlighted. This is labeled case staging, not model evaluation of the custom building layout. Original evidence/actor names remain unmodified in the trace. The same six-character rail exposes their AI roles. Closing returns to local orders; local time is held while the panel is open. Completion awards the existing once-per-scene reward. No second map, duplicate cast rail, or old renderer ships.

1. Add browser regression: one painted map, no old renderer/panel, missions within strategy shell, same six characters, local time held/restored, step changes on-map activity, reward once, close/reopen retains evidence, phone overflow and visible controls.
2. Move scene selection/story/evidence into the mission dock, replace old map render with mission staging on existing crew, reuse crew rail/portraits, remove old source renderer and refresh disclosure/docs.
3. Run Node and sequential browser suites; one fresh review; fix important findings; publish existing feature PR and Pages; verify deployed tests/hashes and refresh handoff ZIP/screenshots.

Review focus: closing during autoplay stops subsequent decisions; an in-flight result is retained; switching/restarting cannot duplicate rewards; pause state survives mission open/close and reload; original evidence is never relabeled as decisions about player buildings; mobile panel/character guides remain usable.
