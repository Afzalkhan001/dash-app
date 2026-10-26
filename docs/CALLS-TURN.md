# Calls across networks: the relay (TURN) — owner guide

DASH calls go straight from one phone or browser to the other. Nothing passes through the DASH server
except the short "here is how to reach me" messages at the start.

- **Same office Wi-Fi:** calls connect with no help.
- **Different networks (home Wi-Fi, another office, mobile data):** most calls still connect. Each
  side asks a STUN server "what is my public address?" The website uses Google's public STUN servers
  unless you set your own.
- **Some networks can't be crossed directly.** This happens on many mobile data networks, some office
  firewalls and some home routers. The call then shows a red bar: "No audio or video is flowing" (app)
  or "No audio or video is flowing … run turn.js …" (website). These calls need a **relay**: a TURN
  server that both sides can reach and that passes the call's packets between them.

The relay can't listen in. Calls are encrypted end to end (DTLS-SRTP), and the keys never go
through the relay.

**The app needs no change and no new build for any of this.** The website hands the relay's address to
every phone and browser when they join a call. Turn it on once, on the website host, and every call
uses it from the next join.

---

## 1. The two website settings

Set these on the host that runs the DASH website (Railway → the DASH service → Variables). Calls only
use the relay when **both** are set.

| Setting | What it is | Example |
|---|---|---|
| `MEETS_TURN_URLS` | The relay's address(es), separated by commas. Put a plain `turn:` address first: the website only reports the relay as on (`hasTurn`) when at least one address starts with `turn:`. Add the TCP and TLS forms too, because they get through firewalls that block UDP. | `turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:5349?transport=tcp` |
| `MEETS_TURN_SECRET` | A long random password that the website and the relay share. It never leaves the website server, and phones never see it. | 48+ random characters, for example the output of `openssl rand -hex 32` |

Optional: `MEETS_STUN_URLS` sets your own STUN address instead of Google's public one, for example
`stun:turn.example.com:3478`. Most relays answer STUN too.

### How the website uses the secret (meets.js `iceServersFor`, lines 1797–1811)

For each person joining a call, the website makes a one-hour login for the relay:

- **username** = `<unix time now + 3600>:<DASH user id>`. The number is the moment it **expires**, in
  seconds.
- **password** = base64( HMAC-SHA1( key = `MEETS_TURN_SECRET`, message = username ) )

This is the standard "TURN REST API" shared-secret scheme. Any relay you choose has to check logins
this exact way: an expiry-first username, HMAC-SHA1, base64, and the same secret. A login that leaks
stops working within the hour and names the person it was issued to.

Static usernames and passwords from a provider's dashboard **don't work** with DASH. The website only
sends logins made from the secret.

---

## 2. Option A — a managed relay (no server to run)

**ExpressTURN Premium.** We checked it against the scheme above:

- ExpressTURN's own example code builds the username as `timestamp:user`, where the timestamp is
  now + TTL, and the password as `crypto.createHmac('sha1', secret).update(username).digest('base64')`.
  That is byte-for-byte what DASH sends. (Source: expressturn.com/webrtc-secret-key-examples.)
- Its site lists **"Supports Shared Secret Authentication"** on the Premium plan only (USD 9 a month
  when we checked, 5,000 GB). The free plan shows "Purchase Premium to unlock … Secret Key
  authentication", so the free plan **won't work** with DASH.
- Premium also lists TCP, UDP, TLS ("TURNS with SSL") and ports 80 and 443.

Steps:

1. Buy Premium. Open Dashboard → **TURN Servers**.
2. Copy the **Secret Key**. The dashboard says to use port 3478 or 3480 with it. Copy the server
   hostname that the dashboard shows for your region as well.
3. On the website host, set:
   ```
   MEETS_TURN_SECRET=<the Secret Key from the dashboard>
   MEETS_TURN_URLS=turn:<their hostname>:3478?transport=udp,turn:<their hostname>:3478?transport=tcp
   ```
   If the dashboard lists a TLS port for secret-key logins, add `turns:<their hostname>:<that port>?transport=tcp`
   at the end. Don't add ports that the dashboard doesn't list for the Secret Key.
4. Redeploy or restart the website service, then check it (section 4).

"Refresh Credentials" in their dashboard changes the Secret Key. If you press it, set the new value in
`MEETS_TURN_SECRET` straight away, or calls lose the relay.

We did **not** check other providers. Twilio, Cloudflare, Xirsys and Metered issue logins through
their own APIs. The DASH website doesn't call those APIs, so don't use them unless the website is
changed first.

