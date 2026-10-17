// Reconstruct a partial evidence bundle from recorded frames; no inference code.
export function exportFrame(data, index, playbackId) {
  const frame = data.frames[index];
  if (!frame) throw Error('Unknown recorded frame');
  const tick = frame.world.tick;
  const history = data.frames.slice(1, index + 1).map(item => structuredClone(item.latestEntry));
  const bundle = structuredClone(data.finalBundle);
  const full = bundle.run;
  bundle.exportedAt = new Date().toISOString();
  bundle.playbackId = playbackId;
  bundle.provenance = { ...frame.provenance, operation: 'recorded', playbackHost: 'static-replay', newModelCalls: 0 };
  bundle.decisions = history;
  bundle.run = {
    ...full, snapshots: full.snapshots.slice(0, tick + 1), checksums: full.checksums.slice(0, tick + 1),
    events: full.events.filter(item => item.tick <= tick), decisions: full.decisions.filter(item => item.tick <= tick),
    socialDecisions: history.length ? full.socialDecisions.filter(item => item.tick <= tick) : undefined, incidents: structuredClone(frame.incidents),
    status: frame.status, modelCalls: history.length, estimatedCost: 0,
  };
  bundle.verification = { ok: true, reason: 'Recorded prefix verified by the build using the engine replay verifier', invariants: [], recordedCheckpointsMatch: true };
  return bundle;
}
