import { createHash, timingSafeEqual } from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";
import type { Prisma } from "@massage-note/database";

export function hashDeliveryAgentToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Shared authentication for daily-closing and range-settlement deliveries. */
export async function authenticateDeliveryAgent(
  client: Pick<Prisma.TransactionClient, "closingDeliveryAgent">,
  authorization: string | undefined,
) {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const prefix = token?.match(/^mna_([a-f0-9]{10})_/)?.[1];
  if (!token || !prefix) {
    throw new UnauthorizedException({
      code: "DELIVERY_AGENT_TOKEN_REQUIRED",
      messageZh: "发送代理凭证无效",
    });
  }

  const agent = await client.closingDeliveryAgent.findUnique({
    where: { tokenPrefix: prefix },
    include: { store: { select: { status: true, deletedAt: true } } },
  });
  const presentedHash = hashDeliveryAgentToken(token);
  if (
    !agent ||
    agent.revokedAt ||
    agent.store.status !== "ACTIVE" ||
    agent.store.deletedAt ||
    agent.tokenHash.length !== presentedHash.length ||
    !timingSafeEqual(Buffer.from(agent.tokenHash), Buffer.from(presentedHash))
  ) {
    throw new UnauthorizedException({
      code: "DELIVERY_AGENT_TOKEN_INVALID",
      messageZh: "发送代理凭证无效或已撤销",
    });
  }
  return agent;
}
