"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Mail, Lock, LogIn, ArrowRight, ShieldCheck, Zap } from 'lucide-react';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    console.log('[LoginPage] Render:', { loading, error });

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        console.log('[LoginPage] Attempting Login for:', email);

        const { data, error: loginError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (loginError) {
            console.error('[LoginPage] Login Error:', loginError.message);
            setError(loginError.message);
            setLoading(false);
        } else {
            console.log('[LoginPage] Login Success, redirecting home');
            router.push('/');
        }
    };

    return (
        <div className="relative min-h-screen w-full bg-[#050508] text-white flex flex-col items-center justify-center p-6 font-sans overflow-hidden">
            {/* Background Animated Elements */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/20 blur-[120px] rounded-full animate-pulse-glow" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-secondary/10 blur-[120px] rounded-full" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md z-[50] relative"
            >
                <div className="flex flex-col items-center mb-12">
                    <div className="w-24 h-24 mb-6 relative">
                        <img src="/splash_logo.webp" alt="Rave Star" className="w-full h-full object-contain drop-shadow-[0_0_20px_rgba(157,80,187,0.5)]" />
                    </div>
                    <h1 className="text-4xl font-black italic tracking-tighter uppercase mb-2">
                        RAVE <span className="text-accent">STAR</span>
                    </h1>
                    <p className="text-[10px] text-white/40 uppercase tracking-[0.4em] font-bold">Access Premium Gaming Hub</p>
                </div>

                <div className="glass-card p-8 rounded-[32px] border-white/5 relative overflow-hidden">
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-accent to-transparent" />

                    <form onSubmit={handleLogin} className="flex flex-col gap-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] text-white/40 uppercase font-black tracking-widest ml-1">Account Email</label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Enter your email"
                                    className="w-full bg-black/40 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:border-accent/50 transition-all placeholder:text-white/10"
                                    required
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-[10px] text-white/40 uppercase font-black tracking-widest ml-1">Secure Password</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full bg-black/40 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-sm focus:outline-none focus:border-accent/50 transition-all placeholder:text-white/10"
                                    required
                                />
                            </div>
                        </div>

                        <AnimatePresence>
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-[11px] text-red-400 font-bold"
                                >
                                    {error}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <motion.button
                            whileTap={{ scale: 0.98 }}
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-accent to-accent-secondary py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-sm shadow-[0_0_20px_rgba(157,80,187,0.3)] flex items-center justify-center gap-3 transition-all disabled:opacity-50"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <LogIn size={18} />
                                    Authorize Login
                                </>
                            )}
                        </motion.button>
                    </form>

                    <div className="mt-8 pt-8 border-t border-white/5 flex flex-col items-center gap-4">
                        <div className="flex items-center gap-2 text-white/20">
                            <ShieldCheck size={14} />
                            <span className="text-[10px] uppercase font-black tracking-widest">End-to-End Secure Session</span>
                        </div>

                        <div className="w-full h-12 bg-black/20 rounded-2xl flex items-center justify-center border border-dashed border-white/5 cursor-pointer hover:bg-white/5 transition-all group">
                            <span className="text-[10px] text-white/40 uppercase font-black group-hover:text-accent transition-colors">Create New Player ID</span>
                            <ArrowRight size={12} className="ml-2 text-white/20 group-hover:text-accent transition-colors" />
                        </div>
                    </div>
                </div>

                <div className="mt-12 flex justify-center gap-8">
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-xl font-black italic">12K+</span>
                        <span className="text-[8px] text-white/30 uppercase font-black">Active Players</span>
                    </div>
                    <div className="w-[1px] h-8 bg-white/5 self-center" />
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-xl font-black italic">99.9%</span>
                        <span className="text-[8px] text-white/30 uppercase font-black">Uptime</span>
                    </div>
                    <div className="w-[1px] h-8 bg-white/5 self-center" />
                    <div className="flex flex-col items-center gap-1">
                        <span className="text-xl font-black italic"><Zap size={18} className="text-yellow-500 fill-yellow-500/20" /></span>
                        <span className="text-[8px] text-white/30 uppercase font-black">Instant Payouts</span>
                    </div>
                </div>
            </motion.div>

            <style jsx global>{`
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.5; filter: blur(120px); }
          50% { opacity: 0.8; filter: blur(140px); }
        }
        .animate-pulse-glow {
          animation: pulse-glow 4s ease-in-out infinite;
        }
      `}</style>
        </div>
    );
}
