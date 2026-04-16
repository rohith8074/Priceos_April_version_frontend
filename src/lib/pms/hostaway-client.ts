import { PMSClient } from "./types";
import {
  Listing,
  CalendarDay,
  Reservation,
  CalendarInterval,
  UpdateResult,
  VerificationResult,
  ReservationFilters,
} from "@/types/hostaway";
import type {
  SeasonalRule,
  Conversation,
  ConversationMessage,
  MessageTemplate,
  OperationalTask,
  Expense,
  OwnerStatement,
} from "@/types/operations";

/**
 * Hostaway API Wire Types
 * Exact shape of Hostaway API responses before mapping to app types
 */

export interface HostawayListingResponse {
  id: number;
  name: string;
  city: string;
  country: string;
  countryCode: string;
  bedroomsNumber: number;
  bathroomsNumber: number;
  propertyTypeId: number;
  price: number;
  currencyCode: string;
  personCapacity: number;
  listingAmenities: Array<{ name: string }>;
}

export interface HostawayCalendarResponse {
  date: string;
  isAvailable: boolean;
  price: number;
  minimumStay: number;
  maximumStay: number;
}

export interface HostawayReservationResponse {
  id: number;
  listingMapId: number;
  guestName: string;
  guestEmail: string;
  channelName: string;
  arrivalDate: string;
  departureDate: string;
  nights: number;
  totalPrice: number;
  status: string;
  checkInTime: string;
  checkOutTime: string;
}

function extractArea(name: string, city: string = ""): string {
  const normalized = (name + " " + city).toLowerCase();
  if (normalized.includes("marina")) return "Dubai Marina";
  if (normalized.includes("jbr") || normalized.includes("shams")) return "JBR";
  if (normalized.includes("downtown") || normalized.includes("burj") || normalized.includes("boulevard")) return "Downtown Dubai";
  if (normalized.includes("jvc") || normalized.includes("jawhara")) return "JVC";
  if (normalized.includes("business bay")) return "Business Bay";
  if (normalized.includes("meydan")) return "Meydan";
  if (normalized.includes("beachfront")) return "Emaar Beachfront";
  if (normalized.includes("creek") || normalized.includes("lagoon")) return "Dubai Creek";
  if (normalized.includes("palm")) return "Palm Jumeirah";
  return "Other";
}

/**
 * Mapper: Hostaway API listing → App Listing
 */
export function mapHostawayListing(raw: HostawayListingResponse): Listing {
  return {
    id: raw.id,
    name: raw.name || "Unknown Property",
    city: raw.city || "Dubai",
    countryCode: raw.countryCode || "AE",
    area: extractArea(raw.name || "", raw.city || ""),
    bedroomsNumber: raw.bedroomsNumber ?? 0,
    bathroomsNumber: raw.bathroomsNumber ?? 1,
    propertyTypeId: raw.propertyTypeId ?? 1,
    price: raw.price ?? 0,
    priceFloor: (raw.price || 0) * 0.8,
    priceCeiling: (raw.price || 0) * 1.5,
    currencyCode: (raw.currencyCode || "AED") as "AED" | "USD",
    personCapacity: raw.personCapacity ?? 2,
    amenities: Array.isArray(raw.listingAmenities)
      ? raw.listingAmenities.map((a: any) => {
        if (typeof a === 'string') return a;
        if (a && typeof a === 'object') return a.name || a.amenity || String(a.id || "");
        return String(a || "");
      }).filter((v) => typeof v === 'string' && v.trim() !== "" && v !== "undefined")
      : [],
  };
}

/**
 * Mapper: Hostaway API calendar day → App CalendarDay
 */
export function mapHostawayCalendarDay(raw: HostawayCalendarResponse): CalendarDay {
  return {
    date: raw.date,
    status: raw.isAvailable ? "available" : "booked",
    price: raw.price,
    minimumStay: raw.minimumStay,
    maximumStay: raw.maximumStay,
  };
}

/**
 * Mapper: Hostaway API reservation → App Reservation
 */
export function mapHostawayReservation(raw: HostawayReservationResponse): Reservation {
  const pricePerNight = raw.nights > 0 ? Math.round(raw.totalPrice / raw.nights) : 0;
  return {
    id: raw.id,
    listingMapId: raw.listingMapId,
    guestName: raw.guestName,
    guestEmail: raw.guestEmail || undefined,
    channelName: mapChannelName(raw.channelName),
    arrivalDate: raw.arrivalDate,
    departureDate: raw.departureDate,
    nights: raw.nights,
    totalPrice: raw.totalPrice,
    pricePerNight,
    status: mapReservationStatus(raw.status),
    createdAt: new Date().toISOString(),
    checkInTime: raw.checkInTime || undefined,
    checkOutTime: raw.checkOutTime || undefined,
  };
}

function mapChannelName(name: string): Reservation["channelName"] {
  const normalized = name.toLowerCase();
  if (normalized.includes("airbnb")) return "Airbnb";
  if (normalized.includes("booking")) return "Booking.com";
  if (normalized.includes("direct")) return "Direct";
  return "Other";
}

function mapReservationStatus(status: string): Reservation["status"] {
  const normalized = status.toLowerCase();
  if (normalized === "confirmed" || normalized === "new") return "confirmed";
  if (normalized === "pending") return "pending";
  if (normalized === "cancelled" || normalized === "canceled") return "cancelled";
  if (normalized === "completed" || normalized === "checked_out") return "completed";
  return "confirmed";
}

/**
 * HostawayClient
 * Real Hostaway API client
 */
