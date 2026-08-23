import { createServer, type Server, type Socket } from "node:net";

export interface TricklingSmtpServer {
  readonly host: "127.0.0.1";
  readonly port: number;
  activeConnectionCount(): number;
  activeTimerCount(): number;
  waitForConnection(): Promise<void>;
  waitForPeerClose(): Promise<void>;
  close(): Promise<void>;
}

export async function startTricklingSmtpServer(): Promise<TricklingSmtpServer> {
  const sockets = new Set<Socket>();
  const timers = new Map<Socket, NodeJS.Timeout>();
  let connectedResolve!: () => void;
  let peerCloseResolve!: () => void;
  const connected = new Promise<void>((resolve) => { connectedResolve = resolve; });
  const peerClosed = new Promise<void>((resolve) => { peerCloseResolve = resolve; });
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    connectedResolve();
    const timer = setInterval(() => {
      if (!socket.destroyed) socket.write("2");
    }, 100);
    timers.set(socket, timer);
    socket.on("error", () => undefined);
    socket.once("close", () => {
      const current = timers.get(socket);
      if (current) clearInterval(current);
      timers.delete(socket);
      sockets.delete(socket);
      peerCloseResolve();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Trickling SMTP server did not bind.");

  return {
    host: "127.0.0.1",
    port: address.port,
    activeConnectionCount: () => sockets.size,
    activeTimerCount: () => timers.size,
    waitForConnection: () => connected,
    waitForPeerClose: () => peerClosed,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      for (const timer of timers.values()) clearInterval(timer);
      timers.clear();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  };
}
