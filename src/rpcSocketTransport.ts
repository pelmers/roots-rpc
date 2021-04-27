import io from "socket.io";
import { AnyJson, RpcTransport } from "./rpcTypes";

export class SocketTransport implements RpcTransport {
  constructor(private socket: io.Socket | SocketIOClient.Socket) {}
  async send(msg: AnyJson) {
    this.socket.send(msg);
  }
  onMessage(cb: (msg: AnyJson) => void) {
    this.socket.on("message", cb);
    return {
      dispose: () => this.socket.off("message", cb),
    };
  }
}
