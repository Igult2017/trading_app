import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useMyProfile } from '@/components/profile/useMyProfile';
import { useAvatarEditor } from '@/components/profile/AvatarEditor';
import { ProfileSection } from './ProfileSection';
import { PrivacySection } from './PrivacySection';
import { PasswordSection, PlanSection, DataSection } from './AccountSections';
import { CAP, INK } from './settingsUi';

/**
 * SettingsPage — the journal's Settings page (?tab=settings), 2026-11-15.
 *
 * His words: "lets have a proper settings page where one can turn on or off certain activities such
 * as listing in the leaderboard or listing of their live accounts in the copier." His choice A: ONE
 * page for everything, replacing the 300px panel that lived in the profile menu.
 *
 * ⚠ IT IS A PAGE OF THE JOURNAL, NOT A ROUTE OF ITS OWN. Settings was once a separate /settings page,
 * and that threw people out onto the public site where the header said "Sign in" — it read as being
 * logged out. His rule then: "Account setting cannot breach the login and get user out like this. It
 * must be within the login." So it renders inside the journal like Drawdown or Analytics.
 */
export default function SettingsPage() {
  const { profile, isLoading, refresh } = useMyProfile();
  const editor = useAvatarEditor();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className={`text-2xl font-bold ${INK}`}>Settings</h1>
        <p className={`text-sm ${CAP}`}>Your profile, what other people can see, and your account.</p>
      </header>

      {isLoading ? (
        [0, 1, 2].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)
      ) : !profile ? (
        <div role="alert" className="flex flex-wrap items-center gap-4 rounded-xl bg-rose-500/10 p-6 text-sm text-rose-400">
          Your settings could not be loaded.
          <Button size="sm" variant="outline" className="bg-transparent" onClick={() => refresh()}>Try again</Button>
        </div>
      ) : (
        <>
          <ProfileSection profile={profile} onPickPhoto={editor.pick} refresh={refresh} />
          <PrivacySection profile={profile} refresh={refresh} />
          <PasswordSection />
          <PlanSection plan={profile.plan} />
          <DataSection />
        </>
      )}
      {editor.element}
    </div>
  );
}
