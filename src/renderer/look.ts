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
  moon: {
    ground: [0x8c8f97, 0x92959d], hill: [0x6f727b, 0x7f828b, 0x8f929b, 0x9fa2ab], rockHill: [0x585b64, 0x6a6d77, 0x7c808a, 0x8e929c], hillLine: 0x5a5d66,
    tree: [0x6d7078, 0x7b7e87, 0x898c95], treeKind: "rock",
    lake: { shore: 0, deep: 0, mid: 0, light: 0, kind: "none" },
    mountain: { dark: 0x4a4d56, light: 0xa9acb6, snowDark: 0xc1c4cc, snowLight: 0xe6e8ee, snow: true },
    asphalt: 0x5e6068, worn: 0x54565d, speck: 0x8d909a, runoff: 0xa5a8b0, runoffDark: 0x7a7d86,
    clouds: 0, cloudTint: 0xb7c3d8, snow: false, birds: false, tramway: true,
  },
};
