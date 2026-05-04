import { ForcedPasswordChangeForm } from "@/components/settings/ForcedPasswordChangeForm";

export default function EmployeeChangePasswordPage() {
  return (
    <div className="mx-auto max-w-lg space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Choose a new password</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your account is using a temporary password from email. Set your own password before continuing to use the portal.
        </p>
      </div>
      <ForcedPasswordChangeForm />
    </div>
  );
}
