import io from "socket.io";
import { Message, RpcTransport } from "./rpcTypes";

export class SocketIOTransport implements RpcTransport {
  /**
   * Implements an RPC transport wrapper for socket.io library.
   * @param socket socket to send/receive data over
   * @param key optional, add key if multiplexing connections on one socket
   */
  constructor(
    private socket: io.Socket | SocketIOClient.Socket,
    private key: string = ""
  ) {}

  send(msg: Message) {
    this.socket.emit(`roots-rpc-${this.key}`, msg);
  }
  onMessage(cb: (msg: Message) => void) {
    this.socket.on(`roots-rpc-${this.key}`, cb);
    return {
      dispose: () => this.socket.off(`roots-rpc-${this.key}`, cb),
    };
  }
}
