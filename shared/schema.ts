import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Pattern Training System Schema
export const patternCategories = pgTable("pattern_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // e.g., "Order Blocks", "Fair Value Gaps", "Chart Patterns"
  type: text("type").notNull(), // "smc", "patterns", "confluence"
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const patternTrainingExamples = pgTable("pattern_training_examples", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  categoryId: varchar("category_id").references(() => patternCategories.id),
  title: text("title").notNull(),
  description: text("description"),
  imagePath: text("image_path"), // Path to uploaded diagram/screenshot
  annotations: jsonb("annotations").$type<{
    keyPoints: string[];
    entryZones: Array<{ price: number; reasoning: string }>;
    stopLoss: Array<{ price: number; reasoning: string }>;
    targets: Array<{ price: number; reasoning: string }>;
    confluenceFactors: string[];
  }>(),
  symbol: text("symbol"), // e.g., "EUR/USD", "BTC/USD"
  timeframe: text("timeframe"), // e.g., "4H", "1D"
  outcome: text("outcome"), // "hit_target", "stopped_out", "breakeven", "pending"
  profitLoss: integer("profit_loss"), // in pips or points
  notes: text("notes"),
  tags: jsonb("tags").$type<string[]>(),
  isValidated: boolean("is_validated").default(false), // For quality control
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const trainingSessions = pgTable("training_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  sessionName: text("session_name").notNull(),
  description: text("description"),
  totalExamples: integer("total_examples").default(0),
  completedExamples: integer("completed_examples").default(0),
  status: text("status").default("active"), // "active", "completed", "paused"
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Schema for inserts
export const insertPatternCategorySchema = createInsertSchema(patternCategories).omit({
  id: true,
  createdAt: true,
});

export const insertPatternTrainingExampleSchema = createInsertSchema(patternTrainingExamples).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTrainingSessionSchema = createInsertSchema(trainingSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type InsertPatternCategory = z.infer<typeof insertPatternCategorySchema>;
export type PatternCategory = typeof patternCategories.$inferSelect;

export type InsertPatternTrainingExample = z.infer<typeof insertPatternTrainingExampleSchema>;
export type PatternTrainingExample = typeof patternTrainingExamples.$inferSelect;

export type InsertTrainingSession = z.infer<typeof insertTrainingSessionSchema>;
export type TrainingSession = typeof trainingSessions.$inferSelect;
