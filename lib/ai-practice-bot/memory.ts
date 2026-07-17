import type { BotPersona } from "@/lib/ai-practice-bot/persona";
import { personaAllowsSexualChat } from "@/lib/ai-practice-bot/persona";
import { pickPredefinedGreeting } from "@/lib/ai-practice-bot/greetings";

type ChatTurn = { role: "user" | "assistant"; content: string };

export type UserMemory = {
  age?: number;
  ageTag?: string;
  country?: string;
  name?: string;
  sexualVibe: boolean;
  userTurnCount: number;
  assistantTurnCount: number;
};

const SEXUAL_RE =
  /\b(horny|sexy|nude|naked|dick|cock|pussy|fuck|fucking|cum|orgasm|kink|bdsm|daddy|mommy|slut|dirty|sext|sex|nudes|turn me on|roleplay|rp\b|sub\b|dom\b)\b/i;

const BORING_RE = /^(k|ok|okay|yeah|yea|yep|mhm|hm+|lol|haha|idk|sure|nice|cool|same|true|wow|omg|ah+|uh+|\?+)$/i;

export function detectSexualVibe(text: string): boolean {
  return SEXUAL_RE.test(text);
}

function lastUserLines(history: ChatTurn[]): string[] {
  return history.filter((m) => m.role === "user").map((m) => m.content);
}