---

## 3. Option B — your own relay with coturn (free software, any small VPS)

You need a small Linux VPS with a **public IPv4 address**. It can't run on Railway: Railway doesn't
accept incoming UDP. One vCPU and 1 GB of memory is plenty for an office.

The repository's own `turn.js` also works with the same secret, but it is **UDP only**. coturn adds
TCP and TLS, which is what gets calls through strict firewalls and mobile data. That makes coturn the
better choice.

1. **Install:** `sudo apt install coturn`, then set `TURNSERVER_ENABLED=1` in `/etc/default/coturn`.
2. **A DNS name:** point `turn.yourdomain.com` (A record) at the VPS. Get a TLS certificate for it,
   for example `sudo certbot certonly --standalone -d turn.yourdomain.com`.
3. **`/etc/turnserver.conf`:**
   ```
   listening-port=3478
   tls-listening-port=5349
   # The VPS's public address (and its private one, on clouds that use NAT: external-ip=PUBLIC/PRIVATE)
   external-ip=<public IPv4>
   realm=turn.yourdomain.com
   # DASH's login scheme: expiry:userid + HMAC-SHA1 of it under the shared secret
   use-auth-secret
   static-auth-secret=<the same long random value as MEETS_TURN_SECRET>
   # The ports the relay hands out for the call's packets
   min-port=49152
   max-port=65535
   cert=/etc/letsencrypt/live/turn.yourdomain.com/fullchain.pem
   pkey=/etc/letsencrypt/live/turn.yourdomain.com/privkey.pem
   fingerprint
   no-cli
   # Never relay into private networks (stops the relay being used to reach your own LAN)
   no-multicast-peers
   denied-peer-ip=10.0.0.0-10.255.255.255
   denied-peer-ip=172.16.0.0-172.31.255.255
   denied-peer-ip=192.168.0.0-192.168.255.255
   ```
4. **Firewall:** open these on the VPS and in the provider's security group:
   - 3478 UDP and TCP (TURN and STUN);
   - 5349 TCP (TURN over TLS; add UDP too if you like);
   - 49152–65535 UDP (the relay range).
5. **Start it:** `sudo systemctl enable --now coturn`.
6. **On the website host, set:**
   ```
   MEETS_TURN_SECRET=<the same value as static-auth-secret>
   MEETS_TURN_URLS=turn:turn.yourdomain.com:3478?transport=udp,turn:turn.yourdomain.com:3478?transport=tcp,turns:turn.yourdomain.com:5349?transport=tcp
   MEETS_STUN_URLS=stun:turn.yourdomain.com:3478
   ```
   Redeploy or restart the website service.

When the certificate renews, restart coturn, or point certbot's deploy hook at
`systemctl restart coturn`.

---

## 4. Check that it works

1. **The website's own answer.** Signed in on the website, open in the same browser:
   `https://<your DASH address>/api/meets/calls/config`
   - `"hasTurn": true` and `"turnState": "on"` mean the relay is on.
   - `"turnState": "missing-secret"` or `"missing-urls"` names the setting that is still empty.
   - `"hasTurn": false` with `"turnState": "on"` means no address in `MEETS_TURN_URLS` starts with
     `turn:`. Add one.

   Every call's join answer carries the same relay entry (`iceServers` with a `turn:` address,
   `username` and `credential`).

   **In the app:** open More › Calls. Under "How calls work", **Other networks** says "Relay on: calls
   connect on any network" once the relay is on. Until then, IT admins and super admins see a yellow
   banner, "Calls on some networks can't connect yet", that names the missing setting. Pull down to
   refresh after changing the settings.
2. **The relay itself.** Open the Trickle ICE test page (webrtc.github.io/samples/src/content/peerconnection/trickle-ice/).
   Paste one `turn:` address, plus the `username` and `credential` from step 1's `iceServers` (valid
   for an hour), and press "Gather candidates". A line of type **relay** means the relay accepts DASH's
   logins. If no relay line appears, the secret, the realm or the firewall is wrong.
3. **A real call.** Call between a phone **on mobile data, with Wi-Fi off** and a laptop on the office
   Wi-Fi. In the app, each person's tile shows how the call travels: "via relay · 90ms" means the
   relay carried it, "direct · …" or "same network · …" means it wasn't needed. The red "No audio or
   video is flowing" bar should no longer appear.

If calls still fail only on one network, that network probably blocks UDP. Make sure the TCP and
`turns:` addresses are in `MEETS_TURN_URLS`, and that port 5349 (or 443) is open on the relay.
