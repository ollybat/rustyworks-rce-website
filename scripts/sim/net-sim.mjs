/* node:net for the bot inside the simulation. The pretend Rust server's address,
   203.0.113.10, is sent to a local server that accepts the connection and never says a word
   (SIM_SILENT_RCON, set by simulate-bot.mjs). That is what a firewalled or rcon.web=1 server
   looks like, and it behaves the same on every machine: some networks refuse 203.0.113.10
   at once, others drop it silently. */
import net from "node:net";

const [silentHost, silentPort] = String(process.env.SIM_SILENT_RCON || "").split(":");
const [webHost, webPort] = String(process.env.SIM_WEB_RCON || "").split(":");
function connect(options, ...rest) {
  /* 203.0.113.20 is a pretend Rust server with rcon.web 1 (WebRCON only) */
  if (webPort && options && typeof options === "object" && String(options.host || "") === "203.0.113.20") {
    return net.connect(Object.assign({}, options, { host: webHost || "127.0.0.1", port: Number(webPort) }), ...rest);
  }
  if (silentPort && options && typeof options === "object" && /^203\.0\.113\.\d+$/.test(String(options.host || ""))) {
    return net.connect(Object.assign({}, options, { host: silentHost || "127.0.0.1", port: Number(silentPort) }), ...rest);
  }
  return net.connect(options, ...rest);
}
export default Object.assign(Object.create(net), { connect, createConnection: connect });
export const { isIP, isIPv4, isIPv6, createServer, Socket } = net;
export { connect };
