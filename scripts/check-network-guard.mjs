import assert from "node:assert/strict";
import { isPublicAddress, rconHostAllowed } from "../bot/network-guard.mjs";

const addresses = [
  ["8.8.8.8", true],
  ["1.1.1.1", true],
  ["10.0.0.1", false],
  ["100.64.0.1", false],
  ["127.0.0.1", false],
  ["169.254.1.1", false],
  ["172.20.0.1", false],
  ["192.168.1.1", false],
  ["192.0.2.1", false],
  ["198.51.100.1", false],
  ["203.0.113.1", false],
  ["224.0.0.1", false],
  ["255.255.255.255", false],
  ["2606:4700:4700::1111", true],
  ["2001:4860:4860::8888", true],
  ["::1", false],
  ["fc00::1", false],
  ["fe80::1", false],
  ["ff02::1", false],
  ["2001:db8::1", false],
  ["2001:0::1", false],
  ["2002:c000:0204::1", false],
  ["::ffff:127.0.0.1", false],
];

for (const [address, expected] of addresses) {
  assert.equal(isPublicAddress(address), expected, address + " public-address classification");
}

const hosts = [
  ["rust.example.com", true],
  ["play.example.net.", true],
  ["localhost", false],
  ["server.local", false],
  ["service.internal", false],
  ["127.0.0.1", false],
  ["10.0.0.2", false],
  ["192.0.2.5", false],
  ["-bad.example", false],
  ["bad..example", false],
];

for (const [host, expected] of hosts) {
  assert.equal(rconHostAllowed(host), expected, host + " hostname validation");
}

console.log("PASS - " + addresses.length + " address cases and " + hosts.length + " hostname cases.");
