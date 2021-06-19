import ws from "isomorphic-ws";
import { Disposable, Message, RpcTransport } from "./rpcTypes";

const PING_INTERVAL = 10000;

/**
 * Implements an RPC transport wrapper for websocket servers and clients
 * Uses isomorphic-ws to provide code that works for both at once
 * @param socket a websocket object that will connect to a corresponding client/server
 * @param key optional, add key if multiplexing connections on one socket
 */
export class WebsocketTransport implements RpcTransport, Disposable {
  queue: Message[] = [];
  pingInterval: NodeJS.Timeout;

  constructor(private socket: ws, private key: string = "") {
    this.socket.addEventListener("open", () => {
      for (const msg of this.queue) {
        this.send(msg);
      }
      this.queue = [];
      this.beginHeartbeat();
    });
    if (this.socket.readyState === ws.OPEN) {
      this.beginHeartbeat();
    }
    this.socket.addEventListener('close', () => this.dispose());
  }

  private beginHeartbeat() {
    if (this.pingInterval == null) {
      this.pingInterval = setInterval(() => {
        this.socket.send(JSON.stringify({ key: this.key, ping: true }));
      }, PING_INTERVAL);
    }
  }

  send(msg: Message) {
    if (this.socket.readyState === ws.OPEN) {
      this.socket.send(JSON.stringify({ msg, key: this.key }));
    } else {
      this.queue.push(msg);
    }
  }

  onMessage(cb: (msg: Message) => void) {
    const listener = (event: any) => {
      const { msg, key, ping } = JSON.parse(event.data);
      if (key === this.key) {
        if (ping) {
          this.socket.send(JSON.stringify({ key: this.key, ping: false }));
        } else if (msg != null) {
          cb(msg);
        }
      }
    };
    this.socket.addEventListener("message", listener);
    return {
      dispose: () => this.socket.removeEventListener("message", listener),
    };
  }

  dispose() {
    clearInterval(this.pingInterval);
  }
}
