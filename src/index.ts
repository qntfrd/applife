
import { EventEmitter } from "events";

type DependencyGraph<T extends {[ key: string ]: unknown}> = Record<
  keyof T, {
    needs?: keyof T | Array<keyof T>,
    up?: (data: T) => Promise<T[string]>,
    down?: (data: T) => Promise<T[string]>,
    after?: keyof T | Array<keyof T>,
  }
>

class ALError extends Error {
  constructor(message: string, public details: Error[]) {
    super(message)
  }
}

export default class Applife<T extends {[ key: string ]: unknown }> extends EventEmitter {
  private loaded: Partial<Record<keyof T, T[string]>> = {}
  private up = new Map<keyof T, Promise<T[string]>>()
  private down = new Map<keyof T, Promise<T[string]>>()
  private errors = new Map<keyof T, Error>()
  private emitter = process

  constructor(private dependencies: DependencyGraph<T>) {
    super()
  }

  private async downDependency(dependencyName: keyof DependencyGraph<T>): Promise<void> {
    const dep = this.dependencies[dependencyName]
    if (dep.after) {
      const after: Array<keyof T> = Array.isArray(dep.after) ? [...dep.after] : [dep.after]
      await Promise.all(after.map((d: keyof T) => this.downDependency(d as any)))
    }
    if (dep.down) {
      // dependency was not started => skip
      if (!this.up.has(dependencyName)) {
        if (this.dependencies[dependencyName].up)
          return Promise.resolve()
      }
      else {
        // make sure the dependency was started or errored
        try {
          await this.up.get(dependencyName)
        } catch {
          return Promise.resolve()
        }
      }

      if (!this.down.has(dependencyName))
        this.down.set(dependencyName, dep.down(this.loaded as T))
      await this.down.get(dependencyName)
    }
  }

  private async upDependency(dependencyName: keyof DependencyGraph<T>): Promise<T[string] | undefined> {
    const dep = this.dependencies[dependencyName]
    if (dep.needs) {
      const needs: Array<keyof T> = Array.isArray(dep.needs) ? [...dep.needs] : [dep.needs]
      await Promise.all(needs.map((d: keyof T) => this.upDependency(d as any)))
    }
    if (dep.up) {
      if (this.errors.size > 0) return Promise.resolve(undefined);

      if (!this.up.has(dependencyName))
        this.up.set(dependencyName, dep.up(this.loaded as T))
      try {
        this.loaded[dependencyName as keyof T] = await this.up.get(dependencyName)
      }
      catch (e) {
        this.errors.set(dependencyName as keyof T, e as Error)
        await this.stop()
      }
    }
    return Promise.resolve(undefined)
  }

  async stop(): Promise<void> {
    await Promise.all(Object.keys(this.dependencies).map(dep => this.downDependency(dep)))
    this.emit("stopped", "stop")
  }

  private async handleInterupt(signal: string) {
    await this.stop()
    this.emit("stopped", signal)
  }

  async start(): Promise<T> {
    ["SIGINT", "SIGTERM", "uncaughtException", "unhandledRejection"].map(signal => {
      this.emitter.on(signal, () => this.handleInterupt(signal))
    })

    await Promise.all(Object.keys(this.dependencies).map(dep => this.upDependency(dep)))
    if (this.errors.size > 0)
      throw new ALError("Boot sequence failed", Array.from(this.errors.values()))
    return this.loaded as T
  }

  async run(): Promise<void> {
    await this.start()
    await this.stop()
  }
}
