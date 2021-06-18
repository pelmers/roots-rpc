import ws from "isomorphic-ws";
import { Message, RpcTransport } from "./rpcTypes";

/**
 * Implements an RPC transport wrapper for websocket servers and clients
 * Uses isomorphic-ws to provide code that works for both at once
 * @param socket a websocket object that will connect to a corresponding client/server
 * @param key optional, add key if multiplexing connections on one socket
 */
export class WebsocketTransport implements RpcTransport {
  queue: Message[] = [];

  constructor(private socket: ws, private key: string = "") {
    this.socket.addEventListener("open", () => {
      for (const msg of this.queue) {
        this.send(msg);
      }
      this.queue = [];
    });
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
      const { msg, key } = JSON.parse(event.data);
      if (key === this.key) {
        cb(msg);
      }
    };
    this.socket.addEventListener("message", listener);
    return {
      dispose: () => this.socket.removeEventListener("message", listener),
    };
  }
}
