import { hashString, Rng } from "./rng.ts";

const ADJECTIVES = ["healthy", "sleepy", "brave", "rusty", "golden", "quiet", "wobbly", "shiny", "grumpy", "swift",
  "lucky", "sneaky", "mighty", "dizzy", "frosty", "jolly", "plucky", "stormy", "crafty", "gentle", "bouncy", "fuzzy",
  "tiny", "giant", "loud", "calm", "witty", "cheeky", "spicy", "mellow", "eager", "proud"] as const;
const NOUNS = ["bear", "fox", "otter", "heron", "badger", "walrus", "falcon", "moose", "gecko", "panda", "lynx",
  "toad", "crow", "newt", "hare", "mole", "seal", "wolf", "yak", "owl", "llama", "bison", "ferret", "koala", "puma",
  "stoat", "tapir", "cobra", "dingo", "eagle", "goose", "hippo"] as const;
const VERBS = ["eats", "chases", "finds", "hugs", "dodges", "paints", "juggles", "steals", "carries", "ignores",
  "builds", "races", "follows", "pokes", "tickles", "guards", "borrows", "avoids", "bakes", "drives", "spots",
  "greets", "hides", "lifts", "marks", "needs", "plants", "rides", "sings", "tames", "washes", "wants"] as const;
const OBJECTS = ["tuna", "pizza", "acorns", "kites", "pickles", "waffles", "mangoes", "teapots", "trumpets", "noodles",
  "pebbles", "cheese", "bananas", "scarves", "clocks", "melons", "biscuits", "lanterns", "marbles", "turnips",
  "pancakes", "cookies", "ladders", "buckets", "carrots", "donuts", "eggs", "figs", "grapes", "honey", "jam",
  "mittens"] as const;

/** A memorable, shareable phrase such as "healthy-bear-eats-tuna". */
export function randomPhrase(rng: Rng): string {
  return [rng.pick(ADJECTIVES), rng.pick(NOUNS), rng.pick(VERBS), rng.pick(OBJECTS)].join("-");
}

/** Lower-case, trimmed, words joined with single dashes. Any text is a valid phrase. */
export function normalizePhrase(text: string): string {
  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function phraseToSeed(phrase: string): number {
  return hashString(normalizePhrase(phrase));
}
