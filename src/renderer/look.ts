import type { BiomeId } from "@apex/sim";

/** How a place looks. The surface behaviour lives in the sim; this is only paint. */
export interface Look {
  ground: [number, number];
  hill: number[];
  rockHill: number[];
  hillLine: number;
  tree: number[];
  treeKind: "round" | "cactus" | "pine" | "rock";
  lake: { shore: number; deep: number; mid: number; light: number; kind: "water" | "ice" | "oasis" | "pond" | "none" };
  mountain: { dark: number; light: number; snowDark: number; snowLight: number; snow: boolean };
  asphalt: number;
  worn: number;
  speck: number;
  /** gravel traps / sand / snow banks outside the corners */
  runoff: number;
  runoffDark: number;
  /** sky: how cloudy, falling snow, birds */
  clouds: number;
  cloudTint: number;
  snow: boolean;
  birds: boolean;
  /** shadows are black on earth and a little blue elsewhere */
  tramway: boolean;
  /** the two colours of the sausage kerbs (red and white when left out) */
  kerbs?: [number, number];
}

export const LOOKS: Record<BiomeId, Look> = {
  grass: {
    ground: [0x2f6b3a, 0x34763f], hill: [0x2a5e35, 0x32703f, 0x3c844b, 0x4a9a5b], rockHill: [0x6c6f78, 0x80838d, 0x9a9da7, 0xb4b7c0], hillLine: 0x1f4a2a,
    tree: [0x1f5a2b, 0x2a6e35, 0x2f7a3a], treeKind: "round",
    lake: { shore: 0xd8c690, deep: 0x2a6fb8, mid: 0x3987d2, light: 0x5aa6ea, kind: "water" },
    mountain: { dark: 0x3e414b, light: 0x9a9ea9, snowDark: 0xaab8d0, snowLight: 0xffffff, snow: true },
    asphalt: 0x3b3e47, worn: 0x34373f, speck: 0x6d7280, runoff: 0xcdb682, runoffDark: 0xa58f5c,
    clouds: 0.5, cloudTint: 0xb7c3d8, snow: false, birds: true, tramway: false,
  },
  desert: {
    ground: [0xd6b576, 0xdbbb7d], hill: [0xc29a58, 0xcfa968, 0xdcb97c, 0xe9cc97], rockHill: [0x9a5b3c, 0xb06b45, 0xc77e53, 0xdb9467], hillLine: 0x8f6e3a,
    tree: [0x4f7a38, 0x5b8a40, 0x6a9a48], treeKind: "cactus",
    lake: { shore: 0xe6d3a0, deep: 0x1f7a8c, mid: 0x2f98a8, light: 0x62bcc4, kind: "oasis" },
    mountain: { dark: 0x7a3f2a, light: 0xd08a5c, snowDark: 0xd9a56f, snowLight: 0xf0c88f, snow: false },
    asphalt: 0x45423f, worn: 0x3d3a37, speck: 0x8a8070, runoff: 0xe6cf98, runoffDark: 0xb99a5e,
    clouds: 0.18, cloudTint: 0xe0d6c0, snow: false, birds: true, tramway: false,
  },
  snow: {
    ground: [0xe3edf7, 0xdbe7f3], hill: [0xb9cde3, 0xcbdcee, 0xdde9f6, 0xf0f7fd], rockHill: [0x7d8aa0, 0x95a3ba, 0xafbdd2, 0xcbd6e6], hillLine: 0x9db3cc,
    tree: [0x1f5d3c, 0x286b47, 0x2f7a52], treeKind: "pine",
    lake: { shore: 0xf4f9fd, deep: 0x7fb4d6, mid: 0x9fcbe6, light: 0xc9e6f5, kind: "ice" },
    mountain: { dark: 0x5a6b86, light: 0xb4c4dc, snowDark: 0xc9d8ec, snowLight: 0xffffff, snow: true },
    asphalt: 0x3d444f, worn: 0x363c46, speck: 0x8995a8, runoff: 0xf7fbff, runoffDark: 0xbfd0e4,
    clouds: 0.7, cloudTint: 0xc3ccda, snow: true, birds: true, tramway: false,
  },
  city: {
    ground: [0x2d3039, 0x30333d], hill: [0x2a5e35, 0x32703f, 0x3c844b, 0x4a9a5b], rockHill: [0x6c6f78, 0x80838d, 0x9a9da7, 0xb4b7c0], hillLine: 0x1f4a2a,
    tree: [0x2a6e35, 0x32803d, 0x3a9146], treeKind: "round",
    lake: { shore: 0x8b909c, deep: 0x2a6fb8, mid: 0x3987d2, light: 0x5aa6ea, kind: "pond" },
    mountain: { dark: 0x3a3f4c, light: 0x8b93a6, snowDark: 0x6b7388, snowLight: 0xa7b0c4, snow: false },
    asphalt: 0x2e3038, worn: 0x282a31, speck: 0x5b6070, runoff: 0x8a8f9b, runoffDark: 0x666b77,
    clouds: 0.4, cloudTint: 0xa9b2c2, snow: false, birds: true, tramway: false,
  },
  // open water: the sea is the ground, the course is a lighter channel marked with buoys, and the hills are islands
  water: {
    ground: [0x1d5a96, 0x215f9e], hill: [0xd9c58a, 0x6aa05a, 0x4f8c4a, 0x3d7a3f], rockHill: [0x6c6f78, 0x80838d, 0x9a9da7, 0xb4b7c0], hillLine: 0xa89a68,
    tree: [0x2f7a3a, 0x3d8c3f, 0x4f9c46], treeKind: "round",
    lake: { shore: 0x1d5a96, deep: 0x174a80, mid: 0x1d5a96, light: 0x2c74b4, kind: "none" },
    mountain: { dark: 0x3e414b, light: 0x9a9ea9, snowDark: 0xaab8d0, snowLight: 0xffffff, snow: false },
    asphalt: 0x3a90cf, worn: 0x4aa3e0, speck: 0xd6efff, runoff: 0xff7a2f, runoffDark: 0xffffff,
    clouds: 0.45, cloudTint: 0xc3d2e6, snow: false, birds: true, tramway: false,
  },
  moon: {
    ground: [0x8c8f97, 0x92959d], hill: [0x6f727b, 0x7f828b, 0x8f929b, 0x9fa2ab], rockHill: [0x585b64, 0x6a6d77, 0x7c808a, 0x8e929c], hillLine: 0x5a5d66,
    tree: [0x6d7078, 0x7b7e87, 0x898c95], treeKind: "rock",
    lake: { shore: 0, deep: 0, mid: 0, light: 0, kind: "none" },
    mountain: { dark: 0x4a4d56, light: 0xa9acb6, snowDark: 0xc1c4cc, snowLight: 0xe6e8ee, snow: true },
    asphalt: 0x5e6068, worn: 0x54565d, speck: 0x8d909a, runoff: 0xa5a8b0, runoffDark: 0x7a7d86,
    clouds: 0, cloudTint: 0xb7c3d8, snow: false, birds: false, tramway: true,
  },
};

