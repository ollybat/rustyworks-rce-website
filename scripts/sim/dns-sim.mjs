import { lookup as systemLookup } from "node:dns/promises";

export function lookup(host, options) {
  if (String(host || "").toLowerCase() === "rcon.sim.test") {
    const records = [{ address: "203.0.113.10", family: 4 }];
    return Promise.resolve(options && options.all ? records : records[0]);
  }
  return systemLookup(host, options);
}
