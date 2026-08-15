-- 店长或经理可先建立没有登录账号的员工关系；员工注册后再把真实账号绑定到原关系。
ALTER TABLE "store_memberships"
  ALTER COLUMN "user_id" DROP NOT NULL;
