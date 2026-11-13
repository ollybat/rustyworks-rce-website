/* The second run of scripts/simulate-bot.mjs: the bot restarts with no BOT_SETTINGS_TOKEN and
   a volume (SETTINGS_FILE). It must come back with what run 1 saved, say where settings live,
   keep saving to the file, and hold the traffic guards. The runner sends SIGTERM after
   SIM_RESULT, while one slow press is still running, to check a clean shutdown. */
import { readFileSync } from "node:fs";
import { createChecker } from "../lib/discord-limits.mjs";

const ADMIN = { id: "100000000000000201", perms: 8n };
const OWNER_ROLE = { id: "100000000000000202", roles: ["100000000000000301"] };
const PLAYER = { id: "100000000000000204" };
const SPAMMER = { id: "100000000000000220" };

const results = [];
const limits = createChecker();
const all = [];
function expect(name, ok, detail) { results.push({ name, ok: !!ok, detail: ok ? "" : String(detail || "").slice(0, 600) }); }
function last(it) {
  const answers = it.calls.filter((c) => c.body !== undefined && ["reply", "editReply", "update", "showModal", "respond"].includes(c.method));
  return answers.length ? answers[answers.length - 1].body : null;
}
function text(value) { return JSON.stringify(value || null); }
const fileNow = () => { try { return JSON.parse(readFileSync(process.env.SETTINGS_FILE, "utf8")); } catch (e) { return null; } };

export async function run({ make, interact }) {
  const go = async (it, label) => {
    await interact(it);
    all.push({ it, label });
    const body = last(it);
    if (body && !Array.isArray(body)) limits.checkPayload(label, body);
    return it;
  };

  /* settings came back from the file: the Owner role is staff, the links are there */
  let it = await go(make.command(OWNER_ROLE, "setup", "status"), "/setup status after a restart");
  expect("a staff role saved before the restart still works", text(last(it)).includes("Setup status"), text(last(it)).slice(0, 300));
  it = await go(make.command(ADMIN, "user", "roster", { search: "PlayerOne" }), "/user roster after a restart");
  expect("player links came back from the file", text(last(it)).includes("PlayerOne"), text(last(it)).slice(0, 300));
  it = await go(make.command(ADMIN, "setup", "run"), "/setup run with volume storage");
  expect("no red 'not being saved' warning when a volume keeps the settings", !text(last(it)).includes("Settings are not being saved"), text(last(it)).slice(0, 300));

  /* /ping says where settings live */
  it = await go(make.command(PLAYER, "ping"), "/ping with volume storage");
  expect("/ping says settings are kept in a file on the volume", text(last(it)).includes("kept in a file on the attached volume"), text(last(it)).slice(0, 900));

  /* a save with no website token goes to the file and is reported as saved */
  const before = fileNow();
  it = await go(make.select(ADMIN, "channel", "setup:channel:admin", ["100000000000000405"]), "change a log channel (file storage)");
  await new Promise((r) => setTimeout(r, 800));
  const after = fileNow();
  expect("a change is written to the file", after && (after.logChannels || {}).admin === "100000000000000405" && after.savedAt !== (before || {}).savedAt, text(after && after.logChannels));
  expect("the reply does not claim it is memory-only", !text(last(it)).includes("memory only"), text(last(it)).slice(0, 300));

  /* a double press of the same button runs once; the second press is told so */
  const firstPress = interact(make.button(PLAYER, "ping:again"));
  await new Promise((r) => setTimeout(r, 50));
  const secondPress = make.button(PLAYER, "ping:again");
  await go(secondPress, "the same button pressed twice");
  await firstPress;
  expect("a double press is answered 'still working', not run twice", text(last(secondPress)).includes("Still working"), text(last(secondPress)));

  /* someone hammering the bot is asked to slow down, and only them */
  let spam = null;
  for (let i = 0; i < 14; i++) spam = await go(make.command(SPAMMER, "help"), "/help spam " + i);
  expect("a flood of presses is asked to slow down", text(last(spam)).includes("Slow down"), text(last(spam)).slice(0, 200));
  it = await go(make.command(PLAYER, "help"), "/help from someone else during the flood");
  expect("other people are not slowed down", !text(last(it)).includes("Slow down"), text(last(it)).slice(0, 200));
  let staffBurst = null;
  for (let i = 0; i < 16; i++) staffBurst = await go(make.command(ADMIN, "help"), "/help by staff " + i);
  expect("staff clicking quickly are never slowed down", !text(last(staffBurst)).includes("Slow down"), text(last(staffBurst)).slice(0, 200));

  /* reset: a wrong word changes nothing; RESET clears the settings and keeps player links */
  it = await go(make.modal(ADMIN, "modal:reset", { reset_word: "nope" }), "reset with the wrong word");
  expect("a wrong confirmation word resets nothing", text(last(it)).includes("Not reset"), text(last(it)).slice(0, 200));
  it = await go(make.modal(ADMIN, "modal:reset", { reset_word: "reset" }), "reset");
  await new Promise((r) => setTimeout(r, 800));
  const wiped = fileNow();
  expect("reset clears roles, channels and servers in the file", wiped && !(wiped.servers || []).length && !Object.values(wiped.staffRoles || {}).some(Boolean), text(wiped && { roles: wiped.staffRoles, servers: wiped.servers }));
  expect("reset keeps player links", wiped && (wiped.links || []).length > 10, text(wiped && (wiped.links || []).length));

  for (const { it: one, label } of all) {
    expect("answered in time: " + label, one.firstAckAt !== null && one.firstAckAt < 3000, "first answer at " + one.firstAckAt + " ms");
    expect("no protocol error: " + label, one.errors.length === 0, one.errors.join("; "));
  }
  for (const p of limits.problems) expect("within Discord's limits", false, p);

  /* one slow press is left running on purpose: the shutdown must wait for it */
  interact(make.button(ADMIN, "ping:again"));
  await new Promise((r) => setTimeout(r, 100));
  const failed = results.filter((r) => !r.ok);
  console.log("SIM_RESULT " + JSON.stringify({ total: results.length, failed: failed.length, interactions: all.length, failures: failed, commands: [] }));
}
