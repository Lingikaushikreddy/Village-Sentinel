import { castPortrait } from './game-art.mjs';
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const CAST = [
  { id: 'mira', name: 'Mira', role: 'The villager', job: 'Needs supplies', description: 'Mira wants useful supplies at a fair price. Her coins, inventory and location come from the actual village simulation. Other residents can receive claims too.', color: 'lilac' },
  { id: 'pip', name: 'Pip', role: 'Strands Decider 2B', job: 'Chooses a tool', description: 'Pip represents the small decision model. It reads only the resident’s permitted observations, chooses an available tool and returns probabilities. The words on this page explain its result; Pip does not generate prose.', color: 'teal' },
  { id: 'bea', name: 'Bea', role: 'Amazon Bedrock', job: 'Handles hard choices', description: 'After inspection, a difficult decision can go to the generative model through Bedrock. Its structured answer must still name a permitted tool. The current recorded examples use a clearly labeled rule-based stand-in.', color: 'gold' },
  { id: 'gus', name: 'Gus', role: 'The world engine', job: 'Applies the action', description: 'Gus represents deterministic application code. It checks what the resident can do and applies the returned action to the village. A model choosing “accept” does not by itself prove a trade succeeded.', color: 'green' },
  { id: 'luna', name: 'Luna', role: 'The usage ledger', job: 'Counts calls & cost', description: 'Luna represents accounting code. It records provider usage and bounded reservations. Duplicate completed commands replay their existing result. Synthetic stub token counts are separate from actual AWS charges.', color: 'coral' },
  { id: 'nimbus', name: 'Nimbus', role: 'The host', job: 'Keeps the game running', description: 'Nimbus represents the computer serving the app and local Decider. This session runs locally. AWS deployment is a separate step, and the interface does not call it AWS-ready before it has been verified.', color: 'blue' },
];
export const portrait = (id, className = '') => `<span class="portrait cast-portrait ${className}" aria-hidden="true">${castPortrait(id)}</span>`;
export const toolName = action => ({ accept_claim: 'Accept the claim', reject_claim: 'Decline the claim', check_evidence: 'Check the evidence' })[action] ?? 'No action';
export const toolIcon = action => ({ accept_claim: '✓', reject_claim: '×', check_evidence: '⌕' })[action] ?? '·';
