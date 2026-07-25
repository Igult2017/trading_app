/** Follower reviews of the user's service. A ratings backend doesn't exist yet, so this is an
 *  honest empty state — never fabricated reviews. */
export function FeedbackList() {
  return (
    <div className="space-y-3 border-t border-surface-container-highest pt-8">
      <span className="font-label-xs text-on-surface opacity-70 uppercase">Feedback</span>
      <p className="p-4 border border-surface-container-highest rounded-lg text-[12px] text-on-surface opacity-50 font-body-md">
        No reviews yet — followers will be able to rate your service once reviews launch.
      </p>
    </div>
  );
}
