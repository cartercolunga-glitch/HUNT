# HUNT multiplayer prototype

## Run it

1. Install Node.js if it is not already installed.
2. Open a terminal in this folder.
3. Run `node server.js`.
4. Open `http://localhost:8787` on the host computer.

To test with phones on the same Wi-Fi network, replace `localhost` with the host computer's local IPv4 address, for example `http://192.168.1.25:8787`.

## Multiplayer endpoints

- `POST /api/games` creates a lobby.
- `POST /api/games/:code/join` joins a lobby.
- `GET /api/games/:code` reads shared state.
- `POST /api/games/:code/start` starts the game.
- `POST /api/games/:code/ping` sends a ping wave.
- `POST /api/games/:code/tag` records a tag.
- `POST /api/games/:code/stop` ends the game.
- `POST /api/games/:code/chat` sends an in-game message.
- `POST /api/games/:code/location` sends an explicitly shared location update.
- `POST /api/games/:code/zone` updates the host zone model.
- `POST /api/games/:code/config` updates host-only game settings.

## Host-adjustable settings

The lobby host can adjust duration, mode, head start, ping interval, tag range, maximum players, location precision, and automatic ending behavior. The server rejects configuration changes from non-host players.

This first backend keeps rooms in memory and uses polling. For a public release, the next step is deploying it with a database, authentication, HTTPS, and a real-time transport such as WebSockets.

