import { db } from "../db";
import { blogPosts } from "@shared/schema";
import { and, eq, lte, isNotNull } from "drizzle-orm";
import { log } from "../static";

/**
 * Publishes scheduled blog posts when their time arrives.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT OPTIONAL. The editor lets an author set a publish time. Without
 * something that acts on it, that field is decoration — the post would sit as 'Scheduled' for ever
 * and the author would believe it had gone out. This panel has already shipped one control that
 * looked like it worked and did nothing (the font picker, which drew five options and applied
 * none), so a date field with no sweep behind it is the same defect wearing a different hat.
 *
 * HOW A POST BECOMES PUBLIC. `/api/blog` only ever returns rows with status 'Published'
 * (routes.ts), so a scheduled post is invisible until this sweep flips it. There is no second place
 * that can publish one, which is what makes the state honest.
 *
 * The sweep is deliberately dumb: every minute, take everything whose time has passed and publish
 * it. No queue, no timers held in memory, nothing to lose across a restart — the database holds the
 * intent and a restarted process catches up on its next tick.
 */

const SWEEP_MS = 60_000;

/** The date string the rest of the blog uses — `date` is free text like "Sep 10", set at creation. */
function displayDate(when: Date): string {
  return when.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}

export async function publishDuePosts(now: Date = new Date()): Promise<number> {
  const due = await db
    .select({ id: blogPosts.id, title: blogPosts.title })
    .from(blogPosts)
    .where(and(
      eq(blogPosts.status, 'Scheduled'),
      isNotNull(blogPosts.publishAt),
      lte(blogPosts.publishAt, now),
    ));

  if (due.length === 0) return 0;

  for (const post of due) {
    // The date shown on the article is stamped at the moment it actually goes live, not at the
    // moment it was scheduled — otherwise a post written in May and scheduled for September would
    // publish carrying May's date.
    await db.update(blogPosts)
      .set({ status: 'Published', date: displayDate(now), updatedAt: now })
      .where(eq(blogPosts.id, post.id));
    log(`[publishScheduler] published "${post.title}"`);
  }
  return due.length;
}

export function startPublishScheduler(): void {
  const tick = () => {
    publishDuePosts().catch(e => log(`[publishScheduler] sweep failed: ${e?.message ?? e}`));
  };
  tick();                       // catch anything that came due while the process was down
  setInterval(tick, SWEEP_MS);
  log('[publishScheduler] started — scheduled posts are checked every 60s');
}
