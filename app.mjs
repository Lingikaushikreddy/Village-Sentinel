import { CAST, portrait, toolName, toolIcon, escapeHTML as esc } from './characters.mjs?v=9fe5a700fe75';
import { startStrategy } from './strategy.mjs?v=9fe5a700fe75';
import { StaticDemo } from './demo-api.mjs?v=9fe5a700fe75';
import { summarizeUsage } from './presentation.mjs?v=9fe5a700fe75';

const strategy = startStrategy();
const $ = selector => document.querySelector(selector);
const state = { scene: 'notice', mode: 'recorded', run: null, scenes: [], health: {}, busy: false, playing: false, token: '' };
const demo = document.documentElement.dataset.backend === 'recorded-static' ? new StaticDemo() : null;
let exportUrl, playEpoch=0;
const sceneIcons = {
  notice: '<path d="M7 5h17v23H7zM11 10h9m-9 5h9m-9 5h6M4 8H2v23h18v-1"/><path d="m19 2 5 3"/>',
  message: '<path d="M3 6h26v17H17l-7 6v-6H3zM8 11h16M8 16h11"/>',
  grain: '<path d="M16 28V7m0 8C8 17 5 12 7 7c6 0 10 3 9 8Zm0 6c-8 2-12-3-10-8 6 0 11 3 10 8Zm0-6c8 2 11-3 9-8-6 0-10 3-9 8Zm0 6c8 2 12-3 10-8-6 0-11 3-10 8ZM16 9c-5-5-3-9 0-11 4 4 5 8 0 11Z"/>',
};
async function api(path, body) {
  if (demo) return demo.request(path, body);
  const response = await fetch(path, body === undefined ? {} : {
    method: 'POST', headers: { 'content-type': 'application/json', ...(state.token ? { 'x-live-token': state.token } : {}) }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (response.status === 401) state.token = '';
  if (!response.ok) throw Error(data.error ?? `Request failed (${response.status})`);
  return data;
}
function error(message) { $('#error').textContent = message ?? ''; $('#error').hidden = !message; }
const last = () => state.run?.history.at(-1);
const isDegraded = entry => Boolean(entry?.trace?.bedrock?.error || entry?.trace?.decider?.error || entry?.trace?.degraded || entry?.trace?.route?.degraded);
function setBusy(busy) {
  state.busy = busy;
  strategy.missionBusy(busy);
  document.body.classList.toggle('busy', busy);
  $('#mode').disabled = busy || state.playing;
  for (const button of document.querySelectorAll('.scene-button')) button.disabled = busy || state.playing;
  $('#restart-button').disabled = busy || state.playing;
  $('#next-button').disabled = busy || state.playing || !state.run || state.run.status === 'completed' || Boolean(state.run.lastError);
  $('#play-button').disabled = !state.run || state.run.status === 'completed' || Boolean(state.run.lastError) || (busy && !state.playing);
  $('#play-button').textContent = state.playing ? 'Ⅱ' : '▷';
  $('#play-button').setAttribute('aria-label', state.playing ? 'Pause after the current decision' : 'Play the complete scene');
  $('#next-text').textContent = busy ? (state.mode === 'live' ? 'Pip is choosing…' : 'Replaying the decision…') : state.run?.status === 'completed' ? 'Scene complete' : 'Next decision';
  renderTeam();
}
function renderScenes() {
  $('#scene-picker').innerHTML = state.scenes.map(scene => `<button class="scene-button" data-scene="${esc(scene.id)}" aria-pressed="${state.scene === scene.id}" aria-label="${esc(scene.title)}"><span class="scene-illustration" aria-hidden="true"><svg viewBox="0 0 32 32">${sceneIcons[scene.icon]}</svg></span><span><strong>${esc(scene.title)}</strong><small>${esc(scene.subtitle)}</small></span></button>`).join('');
}
function teamMessages() {
  const entry = last();
  const mira = state.run?.world.agents.find(a => a.id === 'mira');
  const usage = summarizeUsage(state.run?.history);
  const bea = entry?.trace?.bedrock;
  return {
    mira: mira ? `Case wallet: ${mira.inventory.coins} coins · ${mira.inventory.grain} grain` : 'Needs supplies at a fair price',
    pip: state.busy ? (state.mode === 'recorded' ? 'Reading a saved model result' : 'Making a new model decision') : entry?.originalChoice ? toolName(entry.originalChoice) : entry?.provider.decider === 'unavailable' ? 'Decider unavailable' : 'Ready to compare the tools',
    bea: bea?.error ? 'Bedrock failed · fallback used' : bea?.mode === 'live' ? 'Live Bedrock response' : bea?.mode === 'stub' ? 'Offline stand-in used' : state.health.bedrock_mode === 'live' && state.mode === 'live' ? 'Ready if the choice is difficult' : 'Offline stand-in · AWS pending',
    gus: entry ? `${state.run.history.length} actions applied to the world` : 'Keeping world actions valid',
    luna: state.mode === 'recorded' ? '0 new model calls' : usage.attempted ? `${usage.attempted} ${usage.attempted === 1 ? 'attempt' : 'attempts'} · ${usage.validResponses} valid replies` : usage.simulatedResponses ? `${usage.simulatedResponses} simulated replies · 0 Bedrock calls` : '0 Bedrock calls',
    nimbus: state.health.staticReplay ? 'Public replay · no inference' : 'Local computer · AWS pending',
  };
}
function renderTeam() {
  const messages = teamMessages();
  for(const character of CAST){
    const button=$(`#crew-rail [data-crew="${character.id}"]`);
    button.dataset.role=character.id;
    button.classList.toggle('active-working',state.busy&&character.id==='pip');
    let note=button.querySelector('.mission-role');
    if(!note){note=document.createElement('small');note.className='mission-role';button.append(note);}
    note.textContent=messages[character.id];
  }
}
function renderDecision(entry) {
  const result = $('#decision-result');
  result.hidden = !entry;
  if (!entry) {
    $('#decision-flow').innerHTML = '<p class="empty-note">Take a step to see the evidence behind the action.</p>';
    $('#trace-detail').innerHTML = '<p class="empty-note">Waiting for the first decision.</p>';
    return;
  }
  const degraded = isDegraded(entry);
  result.classList.toggle('degraded', degraded);
  result.innerHTML = `<strong>${degraded ? 'The agent used a fallback' : toolName(entry.returnedAction)}</strong><span>${esc(entry.consequence.detail)}</span>${entry.trace?.bedrock?.mode === 'stub' ? '<p class="result-note">Bea used the offline stand-in, not a live Bedrock model.</p>' : ''}`;
  const policy = entry.trace?.route;
  const routeNote = degraded ? 'Provider failure or limit. This is a degraded decision.' : entry.trace?.tier === 3 ? (entry.trace.bedrock?.mode === 'stub' ? 'The difficult choice went to the labeled offline stand-in.' : 'The difficult choice went to Amazon Bedrock.') : policy?.tier === 2 ? 'The application’s uncertainty policy requested investigation.' : 'The application passed through the model’s choice.';
  $('#decision-flow').innerHTML = `<article class="flow-step">${portrait('pip')}<div><p class="flow-label">Pip’s original choice</p><strong>${esc(toolName(entry.originalChoice))}</strong><p>${entry.originalChoice ? `Confidence ${Number(entry.trace.decider?.confidence ?? 0).toFixed(2)}. ` : ''}${entry.provider.decider === 'recorded' ? 'A real saved Decider result.' : entry.provider.decider === 'live' ? 'A new local Decider result.' : 'Decider was unavailable.'}</p></div></article><article class="flow-step ${degraded ? 'degraded' : ''}">${portrait(entry.trace?.tier === 3 ? 'bea' : 'gus')}<div><p class="flow-label">After the routing policy</p><strong>${esc(toolName(entry.returnedAction))}</strong><p>${esc(routeNote)}</p></div></article><article class="flow-step">${portrait('gus')}<div><p class="flow-label">Gus’s world consequence</p><strong>Applied to ${esc(entry.actor.name)}’s world</strong><p>${esc(entry.consequence.detail)}</p></div></article>`;
  const probabilities = entry.trace?.decider?.probabilities ?? {};
  const memories = (entry.observation?.memories ?? []).filter(m => /verif|inspect|source|grain|rule|notice|stock/i.test(m.text)).slice(-4);
  $('#trace-detail').innerHTML = `<div class="trace-columns"><div><h3>The model’s actual probability vector</h3>${Object.keys(probabilities).length ? Object.entries(probabilities).map(([key, probability]) => `<div class="prob-row"><span>${esc(toolName(key))}</span><div class="prob-track"><i data-probability="${Number(probability)}"></i></div><span class="prob-number">${(Number(probability) * 100).toFixed(1)}%</span></div>`).join('') : '<p class="empty-note">No Decider vector for this decision.</p>'}<p class="confidence-note">Confidence is a rescaled top probability, not a guarantee of correctness. The explanation above is interface text, not prose generated by Decider.</p></div><div><h3>What the resident could observe</h3>${memories.map(memory => `<p class="evidence-item">Tick ${esc(memory.tick)}: ${esc(memory.text)}</p>`).join('') || '<p class="evidence-item">The original claim and public village rules were available.</p>'}</div></div><pre>${esc(JSON.stringify({ decisionId: entry.decisionId, inputHash: entry.inputHash, originalChoice: entry.originalChoice, returnedAction: entry.returnedAction, provider: entry.provider, trace: entry.trace, consequence: entry.consequence }, null, 2))}</pre>`;
  for (const bar of document.querySelectorAll('[data-probability]')) bar.style.width = `${Math.max(0, Math.min(1, Number(bar.dataset.probability))) * 100}%`;
}
function render() {
  const run = state.run;
  if (!run) return;
  strategy.mission(run);
  const entry = last();
  const pending = run.pending;
  const resident = pending?.you ?? entry?.actor;
  $('.speaker-heading>.portrait').outerHTML=portrait('mira','portrait-small');
  $('#resident-label').textContent = run.status === 'completed' ? 'Mira’s team finished the case' : 'Mira brings a case to the team';
  $('#resident-goal').textContent = `Case resident: ${resident?.name ?? 'Mira'} · case tick ${run.world.tick} / ${run.maxTicks}`;
  $('#claim').textContent = pending?.claim ?? entry?.claim ?? 'The scene is complete.';
  $('#step-label').textContent = pending?.allowedActions.length === 2 ? 'After inspection' : run.status === 'completed' ? 'The consequence' : 'The claim';
  $('#tools').innerHTML = ['accept_claim', 'reject_claim', 'check_evidence'].map(action => `<span class="tool-chip ${!(pending?.allowedActions ?? entry?.allowedActions ?? []).includes(action) ? 'unavailable' : ''} ${entry?.returnedAction === action ? 'selected' : ''}"><span class="tool-symbol" aria-hidden="true">${toolIcon(action)}</span>${action === 'accept_claim' ? 'Accept' : action === 'reject_claim' ? 'Decline' : 'Check'}</span>`).join('');
  $('#operation-badge').textContent = state.mode === 'recorded' ? 'Recorded' : entry?.provider.decider === 'unavailable' ? 'Degraded decision' : 'Live Decider';
  $('#operation-badge').classList.toggle('live', state.mode === 'live');
  $('#truth-note').textContent = state.mode === 'recorded' ? 'Real saved Decider decisions. Bedrock stand-in. No new model calls.' : state.health.bedrock_mode === 'live' ? 'New Decider calls. Difficult choices can call live Bedrock.' : 'New Decider calls. Bedrock is an offline stand-in; AWS is pending.';
  if (demo) {
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    exportUrl = URL.createObjectURL(new Blob([JSON.stringify(demo.export(run.id), null, 2)], { type: 'application/json' }));
    $('#export-link').href = exportUrl;
    $('#export-link').download = `sentinel-recorded-${state.scene}.json`;
  } else $('#export-link').href = `/api/runs/${run.id}/export`;
  $('#history').innerHTML = run.history.length ? [...run.history].reverse().map(item => `<li data-decision="${esc(item.decisionId)}"><span class="history-tick">Tick ${item.tick}</span><span><strong>${esc(item.actor.name)}: ${esc(toolName(item.returnedAction))}</strong><br>${esc(item.consequence.detail)}</span><span>${item.provider.decider === 'recorded' ? 'Recorded' : 'New call'}${item.trace?.bedrock?.mode === 'stub' ? ' · Bedrock stand-in' : ''}</span></li>`).join('') : '<li class="empty-note">The village is ready for its first choice.</li>';
  renderDecision(entry);
  renderScenes();
  setBusy(state.busy);
  if (run.lastError) error(run.lastError);
}
async function refreshHealth() {
  try { state.health = await api('/api/health'); }
  catch { state.health = { connected: false }; }
  const liveReady = state.health.connected && state.health.liveEnabled && Boolean(state.health.decider);
  $('#mode option[value=live]').disabled = !liveReady;
  $('#mode-note').textContent = state.mode === 'recorded' ? 'Recorded Decider · Bedrock stand-in' : state.health.bedrock_mode === 'live' ? 'New Decider calls · Bedrock enabled' : 'New Decider calls · Bedrock stand-in';
  $('#host-chip').innerHTML = `<span class="status-dot"></span>${state.health.staticReplay ? 'Public replay' : 'Local village'}`;
  if (state.health.staticReplay) $('#mode option[value=live]').textContent = 'Live mode: run the source locally';
  renderTeam();
}
async function startScene() {
  if (state.busy) return;
  error(); setBusy(true);
  try { state.run = await api('/api/runs', { scene: state.scene, mode: state.mode }); render(); }
  catch (problem) {
    if (state.run) { state.mode = state.run.mode; state.scene = state.run.scene; $('#mode').value = state.mode; render(); }
    error(problem.message);
  }
  finally { setBusy(false); }
}
async function nextDecision() {
  if (state.busy || !state.run || state.run.status === 'completed') return false;
  error(); setBusy(true);
  try {
    state.run = await api(`/api/runs/${state.run.id}/step`, { commandId: crypto.randomUUID(), expectedVersion: state.run.version });
    render();
    return true;
  } catch (problem) {
    state.playing = false;
    try { state.run = await api(`/api/runs/${state.run.id}`); render(); } catch { /* retain known last state */ }
    error(problem.message);
    return false;
  } finally { setBusy(false); }
}
async function playScene() {
  if (state.playing) { playEpoch++; state.playing = false; setBusy(state.busy); return; }
  const epoch=++playEpoch;
  state.playing = true; setBusy(false);
  while (epoch===playEpoch && state.playing && state.run?.status !== 'completed') {
    if (!(await nextDecision())) break;
    await new Promise(resolve => setTimeout(resolve, state.mode === 'recorded' ? 850 : 300));
  }
  if(epoch===playEpoch){state.playing = false; setBusy(false);}
}
function showCharacter(id) {
  const character = CAST.find(item => item.id === id);
  if (!character) return;
  const description = id === 'nimbus' && state.health.staticReplay ? 'This public game replays verified, recorded world frames. It calls neither model. Run the source locally for new Decider decisions; the AWS account and live Bedrock setup remain separate.' : character.description;
  const usage = summarizeUsage(state.run?.history);
  const accounting = id === 'luna' && state.mode === 'live' ? `<p>Returned usage estimates $${usage.estimatedCostUSD.toFixed(6)} at the configured token rates. ${usage.uncertainReservations} uncertain reservations retain $${usage.reservedUSD.toFixed(6)}. ${usage.simulatedResponses} stand-in replies have synthetic usage. These are this scene’s records, not an AWS billing total.</p>` : '';
  $('#character-content').innerHTML = `<div class="character-detail">${portrait(id)}<div><h2 id="character-title">${character.name}</h2><p>${esc(character.role)}</p></div></div><p class="character-description">${esc(description)}</p><div class="character-live-note"><strong>In this scene</strong>${esc(teamMessages()[id])}${accounting}</div>`;
  $('#character-dialog').showModal();
}
$('#scene-picker').addEventListener('click', event => {
  const button = event.target.closest('[data-scene]');
  if (!button || state.busy || state.playing) return;
  state.scene = button.dataset.scene; startScene();
});
$('#crew-rail').addEventListener('click', event => { const button = event.target.closest('[data-role]'); if (button && strategy.isMissionOpen()) showCharacter(button.dataset.role); });
function missionFocus(open){
  if(!open){playEpoch++;state.playing=false;setBusy(state.busy);}
  strategy.focusMission(open);renderTeam();
}
for(const link of document.querySelectorAll('a[href="#mission-center"]'))link.addEventListener('click',event=>{event.preventDefault();missionFocus(true);$('#mission-panel').scrollIntoView({block:'nearest'});});
for(const link of document.querySelectorAll('a[href="#village-play"]'))link.addEventListener('click',()=>missionFocus(false));
$('#close-mission').addEventListener('click',()=>{missionFocus(false);document.querySelector('.mission-shortcut').focus();});
$('#guide-button').addEventListener('click', () => $('#guide-dialog').showModal());
$('#tools-help').addEventListener('click', () => showCharacter('pip'));
$('#next-button').addEventListener('click', nextDecision);
$('#play-button').addEventListener('click', playScene);
$('#restart-button').addEventListener('click', startScene);
$('#mode').addEventListener('change', async event => {
  if (event.target.value === 'live' && state.health.liveRequiresToken && !state.token) {
    $('#token-dialog').showModal(); event.target.value = state.mode; return;
  }
  state.mode = event.target.value; await startScene(); await refreshHealth();
});
$('#token-form').addEventListener('submit', async event => {
  event.preventDefault(); state.token = $('#live-token').value; $('#live-token').value = '';
  $('#token-dialog').close(); state.mode = 'live'; $('#mode').value = 'live'; await startScene(); await refreshHealth();
});
for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => button.closest('dialog').close());
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => { if (event.target === dialog && (event.clientX < dialog.getBoundingClientRect().left || event.clientX > dialog.getBoundingClientRect().right || event.clientY < dialog.getBoundingClientRect().top || event.clientY > dialog.getBoundingClientRect().bottom)) dialog.close(); });

try {
  state.scenes = await api('/api/scenes');
  renderScenes(); renderTeam();
  await refreshHealth();
  await startScene();
  if (state.health.liveEnabled && !state.health.connected) {
    let checks = 0;
    const timer = setInterval(async () => {
      await refreshHealth();
      if (state.health.connected || ++checks >= 40) clearInterval(timer);
    }, 3000);
    window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
  }
} catch (problem) { error(`The village could not load. ${problem.message}`); }
