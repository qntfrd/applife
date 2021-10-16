# AppLife

♻️ Handle the lifecyle of your application


## Getting started

```ts
import AL from "applife"

const app = new AL({
  // first load your environment
  config: { up: loadenv },

  // when config is done, open rabbit connection
  pg: {
    needs: ["config"], // wait for config to have run
    up: async ({ config }) => { // each steps receive the full context
      const client = new Client();
      await client.connect();
      return client
    },
    down: ({ pg }) => pg.close(), // here pg is what was instanciated in `up`
    after: ["rabbit"] // will wait for rabbit to be down before downing pg
  },

  // when config is done, open rabbit connection
  rabbit: {
    needs: ["config"], // wait for config to have run
    up: ({config}) => rabbitClient.connect(config.rabbit.cs),
    down: ({ rabbit }) => rabbit.close(),
    after: ["http"]
  },

  http: {
    needs: ["config"],
    up: ({ config }) => new Koa().use(/* ... */),
  },

  socket: {
    needs: ["http"],
    up: ({ http, rabbit }) => new Server(require("http").createServer(http.callback()))
  }
})

(async () => {
  const { config, rabbit, pg, http, socket } = await app.start()

  const server = http.listen(config.port) // yes this could have been done in AL

  // interupt is raised when the app receives any event that may cause
  app.on("interupt", () => {
    server.close()
  })
})().then(() => console.log("Server has started"))
```
