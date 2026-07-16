ALTER TYPE "OrderStatus" ADD VALUE 'PENDING';
ALTER TYPE "OrderStatus" ADD VALUE 'CANCELED';
CREATE TYPE "OrderType" AS ENUM ('MARKET', 'LIMIT', 'STOP_LOSS');
ALTER TABLE "Order" ADD COLUMN "type" "OrderType" NOT NULL DEFAULT 'MARKET';
ALTER TABLE "Order" ADD COLUMN "triggerPrice" DECIMAL(24,8);
ALTER TABLE "Order" ADD COLUMN "executedAt" TIMESTAMP(3);
CREATE INDEX "Order_symbol_status_idx" ON "Order"("symbol", "status");
