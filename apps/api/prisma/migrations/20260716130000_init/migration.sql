CREATE TYPE "OrderSide" AS ENUM ('BUY', 'SELL');
CREATE TYPE "OrderStatus" AS ENUM ('EXECUTED', 'REJECTED');
CREATE TABLE "User" (
  "id" TEXT NOT NULL, "privyDid" TEXT NOT NULL, "email" TEXT, "displayName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Wallet" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "cashBalance" DECIMAL(24,8) NOT NULL DEFAULT 10000,
  "version" INTEGER NOT NULL DEFAULT 0, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Holding" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "asset" TEXT NOT NULL,
  "quantity" DECIMAL(24,8) NOT NULL DEFAULT 0, "averageCost" DECIMAL(24,8) NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Order" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "clientOrderId" TEXT NOT NULL, "symbol" TEXT NOT NULL,
  "side" "OrderSide" NOT NULL, "quantity" DECIMAL(24,8) NOT NULL, "executionPrice" DECIMAL(24,8),
  "quoteAmount" DECIMAL(24,8), "status" "OrderStatus" NOT NULL, "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Trade" (
  "id" TEXT NOT NULL, "orderId" TEXT NOT NULL, "userId" TEXT NOT NULL, "symbol" TEXT NOT NULL,
  "side" "OrderSide" NOT NULL, "quantity" DECIMAL(24,8) NOT NULL, "price" DECIMAL(24,8) NOT NULL,
  "quoteAmount" DECIMAL(24,8) NOT NULL, "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_privyDid_key" ON "User"("privyDid");
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");
CREATE UNIQUE INDEX "Holding_userId_asset_key" ON "Holding"("userId", "asset");
CREATE UNIQUE INDEX "Order_userId_clientOrderId_key" ON "Order"("userId", "clientOrderId");
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");
CREATE UNIQUE INDEX "Trade_orderId_key" ON "Trade"("orderId");
CREATE INDEX "Trade_userId_executedAt_idx" ON "Trade"("userId", "executedAt");
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Holding" ADD CONSTRAINT "Holding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
