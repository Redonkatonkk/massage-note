import { Injectable } from "@nestjs/common";
import type { User } from "@massage-note/database";
import { type MessageEvent } from "@nestjs/common";
import { Observable, Subject, concat, concatMap, defer, exhaustMap, finalize, from, interval, map, of, share, startWith, takeUntil } from "rxjs";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";

@Injectable()
export class RealtimeService {
  private readonly stores = new Map<string, Observable<MessageEvent[]>>();
  private readonly stopped = new Subject<void>();

  onModuleDestroy() {
    this.stopped.next();
    this.stopped.complete();
    this.stores.clear();
  }
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoreAccessService,
  ) {}

  async stream(actor: User, storeId: string, lastEventId?: string) {
    await this.access.requireActiveMembership(actor.id, storeId);
    return defer(() => {
      let events = this.stores.get(storeId);
      if (!events) {
        events = this.createStoreStream(storeId, lastEventId);
        this.stores.set(storeId, events);
      }
      // Each connection is independent, even for the same user. Reconnecting
      // clients reread REST because the shared cursor may already be ahead.
      return concat(
        of<MessageEvent>({ type: "store.changed", data: { reason: "resync" }, retry: 3_000 }),
        events.pipe(
          concatMap(batch => from(this.access.requireActiveMembership(actor.id, storeId)).pipe(
            map(() => batch),
          )),
          concatMap(batch => from(batch)),
        ),
      );
    });
  }

  private createStoreStream(storeId: string, lastEventId?: string): Observable<MessageEvent[]> {
    let cursor = lastEventId;
    const connectedAt = new Date();
    let lastResyncAt = connectedAt.getTime();
    const stream = interval(2_000).pipe(
      startWith(0),
      exhaustMap(() => from(this.nextEvents(storeId, cursor, connectedAt))),
      map(events => {
        const batch: MessageEvent[] = [];
        // createdAt precedes commit, so keep a periodic REST resync for late commits.
        if (Date.now() - lastResyncAt >= 30_000) {
          batch.push({ type: "store.changed", data: { reason: "resync" }, retry: 3_000 });
          lastResyncAt = Date.now();
        }
        for (const event of events) {
          cursor = event.id;
          const data = typeof event.payloadJson === "object" && event.payloadJson !== null
            ? event.payloadJson as object : { value: event.payloadJson };
          batch.push({ id: event.id, type: event.topic, data, retry: 3_000 });
        }
        batch.push({ type: "heartbeat", data: { serverTime: new Date().toISOString() }, retry: 3_000 });
        return batch;
      }),
      takeUntil(this.stopped),
      finalize(() => { if (this.stores.get(storeId) === stream) this.stores.delete(storeId); }),
      share(),
    );
    return stream;
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
