"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Clock, CheckCircle2, Loader2, Mail, LogOut } from "lucide-react";

export default function PendingApprovalPage() {
    const router = useRouter();
    const [checking, setChecking] = useState(false);
    const [dots, setDots] = useState(".");
    const [email, setEmail] = useState<string | null>(null);

    // Animate the waiting dots
    useEffect(() => {
        const interval = setInterval(() => {
            setDots((d) => (d.length >= 3 ? "." : d + "."));
        }, 600);
        return () => clearInterval(interval);
    }, []);

    // Poll /api/auth/check-approval every 10 seconds
    useEffect(() => {
        let cancelled = false;

        async function poll() {
            if (cancelled) return;
            setChecking(true);
            try {
                const res = await fetch("/api/auth/check-approval");
                const data = await res.json();

                if (data.email && !email) setEmail(data.email);

                if (data.approved) {
                    // Cookie was already refreshed by the API — navigate to dashboard
                    router.push("/dashboard");
                    router.refresh();
                    return;
                }
            } catch {
                // network error — will retry
            } finally {
                if (!cancelled) setChecking(false);
            }
        }

        // First check immediately
        poll();

        // Then every 10 seconds
        const interval = setInterval(poll, 10_000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [router, email]);

    async function handleLogout() {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
    }

    return (
        <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center p-6">
            {/* Ambient blobs */}
            <div className="pointer-events-none fixed inset-0 overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-amber-500/8 blur-[120px] rounded-full animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-500/8 blur-[150px] rounded-full animate-pulse delay-1000" />
            </div>

            <div className="relative z-10 w-full max-w-md">
                {/* Logo */}
                <div className="flex items-center gap-3 mb-10 justify-center">
                    <div className="rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 p-2.5 shadow-lg shadow-amber-500/20">
                        <Sparkles className="h-6 w-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-white tracking-tighter">PriceOS</h1>
                        <p className="text-[10px] text-amber-500/80 font-bold uppercase tracking-[0.2em]">Revenue intelligence</p>
                    </div>
                </div>

                {/* Card */}
                <div
                    className="rounded-2xl border p-8 text-center space-y-6"
                    style={{
                        background: "rgba(255,255,255,0.03)",
                        borderColor: "rgba(255,255,255,0.08)",
                        backdropFilter: "blur(12px)",
                    }}
                >
                    {/* Icon */}
                    <div className="flex justify-center">
                        <div className="relative">
                            <div className="h-20 w-20 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                                <Clock className="h-9 w-9 text-amber-400" />
                            </div>
                            {checking && (
                                <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-[#0a0a0b] flex items-center justify-center">
                                    <Loader2 className="h-4 w-4 text-amber-400 animate-spin" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Heading */}
                    <div className="space-y-2">
                        <h2 className="text-2xl font-black text-white">Account Under Review</h2>
                        <p className="text-sm text-white/50 leading-relaxed">
                            Your account has been created and is waiting for admin approval.
                            You&apos;ll get access as soon as an admin reviews your request.
                        </p>
                    </div>

                    {/* Status pill */}
                    <div className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-full bg-amber-500/10 border border-amber-500/20 w-fit mx-auto">
                        <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                        <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                            Waiting for approval{dots}
                        </span>
                    </div>

                    {/* Email */}
                    {email && (
                        <div className="flex items-center justify-center gap-2 text-xs text-white/40">
                            <Mail className="h-3.5 w-3.5" />
                            <span>{email}</span>
                        </div>
                    )}

                    {/* What happens next */}
                    <div
                        className="rounded-xl p-4 text-left space-y-3"
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                        <p className="text-[11px] font-bold text-white/30 uppercase tracking-wider">What happens next</p>
                        <div className="space-y-2.5">
                            {[
                                { done: true,  text: "Account created successfully" },
                                { done: false, text: "Admin reviews your registration" },
                                { done: false, text: "You receive access to the dashboard" },
                            ].map((step, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    {step.done ? (
                                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                                    ) : (
                                        <div className="h-4 w-4 rounded-full border border-white/20 shrink-0" />
                                    )}
                                    <span className={`text-xs ${step.done ? "text-white/60" : "text-white/30"}`}>
                                        {step.text}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <p className="text-[11px] text-white/25">
                        This page checks automatically every 10 seconds.
                    </p>

                    {/* Logout */}
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors mx-auto"
                    >
                        <LogOut className="h-3.5 w-3.5" />
                        Sign out
                    </button>
                </div>
            </div>
        </div>
    );
}
