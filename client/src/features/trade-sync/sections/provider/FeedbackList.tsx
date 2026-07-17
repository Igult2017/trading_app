import { Stars } from "../../components/Stars";
import { PROVIDER_FEEDBACK } from "../../data/providerStudio";

export function FeedbackList() {
  return (
    <div className="space-y-3 border-t border-surface-container-highest pt-8">
      <span className="font-label-xs text-on-surface opacity-70 uppercase">Feedback</span>
      <div className="space-y-3">
        {PROVIDER_FEEDBACK.map((fb) => (
          <div key={fb.id} className="p-4 border border-surface-container-highest rounded-lg">
            <div className="flex items-center justify-between mb-1">
              <p className="font-body-md font-bold text-on-surface">{fb.name}</p>
              <Stars rating={fb.rating} />
            </div>
            <p className="text-on-surface opacity-70 font-body-md text-[12px]">{fb.comment}</p>
            <p className="text-on-surface opacity-40 text-[9px] mt-1 font-dm-mono">{fb.date}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
