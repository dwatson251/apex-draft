import { installKartPack } from "../packages/sim/src/kartpack.ts";

// The kart fan pack is not part of the game (see kartpack.ts), but the tests cover it: install it before any test builds a track.
installKartPack();
