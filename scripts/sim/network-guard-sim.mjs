/* The simulation's view of bot/network-guard.mjs: identical, except that 203.0.113.0/24
   (TEST-NET-3, where the pretend Rust server lives) counts as public. See loader.mjs. */
import { isPublicAddress as realIsPublic, rconHostAllowed as realHostAllowed } from "../../bot/network-guard.mjs";

const SIM_NET = /^203\.0\.113\.\d{1,3}$/;
export function isPublicAddress(address) { return SIM_NET.test(String(address || "").trim()) || realIsPublic(address); }
export function rconHostAllowed(host) { return SIM_NET.test(String(host || "").trim()) || realHostAllowed(host); }
