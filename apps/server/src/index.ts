import { RemoteFS, WsTransport } from "@playground/remote-fs";

const transport = new WsTransport("ws://localhost:3000");
const fs = new RemoteFS(transport);

const file = await fs.open("src/main.bal");
console.log(file?.content);

const entries = await fs.readDir("src");
console.log(entries);

await fs.writeFile("src/hello.bal", "Hello, World!");

transport.dispose();
