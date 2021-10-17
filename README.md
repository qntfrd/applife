# AppLife

♻️ Handle the lifecyle of your application


## Getting started

```ts
import AL from "applife"

const app = new AL({
  // first load your environment
  config: { up: loadenv },

  // when config is done, open pg connection
  pg: {
    needs: ["config"], // wait for config to have run
    up: async ({ config }) => { // each steps receive the full context
      const client = new Client();
      await client.connect();
      return client
    },
    down: ({ pg }) => pg.close(), // here pg is what was instanciated in `up`
    after: "start" // will only close pg AFTER the up stage has been downed
  },

  http: {
    needs: ["config"],
    up: ({ config }) => new Koa().use(/* ... */),
  },

  socket: {
    needs: ["http"],
    up: ({ http, pg }) => new Server(require("http").createServer(http.callback()))
  },

  start: {
    needs: ["pg", "http", "socket"],
    up: ({ http, config }) => http.listen(port),
    down: ({ start }) => up.close()
  }
})

app.on("stopped", signal => console.log(`App stopped because ${signal} was received`))
app.start()
  .then(({ config }) => console.log(`App started on port ${config.port}`))
  .catch(e => console.error("Could not start app", e))
```

This will start the `config` stage, then the `pg` and `http` stages, then the
`socket` stage and finally if the `start` stage.

If your app receive `SIGINT`, `SIGTERM`, `unhandledRejection` or `uncaughtException`,
(or if you call `app.close()`), `start` will be downed first then `pg`.


## API

### `AppLife#constructor<T extends {[key: string]: unknown}>(dependencies)`

Setup the the applife and load dependencies

- `T extends {[key: string]: unknown}` is the object that represent your state,
  once fully loaded.

  `T` can be infered from usage.
  For example if you have:

  ```ts
  const app = new Applife({
    a: { up: () => Promise.resolve("A") },
    b: { up: () => Promise.resolve(42) },
  })
  // T: { a: string, b: number }
  ```

- `dependencies: {[key: keyof T]: dependency}`, an object that represent the list
  of dependencies. The key is important as each dependency will receive `Pick<T, LoadedEntries>`

  - `dependency` is an object with the following keys

    - `needs?: keyof T | Array<keyof T>`: an optional array of steps which must
      resolve BEFORE calling the `up` method

    - `up?: (loaded: Pick<T, LoadedEntries>) => Promise<T[step]>`: the function to boot the current stage (once all in `needs` resolved).  
    This function takes all loaded properties and MUST return a promise.  
    `up` is optional because you may only want to specify a shutdown step.

    - `after?: keyof T | Array<keyof T>`: an optional array of steps which must
      resolve BEFORE calling the `down` method

    - `down?: (loaded: Pick<T, LoadedEntries>) => Promise<T[step]>`: The function
      to call to gracefully shutdown this step.  
      This function will only be called AFTER all steps defined in `after`.  
      This MUST return a promise


### `AppLife.start() => Promise<T>`

Starts your application (run all the `up` functions) and returns loaded values.

If any dependency fails to load, `start` will throw a `Boot sequence failed` with
a list of all errors that were caught in `Error.details: Error[]`  
The throw will occur AFTER all dependencies are successfuly unloaded

`start` will return your resolved dependencies


### `AppLife.stop() => Promise<void>`

Stop your application (run all the `down` functions).

`stop` will only stop a dependency that was started.


### `AppLife.run() => Promise<void>`

Treat your application as if it were a one of application.

Basically is `app.start().then(() => app.stop())`

Handles dependencies error the same way `start` would.


### `emit stopped(reason)`

After the app stops, it emits the `stopped` event with one of the following reasons:
- `SIGTERM` received the `SIGTERM` signal
- `SIGINT` received the `SIGINT` signal
- `uncaughtException` an exception was not handled by your code
- `unhandledRejection` a promise rejection was not handled by your code
- `stop` - if the `stop` method was called
