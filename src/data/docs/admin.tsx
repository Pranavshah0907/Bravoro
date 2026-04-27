import { DocsWarning } from "@/components/docs/DocsWarning";

export default function AdminSection() {
  return (
    <>
      <DocsWarning>
        This section is only relevant to workspace administrators. If you don't see the Admin option
        in your avatar menu, you don't have admin access.
      </DocsWarning>

      <h2 id="user-management" className="text-[17px] font-semibold text-foreground mt-8 mb-3 scroll-mt-24">
        User Management
      </h2>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-4">
        From the Admin panel, you can manage all users in your workspace:
      </p>
      <ul className="space-y-1.5 text-[14px] text-foreground/80 mb-4 ml-4 list-disc list-outside">
        <li><span className="text-accent">View users</span> — see all members with their roles and status</li>
        <li><span className="text-accent">Create users</span> — add new team members (they'll receive a welcome email with login credentials)</li>
        <li><span className="text-accent">Delete users</span> — remove users who no longer need access</li>
      </ul>

      <h2 id="credit-management" className="text-[17px] font-semibold text-foreground mt-10 mb-3 scroll-mt-24">
        Credit Management
      </h2>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-4">
        As an admin, you control the workspace's credit pool:
      </p>
      <ul className="space-y-1.5 text-[14px] text-foreground/80 mb-4 ml-4 list-disc list-outside">
        <li><span className="text-accent">View balance</span> — current workspace credit balance</li>
        <li><span className="text-accent">Top-up credits</span> — add credits to the workspace pool via the top-up dialog</li>
        <li><span className="text-accent">Transaction history</span> — complete log of all credit additions and deductions with timestamps</li>
      </ul>

      <h2 id="workspace-settings" className="text-[17px] font-semibold text-foreground mt-10 mb-3 scroll-mt-24">
        Workspace Settings
      </h2>
      <p className="text-[14px] text-foreground/80 leading-relaxed mb-4">
        View workspace details including the workspace name, creation date, and total member count.
      </p>
    </>
  );
}
