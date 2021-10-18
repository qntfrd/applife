
import { EventEmitter } from "events";

type DependencyGraph<T extends {[ key: string ]: unknown}> = Record<
  keyof T,
  {
    /** One or several dependencies to wait before starting UP */
    needs?: keyof T | Array<keyof T>,
    /** The boot function */
    up?: (data: T) => Promise<T[string]>,
    /** The shutdown function */
    down?: (data: T) => Promise<T[string]>,
    /** One or several depdendencies to down before calling DOWN */
    after?: keyof T | Array<keyof T>,
  }
>

/** Represents an error that may arise at boot time
 *
 *  The Error has a `details` field which is an array of all errors that were
 *  caught during boot.
 *
 *  Assuming A, B and C boot in parralel, both A and C can throw. This will hold
 *  the information of why both did.
 */
class ALError extends Error {
  /* istanbul ignore next - I don't know what happens but `super(message)` is not covered */
  constructor(message: string, public details: Error[]) {
    super(message)
  }
}

/** Represent your app */
export default class Applife<T extends {[ key: string ]: unknown }> extends EventEmitter {
  /** The value of loaded dependencies */
  private loaded: Partial<Record<keyof T, T[string]>> = {}
  /** Dependencies which are started (Promise implies it has started) */
  private up = new Map<keyof T, Promise<T[string]>>()
  /** Dependencies which are stopped (Promise implies it has stopped) */
  private down = new Map<keyof T, Promise<T[string]>>()

  // TODO: we could be clever and not trying to start the app again if there are errors ?
  /** List of errors at shutdown */
  private errors = new Map<keyof T, Error>()
  /** Hack to allow injecting one's own event emitter, for testing purposes */
  private emitter = process

  /** Constructs the representation of the app
   *
   *  @param dependencies - The dependency graph
   */
  constructor(private dependencies: DependencyGraph<T>) {
    super()
  }

  /** Resolve the dependency graph for shutting the app down
   *
   *  @param dependencyName - The name of the dependency to stop
   *  @return - When the dependency was shutdown
   */
  private async downDependency(dependencyName: keyof DependencyGraph<T>): Promise<void> {
    const dep = this.dependencies[dependencyName]

    // resolve dependencies before shutting down this one
    if (dep.after) {
      const after: Array<keyof T> = Array.isArray(dep.after) ? [...dep.after] : [dep.after]
      await Promise.all(after.map((d: keyof T) => this.downDependency(d as any)))
    }

    // TODO: no need to solve after if the step has no down dependencies
    // Whether the step has a down function
    if (dep.down) {
      // dependency was not started...
      if (!this.up.has(dependencyName)) {
        // ...but it existed => no need to down, it wasn't up
        if (this.dependencies[dependencyName].up)
          return Promise.resolve()
        // this is a `down` only step => continue
      }
      else {
        try {
          // make sure the dependency was started...
          await this.up.get(dependencyName)
        } catch {
          // ...or could not boot (error) => no need to down
          return Promise.resolve()
        }
      }

      // safeguard against multiple calls to down
      if (!this.down.has(dependencyName))
        this.down.set(dependencyName, dep.down(this.loaded as T))

      // wait for the down to actualy be down
      await this.down.get(dependencyName)
    }
  }

  /** Resolve the dependency graph for starting up the app
   *
   *  @param dependencyName - The name of the dependency to start
   *  @return - The value when the dependency was started
   */
  private async upDependency(dependencyName: keyof DependencyGraph<T>): Promise<T[string] | undefined> {
    const dep = this.dependencies[dependencyName]

    // Waits for dependencies to resolve
    if (dep.needs) {
      const needs: Array<keyof T> = Array.isArray(dep.needs) ? [...dep.needs] : [dep.needs]
      await Promise.all(needs.map((d: keyof T) => this.upDependency(d as any)))
    }

    // TODO: If the app has no up function, no need to wait for up blockers
    if (dep.up) {
      // TODO: can be refactored
      // if some errors were raised in other step => do not boot
      if (this.errors.size > 0) return Promise.resolve(undefined);

      // safeguard against multiple up calls
      if (!this.up.has(dependencyName))
        this.up.set(dependencyName, dep.up(this.loaded as T))

      try {
        // wait for the dependency to start
        this.loaded[dependencyName as keyof T] = await this.up.get(dependencyName)
      }
      catch (e) {
        // ...or crash
        this.errors.set(dependencyName as keyof T, e as Error)
        // in which case we shut the app down
        await this.stop()
      }
    }
    return Promise.resolve(undefined)
  }

  /** Stops the app
   *
   *  Has no effects if the app had not started
   *  TODO: v this probably is not true
   *  Will cancel the rest of the boot sequence when called
   *
   *  @emit `stopped(stop)` when the app stopped
   */
  async stop(): Promise<void> {
    await Promise.all(Object.keys(this.dependencies).map(dep => this.downDependency(dep)))
    this.emit("stopped", "stop")
  }

  /** A common handler for any signal that must stop the app
   *
   *  @param signal - The name of the signal
   */
  private async handleInterupt(signal: string) {
    await this.stop()
    this.emit("stopped", signal)
  }

  /** Starts the application
   *
   *  TODO: the current implementation prevent retry after the first start
   *  Returns loaded dependencies value
   */
  async start(): Promise<T> {
    // register interupts
    ["SIGINT", "SIGTERM", "uncaughtException", "unhandledRejection"].map(signal => {
      this.emitter.on(signal, () => this.handleInterupt(signal))
    })

    // wait for dependencies to be started
    await Promise.all(Object.keys(this.dependencies).map(dep => this.upDependency(dep)))

    // aggregate and throw errors, if any
    if (this.errors.size > 0)
      throw new ALError("Boot sequence failed", Array.from(this.errors.values()))
    return this.loaded as T
  }

  /** Start the app, then stops it */
  async run(): Promise<void> {
    await this.start()
    await this.stop()
  }
}
