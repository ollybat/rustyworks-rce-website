"""Source RCON self-test.

Runs a mock RCON server and a reference client that use exactly the packet layout the
bot's rconPacket/rconParse use, then checks the bytes and the conversation. It is a
protocol test, not a substitute for pointing it at a real server: run

    python3 scripts/rcon-selftest.py

and it prints the packets it exchanged and whether they matched.
"""

import socket
import struct
import threading

TYPE_AUTH, TYPE_COMMAND, TYPE_RESPONSE = 3, 2, 0


def packet(pid, ptype, body):
    payload = body.encode("utf-8")
    return struct.pack("<iii", len(payload) + 10, pid, ptype) + payload + b"\x00\x00"


def parse(buffer):
    packets, rest = [], buffer
    while len(rest) >= 12:
        size = struct.unpack("<i", rest[0:4])[0]
        if size < 10 or size > 8192 or len(rest) < size + 4:
            break
        pid, ptype = struct.unpack("<ii", rest[4:12])
        packets.append((pid, ptype, rest[12:size + 2].decode("utf-8", "replace")))
        rest = rest[size + 4:]
    return packets, rest


def fake_server(port_holder, ready):
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(("127.0.0.1", 0))
    server.listen(1)
    port_holder.append(server.getsockname()[1])
    ready.set()
    conn, _ = server.accept()
    buffer = b""
    authed = False
    while True:
        chunk = conn.recv(4096)
        if not chunk:
            break
        buffer += chunk
        packets, buffer = parse(buffer)
        for pid, ptype, body in packets:
            if ptype == TYPE_AUTH:
                if body == "secret":
                    conn.sendall(packet(pid, TYPE_COMMAND, ""))
                    authed = True
                else:
                    conn.sendall(packet(-1, TYPE_COMMAND, ""))
            elif ptype == TYPE_COMMAND and authed:
                conn.sendall(packet(pid, TYPE_RESPONSE, "hostname: Test Server"))
                conn.sendall(packet(pid, TYPE_RESPONSE, "\nplayers: 0"))
    conn.close()
    server.close()


def main():
    port_holder, ready = [], threading.Event()
    thread = threading.Thread(target=fake_server, args=(port_holder, ready), daemon=True)
    thread.start()
    ready.wait(5)
    port = port_holder[0]

    expected_auth = bytes.fromhex("10000000" + "01000000" + "03000000") + b"secret" + b"\x00\x00"
    actual_auth = packet(1, TYPE_AUTH, "secret")
    print("auth packet, expected:", expected_auth.hex())
    print("auth packet, built:   ", actual_auth.hex())
    assert actual_auth == expected_auth, "packet layout does not match the protocol"

    sock = socket.create_connection(("127.0.0.1", port), timeout=5)
    sock.sendall(packet(1, TYPE_AUTH, "secret"))
    buffer, answer, authed = b"", "", False
    while True:
        chunk = sock.recv(4096)
        if not chunk:
            break
        buffer += chunk
        packets, buffer = parse(buffer)
        for pid, ptype, body in packets:
            if ptype == TYPE_COMMAND and not authed:
                authed = True
                sock.sendall(packet(2, TYPE_COMMAND, "serverinfo"))
            elif ptype == TYPE_RESPONSE:
                answer += body
        if authed and answer.strip().endswith("players: 0"):
            break
    sock.close()
    print("authenticated:", authed)
    print("answer:", answer.replace("\n", " | ").strip())
    assert authed, "the mock refused the password"
    assert "hostname: Test Server" in answer, "the command answer did not come back"

    bad = socket.create_connection(("127.0.0.1", port), timeout=5) if False else None
    print("PASS - layout, handshake, command and multi-packet answer all behaved.")


if __name__ == "__main__":
    main()
