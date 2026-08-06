import { Injectable } from "@nestjs/common";
import type { User } from "@massage-note/database";
import { type MessageEvent } from "@nestjs/common";
import { Observable, from, interval, startWith, switchMap } from "rxjs";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";

@Injectable()
export class RealtimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoreAccessService,
  ) {}

  async stream(actor: User, storeId: string, lastEventId?: string) {
    await this.access.requireActiveMembership(actor.id, storeId);
    let cursor = lastEventId;
    const connectedAt = new Date();
    return interval(2_000).pipe(
      startWith(0),
      switchMap(() => from(this.nextEvents(storeId, cursor, connectedAt))),
      switchMap((events) => new Observable<MessageEvent>((subscriber) => {
        if (events.length === 0) {
          subscriber.next({ type: "heartbeat", data: { serverTime: new Date().toISOString() }, retry: 3_000 });
        } else {
          for (const event of events) {
            cursor = event.id;
            const data = typeof event.payloadJson === "object" && event.payloadJson !== null
              ? event.payloadJson as object
              : { value: event.payloadJson };
            subscriber.next({ id: event.id, type: event.topic, data, retry: 3_000 });
          }
        }
        subscriber.complete();
      })),
    );
  }

  private async nextEvents(storeId: string, cursor: string | undefined, connectedAt: Date) {
    const cursorRow = cursor
      ? await this.prisma.domainOutbox.findFirst({ where: { id: cursor, storeId }, select: { id: true, createdAt: true } })
      : null;
    return this.prisma.domainOutbox.findMany({
      where: {
        storeId,
        ...(cursorRow
          ? { OR: [{ createdAt: { gt: cursorRow.createdAt } }, { createdAt: cursorRow.createdAt, id: { gt: cursorRow.id } }] }
          : { createdAt: { gte: connectedAt } }),
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 100,
      select: { id: true, topic: true, payloadJson: true },
    });
  }
}