/**
 * The Mario Kart courses have a theme of their own on top of the ground they race on: its colours, kerbs and (for some) whether it is night. Original paint, in
 * this game's own style; nothing here is from the games.
 */
interface Theme { over: Partial<Look>; night?: boolean }
const THEMES: Record<string, Theme> = {
  meadow: { over: { ground: [0x3f9a48, 0x45a34f], asphalt: 0x474b57, worn: 0x3f434e, kerbs: [0xe0403f, 0xf6f4ee], clouds: 0.55 } },
  retro: { over: { ground: [0x78b858, 0x80c060], hill: [0x6fae52, 0x7cbb5e, 0x8ac86a, 0x98d576], asphalt: 0x7a7f90, worn: 0x70758a, speck: 0x9aa0b4, kerbs: [0xe04040, 0xf2f2f2], clouds: 0.3, birds: false } },
  beach: { over: { ground: [0xefd9a0, 0xf3dfaa], hill: [0xe2c98a, 0xe9d198, 0xf0d9a6, 0xf6e2b4], tree: [0x2f9a5a, 0x3aa866, 0x47b873], lake: { shore: 0xf6e8b8, deep: 0x1f8fc8, mid: 0x38aee0, light: 0x7cd2f2, kind: "water" }, asphalt: 0x4a4a52, runoff: 0xf6e8b8, runoffDark: 0xd8c690, kerbs: [0x1fb0d0, 0xfaf8f0], clouds: 0.3 } },
  desert: { over: { asphalt: 0x4a4540, kerbs: [0xd9622b, 0xf3e6c4] } },
  snow: { over: { asphalt: 0x3d4452, kerbs: [0x3a78d8, 0xf4f8ff] } },
  jungle: { over: { ground: [0x22592e, 0x276434], hill: [0x1d4d27, 0x245c30, 0x2c6c39, 0x358046], tree: [0x14522a, 0x1c6a36, 0x24803f], asphalt: 0x4a4038, worn: 0x41382f, runoff: 0xb08a58, runoffDark: 0x80633a, kerbs: [0xe0a020, 0x3a2a14], clouds: 0.35 } },
  mine: { over: { ground: [0x7a6a55, 0x806f5a], hill: [0x6a5a48, 0x76654f, 0x827058, 0x8e7b62], tree: [0x6a5f55, 0x786c60, 0x86796b], treeKind: "rock", asphalt: 0x4a443e, runoff: 0xa08a68, runoffDark: 0x7a6648, kerbs: [0xe0a020, 0x333030], clouds: 0.15 } },
  city: { over: { kerbs: [0xf0c030, 0x24262c] } },
  castle: { night: true, over: { ground: [0x3a3340, 0x403846], hill: [0x2e2832, 0x372f3c, 0x413747, 0x4b4052], tree: [0x3a3340, 0x463d4c, 0x524859], treeKind: "rock", asphalt: 0x2c2a33, worn: 0x26242c, runoff: 0x6a4a55, runoffDark: 0x4a3038, kerbs: [0xb02020, 0x2a2a2e], clouds: 0.5, cloudTint: 0x6a5a68, birds: false } },
  ghost: { night: true, over: { ground: [0x2a2f45, 0x2e344c], hill: [0x252a3e, 0x2c3248, 0x343a52, 0x3d445c], tree: [0x232a3e, 0x2b3350, 0x343d5e], treeKind: "pine", asphalt: 0x353a50, worn: 0x2e3347, runoff: 0x4a4f6a, runoffDark: 0x363a52, kerbs: [0x6a3fa0, 0xcfc3e8], clouds: 0.6, cloudTint: 0x6a6f9a, birds: false } },
  rainbow: { night: true, over: { ground: [0x0a0e2a, 0x0c1133], hill: [0x101640, 0x151c4c, 0x1b2358, 0x222b66], tree: [0x101640, 0x1b2358, 0x2a3470], treeKind: "rock", asphalt: 0x3a2f6a, worn: 0x32285c, speck: 0xc8b4ff, runoff: 0x2a2a6a, runoffDark: 0x1a1a4a, kerbs: [0xff4fa0, 0x4fe0ff], clouds: 0, birds: false } },
  volcano: { over: { ground: [0x4a3a38, 0x504040], hill: [0x3e302e, 0x4a3a38, 0x564442, 0x62504e], tree: [0x5a4a46, 0x66544e, 0x725f58], treeKind: "rock", asphalt: 0x3a3436, runoff: 0xff6a1f, runoffDark: 0xc04010, kerbs: [0xff5a1f, 0x222022], clouds: 0.5, cloudTint: 0x7a6a68, birds: false } },
  tech: { night: true, over: { ground: [0x10131d, 0x131724], hill: [0x151a28, 0x1a2032, 0x20283c, 0x283148], tree: [0x1a2032, 0x20283c, 0x283148], treeKind: "rock", asphalt: 0x2a2e3c, worn: 0x232734, speck: 0x6a7090, runoff: 0x20283c, runoffDark: 0x161c2a, kerbs: [0x25f0ff, 0xff30c0], clouds: 0, birds: false } },
  sweets: { over: { ground: [0xf3b6d0, 0xf6bfd8], hill: [0xeaa0c0, 0xf0acc8, 0xf6b8d0, 0xfcc4d8], tree: [0xff9ec2, 0xffb4d0, 0xffc8dc], asphalt: 0x8a5a45, worn: 0x7c4f3c, speck: 0xb88268, runoff: 0xfff0f5, runoffDark: 0xe8c8d4, kerbs: [0xff6fa0, 0xfff0f5], clouds: 0.5, cloudTint: 0xfff0f6, birds: false } },
  sky: { over: { ground: [0x9ed0f5, 0xa6d6f8], hill: [0x92c4ec, 0x9fcdf2, 0xaed6f6, 0xbde0fa], tree: [0xe8f4ff, 0xf2f9ff, 0xffffff], treeKind: "rock", asphalt: 0x9a9fb8, worn: 0x8e93ac, speck: 0xc8cce0, runoff: 0xffffff, runoffDark: 0xc8dcf0, kerbs: [0xffffff, 0x6aa8e8], clouds: 1, cloudTint: 0xffffff } },
  factory: { over: { ground: [0x50555f, 0x565b66], hill: [0x474c56, 0x4f545e, 0x5a5f6a, 0x656a76], tree: [0x5a5f6a, 0x686d78, 0x767b86], treeKind: "rock", asphalt: 0x3a3d45, worn: 0x32353c, runoff: 0x6a6f7a, runoffDark: 0x4a4f5a, kerbs: [0xf0c020, 0x222222], clouds: 0.2, birds: false } },
  water: { over: { ground: [0x1d5a96, 0x215f9e], asphalt: 0x3a6a9a, kerbs: [0xf0f0f0, 0x2a7fd0] } },
};

/** The look of a place, with a Mario Kart course's theme laid over it if it has one. */
export function lookOf(biome: BiomeId, theme?: string): Look {
  const t = theme ? THEMES[theme] : undefined;
  return t ? { ...LOOKS[biome], ...t.over } : LOOKS[biome];
}

/** Whether it is night on a course with a theme: some themes are always dark and the rest always day. Undefined for a track with no theme (its seed decides). */
export function themeNight(theme?: string): boolean | undefined {
  const t = theme ? THEMES[theme] : undefined;
  return t ? !!t.night : undefined;
}

export const THEME_IDS = Object.keys(THEMES);
