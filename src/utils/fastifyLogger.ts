import { FastifyInstance } from "fastify";
import { Logger } from "src/types/logger";

export class FastifyLogger implements Logger {
  constructor(
    private readonly prefix: string,
    private readonly fastify: FastifyInstance,
  ) {}

  log(msg: string) {
    this.fastify.log.info(`[${this.prefix}] ${msg}`);
  }

  warn(msg: string) {
    this.fastify.log.warn(`[${this.prefix}] ${msg}`);
  }

  error(msg: string) {
    this.fastify.log.error(`[${this.prefix}] ${msg}`);
  }
}