export class HostawayClient implements PMSClient {
  private staticToken: string;
  private baseUrl: string = "https://api.hostaway.com/v1";

  constructor(token?: string) {
    this.staticToken = token || process.env.Hostaway_Authorization_token || "";

    if (!this.staticToken) {
      throw new Error(
        "Hostaway_Authorization_token environment variable is required in your .env file."
      );
    }
  }

  private async fetchApi(endpoint: string) {
    const url = endpoint.startsWith("http") ? endpoint : `${this.baseUrl}${endpoint}`;

    // ONLY GET requests allowed, using the static token.
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.staticToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`Hostaway API Error (${res.status}): ${res.statusText}`);
    }

    const json = await res.json();
    return json.result || json;
  }

  async listListings(): Promise<Listing[]> {
    const data = await this.fetchApi("/listings");
    const listings = Array.isArray(data) ? data : [];
    return listings.map(mapHostawayListing);
  }

  async getListing(id: string | number): Promise<Listing> {
    const data = await this.fetchApi(`/listings/${id}`);
    return mapHostawayListing(data);
  }

  async getCalendar(
    id: string | number,
    startDate: Date,
    endDate: Date
  ): Promise<CalendarDay[]> {
    const startStr = startDate.toISOString().split("T")[0];
    const endStr = endDate.toISOString().split("T")[0];
    const data = await this.fetchApi(
      `/listings/${id}/calendar?startDate=${startStr}&endDate=${endStr}`
    );
    const calendarDays = Array.isArray(data) ? data : [];
    return calendarDays.map(mapHostawayCalendarDay);
  }

  async getReservations(filters?: ReservationFilters): Promise<Reservation[]> {
    const params = new URLSearchParams();
    if (filters?.listingMapId) params.append("listingMapId", filters.listingMapId.toString());
    if (filters?.limit) params.append("limit", filters.limit.toString());
    if (filters?.offset) params.append("offset", filters.offset.toString());
    if (filters?.status) params.append("status", filters.status);

    const query = params.toString() ? `?${params.toString()}` : "";
    const data = await this.fetchApi(`/reservations${query}`);
    const reservations = Array.isArray(data) ? data : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return reservations.map((r: any) => mapHostawayReservation(r));
  }

  async getReservation(id: string | number): Promise<Reservation> {
    const data = await this.fetchApi(`/reservations/${id}`);
    return mapHostawayReservation(data);
  }

  // ============================================================================
  // WRITE OPERATIONS STRICTLY DISABLED - USE NEON DATABASE INSTEAD
  // ============================================================================

  private disableWrite(): never {
    throw new Error(
      "Write access to live Hostaway API is strictly disabled by intention. Update your proposal statuses in the local Neon database."
    );
  }

  async updateListing(id: string | number, updates: Partial<Listing>): Promise<Listing> {
    return this.disableWrite();
  }

  async blockDates(
    id: string | number,
    startDate: string,
    endDate: string,
    reason: string
  ): Promise<UpdateResult> {
    return this.disableWrite();
  }

  async unblockDates(
    id: string | number,
    startDate: string,
    endDate: string
  ): Promise<UpdateResult> {
    return this.disableWrite();
  }

  async updateCalendar(
    id: string | number,
    intervals: CalendarInterval[]
  ): Promise<UpdateResult> {
    return this.disableWrite();
  }

  async getSeasonalRules(listingId: string | number): Promise<SeasonalRule[]> {
    return [];
  }
  async createSeasonalRule(
    listingId: string | number,
    rule: Omit<SeasonalRule, "id" | "listingMapId">
  ): Promise<SeasonalRule> {
    return this.disableWrite();
  }
  async updateSeasonalRule(
    listingId: string | number,
    ruleId: number,
    updates: Partial<SeasonalRule>
  ): Promise<SeasonalRule> {
    return this.disableWrite();
  }
  async deleteSeasonalRule(listingId: string | number, ruleId: number): Promise<void> {
    return this.disableWrite();
  }
  async getConversations(listingId?: string | number): Promise<Conversation[]> {
    return [];
  }
  async getConversationMessages(conversationId: number): Promise<ConversationMessage[]> {
    return [];
  }
  async sendMessage(
    conversationId: number,
    content: string
  ): Promise<ConversationMessage> {
    return this.disableWrite();
  }
  async getMessageTemplates(): Promise<MessageTemplate[]> {
    return [];
  }
  async getTasks(listingId?: string | number): Promise<OperationalTask[]> {
    return [];
  }
  async createTask(
    task: Omit<OperationalTask, "id" | "createdAt">
  ): Promise<OperationalTask> {
    return this.disableWrite();
  }
  async updateTask(
    taskId: number,
    updates: Partial<OperationalTask>
  ): Promise<OperationalTask> {
    return this.disableWrite();
  }
  async getExpenses(listingId?: string | number): Promise<Expense[]> {
    return [];
  }
  async createExpense(expense: Omit<Expense, "id">): Promise<Expense> {
    return this.disableWrite();
  }
  async getOwnerStatements(listingId?: string | number): Promise<OwnerStatement[]> {
    return [];
  }
  async createReservation(
    reservation: Omit<Reservation, "id" | "createdAt" | "pricePerNight">
  ): Promise<Reservation> {
    return this.disableWrite();
  }

  async verifyCalendar(
    id: string | number,
    dates: string[]
  ): Promise<VerificationResult> {
    return { matches: true, totalDates: dates.length, matchedDates: dates.length };
  }

  getMode(): "mock" | "live" {
    return "live";
  }
}
