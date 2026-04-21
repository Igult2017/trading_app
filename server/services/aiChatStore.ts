/**
 * server/services/aiChatStore.ts
 * ──────────────────────────────
 * Persistence layer for Trader-AI chat conversations.
 * Tables `ai_chats` and `ai_chat_messages` are created in db-init.ts.
 */

import { sql } from "drizzle-orm";
import { db } from "../db";

export interface AIChat {
  id:        string;
  userId:    string;
  sessionId: string | null;
  title:     string;
  createdAt: string;
  updatedAt: string;
}

export interface AIChatMessage {
  id:        string;
  chatId:    string;
  role:      "user" | "model";
  content:   string;
  createdAt: string;
}

function row<T = any>(r: any): T {
  return r as T;
}

export async function listChats(userId: string, sessionId?: string): Promise<AIChat[]> {
  const result: any = sessionId
    ? await db.execute(sql`
        SELECT id, user_id AS "userId", session_id AS "sessionId",
               title, created_at AS "createdAt", updated_at AS "updatedAt"
        FROM ai_chats
        WHERE user_id = ${userId} AND session_id = ${sessionId}
        ORDER BY updated_at DESC
      `)
    : await db.execute(sql`
        SELECT id, user_id AS "userId", session_id AS "sessionId",
               title, created_at AS "createdAt", updated_at AS "updatedAt"
        FROM ai_chats
        WHERE user_id = ${userId}
        ORDER BY updated_at DESC
      `);
  return (result.rows ?? result) as AIChat[];
}

export async function getChat(chatId: string, userId: string): Promise<AIChat | null> {
  const result: any = await db.execute(sql`
    SELECT id, user_id AS "userId", session_id AS "sessionId",
           title, created_at AS "createdAt", updated_at AS "updatedAt"
    FROM ai_chats
    WHERE id = ${chatId} AND user_id = ${userId}
    LIMIT 1
  `);
  const rows = (result.rows ?? result) as AIChat[];
  return rows[0] ?? null;
}

export async function getMessages(chatId: string): Promise<AIChatMessage[]> {
  const result: any = await db.execute(sql`
    SELECT id, chat_id AS "chatId", role, content,
           created_at AS "createdAt"
    FROM ai_chat_messages
    WHERE chat_id = ${chatId}
    ORDER BY created_at ASC
  `);
  return (result.rows ?? result) as AIChatMessage[];
}

export async function createChat(
  userId: string,
  sessionId: string | null,
  title: string,
): Promise<AIChat> {
  const result: any = await db.execute(sql`
    INSERT INTO ai_chats (user_id, session_id, title)
    VALUES (${userId}, ${sessionId}, ${title})
    RETURNING id, user_id AS "userId", session_id AS "sessionId",
              title, created_at AS "createdAt", updated_at AS "updatedAt"
  `);
  const rows = (result.rows ?? result) as AIChat[];
  return rows[0];
}

export async function appendMessage(
  chatId: string,
  role: "user" | "model",
  content: string,
): Promise<void> {
  await db.execute(sql`
    INSERT INTO ai_chat_messages (chat_id, role, content)
    VALUES (${chatId}, ${role}, ${content})
  `);
  await db.execute(sql`
    UPDATE ai_chats SET updated_at = NOW() WHERE id = ${chatId}
  `);
}

export async function renameChat(
  chatId: string,
  userId: string,
  title: string,
): Promise<AIChat | null> {
  const result: any = await db.execute(sql`
    UPDATE ai_chats
       SET title = ${title}, updated_at = NOW()
     WHERE id = ${chatId} AND user_id = ${userId}
    RETURNING id, user_id AS "userId", session_id AS "sessionId",
              title, created_at AS "createdAt", updated_at AS "updatedAt"
  `);
  const rows = (result.rows ?? result) as AIChat[];
  return rows[0] ?? null;
}

export async function deleteChat(chatId: string, userId: string): Promise<boolean> {
  const result: any = await db.execute(sql`
    DELETE FROM ai_chats WHERE id = ${chatId} AND user_id = ${userId}
    RETURNING id
  `);
  const rows = (result.rows ?? result) as Array<{ id: string }>;
  return rows.length > 0;
}

/** Auto-derive a short title from the user's first question. */
export function titleFromQuestion(q: string): string {
  const clean = (q || "").replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  return clean.length <= 60 ? clean : clean.slice(0, 57) + "…";
}
