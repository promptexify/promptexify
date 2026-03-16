"use client";

import { useCallback, useRef, useState } from "react";
import { useMousePosition } from "@/hooks/use-mouse-position";
import { AnimatedBackground } from "@/components/ui/animated-background";
import { GridBackground } from "@/components/ui/grid-background";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Container } from "@/components/ui/container";
import { Search, X } from "@/components/ui/icons";
import { motion, Variants } from "framer-motion";

interface HeroSectionProps {
  searchQuery?: string;
  sort?: string;
}

export function HeroSection({
  searchQuery,
  sort = "latest",
}: HeroSectionProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState(searchQuery ?? "");

  const update = useCallback(({ x, y }: { x: number; y: number }) => {
    if (!overlayRef.current) {
      return;
    }

    const { width, height } = overlayRef.current?.getBoundingClientRect() ?? {};
    const xOffset = x - width / 2;
    const yOffset = y - height / 2;

    overlayRef.current?.style.setProperty("--x", `${xOffset}px`);
    overlayRef.current?.style.setProperty("--y", `${yOffset}px`);
  }, []);

  useMousePosition(containerRef, update);

  const clearInput = useCallback(() => {
    setInputValue("");
    inputRef.current?.focus();
  }, []);

  const FADE_IN_ANIMATION_VARIANTS: Variants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0, transition: { type: "spring" } },
  };

  return (
    <section
      ref={containerRef}
      className="group relative bg-gradient-to-b from-background via-muted/20 to-background -mt-10 pt-14 overflow-hidden z-20 pb-10"
    >
      {/* Grid Background */}
      <GridBackground className="z-0" gridSize={35} />
      <AnimatedBackground className="z-10" />

      <div className="absolute bottom-0 bg-gradient-to-t from-background to-transparent w-full h-20 z-50" />

      {/* Mouse Effect Overlay */}
      <div
        ref={overlayRef}
        className="absolute hidden md:block blur-3xl h-128 w-128 rounded-full bg-white/20 opacity-0 bg-blend-lighten transition-opacity group-hover:opacity-10 dark:group-hover:opacity-20 pointer-events-none"
        style={{
          transform: "translate(var(--x), var(--y))",
          zIndex: 15,
        }}
      />

      {/* Gradient Overlays for fade effect */}
      <div className="hidden md:block lg:block xl:block">
        <div className="absolute inset-x-0 top-0 h-1/4 bg-gradient-to-b from-background to-transparent z-50 pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-background to-transparent z-50 pointer-events-none" />
        <div className="absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-background to-transparent z-50 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-background to-transparent z-50 pointer-events-none" />
      </div>
      <Container className="relative z-20 md:py-25">
        <motion.div
          initial="hidden"
          animate="show"
          viewport={{ once: true }}
          variants={{
            hidden: {},
            show: {
              transition: {
                staggerChildren: 0.15,
              },
            },
          }}
          className="max-w-3xl mx-auto text-center"
        >
          <motion.h1
            variants={FADE_IN_ANIMATION_VARIANTS}
            className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent"
          >
            Vibe Coding Directory
          </motion.h1>
          <motion.p
            variants={FADE_IN_ANIMATION_VARIANTS}
            className="text-sm md:text-xl lg:text-xl xl:text-xl text-muted-foreground mb-6"
          >
            Discover Rules, MCP configs, Skills, and prompts for Cursor, Claude
            Code, and AI coding tools. Hand-picked, ready-to-use templates for
            better AI-assisted development.
          </motion.p>
          {/* Search Bar */}
          <motion.form
            variants={FADE_IN_ANIMATION_VARIANTS}
            method="GET"
            action="/search"
            className="relative max-w-xl mx-auto"
          >
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground h-5 w-5 pointer-events-none" />
            <Input
              ref={inputRef}
              name="q"
              placeholder="Search rules, MCP, skills, prompts, or tags..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="px-12 py-6 text-lg border-2 rounded-xl focus:border-primary bg-background/90"
              autoComplete="off"
              spellCheck={false}
            />
            {/* Clear button */}
            {inputValue.length > 0 && (
              <button
                type="button"
                onClick={clearInput}
                className="absolute right-[90px] top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {/* Preserve sort parameter when submitting search, default to relevance */}
            <input type="hidden" name="sort" value={sort !== "latest" ? sort : "relevance"} />
            <Button
              type="submit"
              className="absolute right-2 top-1/2 transform -translate-y-1/2"
            >
              Search
            </Button>
          </motion.form>
          {/* Keyboard hint */}
          <motion.p
            variants={FADE_IN_ANIMATION_VARIANTS}
            className="text-xs text-muted-foreground/60 mt-3"
          >
            Search by title, description, tags, or category name
          </motion.p>
        </motion.div>
      </Container>
    </section>
  );
}
