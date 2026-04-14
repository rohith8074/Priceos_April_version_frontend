"use client";

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, CalendarDays, Home } from "lucide-react";
import type { OwnerStatement } from "@/types/operations";
import type { Listing } from "@/types/hostaway";

interface OwnerStatementCardProps {
  statements: OwnerStatement[];
  properties: Listing[];
}

function formatCurrency(amount: number, currencyCode = "AED"): string {
  return `${amount.toLocaleString("en-US")} ${currencyCode}`;
}

function formatMonth(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(Number(year), Number(m) - 1);
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function OwnerStatementCard({ statements, properties }: OwnerStatementCardProps) {
  const propertyMap = useMemo(
    () => new Map(properties.map((p) => [p.id, p])),
    [properties]
  );

  // Group statements by property, pick the most recent month for each
  const latestStatements = useMemo(() => {
    const grouped = new Map<number, OwnerStatement>();
    for (const stmt of statements) {
      const existing = grouped.get(stmt.listingMapId);
      if (!existing || stmt.month > existing.month) {
        grouped.set(stmt.listingMapId, stmt);
      }
    }
    // Sort by property name
    return Array.from(grouped.values()).sort((a, b) => {
      const nameA = propertyMap.get(a.listingMapId)?.name ?? "";
      const nameB = propertyMap.get(b.listingMapId)?.name ?? "";
      return nameA.localeCompare(nameB);
    });
  }, [statements, propertyMap]);

  if (latestStatements.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No owner statements available
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {latestStatements.map((stmt) => {
        const property = propertyMap.get(stmt.listingMapId);
        const isPositive = stmt.netIncome >= 0;

        return (
          <Card key={stmt.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Home className="h-4 w-4 text-muted-foreground" />
                    {property?.name ?? `Property #${stmt.listingMapId}`}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {formatMonth(stmt.month)}
                  </p>
                </div>
                {isPositive ? (
                  <TrendingUp className="h-5 w-5 text-green-500" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-500" />
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Revenue / Expenses / Net */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Revenue</span>
                  <span className="font-medium text-green-600 dark:text-green-400">
                    {formatCurrency(stmt.totalRevenue, (property as any)?.currencyCode)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Expenses</span>
                  <span className="font-medium text-red-600 dark:text-red-400">
                    {formatCurrency(stmt.totalExpenses, (property as any)?.currencyCode)}
                  </span>
                </div>
                <div className="border-t pt-2 flex justify-between text-sm">
                  <span className="font-semibold">Net Income</span>
                  <span
                    className={`font-bold ${
                      isPositive
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {isPositive ? "+" : ""}
                    {formatCurrency(stmt.netIncome, (property as any)?.currencyCode)}
                  </span>
                </div>
              </div>

              {/* Occupancy */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Occupancy</span>
                  <span className="font-medium">{stmt.occupancyRate}%</span>
                </div>
                <Progress value={stmt.occupancyRate} className="h-2" />
              </div>

              {/* Reservations */}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Reservations</span>
                <span className="font-medium">{stmt.reservationCount}</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
