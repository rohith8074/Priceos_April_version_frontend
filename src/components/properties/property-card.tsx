"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Building2, Bed, Bath, MessageSquare } from "lucide-react";
import type { Listing } from "@/types/hostaway";
import { useChatStore } from "@/stores/chat-store";
import { usePropertyStore } from "@/stores/property-store";
import Link from "next/link";

interface PropertyCardProps {
  property: Listing;
  detailed?: boolean;
}

// Helper to map Hostaway property type IDs
function getPropertyTypeLabel(id: number): string {
  const map: Record<number, string> = {
    1: "Apartment",
    2: "House",
    3: "Villa",
    4: "Studio",
    5: "Townhouse",
  };
  return map[id] || "Property";
}

export function PropertyCard({ property, detailed = false }: PropertyCardProps) {
  const { open } = useChatStore();
  const { setActiveProperty } = usePropertyStore();

  const handleAskAI = () => {
    setActiveProperty(property);
    open(`What's the optimal pricing strategy for ${property.name}?`);
  };

  return (
    <Card className="group transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <Link href={`/properties/${property.id}`}>
              <CardTitle className="text-base leading-tight hover:underline">
                {property.name}
              </CardTitle>
            </Link>
            <p className="text-xs text-muted-foreground">{property.area}</p>
          </div>
          <Badge variant="secondary" className="text-xs">
            {getPropertyTypeLabel(property.propertyTypeId)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Bed className="h-3.5 w-3.5" />
            {property.bedroomsNumber === 0 ? "Studio" : `${property.bedroomsNumber} Bed`}
          </div>
          <div className="flex items-center gap-1">
            <Bath className="h-3.5 w-3.5" />
            {property.bathroomsNumber} Bath
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-bold">
              {property.price}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                {property.currencyCode || "AED"}/night
              </span>
            </p>
            <p className="text-xs text-muted-foreground">Base Price</p>
          </div>
        </div>

        {detailed && property.amenities && property.amenities.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {property.amenities.slice(0, 5).map((amenity) => (
              <Badge key={amenity} variant="outline" className="text-xs">
                {amenity}
              </Badge>
            ))}
            {property.amenities.length > 5 && (
              <Badge variant="outline" className="text-xs">
                +{property.amenities.length - 5}
              </Badge>
            )}
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2"
          onClick={handleAskAI}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Ask AI
        </Button>
      </CardContent>
    </Card>
  );
}
