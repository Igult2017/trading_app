import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Props {
  children: React.ReactNode;
  darkMode?: boolean;
  className?: string;
}

export function AuroraBackground({ children, darkMode, className }: Props) {
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          animate={{ x: [0, 120, -80, 0], y: [0, -60, 40, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full"
          style={{
            background: darkMode
              ? "radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 70%)"
              : "radial-gradient(circle, rgba(59,130,246,0.10) 0%, transparent 70%)",
          }}
        />
        <motion.div
          animate={{ x: [0, -100, 80, 0], y: [0, 60, -40, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -bottom-20 -left-32 w-[500px] h-[500px] rounded-full"
          style={{
            background: darkMode
              ? "radial-gradient(circle, rgba(99,102,241,0.14) 0%, transparent 70%)"
              : "radial-gradient(circle, rgba(99,102,241,0.07) 0%, transparent 70%)",
          }}
        />
        <motion.div
          animate={{ x: [0, 60, -60, 0], y: [0, 80, -30, 0] }}
          transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/2 left-1/3 w-[400px] h-[400px] rounded-full"
          style={{
            background: darkMode
              ? "radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 70%)"
              : "radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%)",
          }}
        />
      </div>
      {children}
    </div>
  );
}