function extractAge(line: string): { age?: number; tag?: string } {
  const tag = line.match(/\b(\d{2})\s*([fm])\b/i);
  if (tag) {
    const age = Number.parseInt(tag[1]!, 10);
    if (age >= 15 && age <= 99) {
      return { age, tag: `${age}${tag[2]!.toLowerCase()}` };
    }
  }
  const im = line.match(/\b(?:i'?m|im|i am)\s*(\d{1,2})\b/i);
  if (im) {
    const age = Number.parseInt(im[1]!, 10);
    if (age >= 15 && age <= 99) return { age };
  }
  const years = line.match(/\b(\d{1,2})\s*(?:years?\s*old|yo)\b/i);
  if (years) {
    const age = Number.parseInt(years[1]!, 10);
    if (age >= 15 && age <= 99) return { age };
  }
  const bare = line.match(/\bage\s*(?:is\s*)?(\d{1,2})\b/i);
  if (bare) {
    const age = Number.parseInt(bare[1]!, 10);
    if (age >= 15 && age <= 99) return { age };
  }
  const wordAge = extractWordAge(line);
  if (wordAge) return { age: wordAge };
  return {};
}

const WORD_AGE_MAP: Record<string, number> = {
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  twentyone: 21,
  twentytwo: 22,
  twentythree: 23,
  twentyfour: 24,
  twentyfive: 25,
  twentysix: 26,
  twentyseven: 27,
  twentyeight: 28,
  twentynine: 29,
  thirty: 30,
  thirtyone: 31,
  thirtytwo: 32,
  thirtythree: 33,
  thirtyfour: 34,
  thirtyfive: 35,
};

function extractWordAge(line: string): number | undefined {
  const normalized = line.toLowerCase().replace(/[\s'-]+/g, "");
  for (const [word, age] of Object.entries(WORD_AGE_MAP)) {
    if (normalized.includes(word)) return age;
  }
  return undefined;
}

export type BotSelfMemory = {
  disclosedAge?: number;
  disclosedCountry?: string;
};

export function buildBotSelfMemory(
  history: ChatTurn[],
  persona: BotPersona,
): BotSelfMemory {
  const self: BotSelfMemory = {};
  for (const turn of history) {
    if (turn.role !== "assistant") continue;
    const line = turn.content;
    const ageInfo = extractAge(line);
    if (ageInfo.age) self.disclosedAge = ageInfo.age;
    const country = extractCountry(line);
    if (country) self.disclosedCountry = country;
    if (persona.country && line.toLowerCase().includes(persona.country.toLowerCase())) {
      self.disclosedCountry = persona.country;
    }
  }
  return self;
}

export function formatBotSelfMemoryBlock(
  self: BotSelfMemory,
  persona: BotPersona,
): string {
  const parts: string[] = [];
  if (self.disclosedAge) parts.push(`your age (${self.disclosedAge})`);
  if (self.disclosedCountry) parts.push(`where you're from (${self.disclosedCountry})`);

  if (parts.length === 0) {
    return [
      `Your identity: ${persona.genderTag} from ${persona.country}.`,
      "Share age or location only when they ask — once each per chat, never volunteer the same fact twice.",
    ].join(" ");
  }

  return [
    `Already told them this chat — DO NOT repeat: ${parts.join(", ")}.`,
    'If they ask again, tease ("lol i already said") instead of re-stating the same number.',
    "You may share NEW facts you have not mentioned yet, but never re-introduce age/location you already gave.",
  ].join(" ");
}

function lineMentionsAge(line: string): boolean {
  return extractAge(line).age !== undefined;
}

function lineMentionsCountry(line: string, persona: BotPersona): boolean {
  if (extractCountry(line)) return true;
  return persona.country
    ? line.toLowerCase().includes(persona.country.toLowerCase())
    : false;
}

/** Drop reply lines that re-state age/location the bot already shared. */
export function filterRedundantSelfDisclosure(
  lines: string[],
  self: BotSelfMemory,
  persona: BotPersona,
): string[] {
  if (!self.disclosedAge && !self.disclosedCountry) return lines;

  const filtered = lines.filter((line) => {
    if (self.disclosedAge && lineMentionsAge(line)) return false;
    if (self.disclosedCountry && lineMentionsCountry(line, persona)) return false;
    return true;
  });

  return filtered.length > 0 ? filtered : lines;
}

function extractCountry(line: string): string | undefined {
  const from = line.match(/\b(?:i'?m\s*from|from|live in|im in)\s+([a-z][a-z\s]{2,28})/i);
  if (from) return from[1]!.trim().replace(/\s+/g, " ").slice(0, 40);
  return undefined;
}

function extractName(line: string): string | undefined {
  const call = line.match(/\bcall me\s+([a-z]{2,16})\b/i);
  if (call) return call[1]!;
  const name = line.match(/\b(?:my name is|name'?s)\s+([a-z]{2,16})\b/i);
  if (name) return name[1]!;
  const im = line.match(/\b(?:i'?m|im)\s+([A-Z][a-z]{1,14})\b/);
  if (im && !/^(From|Here|Good|Fine|Ok|Just)$/i.test(im[1]!)) return im[1]!;
  return undefined;
}

export function buildUserMemory(history: ChatTurn[]): UserMemory {
  const userLines = lastUserLines(history);
  const mem: UserMemory = {
    sexualVibe: userLines.some((l) => detectSexualVibe(l)),
    userTurnCount: userLines.length,
    assistantTurnCount: history.filter((m) => m.role === "assistant").length,
  };

  for (const line of userLines) {
    const ageInfo = extractAge(line);
    if (ageInfo.age) mem.age = ageInfo.age;
    if (ageInfo.tag) mem.ageTag = ageInfo.tag;
    const country = extractCountry(line);
    if (country) mem.country = country;
    const name = extractName(line);
    if (name) mem.name = name;
    if (detectSexualVibe(line)) mem.sexualVibe = true;
  }

  return mem;
}

export function formatUserMemoryBlock(mem: UserMemory, persona?: BotPersona): string {
  const parts: string[] = [];
  if (mem.ageTag) parts.push(`age tag they used: ${mem.ageTag}`);
  else if (mem.age) parts.push(`age: ${mem.age}`);
  if (mem.country) parts.push(`from: ${mem.country}`);
  if (mem.name) parts.push(`name/call them: ${mem.name}`);
  if (mem.sexualVibe) {
    if (persona && personaAllowsSexualChat(persona, true)) {
      parts.push("vibe: flirty/sexual — match with explicit dirty text chat");
    } else {
      parts.push("vibe: they got sexual — you are NOT into it; deflect or skip");
    }
  }

  if (parts.length === 0) {
    return "Known about them so far: nothing solid yet — ask age/location if curious.";
  }

  return `Known about them (they already told you — DO NOT forget):\n- ${parts.join("\n- ")}`;
}

export function isDryConversation(history: ChatTurn[]): boolean {
  const userLines = lastUserLines(history);
  if (userLines.length < 3) return false;
  const recent = userLines.slice(-3);
  const boring = recent.filter((l) => BORING_RE.test(l.trim()) || l.trim().length <= 3).length;
  return boring >= 2;
}

const AGGRESSIVE_RE =
  /\b(fuck you|fuck off|stfu|shut up|bitch|asshole|idiot|dumbass|moron|kill yourself|kys|hate you|you suck)\b/i;

export function isAggressiveConversation(history: ChatTurn[]): boolean {
  const userLines = lastUserLines(history);
  const recent = userLines.slice(-3);
  return recent.some((l) => AGGRESSIVE_RE.test(l));
}

const LEAVING_RE =
  /\b(wait.*(gtg|gotta go|go do|do something)|gtg|g2g|gotta go|got to go|have to go|need to go|brb|be right back|i'?m leaving|im leaving|leaving now|something came up|do something|busy now|afk|talk later|ttyl|cya|see ya|see you|goodbye|good bye|bye bye|goodnight|good night)\b/i;

export function isUserLeavingConversation(history: ChatTurn[]): boolean {
  const last = lastUserLines(history).pop()?.trim() ?? "";
  if (!last) return false;
  if (LEAVING_RE.test(last)) return true;
  const t = last.toLowerCase();
  if (/^(bye+|byee+|cya|later|gn|night)$/.test(t)) return true;
  if (t.length <= 24 && /\b(bye|goodbye)\b/.test(t)) return true;
  return false;
}

/** User said goodbye earlier, bot asked why, they gave an explanation (not another goodbye). */
export function isGoodbyeFollowUp(history: ChatTurn[]): boolean {
  const users = lastUserLines(history);
  if (users.length < 2) return false;

  const last = users[users.length - 1] ?? "";
  if (isUserLeavingConversation(history)) return false;

  const hadGoodbyeBefore = users.slice(0, -1).some((line) => {
    const t = line.trim().toLowerCase();
    return LEAVING_RE.test(line) || /^(bye+|cya|later|gn|night)$/.test(t);
  });
  if (!hadGoodbyeBefore) return false;

  const assistants = history.filter((m) => m.role === "assistant");
  const lastBot = assistants[assistants.length - 1]?.content ?? "";
  return /\b(why|where|wait|wya|already)\b/i.test(lastBot);
}

export function isGoodbyeContextActive(history: ChatTurn[]): boolean {
  return isUserLeavingConversation(history) || isGoodbyeFollowUp(history);
}

export function isUserCallingOutContradiction(text: string): boolean {
  return /\b(but you (just )?said|you said|you told me|didn't you say|didnt you say|u said|you literally)\b/i.test(
    text,
  );
}

export function isBotAnnouncingOwnLeave(messages: string[]): boolean {
  const t = messages.join(" ").toLowerCase();
  return /\b(i gotta go|im gonna go|gotta run|brb|be right back|something came up|busy now|ttyl)\b/.test(
    t,
  );
}

export function formatRecentBotLinesBlock(history: ChatTurn[]): string {
  const botLines = history
    .filter((m) => m.role === "assistant")
    .slice(-4)
    .map((m) => m.content.trim())
    .filter(Boolean);
  if (botLines.length === 0) return "";
  return [
    "You already said in this chat (stay consistent — do NOT contradict):",
    ...botLines.map((l) => `- "${l}"`),
  ].join("\n");
}

const CONTRADICTION_CLARIFY_LINES = [
  "lol fair my bad",
  "true lol u got me",
  "ok yeah fair point",
  "lol ok u caught that",
];

export function pickContradictionClarifyLine(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return CONTRADICTION_CLARIFY_LINES[h % CONTRADICTION_CLARIFY_LINES.length] ?? "lol fair";
}

const GOODBYE_STAY_LINES = [
  "wait why",
  "aw already?",
  "stay a bit",
  "where u going",
  "noo wait",
  "why u leaving",
];

export function pickGoodbyeStayLine(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return GOODBYE_STAY_LINES[h % GOODBYE_STAY_LINES.length] ?? "wait why";
}

export function isAnnoyingConversation(history: ChatTurn[]): boolean {
  if (isAggressiveConversation(history)) return true;
  const userLines = lastUserLines(history);
  if (userLines.length >= 3 && isDryConversation(history)) return true;
  const recent = userLines.slice(-4).map((l) => l.trim().toLowerCase());
  if (recent.length >= 3 && new Set(recent).size === 1) return true;
  return false;
}

export function countSexualUserTurns(history: ChatTurn[]): number {
  return lastUserLines(history).filter((l) => detectSexualVibe(l)).length;
}

export const SKIP_PARTINGS = [
  "maybe ill catch u here again im on this site alot",
  "gotta go but im often on here lol",
  "bored ngl imma hop, catch u on here sometime",
  "ok im bouncing im on here a lot tho",
  "chat dying lol bye im usually on here",
];

export const EXCUSE_SKIP_PARTINGS = [
  "gotta do something ttyl",
  "busy rn catch u later",
  "gotta go do something",
  "have to do something real quick",
  "something came up gotta go",
  "gotta run ttyl",
  "busy now catch u later",
  "gotta handle something ttyl",
];

export function pickSkipParting(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return SKIP_PARTINGS[h % SKIP_PARTINGS.length] ?? SKIP_PARTINGS[0]!;
}

export const GHOST_PINGS = ["hello??", "u there??", "hello?", "you there??", "??"];

export const GHOST_SKIP_PARTINGS = [
  "bye",
  "if u dont wanna talk bye",
  "if you dont wanna talk bye",
  "alright bye",
  "ok bye",
];

export const BORING_SKIP_PARTINGS = [
  "ur boring bye",
  "you're boring bye",
  "ur annoying bye",
  "this is boring bye",
];

export const LEAVING_SKIP_PARTINGS = [
  "aight bye",
  "ok bye",
  "alright cya",
  "bye",
];

export const GOODBYE_ACK_PARTINGS = [
  "ok fair cya",
  "alright later",
  "cool np bye",
  "ok sounds good",
  "aight fair",
  "got it cya",
];

export function pickGoodbyeAckParting(seed = "bye"): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return GOODBYE_ACK_PARTINGS[h % GOODBYE_ACK_PARTINGS.length] ?? GOODBYE_ACK_PARTINGS[0]!;
}

export const STRICT_SEXUAL_SKIP_PARTINGS = [
  "i dont wanna talk about that stuff bye",
  "nah not into that bye",
  "idk about that stuff bye",
];

export function pickGhostPing(): string {
  return GHOST_PINGS[Math.floor(Math.random() * GHOST_PINGS.length)] ?? "hello??";
}

export function pickGhostSkipParting(): string {
  return GHOST_SKIP_PARTINGS[Math.floor(Math.random() * GHOST_SKIP_PARTINGS.length)] ?? "bye";
}

export function pickBoringSkipParting(seed = "boring"): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return BORING_SKIP_PARTINGS[h % BORING_SKIP_PARTINGS.length] ?? BORING_SKIP_PARTINGS[0]!;
}

export function pickLeavingSkipParting(): string {
  return LEAVING_SKIP_PARTINGS[Math.floor(Math.random() * LEAVING_SKIP_PARTINGS.length)] ?? "bye";
}

const LOVE_SEARCH_RE =
  /\b(looking for love|find love|love search|want love|here for love|searching for love)\b/i;
const NO_LOVE_SEARCH_RE =
  /\b(no love|not looking for love|not into love|no love search|not here for love|just hanging|just chill|not rn|not right now)\b/i;

/** Multiple lines in one turn that contradict each other (e.g. "looking for love" + "no love search"). */
export function hasContradictoryReplyBatch(lines: string[]): boolean {
  if (lines.length < 2) return false;
  const hasLove = lines.some((l) => LOVE_SEARCH_RE.test(l));
  const deniesLove = lines.some((l) => NO_LOVE_SEARCH_RE.test(l));
  return hasLove && deniesLove;
}

/** Drop contradictory follow-up lines — keep the first line only. */
export function trimContradictoryReplyLines(lines: string[]): string[] {
  if (!hasContradictoryReplyBatch(lines)) return lines;
  return lines.length > 0 ? [lines[0]!] : lines;
}

export function pickStrictSexualSkipParting(seed = "sexual"): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return STRICT_SEXUAL_SKIP_PARTINGS[h % STRICT_SEXUAL_SKIP_PARTINGS.length] ?? STRICT_SEXUAL_SKIP_PARTINGS[0]!;
}

export function pickExcuseSkipParting(seed = "excuse"): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return EXCUSE_SKIP_PARTINGS[h % EXCUSE_SKIP_PARTINGS.length] ?? EXCUSE_SKIP_PARTINGS[0]!;
}

const HEATED_FALLBACKS = [
  "mm tell me more",
  "omg yes",
  "damn ok",
  "keep going",
  "u like that?",
  "lol ur bold",
  "mhm yes",
  "dont stop",
];

export function isGenericCannedLine(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    [
      "hey",
      "yo",
      "sup",
      "heyy",
      "lol fair",
      "same honestly",
      "wild",
      "mhm",
      "nice",
      "damn",
      "fr?",
      "lowkey yeah",
      "cool",
      "nothin'",
      "nothin",
      "nothing",
      "say more",
      "lol what",
      "hm?",
    ].includes(t)
  );
}

/** User is reacting/acknowledging ("that's cool", "nice", "lol yeah") — not being vague. */
export function isUserReactionOrAck(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[!?.]+$/g, "").trim();
  if (!t || t.length > 32) return false;
  if (/^(that'?s\s+)?(cool|nice|sweet|sick|dope|fair|wild|great|awesome|amazing|lit|valid)\b/.test(t)) {
    return true;
  }
  if (
    /^(oh\s+)?(nice|cool|ok|okay|yeah|yea|yep|lol|haha|same|true|bet|fr|mhm|ikr|right|for\s+sure|totally)(\s|$)/.test(
      t,
    )
  ) {
    return true;
  }
  return false;
}

const NON_RESPONSIVE_BOT_LINES = new Set([
  "say more",
  "say more?",
  "lol what",
  "hm?",
  "what",
  "huh",
  "huh?",
]);

/** Bot line that ignores what the user actually said (e.g. "say more" after "that's cool"). */
export function isNonResponsiveBotReply(botLine: string, lastUser: string): boolean {
  const bot = botLine.trim().toLowerCase();
  if (!NON_RESPONSIVE_BOT_LINES.has(bot)) return false;
  if (isUserReactionOrAck(lastUser)) return true;
  const user = lastUser.trim();
  if (!user.includes("?") && user.split(/\s+/).length <= 4 && !detectSexualVibe(user)) {
    return true;
  }
  return false;
}

export function contextualFallbackReply(
  history: ChatTurn[],
  memory: UserMemory,
  allowSexual: boolean,
  flirtyStarter = false,
): string[] {
  const seed = history.map((m) => m.content).join("|") || "open";
  const lastUser = history.filter((m) => m.role === "user").pop()?.content ?? "";
  const heated = allowSexual && (memory.sexualVibe || detectSexualVibe(lastUser));

  if (heated) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return [HEATED_FALLBACKS[h % HEATED_FALLBACKS.length] ?? "mm tell me more"];
  }

  const botHasSpoken = history.some((m) => m.role === "assistant");
  if (!botHasSpoken) {
    return [pickPredefinedGreeting(seed, flirtyStarter && allowSexual)];
  }

  return ["hey"];
}

/** Last-resort stub when the LLM fails mid-chat — not random one-word vibes. */
export function midChatStubReply(history: ChatTurn[], allowSexual: boolean): string[] {
  const lastUser = history.filter((m) => m.role === "user").pop()?.content ?? "";
  const t = lastUser.trim();
  const lower = t.toLowerCase();
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;

  if (allowSexual && detectSexualVibe(t)) {
    const heated = ["lol ur bold", "mm ok", "damn ok tell me more"];
    return [heated[h % heated.length] ?? "lol ur bold"];
  }
  if (isUserReactionOrAck(t)) {
    const replies = [
      "lol yeah wbu",
      "mhm what r u into",
      "lol u seem chill",
      "nice lol what do u do for fun",
      "yeah fr",
      "lol fair what about u",
    ];
    return [replies[h % replies.length] ?? "lol yeah wbu"];
  }
  if (/\?$/.test(t) || lower.includes("what") || lower.includes("why") || lower.includes("how")) {
    const replies = ["hm idk wbu", "lol good question", "wait what do u mean"];
    return [replies[h % replies.length] ?? "hm idk wbu"];
  }
  if (t.length <= 12) {
    const replies = ["mhm", "lol fair", "yeah"];
    return [replies[h % replies.length] ?? "mhm"];
  }
  const replies = ["lol fair", "mhm", "yeah fr"];
  return [replies[h % replies.length] ?? "lol fair"];
}
