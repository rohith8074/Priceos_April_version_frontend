"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MessageSquare, Activity, User, MessageCircle, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
    { name: "Portfolio", href: "/dashboard", icon: LayoutDashboard },
    { name: "Agent Chat", href: "/agent-chat", icon: MessageSquare },
    { name: "Guest Inbox", href: "/guest-chat", icon: MessageCircle },
    { name: "Pricing", href: "/pricing", icon: Activity },
    { name: "Team", href: "/users", icon: Shield },
];

export function AppSidebar() {
    const pathname = usePathname();

    return (
        <div className="flex h-full w-16 flex-col items-center border-r bg-background/80 backdrop-blur-xl py-6 shrink-0 transition-all duration-500 ease-in-out hover:w-64 group z-50 shadow-2xl overflow-hidden">


            <div className="flex flex-1 flex-col gap-2 w-full px-2">
                {navigation.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                "group/item relative flex items-center justify-start gap-4 rounded-xl p-3 transition-all duration-300",
                                isActive
                                    ? "bg-primary/10 text-primary shadow-[inset_0_0_10px_rgba(var(--primary),0.05)]"
                                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                            )}
                        >
                            <div className={cn(
                                "flex items-center justify-center shrink-0 transition-transform duration-300 group-hover/item:scale-110",
                                isActive ? "text-primary" : "text-muted-foreground/60 group-hover/item:text-primary"
                            )}>
                                <item.icon className="h-5 w-5" />
                            </div>

                            <span className="truncate whitespace-nowrap opacity-0 transition-opacity duration-300 group-hover:opacity-100 font-bold text-[13px] uppercase tracking-wider">
                                {item.name}
                            </span>

                            {isActive && (
                                <div className="absolute left-[-8px] top-1/2 -translate-y-1/2 w-1.5 h-6 bg-primary rounded-r-full shadow-lg shadow-primary/20" />
                            )}
                        </Link>
                    );
                })}
            </div>

            {/* Footer indicator */}
            <div className="w-full px-4 py-4 mt-auto border-t border-border/50 group-hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold">RP</span>
                    </div>
                    <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <span className="text-[10px] font-bold uppercase tracking-tight">Enterprise Plan</span>
                        <span className="text-[8px] text-muted-foreground uppercase font-black tracking-widest text-emerald-500">System Online</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
