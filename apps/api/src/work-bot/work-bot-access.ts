import { ForbiddenException } from "@nestjs/common";
import { Prisma } from "@massage-note/database";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";

/** Server-only adapter: chat claims never grant a manager's privileges. */
export class WorkBotAccess extends StoreAccessService {
  constructor(prisma: PrismaService, private readonly bindingId: string) { super(prisma); }
  override async requireActiveMembership(actorId: string, storeId: string, client?: Prisma.TransactionClient) {
    if (!client) throw new Error("Work bot writes require the event transaction");
    const binding = await client.workBotMemberBinding.findFirst({
      where: { id: this.bindingId, groupBinding: { storeId, store: { status: "ACTIVE", deletedAt: null } } },
      include: { membership: true },
    });
    const member = binding?.membership;
    if (!member || member.id !== actorId || member.storeId !== storeId || member.status !== "ACTIVE" || member.deletedAt) {
      throw new ForbiddenException("微信绑定已失效，请重新绑定");
    }
    if (member.userId && !await client.user.findFirst({ where: { id: member.userId, status: "ACTIVE" } })) {
      throw new ForbiddenException("绑定账号已停用");
    }
    return { ...member, role: binding.verifiedAt ? member.role : "EMPLOYEE" as const };
  }
}
