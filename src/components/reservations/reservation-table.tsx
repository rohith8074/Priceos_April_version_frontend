"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MessageSquare } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import type { Reservation, Listing } from "@/types/hostaway";
import Link from "next/link";

interface ReservationTableProps {
  reservations: Reservation[];
  properties: Listing[];
}

const channelColors: Record<string, string> = {
  Airbnb: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  "Booking.com": "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  Direct: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  Other: "bg-gray-100 text-gray-700 dark:bg-gray-950 dark:text-gray-300",
};

const statusVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  confirmed: "default",
  pending: "secondary",
  cancelled: "destructive",
  completed: "outline",
};

export function ReservationTable({ reservations, properties }: ReservationTableProps) {
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { open } = useChatStore();

  const propertyMap = new Map(properties.map((p) => [p.id, p]));

  const filtered = reservations.filter((r) => {
    if (propertyFilter !== "all" && r.listingMapId !== Number(propertyFilter)) return false;
    if (channelFilter !== "all" && r.channelName !== channelFilter) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={propertyFilter} onValueChange={setPropertyFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Properties" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Properties</SelectItem>
            {properties.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={channelFilter} onValueChange={setChannelFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Channels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            <SelectItem value="Airbnb">Airbnb</SelectItem>
            <SelectItem value="Booking.com">Booking.com</SelectItem>
            <SelectItem value="Direct">Direct</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto text-sm text-muted-foreground self-center">
          {filtered.length} reservation{filtered.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium">Guest</th>
                <th className="px-4 py-3 text-left font-medium">Property</th>
                <th className="px-4 py-3 text-left font-medium">Channel</th>
                <th className="px-4 py-3 text-left font-medium">Dates</th>
                <th className="px-4 py-3 text-right font-medium">Nights</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 text-center font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const property = propertyMap.get(r.listingMapId);
                return (
                  <tr
                    key={r.id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/reservations/${r.id}`}
                        className="font-medium hover:underline"
                      >
                        {r.guestName}
                      </Link>
                      {r.guestEmail && (
                        <p className="text-xs text-muted-foreground">{r.guestEmail}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {property?.name ?? `#${r.listingMapId}`}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${channelColors[r.channelName] ?? channelColors.Other}`}
                      >
                        {r.channelName}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {r.arrivalDate} &rarr; {r.departureDate}
                    </td>
                    <td className="px-4 py-3 text-right">{r.nights}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {r.totalPrice.toLocaleString("en-US")} {property?.currencyCode || "AED"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={statusVariants[r.status] ?? "secondary"}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() =>
                          open(
                            `Is reservation #${r.id} for ${r.guestName} at ${property?.name} priced well? Dates: ${r.arrivalDate} to ${r.departureDate}, Total: ${r.totalPrice} ${property?.currencyCode || "AED"} for ${r.nights} nights.`
                          )
                        }
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    No reservations match your filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
