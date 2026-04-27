import { DocsTip } from "@/components/docs/DocsTip";

export default function SettingsSection() {
  return (
    <>
      <h2 id="profile" className="text-[17px] font-semibold text-foreground mt-8 mb-3 scroll-mt-24">
        Profile
      </h2>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-4">
        View and update your display name. Your email address is shown but cannot be changed directly
        — contact your admin if you need to update it.
      </p>

      <h2 id="security" className="text-[17px] font-semibold text-foreground mt-10 mb-3 scroll-mt-24">
        Security
      </h2>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-4">
        Change your password from the Security tab. You'll need to enter your current password and
        confirm the new one.
      </p>

      <h2 id="workspace-info" className="text-[17px] font-semibold text-foreground mt-10 mb-3 scroll-mt-24">
        Workspace Info
      </h2>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-4">
        The Settings page shows your workspace name and remaining credit balance. The credit indicator is
        color-coded — green (healthy), amber (running low), red (critically low).
      </p>

      <DocsTip>
        Check your credits in Settings before running large bulk operations to make sure you have enough
        to complete the full batch.
      </DocsTip>
    </>
  );
}
