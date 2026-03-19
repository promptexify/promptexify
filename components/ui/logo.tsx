"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoProps {
  href?: string | null;
  className?: string;
  width?: number;
  height?: number;
}

// Main Logo
function LogoImage({
  width = 180,
  height = 28,
  className,
}: {
  width?: number;
  height?: number;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <div
        className={cn("transition-opacity duration-200", className)}
        style={{ width, height }}
      />
    );
  }

  const isDark = resolvedTheme === "dark";
  const logoSrc = isDark
    ? "/static/logo/logo-white.svg"
    : "/static/logo/logo-dark.svg";

  return (
    <Image
      src={logoSrc}
      alt="Promptexify logo"
      width={width}
      height={height}
      style={{ width: "135px", height: "auto" }}
      className={cn("transition-opacity duration-200", className)}
      priority
    />
  );
}

// Logo Symbol
function LogoSymbolSVG({
  width = 58,
  height = 58,
  className,
}: {
  width?: number;
  height?: number;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <div
        className={cn(
          "rounded-full transition-opacity duration-200",
          className
        )}
        style={{ width, height }}
      />
    );
  }

  const isDark = resolvedTheme === "dark";
  const symbolSrc = isDark
    ? "/static/logo/logo-symbol-white.svg"
    : "/static/logo/logo-symbol-dark.svg";

  return (
    <Image
      src={symbolSrc}
      alt="Promptexify Logo Symbol"
      width={width}
      height={height}
      style={{ width: "55px", height: "auto" }}
      className={cn("transition-opacity duration-200", className)}
      priority
    />
  );
}

// Logo Type Compact
function LogoTypo({
  width = 58,
  height = 58,
  className,
}: {
  width?: number;
  height?: number;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <div
        className={cn(
          "rounded-full transition-opacity duration-200",
          className
        )}
        style={{ width, height }}
      />
    );
  }

  const isDark = resolvedTheme === "dark";
  const symbolSrc = isDark
    ? "/static/logo/logo-type-white.svg"
    : "/static/logo/logo-type-dark.svg";

  return (
    <Image
      src={symbolSrc}
      alt="Promptexify Logo Type"
      width={width}
      height={height}
      style={{ width: "auto", height: "auto" }}
      className={cn("transition-opacity duration-200", className)}
      priority
    />
  );
}

// Exported Logo Component
export function Logo({
  href = "/",
  className,
  width = 180,
  height = 28,
}: LogoProps) {
  const logoElement = (
    <LogoImage width={width} height={height} className={className} />
  );

  if (href === null) {
    return logoElement;
  }

  return (
    <Link href={href} className="block">
      {logoElement}
    </Link>
  );
}

// Exported Logo Compact Component
export function LogoType({
  href = "/",
  className,
  width = 180,
  height = 28,
}: LogoProps) {
  const logoElement = (
    <LogoTypo width={width} height={height} className={className} />
  );

  if (href === null) {
    return logoElement;
  }

  return (
    <Link href={href} className="block">
      {logoElement}
    </Link>
  );
}

// Exported Logo Symbol Component
export function LogoSymbol({
  href = "/",
  className,
}: Omit<LogoProps, "width" | "height">) {
  const logoElement = (
    <LogoSymbolSVG width={58} height={58} className={className} />
  );

  if (href === null) {
    return logoElement;
  }

  return (
    <Link href={href} className="block">
      {logoElement}
    </Link>
  );
}
